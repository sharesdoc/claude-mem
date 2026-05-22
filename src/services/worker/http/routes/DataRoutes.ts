
import express, { Request, Response } from 'express';
import { z } from 'zod';
import path from 'path';
import type { SQLQueryBindings } from 'bun:sqlite';
import { readFileSync, statSync, existsSync } from 'fs';
import { logger } from '../../../../utils/logger.js';
import { getPackageRoot, paths } from '../../../../shared/paths.js';
import { getWorkerPort } from '../../../../shared/worker-utils.js';
import { normalizeStringArrayQuery } from '../../../../shared/query-utils.js';
import { PaginationHelper } from '../../PaginationHelper.js';
import { DatabaseManager } from '../../DatabaseManager.js';
import { SessionManager } from '../../SessionManager.js';
import { SSEBroadcaster } from '../../SSEBroadcaster.js';
import type { WorkerService } from '../../../worker-service.js';
import { BaseRouteHandler } from '../BaseRouteHandler.js';
import { AdminSessionStore, extractBearerToken } from '../AdminSessionStore.js';
import { validateBody } from '../middleware/validateBody.js';
import { normalizePlatformSource } from '../../../../shared/platform-source.js';
import { getObservationsByFilePath } from '../../../sqlite/observations/get.js';
import { getFirstObservationCreatedAt } from '../../../sqlite/observations/recent.js';
import { getUptimeSeconds } from '../../../../shared/uptime.js';
import { ChromaSync } from '../../../sync/ChromaSync.js';

const integerArrayLike = z.preprocess((value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // not JSON, fall through to comma split
    }
    return value.split(',').map((part) => Number(part.trim()));
  }
  return value;
}, z.array(z.number().int()));

const stringArrayLike = z.preprocess((value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // not JSON, fall through to comma split
    }
    return value.split(',').map((part) => part.trim()).filter(Boolean);
  }
  return value;
}, z.array(z.string()));

const observationsBatchSchema = z.object({
  ids: integerArrayLike,
  orderBy: z.enum(['date_desc', 'date_asc']).optional(),
  limit: z.number().int().positive().optional(),
  project: z.string().optional(),
}).passthrough();

const sdkSessionsBatchSchema = z.preprocess((value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;

  const body = value as Record<string, unknown>;
  if (body.memorySessionIds === undefined && body.sdkSessionIds !== undefined) {
    return { ...body, memorySessionIds: body.sdkSessionIds };
  }

  return value;
}, z.object({
  memorySessionIds: stringArrayLike,
}).passthrough());

const setProcessingSchema = z.object({}).passthrough();

const importSchema = z.object({
  sessions: z.array(z.unknown()).optional(),
  summaries: z.array(z.unknown()).optional(),
  observations: z.array(z.unknown()).optional(),
  prompts: z.array(z.unknown()).optional(),
}).passthrough();

const deleteProjectsSchema = z.object({
  projects: z.array(z.string().min(1)).min(1).max(200),
}).passthrough();

export class DataRoutes extends BaseRouteHandler {
  constructor(
    private paginationHelper: PaginationHelper,
    private dbManager: DatabaseManager,
    private sessionManager: SessionManager,
    private sseBroadcaster: SSEBroadcaster,
    private workerService: WorkerService,
    private startTime: number,
    /**
     * Shared admin-session registry used to authorize destructive writes.
     * Paired with `requireAdminForWrites`: when that flag is true (server
     * mode) the caller must present a valid admin bearer token; in client /
     * standalone mode the flag is false and the gate is skipped entirely.
     */
    private adminSessions: AdminSessionStore,
    private requireAdminForWrites: boolean
  ) {
    super();
  }

  /**
   * Authorize a destructive write. In server mode the request must carry a
   * valid admin session token (single-admin system → a live token == "the
   * admin"); a 401 is written and false returned otherwise. In client /
   * standalone mode there is no admin login, so writes are always allowed.
   *
   * @returns true if the handler may proceed, false if a 401 was sent.
   */
  private authorizeWrite(req: Request, res: Response): boolean {
    if (!this.requireAdminForWrites) return true;
    if (this.adminSessions.verify(extractBearerToken(req))) return true;
    this.unauthorized(res, 'Admin login required');
    return false;
  }

