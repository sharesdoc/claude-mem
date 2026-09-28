
import { ChromaMcpManager } from './ChromaMcpManager.js';
import { ChromaSyncState, ProjectWatermarks } from './ChromaSyncState.js';
import { ParsedObservation, ParsedSummary } from '../../sdk/parser.js';
import { SessionStore } from '../sqlite/SessionStore.js';
import { logger } from '../../utils/logger.js';
import { parseFileList } from '../sqlite/observations/files.js';

interface ChromaDocument {
  id: string;
  document: string;
  metadata: Record<string, string | number>;
}

interface StoredObservation {
  id: number;
  memory_session_id: string;
  project: string;
  merged_into_project: string | null;
  text: string | null;
  type: string;
  title: string | null;
  subtitle: string | null;
  facts: string | null; 
  narrative: string | null;
  concepts: string | null; 
  files_read: string | null; 
  files_modified: string | null; 
  prompt_number: number;
  discovery_tokens: number; 
  created_at: string;
  created_at_epoch: number;
}

interface StoredSummary {
  id: number;
  memory_session_id: string;
  project: string;
  merged_into_project: string | null;
  request: string | null;
  investigated: string | null;
  learned: string | null;
  completed: string | null;
  next_steps: string | null;
  notes: string | null;
  prompt_number: number;
  discovery_tokens: number; 
  created_at: string;
  created_at_epoch: number;
}

interface StoredUserPrompt {
  id: number;
  content_session_id: string;
  prompt_number: number;
  prompt_text: string;
  created_at: string;
  created_at_epoch: number;
  memory_session_id: string;
  project: string;
}

export class ChromaSync {
  private project: string;
  private collectionName: string;
  private collectionCreated = false;
  private collectionCreation: Promise<void> | null = null;
  private readonly BATCH_SIZE = 100;

  constructor(project: string) {
    this.project = project;
    this.collectionName = ChromaSync.collectionNameFor(project);
  }