  setupRoutes(app: express.Application): void {
    app.get('/api/observations', this.handleGetObservations.bind(this));
    app.get('/api/summaries', this.handleGetSummaries.bind(this));
    app.get('/api/prompts', this.handleGetPrompts.bind(this));

    app.get('/api/observation/:id', this.handleGetObservationById.bind(this));
    app.get('/api/observations/by-file', this.handleGetObservationsByFile.bind(this));
    app.post('/api/observations/batch', validateBody(observationsBatchSchema), this.handleGetObservationsByIds.bind(this));
    app.get('/api/session/:id', this.handleGetSessionById.bind(this));
    app.post('/api/sdk-sessions/batch', validateBody(sdkSessionsBatchSchema), this.handleGetSdkSessionsByIds.bind(this));
    app.get('/api/prompt/:id', this.handleGetPromptById.bind(this));
    app.delete('/api/prompt/:id', this.handleDeletePromptById.bind(this));

    app.get('/api/stats', this.handleGetStats.bind(this));
    app.get('/api/projects', this.handleGetProjects.bind(this));
    app.get('/api/projects/stats', this.handleGetProjectStats.bind(this));

    app.get('/api/processing-status', this.handleGetProcessingStatus.bind(this));
    app.post('/api/processing', validateBody(setProcessingSchema), this.handleSetProcessing.bind(this));

    app.post('/api/import', validateBody(importSchema), this.handleImport.bind(this));
    app.post('/api/projects/delete', validateBody(deleteProjectsSchema), this.handleDeleteProjects.bind(this));
  }

  /**
   * Permanently delete a set of projects from this worker's storage. Refuses
   * to touch projects that are currently driving an SDK session (in-memory)
   * or have pending/processing queue rows.
   *
   * Request:  { projects: string[] }
   * Response: {
   *   deleted: string[],
   *   skipped: Array<{ project: string, reason: 'in_use', detail: string }>,
   *   errors:  Array<{ project: string, error: string }>,
   *   chromaResidue: string[]      // chroma collections that failed to drop
   * }
   *
   * Behaviour notes:
   *   - The SQLite delete runs in a single transaction; if it throws, NO
   *     project is partially deleted.
   *   - Chroma collections are dropped after the SQLite commit, best-effort.
   *     Residue is reported but does not flip the project from "deleted" to
   *     "errored" — chroma is reconstructable from SQLite at any time.
   *   - We re-check the in-use predicate immediately before the SQLite tx so
   *     a session that started during the request still gets a clean skip.
   */
  private handleDeleteProjects = this.wrapHandler(async (req: Request, res: Response): Promise<void> => {
    if (!this.authorizeWrite(req, res)) return;

    const { projects } = req.body as z.infer<typeof deleteProjectsSchema>;
    const requested = Array.from(new Set(projects));

    const store = this.dbManager.getSessionStore();
    const skipped: Array<{ project: string; reason: 'in_use'; detail: string }> = [];
    const errors: Array<{ project: string; error: string }> = [];

    const inMemoryActive = this.sessionManager.getProjectsInUse();
    const pendingActive = store.projectsWithPendingWork(requested);

    const candidates: string[] = [];
    for (const project of requested) {
      const memActive = inMemoryActive.has(project);
      const queueActive = pendingActive.has(project);
      if (memActive || queueActive) {
        const reasons: string[] = [];
        if (memActive) reasons.push('active SDK session');
        if (queueActive) reasons.push('pending queue rows');
        skipped.push({
          project,
          reason: 'in_use',
          detail: reasons.join(' + '),
        });
        continue;
      }
      candidates.push(project);
    }

    if (candidates.length === 0) {
      res.json({ deleted: [], skipped, errors, chromaResidue: [] });
      return;
    }

    let counts: Record<string, {
      observations: number; summaries: number;
      sessions: number; prompts: number; pending: number;
    }> = {};
    try {
      counts = store.deleteProjectsCompletely(candidates);
    } catch (error) {
      // SQL tx failed → nothing was deleted. Report every candidate as errored.
      const message = error instanceof Error ? error.message : String(error);
      logger.error('SESSION', 'Project delete transaction failed', {
        candidates,
      }, error instanceof Error ? error : new Error(message));
      for (const project of candidates) {
        errors.push({ project, error: message });
      }
      res.status(500).json({ deleted: [], skipped, errors, chromaResidue: [] });
      return;
    }

    // SQLite is committed — these projects are gone. Chroma is best-effort
    // from here on; we never put a successfully-deleted project back into the
    // errors list because of a chroma residue.
    const deleted = candidates;
    const chromaResidue: string[] = [];

    // Skip chroma entirely when it's disabled. Calling
    // ChromaSync.deleteCollectionForProject would force-instantiate the
    // singleton ChromaMcpManager and try to spawn uvx — exactly the
    // behaviour CLAUDE_MEM_CHROMA_ENABLED=false exists to prevent.
    const chromaEnabled = this.dbManager.getChromaSync() !== null;
    if (chromaEnabled) {
      for (const project of deleted) {
        try {
          await ChromaSync.deleteCollectionForProject(project);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.warn('CHROMA_SYNC', 'Failed to drop chroma collection after project delete (SQL already committed)', {
            project,
            error: message,
          });
          chromaResidue.push(project);
        }
      }
    } else {
      logger.debug('CHROMA_SYNC', 'Chroma disabled; skipping collection drop for deleted projects', {
        count: deleted.length,
      });
    }

    // Tell connected SSE clients the project list changed; they will prune
    // their local feed by project on receiving this event.
    this.sseBroadcaster.broadcast({
      type: 'projects_deleted',
      projects: deleted,
    });

    logger.info('SESSION', 'Projects deleted via /api/projects/delete', {
      requested: requested.length,
      deleted: deleted.length,
      skipped: skipped.length,
      errors: errors.length,
      chromaResidue: chromaResidue.length,
      counts,
    });

    res.json({ deleted, skipped, errors, chromaResidue });
  });

  private handleGetObservations = this.wrapHandler((req: Request, res: Response): void => {
    const { offset, limit, project, platformSource, dateStartEpoch, dateEndEpoch, userLabel } = this.parsePaginationParams(req);
    const result = this.paginationHelper.getObservations(offset, limit, project, platformSource, dateStartEpoch, dateEndEpoch, userLabel);
    res.json(result);
  });

  private handleGetSummaries = this.wrapHandler((req: Request, res: Response): void => {
    const { offset, limit, project, platformSource, dateStartEpoch, dateEndEpoch, userLabel } = this.parsePaginationParams(req);
    const result = this.paginationHelper.getSummaries(offset, limit, project, platformSource, dateStartEpoch, dateEndEpoch, userLabel);
    res.json(result);
  });

  private handleGetPrompts = this.wrapHandler((req: Request, res: Response): void => {
    const { offset, limit, project, platformSource, dateStartEpoch, dateEndEpoch, userLabel } = this.parsePaginationParams(req);
    const result = this.paginationHelper.getPrompts(offset, limit, project, platformSource, dateStartEpoch, dateEndEpoch, userLabel);
    res.json(result);
  });

  private handleGetObservationById = this.wrapHandler((req: Request, res: Response): void => {
    const id = this.parseIntParam(req, res, 'id');
    if (id === null) return;

    const store = this.dbManager.getSessionStore();
    const observation = store.getObservationById(id);

    if (!observation) {
      this.notFound(res, `Observation #${id} not found`);
      return;
    }

    res.json(observation);
  });

  private handleGetObservationsByFile = this.wrapHandler((req: Request, res: Response): void => {
    const filePath = req.query.path as string | undefined;
    if (!filePath) {
      this.badRequest(res, 'path query parameter is required');
      return;
    }

    const projects = normalizeStringArrayQuery(req.query.projects);
    const parsedLimit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const limit = Number.isFinite(parsedLimit) && parsedLimit! > 0 ? parsedLimit : undefined;

    const db = this.dbManager.getSessionStore().db;
    const observations = getObservationsByFilePath(db, filePath, { projects, limit });

    res.json({ observations, count: observations.length });
  });