  /**
   * Deterministic mapping from project ID to chroma collection name.
   * Mirrors the constructor logic so callers can resolve the name without
   * instantiating ChromaSync (used by the project-delete admin path).
   */
  static collectionNameFor(project: string): string {
    const sanitized = project
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/[^a-zA-Z0-9]+$/, '');
    return `cm__${sanitized || 'unknown'}`;
  }

  /**
   * Drop the chroma collection that belongs to `project`. Best-effort:
   *   - returns true on confirmed delete
   *   - returns false if the collection didn't exist (already absent, no-op)
   *   - throws only on unexpected transport errors so the caller can decide
   *     whether to log + continue (we use this from `deleteProjectsCompletely`
   *     where SQLite is already committed, so chroma residue ≠ corruption).
   */
  static async deleteCollectionForProject(project: string): Promise<boolean> {
    const collectionName = ChromaSync.collectionNameFor(project);
    const chromaMcp = ChromaMcpManager.getInstance();
    try {
      await chromaMcp.callTool('chroma_delete_collection', {
        collection_name: collectionName
      });
      logger.info('CHROMA_SYNC', 'Collection dropped', { project, collectionName });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Not-found is the happy "nothing to delete" path; surface anything else.
      if (/not.{0,3}found|does not exist|no such collection/i.test(message)) {
        logger.debug('CHROMA_SYNC', 'Collection absent at delete time (treating as success)', {
          project,
          collectionName
        });
        return false;
      }
      throw error;
    }
  }

  /**
   * Reconstruct the Chroma document ids that `formatObservationDocs` would have
   * emitted for an observation, from just its id + content fields. Kept next to
   * formatObservationDocs so the id scheme (obs_{id}_narrative / _text /
   * _fact_{index}) stays in lockstep — used by the prompt-delete path to purge
   * an observation's vectors without re-reading the full Chroma collection.
   */
  static observationDocIds(obs: {
    id: number;
    narrative: string | null;
    text: string | null;
    facts: string | null;
  }): string[] {
    const ids: string[] = [];
    if (obs.narrative) ids.push(`obs_${obs.id}_narrative`);
    if (obs.text) ids.push(`obs_${obs.id}_text`);
    const facts = obs.facts ? JSON.parse(obs.facts) : [];
    if (Array.isArray(facts)) {
      facts.forEach((_fact: unknown, index: number) => {
        ids.push(`obs_${obs.id}_fact_${index}`);
      });
    }
    return ids;
  }

  /**
   * Delete specific documents by id from a project's collection. Best-effort,
   * mirroring deleteCollectionForProject: used after the SQLite delete of a
   * prompt is already committed, so a Chroma residue is not corruption (the
   * collection is reconstructable from SQLite). Returns true on a clean call,
   * false if the collection was absent; re-throws other transport errors so the
   * caller can log + continue.
   */
  static async deleteDocumentsByIds(project: string, ids: string[]): Promise<boolean> {
    if (ids.length === 0) return true;
    const collectionName = ChromaSync.collectionNameFor(project);
    const chromaMcp = ChromaMcpManager.getInstance();
    try {
      await chromaMcp.callTool('chroma_delete_documents', {
        collection_name: collectionName,
        ids
      });
      logger.info('CHROMA_SYNC', 'Documents deleted by id', {
        project,
        collectionName,
        count: ids.length
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/not.{0,3}found|does not exist|no such collection/i.test(message)) {
        logger.debug('CHROMA_SYNC', 'Collection absent at delete time (treating as success)', {
          project,
          collectionName
        });
        return false;
      }
      throw error;
    }
  }

  private async ensureCollectionExists(): Promise<void> {
    if (this.collectionCreated) {
      return;
    }

    if (!this.collectionCreation) {
      this.collectionCreation = this.createCollection().finally(() => {
        this.collectionCreation = null;
      });
    }
    await this.collectionCreation;
  }

  private async createCollection(): Promise<void> {
    const chromaMcp = ChromaMcpManager.getInstance();
    try {
      await chromaMcp.callTool('chroma_create_collection', {
        collection_name: this.collectionName
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('already exists')) {
        throw error;
      }
      // Collection already exists - this is the expected path after first creation
    }

    this.collectionCreated = true;

    logger.debug('CHROMA_SYNC', 'Collection ready', {
      collection: this.collectionName
    });
  }

  private formatObservationDocs(obs: StoredObservation): ChromaDocument[] {
    const documents: ChromaDocument[] = [];

    const facts = obs.facts ? JSON.parse(obs.facts) : [];
    const concepts = obs.concepts ? JSON.parse(obs.concepts) : [];
    const files_read = parseFileList(obs.files_read);
    const files_modified = parseFileList(obs.files_modified);

    const baseMetadata: Record<string, string | number | null> = {
      sqlite_id: obs.id,
      doc_type: 'observation',
      memory_session_id: obs.memory_session_id,
      project: obs.project,
      merged_into_project: obs.merged_into_project ?? null,
      created_at_epoch: obs.created_at_epoch,
      type: obs.type || 'discovery',
      title: obs.title || 'Untitled'
    };

    if (obs.subtitle) {
      baseMetadata.subtitle = obs.subtitle;
    }
    if (concepts.length > 0) {
      baseMetadata.concepts = concepts.join(',');
    }
    if (files_read.length > 0) {
      baseMetadata.files_read = files_read.join(',');
    }
    if (files_modified.length > 0) {
      baseMetadata.files_modified = files_modified.join(',');
    }

    if (obs.narrative) {
      documents.push({
        id: `obs_${obs.id}_narrative`,
        document: obs.narrative,
        metadata: { ...baseMetadata, field_type: 'narrative' }
      });
    }

    if (obs.text) {
      documents.push({
        id: `obs_${obs.id}_text`,
        document: obs.text,
        metadata: { ...baseMetadata, field_type: 'text' }
      });
    }

    facts.forEach((fact: string, index: number) => {
      documents.push({
        id: `obs_${obs.id}_fact_${index}`,
        document: fact,
        metadata: { ...baseMetadata, field_type: 'fact', fact_index: index }
      });
    });

    return documents;
  }

  private formatSummaryDocs(summary: StoredSummary): ChromaDocument[] {
    const documents: ChromaDocument[] = [];

    const baseMetadata: Record<string, string | number | null> = {
      sqlite_id: summary.id,
      doc_type: 'session_summary',
      memory_session_id: summary.memory_session_id,
      project: summary.project,
      merged_into_project: summary.merged_into_project ?? null,
      created_at_epoch: summary.created_at_epoch,
      prompt_number: summary.prompt_number || 0
    };

    if (summary.request) {
      documents.push({
        id: `summary_${summary.id}_request`,
        document: summary.request,
        metadata: { ...baseMetadata, field_type: 'request' }
      });
    }

    if (summary.investigated) {
      documents.push({
        id: `summary_${summary.id}_investigated`,
        document: summary.investigated,
        metadata: { ...baseMetadata, field_type: 'investigated' }
      });
    }

    if (summary.learned) {
      documents.push({
        id: `summary_${summary.id}_learned`,
        document: summary.learned,
        metadata: { ...baseMetadata, field_type: 'learned' }
      });
    }

    if (summary.completed) {
      documents.push({
        id: `summary_${summary.id}_completed`,
        document: summary.completed,
        metadata: { ...baseMetadata, field_type: 'completed' }
      });
    }

    if (summary.next_steps) {
      documents.push({
        id: `summary_${summary.id}_next_steps`,
        document: summary.next_steps,
        metadata: { ...baseMetadata, field_type: 'next_steps' }
      });
    }

    if (summary.notes) {
      documents.push({
        id: `summary_${summary.id}_notes`,
        document: summary.notes,
        metadata: { ...baseMetadata, field_type: 'notes' }
      });
    }

    return documents;
  }

  /**
   * Write `documents` to Chroma in BATCH_SIZE-sized batches.
   *
   * Returns the number of documents that were successfully written (or
   * confirmed via delete+add reconcile). Per-batch failures are logged and the
   * loop continues — we never throw — so callers must use the returned count
   * to advance their watermark, otherwise an interrupted backfill can mark
   * unsynced records as synced.
   */
  private async addDocuments(documents: ChromaDocument[]): Promise<number> {
    if (documents.length === 0) {
      return 0;
    }

    try {
      await this.ensureCollectionExists();
    } catch (error) {
      logger.error('CHROMA_SYNC', 'Collection initialization failed — deferring documents to backfill', {
        collection: this.collectionName,
        documentCount: documents.length
      }, error instanceof Error ? error : new Error(String(error)));
      return 0;
    }

    const chromaMcp = ChromaMcpManager.getInstance();

    let written = 0;
    for (let i = 0; i < documents.length; i += this.BATCH_SIZE) {
      const batch = documents.slice(i, i + this.BATCH_SIZE);

      const cleanMetadatas = batch.map(d =>
        Object.fromEntries(
          Object.entries(d.metadata).filter(([_, v]) => v !== null && v !== undefined && v !== '')
        )
      );

      try {
        written += await chromaMcp.runMutationExclusive(async callTool => {
          try {
            await callTool('chroma_add_documents', {
              collection_name: this.collectionName,
              ids: batch.map(d => d.id),
              documents: batch.map(d => d.document),
              metadatas: cleanMetadatas
            });
            return batch.length;
          } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            if (!errMsg.includes('already exist')) throw error;
            const existing = await callTool('chroma_get_documents', {
              collection_name: this.collectionName,
              ids: batch.map(d => d.id),
              include: []
            }) as { ids?: string[] };
            const existingIds = new Set(existing?.ids ?? []);
            const toUpdate = batch.filter(document => existingIds.has(document.id));
            const toAdd = batch.filter(document => !existingIds.has(document.id));
            const cleanFor = (docs: ChromaDocument[]) => docs.map(document =>
              Object.fromEntries(Object.entries(document.metadata).filter(
                ([_, value]) => value !== null && value !== undefined && value !== ''
              ))
            );
            if (toUpdate.length > 0) {
              await callTool('chroma_update_documents', {
                collection_name: this.collectionName,
                ids: toUpdate.map(document => document.id),
                documents: toUpdate.map(document => document.document),
                metadatas: cleanFor(toUpdate)
              });
            }
            if (toAdd.length > 0) {
              await callTool('chroma_add_documents', {
                collection_name: this.collectionName,
                ids: toAdd.map(document => document.id),
                documents: toAdd.map(document => document.document),
                metadatas: cleanFor(toAdd)
              });
            }
            logger.info('CHROMA_SYNC', 'Batch reconciled via in-place update + add', {
              collection: this.collectionName,
              batchStart: i,
              batchSize: batch.length,
              updated: toUpdate.length,
              added: toAdd.length
            });
            return toUpdate.length + toAdd.length;
          }
        }, `reconcile batch ${i}`);
      } catch (error) {
        logger.error('CHROMA_SYNC', 'Batch write/reconcile failed — watermark will not advance for this batch', {
          collection: this.collectionName,
          batchStart: i,
          batchSize: batch.length
        }, error instanceof Error ? error : new Error(String(error)));
      }
    }

    logger.debug('CHROMA_SYNC', 'Documents added', {
      collection: this.collectionName,
      requested: documents.length,
      written
    });
    return written;
  }

  async syncObservation(
    observationId: number,
    memorySessionId: string,
    project: string,
    obs: ParsedObservation,
    promptNumber: number,
    createdAtEpoch: number,
    discoveryTokens: number = 0
  ): Promise<void> {
    const stored: StoredObservation = {
      id: observationId,
      memory_session_id: memorySessionId,
      project: project,
      merged_into_project: null,
      text: null, // Legacy field, not used
      type: obs.type,
      title: obs.title,
      subtitle: obs.subtitle,
      facts: JSON.stringify(obs.facts),
      narrative: obs.narrative,
      concepts: JSON.stringify(obs.concepts),
      files_read: JSON.stringify(obs.files_read),
      files_modified: JSON.stringify(obs.files_modified),
      prompt_number: promptNumber,
      discovery_tokens: discoveryTokens,
      created_at: new Date(createdAtEpoch * 1000).toISOString(),
      created_at_epoch: createdAtEpoch
    };

    const documents = this.formatObservationDocs(stored);

    logger.info('CHROMA_SYNC', 'Syncing observation', {
      observationId,
      documentCount: documents.length,
      project
    });

    // Only advance the watermark on a confirmed full write. addDocuments() now
    // returns a written count and tolerates per-batch failures, so a transient
    // Chroma error must NOT mark this observation as synced — otherwise the
    // backfill pass on next boot will skip past it (CodeRabbit review on PR
    // #2282).
    const written = await this.addDocuments(documents);
    if (written === documents.length) {
      ChromaSyncState.bump(project, 'observations', observationId);
    } else {
      ChromaSyncState.markPending(project, 'observations', [observationId]);
      logger.warn('CHROMA_SYNC', 'Observation watermark bump skipped — partial write', {
        observationId,
        project,
        requested: documents.length,
        written
      });
    }
  }

  async syncSummary(
    summaryId: number,
    memorySessionId: string,
    project: string,
    summary: ParsedSummary,
    promptNumber: number,
    createdAtEpoch: number,
    discoveryTokens: number = 0
  ): Promise<void> {
    const stored: StoredSummary = {
      id: summaryId,
      memory_session_id: memorySessionId,
      project: project,
      merged_into_project: null,
      request: summary.request,
      investigated: summary.investigated,
      learned: summary.learned,
      completed: summary.completed,
      next_steps: summary.next_steps,
      notes: summary.notes,
      prompt_number: promptNumber,
      discovery_tokens: discoveryTokens,
      created_at: new Date(createdAtEpoch * 1000).toISOString(),
      created_at_epoch: createdAtEpoch
    };

    const documents = this.formatSummaryDocs(stored);

    logger.info('CHROMA_SYNC', 'Syncing summary', {
      summaryId,
      documentCount: documents.length,
      project
    });

    // Only bump on a confirmed full write — see syncObservation() for rationale.
    const written = await this.addDocuments(documents);
    if (written === documents.length) {
      ChromaSyncState.bump(project, 'summaries', summaryId);
    } else {
      ChromaSyncState.markPending(project, 'summaries', [summaryId]);
      logger.warn('CHROMA_SYNC', 'Summary watermark bump skipped — partial write', {
        summaryId,
        project,
        requested: documents.length,
        written
      });
    }
  }

  private formatUserPromptDoc(prompt: StoredUserPrompt): ChromaDocument {
    return {
      id: `prompt_${prompt.id}`,
      document: prompt.prompt_text,
      metadata: {
        sqlite_id: prompt.id,
        doc_type: 'user_prompt',
        memory_session_id: prompt.memory_session_id,
        project: prompt.project,
        created_at_epoch: prompt.created_at_epoch,
        prompt_number: prompt.prompt_number
      }
    };
  }

  async syncUserPrompt(
    promptId: number,
    memorySessionId: string,
    project: string,
    promptText: string,
    promptNumber: number,
    createdAtEpoch: number
  ): Promise<void> {
    const stored: StoredUserPrompt = {
      id: promptId,
      content_session_id: '', // Not needed for Chroma sync
      prompt_number: promptNumber,
      prompt_text: promptText,
      created_at: new Date(createdAtEpoch * 1000).toISOString(),
      created_at_epoch: createdAtEpoch,
      memory_session_id: memorySessionId,
      project: project
    };

    const document = this.formatUserPromptDoc(stored);

    logger.info('CHROMA_SYNC', 'Syncing user prompt', {
      promptId,
      project
    });

    // Only bump on a confirmed full write — see syncObservation() for rationale.
    const written = await this.addDocuments([document]);
    if (written === 1) {
      ChromaSyncState.bump(project, 'prompts', promptId);
    } else {
      ChromaSyncState.markPending(project, 'prompts', [promptId]);
      logger.warn('CHROMA_SYNC', 'Prompt watermark bump skipped — write failed', {
        promptId,
        project,
        written
      });
    }
  }

  private async getExistingChromaIds(projectOverride?: string): Promise<{
    observations: Set<number>;
    summaries: Set<number>;
    prompts: Set<number>;
    documents: Set<string>;
  }> {
    const targetProject = projectOverride ?? this.project;
    await this.ensureCollectionExists();

    const chromaMcp = ChromaMcpManager.getInstance();

    const observationIds = new Set<number>();
    const summaryIds = new Set<number>();
    const promptIds = new Set<number>();
    const documentIds = new Set<string>();

    let offset = 0;
    const limit = 1000; 

    logger.info('CHROMA_SYNC', 'Fetching existing Chroma document IDs...', { project: targetProject });

    while (true) {
      const result = await chromaMcp.callTool('chroma_get_documents', {
        collection_name: this.collectionName,
        limit: limit,
        offset: offset,
        where: { project: targetProject },
        include: ['metadatas']
      }) as any;

      const metadatas = result?.metadatas || [];
      const ids = result?.ids || [];

      if (metadatas.length === 0) {
        break; 
      }

      for (let index = 0; index < metadatas.length; index += 1) {
        const meta = metadatas[index];
        if (typeof ids[index] === 'string') documentIds.add(ids[index]);
        if (meta && meta.sqlite_id) {
          const sqliteId = meta.sqlite_id as number;
          if (meta.doc_type === 'observation') {
            observationIds.add(sqliteId);
          } else if (meta.doc_type === 'session_summary') {
            summaryIds.add(sqliteId);
          } else if (meta.doc_type === 'user_prompt') {
            promptIds.add(sqliteId);
          }
        }
      }

      offset += limit;

      logger.debug('CHROMA_SYNC', 'Fetched batch of existing IDs', {
        project: targetProject,
        offset,
        batchSize: metadatas.length
      });
    }

    logger.info('CHROMA_SYNC', 'Existing IDs fetched', {
      project: targetProject,
      observations: observationIds.size,
      summaries: summaryIds.size,
      prompts: promptIds.size,
      total: observationIds.size + summaryIds.size + promptIds.size
    });

    return { observations: observationIds, summaries: summaryIds, prompts: promptIds, documents: documentIds };
  }

  async bootstrapWatermarksFromChroma(project: string, store: SessionStore): Promise<void> {
    const existing = await this.getExistingChromaIds(project);
    const max = (set: Set<number>): number => {
      let m = 0;
      for (const id of set) if (id > m) m = id;
      return m;
    };
    const observationRows = store.db.prepare('SELECT * FROM observations WHERE project = ? ORDER BY id').all(project) as StoredObservation[];
    const summaryRows = store.db.prepare('SELECT * FROM session_summaries WHERE project = ? ORDER BY id').all(project) as StoredSummary[];
    const promptRows = store.db.prepare(`
      SELECT up.*, s.project, s.memory_session_id FROM user_prompts up
      JOIN sdk_sessions s ON up.content_session_id = s.content_session_id
      WHERE s.project = ? ORDER BY up.id
    `).all(project) as StoredUserPrompt[];
    const summarize = <T extends { id: number }>(source: T[], chromaIds: Set<number>, expectedIds: (row: T) => string[]) =>
      ChromaSync.summarizeBootstrapRows(source, max(chromaIds), existing.documents, expectedIds);
    const observations = summarize(observationRows, existing.observations, row => this.formatObservationDocs(row).map(doc => doc.id));
    const summaries = summarize(summaryRows, existing.summaries, row => this.formatSummaryDocs(row).map(doc => doc.id));
    const prompts = summarize(promptRows, existing.prompts, row => [this.formatUserPromptDoc(row).id]);
    ChromaSyncState.replace(project, {
      observations: observations.watermark,
      summaries: summaries.watermark,
      prompts: prompts.watermark,
      pending: {
        observations: observations.pending,
        summaries: summaries.pending,
        prompts: prompts.pending
      }
    });
    logger.info('CHROMA_SYNC', 'Bootstrapped watermarks from Chroma', {
      project,
      watermarks: ChromaSyncState.get(project)
    });
  }

  private static summarizeBootstrapRows<T extends { id: number }>(
    source: T[],
    watermark: number,
    existingDocumentIds: Set<string>,
    expectedIds: (row: T) => string[]
  ): { watermark: number; pending: number[] } {
    return {
      watermark,
      pending: source.filter(row => {
        if (row.id > watermark) return false;
        const expected = expectedIds(row);
        return expected.length === 0 || expected.some(id => !existingDocumentIds.has(id));
      }).map(row => row.id)
    };
  }

  async ensureBackfilled(projectOverride?: string, storeOverride?: SessionStore): Promise<void> {
    const backfillProject = projectOverride ?? this.project;
    logger.info('CHROMA_SYNC', 'Starting smart backfill', { project: backfillProject });

    await this.ensureCollectionExists();

    const watermarks = ChromaSyncState.get(backfillProject);

    const db = storeOverride ?? new SessionStore();

    try {
      await this.runBackfillPipeline(db, backfillProject, watermarks);
    } catch (error) {
      logger.error('CHROMA_SYNC', 'Backfill failed', { project: backfillProject }, error instanceof Error ? error : new Error(String(error)));
      throw new Error(`Backfill failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (!storeOverride) {
        db.close();
      }
    }
  }

  private async runBackfillPipeline(
    db: SessionStore,
    backfillProject: string,
    watermarks: ProjectWatermarks
  ): Promise<void> {
    const allDocs = await this.backfillObservations(db, backfillProject, watermarks.observations);
    const summaryDocs = await this.backfillSummaries(db, backfillProject, watermarks.summaries);
    const promptDocs = await this.backfillPrompts(db, backfillProject, watermarks.prompts);

    logger.info('CHROMA_SYNC', 'Smart backfill complete', {
      project: backfillProject,
      synced: {
        observationDocs: allDocs.length,
        summaryDocs: summaryDocs.length,
        promptDocs: promptDocs.length
      },
      watermarks: ChromaSyncState.get(backfillProject)
    });
  }

  private mergeRowsById<T extends { id: number }>(rows: T[], pendingRows: T[]): T[] {
    const merged = new Map<number, T>();
    for (const row of rows) merged.set(row.id, row);
    for (const row of pendingRows) merged.set(row.id, row);
    return [...merged.values()].sort((a, b) => a.id - b.id);
  }

  /** Writes and advances state one SQLite row at a time, including split rows. */
  private async backfillRows<T extends { id: number }>(
    rows: T[],
    format: (row: T) => ChromaDocument[],
    kind: 'observations' | 'summaries' | 'prompts',
    project: string
  ): Promise<ChromaDocument[]> {
    const allDocs: ChromaDocument[] = [];
    for (const row of rows) {
      const docs = format(row);
      allDocs.push(...docs);
      let complete = true;
      for (let offset = 0; offset < docs.length; offset += this.BATCH_SIZE) {
        const batch = docs.slice(offset, offset + this.BATCH_SIZE);
        if (await this.addDocuments(batch) !== batch.length) {
          complete = false;
          break;
        }
      }
      if (complete) {
        ChromaSyncState.clearPending(project, kind, [row.id]);
        ChromaSyncState.bump(project, kind, row.id);
      } else {
        ChromaSyncState.markPending(project, kind, [row.id]);
      }
    }
    return allDocs;
  }

  private async backfillObservations(
    db: SessionStore,
    backfillProject: string,
    watermark: number
  ): Promise<ChromaDocument[]> {
    const pendingIds = ChromaSyncState.getPending(backfillProject, 'observations');
    const observations = db.db.prepare(`
      SELECT * FROM observations
      WHERE project = ? AND id > ?
      ORDER BY id ASC
    `).all(backfillProject, watermark) as StoredObservation[];
    let pendingRows: StoredObservation[] = [];
    if (pendingIds.length > 0) {
      const placeholders = pendingIds.map(() => '?').join(',');
      pendingRows = db.db.prepare(`SELECT * FROM observations WHERE project = ? AND id IN (${placeholders})`)
        .all(backfillProject, ...pendingIds) as StoredObservation[];
      const found = new Set(pendingRows.map(row => row.id));
      ChromaSyncState.clearPending(backfillProject, 'observations', pendingIds.filter(id => !found.has(id)));
    }
    const rows = this.mergeRowsById(observations, pendingRows);

    if (rows.length === 0) {
      return [];
    }

    const totalObsCount = db.db.prepare(`
      SELECT COUNT(*) as count FROM observations WHERE project = ?
    `).get(backfillProject) as { count: number };

    logger.info('CHROMA_SYNC', 'Backfilling observations', {
      project: backfillProject,
      missing: rows.length,
      pending: pendingIds.length,
      watermark,
      total: totalObsCount.count
    });

    return this.backfillRows(rows, row => this.formatObservationDocs(row), 'observations', backfillProject);
  }

  private async backfillSummaries(
    db: SessionStore,
    backfillProject: string,
    watermark: number
  ): Promise<ChromaDocument[]> {
    const pendingIds = ChromaSyncState.getPending(backfillProject, 'summaries');
    const summaries = db.db.prepare(`
      SELECT * FROM session_summaries
      WHERE project = ? AND id > ?
      ORDER BY id ASC
    `).all(backfillProject, watermark) as StoredSummary[];
    let pendingRows: StoredSummary[] = [];
    if (pendingIds.length > 0) {
      const placeholders = pendingIds.map(() => '?').join(',');
      pendingRows = db.db.prepare(`SELECT * FROM session_summaries WHERE project = ? AND id IN (${placeholders})`)
        .all(backfillProject, ...pendingIds) as StoredSummary[];
      const found = new Set(pendingRows.map(row => row.id));
      ChromaSyncState.clearPending(backfillProject, 'summaries', pendingIds.filter(id => !found.has(id)));
    }
    const rows = this.mergeRowsById(summaries, pendingRows);

    if (rows.length === 0) {
      return [];
    }

    const totalSummaryCount = db.db.prepare(`
      SELECT COUNT(*) as count FROM session_summaries WHERE project = ?
    `).get(backfillProject) as { count: number };

    logger.info('CHROMA_SYNC', 'Backfilling summaries', {
      project: backfillProject,
      missing: rows.length,
      pending: pendingIds.length,
      watermark,
      total: totalSummaryCount.count
    });

    return this.backfillRows(rows, row => this.formatSummaryDocs(row), 'summaries', backfillProject);
  }

  private async backfillPrompts(
    db: SessionStore,
    backfillProject: string,
    watermark: number
  ): Promise<ChromaDocument[]> {
    const pendingIds = ChromaSyncState.getPending(backfillProject, 'prompts');
    const prompts = db.db.prepare(`
      SELECT
        up.*,
        s.project,
        s.memory_session_id
      FROM user_prompts up
      JOIN sdk_sessions s ON up.content_session_id = s.content_session_id
      WHERE s.project = ? AND up.id > ?
      ORDER BY up.id ASC
    `).all(backfillProject, watermark) as StoredUserPrompt[];
    let pendingRows: StoredUserPrompt[] = [];
    if (pendingIds.length > 0) {
      const placeholders = pendingIds.map(() => '?').join(',');
      pendingRows = db.db.prepare(`
        SELECT up.*, s.project, s.memory_session_id
        FROM user_prompts up
        JOIN sdk_sessions s ON up.content_session_id = s.content_session_id
        WHERE s.project = ? AND up.id IN (${placeholders})
      `).all(backfillProject, ...pendingIds) as StoredUserPrompt[];
      const found = new Set(pendingRows.map(row => row.id));
      ChromaSyncState.clearPending(backfillProject, 'prompts', pendingIds.filter(id => !found.has(id)));
    }
    const rows = this.mergeRowsById(prompts, pendingRows);

    if (rows.length === 0) {
      return [];
    }

    const totalPromptCount = db.db.prepare(`
      SELECT COUNT(*) as count
      FROM user_prompts up
      JOIN sdk_sessions s ON up.content_session_id = s.content_session_id
      WHERE s.project = ?
    `).get(backfillProject) as { count: number };

    logger.info('CHROMA_SYNC', 'Backfilling user prompts', {
      project: backfillProject,
      missing: rows.length,
      pending: pendingIds.length,
      watermark,
      total: totalPromptCount.count
    });

    return this.backfillRows(rows, row => [this.formatUserPromptDoc(row)], 'prompts', backfillProject);
  }

  async queryChroma(
    query: string,
    limit: number,
    whereFilter?: Record<string, any>
  ): Promise<{ ids: number[]; distances: number[]; metadatas: any[] }> {
    await this.ensureCollectionExists();

    let results: any;
    try {
      const chromaMcp = ChromaMcpManager.getInstance();
      results = await chromaMcp.callTool('chroma_query_documents', {
        collection_name: this.collectionName,
        query_texts: [query],
        n_results: limit,
        ...(whereFilter && { where: whereFilter }),
        include: ['documents', 'metadatas', 'distances']
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      const isConnectionError =
        errorMessage.includes('ECONNREFUSED') || 
        errorMessage.includes('ENOTFOUND') || 
        errorMessage.includes('fetch failed') || 
        errorMessage.includes('subprocess closed') || 
        errorMessage.includes('timed out'); 

      if (isConnectionError) {
        this.collectionCreated = false;
        logger.error('CHROMA_SYNC', 'Connection lost during query',
          { project: this.project, query }, error as Error);
        throw new Error(`Chroma query failed - connection lost: ${errorMessage}`);
      }

      logger.error('CHROMA_SYNC', 'Query failed', { project: this.project, query }, error as Error);
      throw error;
    }

    return this.deduplicateQueryResults(results);
  }

  private deduplicateQueryResults(results: any): { ids: number[]; distances: number[]; metadatas: any[] } {
    const ids: number[] = [];
    const seen = new Set<string>();
    const docIds = results?.ids?.[0] || [];
    const rawMetadatas = results?.metadatas?.[0] || [];
    const rawDistances = results?.distances?.[0] || [];

    const metadatas: any[] = [];
    const distances: number[] = [];

    for (let i = 0; i < docIds.length; i++) {
      const docId = docIds[i];
      const obsMatch = docId.match(/obs_(\d+)_/);
      const summaryMatch = docId.match(/summary_(\d+)_/);
      const promptMatch = docId.match(/prompt_(\d+)/);

      let sqliteId: number | null = null;
      let entityType: string | null = null;
      if (obsMatch) {
        sqliteId = parseInt(obsMatch[1], 10);
        entityType = 'observation';
      } else if (summaryMatch) {
        sqliteId = parseInt(summaryMatch[1], 10);
        entityType = 'session_summary';
      } else if (promptMatch) {
        sqliteId = parseInt(promptMatch[1], 10);
        entityType = 'user_prompt';
      }

      if (sqliteId !== null && entityType) {
        const dedupeKey = `${entityType}:${sqliteId}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        ids.push(sqliteId);
        metadatas.push(rawMetadatas[i] ?? null);
        distances.push(rawDistances[i] ?? 0);
      }
    }

    return { ids, distances, metadatas };
  }

  /** Maximum number of concurrent project backfills to run at once. */
  private static readonly BACKFILL_CONCURRENCY_LIMIT = 3;

  /** Guard flag to prevent overlapping backfill runs from fire-and-forget callers. */
  private static backfillInProgress = false;

  /**
   * Backfill all projects that have observations in SQLite but may be missing from Chroma.
   * Uses a single shared ChromaSync('claude-mem') instance and Chroma connection.
   * Per-project scoping is passed as a parameter to ensureBackfilled(), avoiding
   * instance state mutation. All documents land in the cm__claude-mem collection
   * with project scoped via metadata, matching how DatabaseManager and SearchManager operate.
   * Designed to be called fire-and-forget on worker startup.
   *
   * Concurrency: processes at most BACKFILL_CONCURRENCY_LIMIT projects in parallel
   * to bound CPU and memory pressure from concurrent Chroma embedding operations.
   * A re-entrant guard prevents overlapping backfill runs from accumulating.
   */
  static async backfillAllProjects(storeOverride?: SessionStore): Promise<void> {
    if (ChromaSync.backfillInProgress) {
      logger.info('CHROMA_SYNC', 'Backfill already in progress, skipping duplicate run');
      return;
    }

    // Allocate first so a constructor throw cannot leave the guard stuck true
    // and silently skip every subsequent backfill (CodeRabbit review on PR
    // #2282). The guard only flips to true after both resources are alive,
    // and the finally always clears it.
    let db: SessionStore | undefined;
    let sync: ChromaSync | undefined;
    try {
      db = storeOverride ?? new SessionStore();
      sync = new ChromaSync('claude-mem');
    } catch (error) {
      logger.error('CHROMA_SYNC', 'Failed to initialize backfill resources',
        {}, error instanceof Error ? error : new Error(String(error)));
      // Best-effort cleanup if SessionStore allocated but ChromaSync threw.
      if (db && !storeOverride) {
        try { db.close(); } catch { /* ignore */ }
      }
      throw error;
    }

    ChromaSync.backfillInProgress = true;
    try {
      const projects = db.db.prepare(
        'SELECT DISTINCT project FROM observations WHERE project IS NOT NULL AND project != ?'
      ).all('') as { project: string }[];

      logger.info('CHROMA_SYNC', `Backfill check for ${projects.length} projects`);

      if (!ChromaSyncState.exists()) {
        logger.info('CHROMA_SYNC', 'Watermark cache missing — bootstrapping from Chroma (one-time)');
        for (const { project } of projects) {
          try {
            await sync.bootstrapWatermarksFromChroma(project, db);
          } catch (error) {
            logger.error('CHROMA_SYNC', `Bootstrap failed for project: ${project}`,
              {}, error instanceof Error ? error : new Error(String(error)));
          }
        }
        logger.info('CHROMA_SYNC', 'Bootstrap complete — incremental backfills will use watermarks');
      }

      // Process projects in chunks of BACKFILL_CONCURRENCY_LIMIT to bound
      // CPU/memory pressure from concurrent Chroma embedding operations.
      // Each chunk runs its projects in parallel; we wait for the entire chunk
      // before starting the next one. Simple and predictable — no semaphore
      // overhead, no unbounded fan-out.
      const concurrency = ChromaSync.BACKFILL_CONCURRENCY_LIMIT;
      for (let i = 0; i < projects.length; i += concurrency) {
        const chunk = projects.slice(i, i + concurrency);
        const chunkResults = await Promise.allSettled(
          chunk.map(({ project }) => sync!.ensureBackfilled(project, db!))
        );

        for (let j = 0; j < chunkResults.length; j++) {
          const result = chunkResults[j];
          if (result.status === 'rejected') {
            const project = chunk[j].project;
            const error = result.reason;
            if (error instanceof Error) {
              logger.error('CHROMA_SYNC', `Backfill failed for project: ${project}`, {}, error);
            } else {
              logger.error('CHROMA_SYNC', `Backfill failed for project: ${project}`, { error: String(error) });
            }
            // Continue to next chunk — don't let one failure stop others
          }
        }
      }
    } finally {
      ChromaSync.backfillInProgress = false;
      if (sync) {
        try { await sync.close(); } catch (closeError) {
          logger.debug('CHROMA_SYNC', 'sync.close() failed during backfill teardown',
            {}, closeError instanceof Error ? closeError : new Error(String(closeError)));
        }
      }
      if (!storeOverride && db) {
        try { db.close(); } catch (closeError) {
          logger.debug('CHROMA_SYNC', 'db.close() failed during backfill teardown',
            {}, closeError instanceof Error ? closeError : new Error(String(closeError)));
        }
      }
    }
  }

  async updateMergedIntoProject(
    sqliteIds: number[],
    mergedIntoProject: string
  ): Promise<void> {
    if (sqliteIds.length === 0) return;

    await this.ensureCollectionExists();
    const chromaMcp = ChromaMcpManager.getInstance();

    let totalPatched = 0;

    for (let i = 0; i < sqliteIds.length; i += this.BATCH_SIZE) {
      const idBatch = sqliteIds.slice(i, i + this.BATCH_SIZE);

      const existing = await chromaMcp.callTool('chroma_get_documents', {
        collection_name: this.collectionName,
        where: { sqlite_id: { $in: idBatch } },
        include: ['metadatas']
      }) as { ids?: string[]; metadatas?: Array<Record<string, any> | null> };

      const docIds: string[] = existing?.ids ?? [];
      if (docIds.length === 0) continue;

      const metadatas = (existing?.metadatas ?? []).map(m => {
        const merged: Record<string, any> = {
          ...(m ?? {}),
          merged_into_project: mergedIntoProject
        };
        return Object.fromEntries(
          Object.entries(merged).filter(
            ([, v]) => v !== null && v !== undefined && v !== ''
          )
        );
      });

      await chromaMcp.callTool('chroma_update_documents', {
        collection_name: this.collectionName,
        ids: docIds,
        metadatas
      });
      totalPatched += docIds.length;
    }

    logger.info('CHROMA_SYNC', 'merged_into_project metadata patched', {
      collection: this.collectionName,
      mergedIntoProject,
      sqliteIdCount: sqliteIds.length,
      chromaDocsPatched: totalPatched
    });
  }

  async close(): Promise<void> {
    logger.info('CHROMA_SYNC', 'ChromaSync closed', { project: this.project });
  }
}