  private handleGetObservationsByIds = this.wrapHandler((req: Request, res: Response): void => {
    const { ids, orderBy, limit, project } = req.body as z.infer<typeof observationsBatchSchema>;

    if (ids.length === 0) {
      res.json([]);
      return;
    }

    const store = this.dbManager.getSessionStore();
    const observations = store.getObservationsByIds(ids, { orderBy, limit, project });

    res.json(observations);
  });

  private handleGetSessionById = this.wrapHandler((req: Request, res: Response): void => {
    const id = this.parseIntParam(req, res, 'id');
    if (id === null) return;

    const store = this.dbManager.getSessionStore();
    const sessions = store.getSessionSummariesByIds([id]);

    if (sessions.length === 0) {
      this.notFound(res, `Session #${id} not found`);
      return;
    }

    res.json(sessions[0]);
  });

  private handleGetSdkSessionsByIds = this.wrapHandler((req: Request, res: Response): void => {
    const { memorySessionIds } = req.body as z.infer<typeof sdkSessionsBatchSchema>;

    const store = this.dbManager.getSessionStore();
    const sessions = store.getSdkSessionsBySessionIds(memorySessionIds);
    res.json(sessions);
  });

  private handleGetPromptById = this.wrapHandler((req: Request, res: Response): void => {
    const id = this.parseIntParam(req, res, 'id');
    if (id === null) return;

    const store = this.dbManager.getSessionStore();
    const prompts = store.getUserPromptsByIds([id]);

    if (prompts.length === 0) {
      this.notFound(res, `Prompt #${id} not found`);
      return;
    }

    res.json(prompts[0]);
  });

  /**
   * Permanently delete a single user prompt by id. Used by the viewer's
   * per-card delete button. On success we broadcast a `prompt_deleted` SSE
   * event so every connected client (including the originator) prunes the row
   * from its live feed without a manual refresh.
   *
   * Request:  DELETE /api/prompt/:id
   * Response: { deleted: true, id } | 404 if no such prompt.
   */
  private handleDeletePromptById = this.wrapHandler((req: Request, res: Response): void => {
    if (!this.authorizeWrite(req, res)) return;

    const id = this.parseIntParam(req, res, 'id');
    if (id === null) return;

    const store = this.dbManager.getSessionStore();
    const deleted = store.deletePromptById(id);

    if (!deleted) {
      this.notFound(res, `Prompt #${id} not found`);
      return;
    }

    this.sseBroadcaster.broadcast({ type: 'prompt_deleted', id });

    logger.info('SESSION', 'Prompt deleted via /api/prompt/:id', { id });
    res.json({ deleted: true, id });
  });

  private handleGetStats = this.wrapHandler((req: Request, res: Response): void => {
    const db = this.dbManager.getSessionStore().db;

    const packageRoot = getPackageRoot();
    const packageJsonPath = path.join(packageRoot, 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    const version = packageJson.version;

    const totalObservations = db.prepare('SELECT COUNT(*) as count FROM observations').get() as { count: number };
    const totalSessions = db.prepare('SELECT COUNT(*) as count FROM sdk_sessions').get() as { count: number };
    const totalSummaries = db.prepare('SELECT COUNT(*) as count FROM session_summaries').get() as { count: number };
    const firstObservationAt = getFirstObservationCreatedAt(db);

    const dbPath = paths.database();
    let dbSize = 0;
    if (existsSync(dbPath)) {
      dbSize = statSync(dbPath).size;
    }

    const uptime = getUptimeSeconds(this.startTime);
    const activeSessions = this.sessionManager.getActiveSessionCount();
    const sseClients = this.sseBroadcaster.getClientCount();

    res.json({
      worker: {
        version,
        uptime,
        activeSessions,
        sseClients,
        port: getWorkerPort()
      },
      database: {
        path: dbPath,
        size: dbSize,
        observations: totalObservations.count,
        sessions: totalSessions.count,
        summaries: totalSummaries.count,
        firstObservationAt
      }
    });
  });

  private handleGetProjects = this.wrapHandler((req: Request, res: Response): void => {
    const store = this.dbManager.getSessionStore();
    const rawPlatformSource = req.query.platformSource as string | undefined;
    const platformSource = rawPlatformSource ? normalizePlatformSource(rawPlatformSource) : undefined;

    if (platformSource) {
      const projects = store.getAllProjects(platformSource);
      res.json({
        projects,
        sources: [platformSource],
        projectsBySource: { [platformSource]: projects }
      });
      return;
    }

    res.json(store.getProjectCatalog());
  });

  /**
   * Per-project row counts (observations / summaries / prompts) plus a
   * `latest_epoch` timestamp, returned as an object keyed by project ID.
   *
   * Why this exists: the sidebar's project list used to derive its counts
   * from the in-memory `observations[]` / `summaries[]` / `prompts[]`
   * arrays accumulated via SSE. Those arrays only carry rows pushed during
   * the *current* SSE session, so after every worker restart the sidebar
   * reset to all-zeros even though SQLite still held the data. This endpoint
   * is the authoritative source; SSE deltas (`new_observation` etc.) keep
   * it fresh on the client between fetches.
   *
   * Worktree-adopted rows (`merged_into_project` set) are attributed to the
   * parent project so the sidebar shows aggregate counts that match the
   * context-inject view (which uses the same OR predicate).
   */
  private handleGetProjectStats = this.wrapHandler((req: Request, res: Response): void => {
    const db = this.dbManager.getSessionStore().db;
    type Stat = { observations: number; summaries: number; prompts: number; total: number; latest: number };
    const stats: Record<string, Stat> = {};
    const ensure = (project: string): Stat => {
      let s = stats[project];
      if (!s) {
        s = { observations: 0, summaries: 0, prompts: 0, total: 0, latest: 0 };
        stats[project] = s;
      }
      return s;
    };

    // Optional half-open day window [dateStart, dateEnd) in ms epoch. When
    // both are absent the endpoint behaves exactly like before (all-time
    // totals); when present, every count and every `latest` is restricted
    // to that window so the sidebar can render day-scoped stats.
    const parseEpoch = (raw: unknown): number | undefined => {
      if (typeof raw !== 'string' || raw.length === 0) return undefined;
      const n = Number.parseInt(raw, 10);
      return Number.isFinite(n) ? n : undefined;
    };
    const dateStart = parseEpoch(req.query.dateStart);
    const dateEnd = parseEpoch(req.query.dateEnd);

    // T-20: ?userLabel=Foo scopes every projects/stats count to one
    // employee. We need to JOIN sdk_sessions on memory_session_id for
    // observations + summaries, and reuse the existing JOIN for prompts.
    const rawUserLabel = req.query.userLabel;
    const userLabel = typeof rawUserLabel === 'string' && rawUserLabel.trim().length > 0
      ? rawUserLabel.trim()
      : undefined;

    const dateConds: string[] = [];
    const dateParams: SQLQueryBindings[] = [];
    if (dateStart !== undefined) {
      dateConds.push('o.created_at_epoch >= ?');
      dateParams.push(dateStart);
    }
    if (dateEnd !== undefined) {
      dateConds.push('o.created_at_epoch < ?');
      dateParams.push(dateEnd);
    }
    if (userLabel !== undefined) {
      dateConds.push('s.user_label = ?');
      dateParams.push(userLabel);
    }
    const userJoin = userLabel !== undefined ? ' JOIN sdk_sessions s ON s.memory_session_id = o.memory_session_id' : '';
    const obsWhere = dateConds.length ? ' WHERE ' + dateConds.join(' AND ') : '';

    const obsRows = db.prepare(`
      SELECT COALESCE(NULLIF(o.merged_into_project, ''), o.project) AS project,
             COUNT(*) AS n,
             COALESCE(MAX(o.created_at_epoch), 0) AS latest
      FROM observations o${userJoin}${obsWhere}
      GROUP BY COALESCE(NULLIF(o.merged_into_project, ''), o.project)
    `).all(...dateParams) as Array<{ project: string; n: number; latest: number }>;
    for (const row of obsRows) {
      if (!row.project) continue;
      const s = ensure(row.project);
      s.observations = row.n;
      s.total += row.n;
      if (row.latest > s.latest) s.latest = row.latest;
    }

    // session_summaries uses `o.` as its alias for symmetry with the obs
    // query above so we can share `dateConds` and `dateParams`.
    const sumWhere = dateConds.length ? ' WHERE ' + dateConds.join(' AND ') : '';
    const sumJoin = userLabel !== undefined ? ' JOIN sdk_sessions s ON s.memory_session_id = o.memory_session_id' : '';
    const sumRows = db.prepare(`
      SELECT COALESCE(NULLIF(o.merged_into_project, ''), o.project) AS project,
             COUNT(*) AS n,
             COALESCE(MAX(o.created_at_epoch), 0) AS latest
      FROM session_summaries o${sumJoin}${sumWhere}
      GROUP BY COALESCE(NULLIF(o.merged_into_project, ''), o.project)
    `).all(...dateParams) as Array<{ project: string; n: number; latest: number }>;
    for (const row of sumRows) {
      if (!row.project) continue;
      const s = ensure(row.project);
      s.summaries = row.n;
      s.total += row.n;
      if (row.latest > s.latest) s.latest = row.latest;
    }

    // Prompts already JOINs sdk_sessions, just append the optional filters.
    const promptConds: string[] = [];
    const promptParams: SQLQueryBindings[] = [];
    if (dateStart !== undefined) {
      promptConds.push('up.created_at_epoch >= ?');
      promptParams.push(dateStart);
    }
    if (dateEnd !== undefined) {
      promptConds.push('up.created_at_epoch < ?');
      promptParams.push(dateEnd);
    }
    if (userLabel !== undefined) {
      promptConds.push('s.user_label = ?');
      promptParams.push(userLabel);
    }
    const dateWherePromptsExtra = promptConds.length ? ' AND ' + promptConds.join(' AND ') : '';

    const promptRows = db.prepare(`
      SELECT s.project AS project,
             COUNT(*) AS n,
             COALESCE(MAX(up.created_at_epoch), 0) AS latest
      FROM user_prompts up
      JOIN sdk_sessions s ON s.content_session_id = up.content_session_id
      WHERE s.project IS NOT NULL AND s.project != ''${dateWherePromptsExtra}
      GROUP BY s.project
    `).all(...promptParams) as Array<{ project: string; n: number; latest: number }>;
    for (const row of promptRows) {
      if (!row.project) continue;
      const s = ensure(row.project);
      s.prompts = row.n;
      s.total += row.n;
      if (row.latest > s.latest) s.latest = row.latest;
    }

    const projectUsers = this.dbManager.getSessionStore().getProjectCatalog().projectUsers;
    res.json({ projects: stats, projectUsers });
  });

  private handleGetProcessingStatus = this.wrapHandler(async (req: Request, res: Response): Promise<void> => {
    const isProcessing = await this.sessionManager.isAnySessionProcessing();
    const queueDepth = await this.sessionManager.getTotalActiveWork(); 
    res.json({ isProcessing, queueDepth });
  });

  private handleSetProcessing = this.wrapHandler(async (req: Request, res: Response): Promise<void> => {
    const isProcessing = await this.sessionManager.isAnySessionProcessing();
    const queueDepth = await this.sessionManager.getTotalQueueDepth();
    const activeSessions = this.sessionManager.getActiveSessionCount();

    res.json({ status: 'ok', isProcessing, queueDepth, activeSessions });
  });

  private parsePaginationParams(req: Request): {
    offset: number;
    limit: number;
    project?: string;
    platformSource?: string;
    dateStartEpoch?: number;
    dateEndEpoch?: number;
    userLabel?: string;
  } {
    const offset = parseInt(req.query.offset as string, 10) || 0;
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 100);
    const project = req.query.project as string | undefined;
    const rawPlatformSource = req.query.platformSource as string | undefined;
    const platformSource = rawPlatformSource ? normalizePlatformSource(rawPlatformSource) : undefined;

    // dateStart / dateEnd are millisecond epoch values. The client computes
    // them in its own timezone (start = local-midnight, end = next-midnight)
    // so we don't have to guess. Anything non-numeric is dropped — never
    // 500 the request just because the query string is malformed.
    const parseEpoch = (raw: unknown): number | undefined => {
      if (typeof raw !== 'string' || raw.length === 0) return undefined;
      const n = Number.parseInt(raw, 10);
      return Number.isFinite(n) ? n : undefined;
    };
    const dateStartEpoch = parseEpoch(req.query.dateStart);
    const dateEndEpoch = parseEpoch(req.query.dateEnd);

    // T-20: viewer (server mode) sends ?userLabel=Foo to scope all lists
    // and stats to that employee. Empty string is treated as "no filter".
    const rawUserLabel = req.query.userLabel;
    const userLabel = typeof rawUserLabel === 'string' && rawUserLabel.trim().length > 0
      ? rawUserLabel.trim()
      : undefined;

    return { offset, limit, project, platformSource, dateStartEpoch, dateEndEpoch, userLabel };
  }

  private handleImport = this.wrapHandler((req: Request, res: Response): void => {
    const { sessions, summaries, observations, prompts } = req.body;

    const stats = {
      sessionsImported: 0,
      sessionsSkipped: 0,
      summariesImported: 0,
      summariesSkipped: 0,
      observationsImported: 0,
      observationsSkipped: 0,
      promptsImported: 0,
      promptsSkipped: 0
    };

    const store = this.dbManager.getSessionStore();

    if (Array.isArray(sessions)) {
      for (const session of sessions) {
        const result = store.importSdkSession(session);
        if (result.imported) {
          stats.sessionsImported++;
        } else {
          stats.sessionsSkipped++;
        }
      }
    }

    if (Array.isArray(summaries)) {
      for (const summary of summaries) {
        const result = store.importSessionSummary(summary);
        if (result.imported) {
          stats.summariesImported++;
        } else {
          stats.summariesSkipped++;
        }
      }
    }

    const importedObservations: Array<{ id: number; obs: typeof observations[0] }> = [];
    if (Array.isArray(observations)) {
      for (const obs of observations) {
        const result = store.importObservation(obs);
        if (result.imported) {
          stats.observationsImported++;
          importedObservations.push({ id: result.id, obs });
        } else {
          stats.observationsSkipped++;
        }
      }

      if (stats.observationsImported > 0) {
        store.rebuildObservationsFTSIndex();
      }

      const chromaSync = this.dbManager.getChromaSync();
      if (chromaSync && importedObservations.length > 0) {
        const CHROMA_SYNC_CONCURRENCY = 8;
        const safeParseJson = (val: string | null): string[] => {
          if (!val) return [];
          try { return JSON.parse(val); } catch { return []; }
        };

        const syncOne = async ({ id, obs }: { id: number; obs: any }) => {
          const parsedObs = {
            type: obs.type || 'discovery',
            title: obs.title || null,
            subtitle: obs.subtitle || null,
            facts: safeParseJson(obs.facts),
            narrative: obs.narrative || null,
            concepts: safeParseJson(obs.concepts),
            files_read: safeParseJson(obs.files_read),
            files_modified: safeParseJson(obs.files_modified),
          };

          await chromaSync.syncObservation(
            id,
            obs.memory_session_id,
            obs.project,
            parsedObs,
            obs.prompt_number || 0,
            obs.created_at_epoch,
            obs.discovery_tokens || 0
          ).catch(err => {
            logger.error('CHROMA', 'Import ChromaDB sync failed', { id }, err as Error);
          });
        };

        (async () => {
          for (let i = 0; i < importedObservations.length; i += CHROMA_SYNC_CONCURRENCY) {
            const batch = importedObservations.slice(i, i + CHROMA_SYNC_CONCURRENCY);
            await Promise.all(batch.map(syncOne));
          }
        })().catch(err => {
          logger.error('CHROMA', 'Import ChromaDB batch sync failed', {}, err as Error);
        });
      }
    }

    if (Array.isArray(prompts)) {
      for (const prompt of prompts) {
        const result = store.importUserPrompt(prompt);
        if (result.imported) {
          stats.promptsImported++;
        } else {
          stats.promptsSkipped++;
        }
      }
    }

    res.json({
      success: true,
      stats
    });
  });

}
