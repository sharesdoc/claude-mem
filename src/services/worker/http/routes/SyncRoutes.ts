import express, { Request, Response } from 'express';
import { z } from 'zod';
import { BaseRouteHandler } from '../BaseRouteHandler.js';
import { validateBody } from '../middleware/validateBody.js';
import { trustProxies } from '../middleware/trustProxies.js';
import { enforceAllowList } from '../middleware/enforceAllowList.js';
import { tokenAuth } from '../middleware/tokenAuth.js';
import { logger } from '../../../../utils/logger.js';
import { buildAuthChain, type SyncAuthStrategy } from '../../../sync/auth/index.js';
import type { DatabaseManager } from '../../DatabaseManager.js';
import type { Request as ExpressRequest, Response as ExpressResponse, NextFunction } from 'express';
import type { SSEBroadcaster } from '../../SSEBroadcaster.js';
import { shouldEmitProjectRow } from '../../../../shared/should-track-project.js';

/**
 * T-09 — POST /api/sync/ingest (server-only).
 *
 * Middleware chain layers each operator-controlled boundary in order:
 *   trustProxies → requireTls → auth → allowList → validate → handler
 *
 * Each layer is wired from its settings key so an operator can enable
 * exactly the surface that fits their deployment without code changes.
 * The handler itself is dumb: it runs the whole batch inside a single
 * SQLite transaction and rolls back on any error, then reports the
 * server-side watermark so the client can advance.
 */

const sessionSchema = z.object({
  id: z.number().int().nonnegative(),
  content_session_id: z.string(),
  memory_session_id: z.string().nullable(),
  project: z.string(),
  platform_source: z.string(),
  user_prompt: z.string().nullable(),
  custom_title: z.string().nullable(),
  started_at: z.string(),
  started_at_epoch: z.number().int(),
  completed_at: z.string().nullable(),
  completed_at_epoch: z.number().int().nullable(),
  status: z.string(),
  user_name: z.string().nullable(),
  user_label: z.string().nullable(),
}).passthrough();

const observationSchema = z.object({
  id: z.number().int().nonnegative(),
  memory_session_id: z.string(),
  project: z.string(),
  type: z.string(),
  title: z.string().nullable(),
  subtitle: z.string().nullable(),
  text: z.string().nullable(),
  facts: z.string().nullable(),
  narrative: z.string().nullable(),
  concepts: z.string().nullable(),
  files_read: z.string().nullable(),
  files_modified: z.string().nullable(),
  prompt_number: z.number().int().nullable(),
  created_at: z.string(),
  created_at_epoch: z.number().int(),
  content_hash: z.string().nullable(),
}).passthrough();

const summarySchema = z.object({
  id: z.number().int().nonnegative(),
  memory_session_id: z.string(),
  project: z.string(),
  request: z.string().nullable(),
  investigated: z.string().nullable(),
  learned: z.string().nullable(),
  completed: z.string().nullable(),
  next_steps: z.string().nullable(),
  files_read: z.string().nullable(),
  files_edited: z.string().nullable(),
  notes: z.string().nullable(),
  prompt_number: z.number().int().nullable(),
  created_at: z.string(),
  created_at_epoch: z.number().int(),
}).passthrough();

const promptSchema = z.object({
  id: z.number().int().nonnegative(),
  content_session_id: z.string(),
  prompt_number: z.number().int(),
  prompt_text: z.string(),
  created_at: z.string(),
  created_at_epoch: z.number().int(),
}).passthrough();

const syncIngestSchema = z.object({
  schema_version: z.literal(1),
  user_label: z.string().min(1),
  generated_at_epoch: z.number().int(),
  sessions: z.array(sessionSchema),
  observations: z.array(observationSchema),
  summaries: z.array(summarySchema),
  prompts: z.array(promptSchema),
});

type SyncIngestPayload = z.infer<typeof syncIngestSchema>;

export interface SyncRoutesSettings {
  CLAUDE_MEM_SERVER_TRUSTED_PROXIES: string;
  CLAUDE_MEM_SERVER_REQUIRE_TLS: string;
  CLAUDE_MEM_SERVER_AUTH_MODE: string;
  CLAUDE_MEM_SERVER_ALLOWED_USERS: string;
  CLAUDE_MEM_SERVER_ACCESS_TOKEN: string;
  CLAUDE_MEM_SERVER_INGEST_MAX_BATCH: string;
}

export class SyncRoutes extends BaseRouteHandler {
  private readonly authChain: SyncAuthStrategy;
  private readonly maxBatch: number;
  private readonly sseBroadcaster: SSEBroadcaster | undefined;

  constructor(
    private readonly dbManager: DatabaseManager,
    private readonly settings: SyncRoutesSettings,
    sseBroadcaster?: SSEBroadcaster,
  ) {
    super();
    this.sseBroadcaster = sseBroadcaster;
    this.authChain = buildAuthChain({
      settings: this.settings,
      getDb: () => this.dbManager.getConnection(),
    });
    const parsed = Number.parseInt(this.settings.CLAUDE_MEM_SERVER_INGEST_MAX_BATCH ?? '1000', 10);
    this.maxBatch = Number.isFinite(parsed) && parsed > 0 ? parsed : 1000;
  }

  setupRoutes(app: express.Application): void {
    app.post(
      '/api/sync/ingest',
      trustProxies(this.settings.CLAUDE_MEM_SERVER_TRUSTED_PROXIES ?? ''),
      tokenAuth(this.settings.CLAUDE_MEM_SERVER_ACCESS_TOKEN ?? ''),
      this.requireTls(),
      this.authMiddleware(),
      enforceAllowList(this.settings.CLAUDE_MEM_SERVER_ALLOWED_USERS ?? ''),
      validateBody(syncIngestSchema),
      this.handleIngest.bind(this),
    );
  }

  private requireTls() {
    const required = (this.settings.CLAUDE_MEM_SERVER_REQUIRE_TLS ?? 'false').trim().toLowerCase() === 'true';
    return (req: ExpressRequest, res: ExpressResponse, next: NextFunction): void => {
      if (!required) {
        next();
        return;
      }
      const forwardedProto = req.headers['x-forwarded-proto'];
      const proto = typeof forwardedProto === 'string' ? forwardedProto : req.protocol;
      if (proto === 'https') {
        next();
        return;
      }
      logger.warn('HTTP', 'sync ingest rejected: TLS required', { path: req.path, proto });
      res.status(400).json({ error: 'tls_required', reason: 'CLAUDE_MEM_SERVER_REQUIRE_TLS=true' });
    };
  }

  private authMiddleware() {
    return async (req: ExpressRequest, res: ExpressResponse, next: NextFunction): Promise<void> => {
      try {
        const reason = await this.authChain.authenticate(req);
        if (reason === null) {
          next();
          return;
        }
        logger.warn('SYNC_AUTH', 'sync ingest rejected by auth chain', { mode: this.authChain.mode, reason });
        res.status(401).json({ error: 'unauthorized', mode: this.authChain.mode, reason });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error('SYNC_AUTH', 'auth chain threw', { mode: this.authChain.mode }, err instanceof Error ? err : new Error(message));
        res.status(500).json({ error: 'auth_chain_failure', mode: this.authChain.mode, reason: message });
      }
    };
  }

  private handleIngest = this.wrapHandler(async (req: Request, res: Response): Promise<void> => {
    const payload = req.body as SyncIngestPayload;
    const total = payload.sessions.length + payload.observations.length + payload.summaries.length + payload.prompts.length;
    if (total > this.maxBatch) {
      res.status(413).json({
        error: 'batch_too_large',
        max: this.maxBatch,
        received: total,
      });
      return;
    }

    const { applied, nextWatermark } = this.applyBatch(payload);
    res.json({
      applied,
      next_watermark: nextWatermark,
    });

    // Broadcast SSE events so the viewer refreshes in real-time.
    this.broadcastBatchEvents(payload, applied);
  });

  /**
   * Apply the whole batch inside one transaction so partial failures
   * roll back cleanly. Returns per-table counts + the server-side
   * watermark so the client can advance.
   *
   * `sync_inbox` records every accepted row so a re-push of an
   * already-applied uid is silently skipped (idempotent ingest).
   */
  private applyBatch(payload: SyncIngestPayload): {
    applied: Record<string, { inserted: number; skipped: number }>;
    nextWatermark: Record<string, number>;
  } {
    const db = this.dbManager.getConnection();
    const applied = {
      sessions: { inserted: 0, skipped: 0 },
      observations: { inserted: 0, skipped: 0 },
      summaries: { inserted: 0, skipped: 0 },
      prompts: { inserted: 0, skipped: 0 },
    };

    const recordInbox = db.prepare(`
      INSERT OR IGNORE INTO sync_inbox (user_label, source_table, source_uid, applied_at_epoch, applied_row_id)
      VALUES (?, ?, ?, ?, ?)
    `);
    const inboxHas = db.prepare(`
      SELECT 1 FROM sync_inbox WHERE user_label = ? AND source_table = ? AND source_uid = ?
    `);

    const upsertSession = db.prepare(`
      INSERT INTO sdk_sessions
        (content_session_id, memory_session_id, project, platform_source, user_prompt,
         custom_title, started_at, started_at_epoch, completed_at, completed_at_epoch,
         status, user_name, user_label)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(content_session_id) DO NOTHING
    `);
    const upsertObs = db.prepare(`
      INSERT INTO observations
        (memory_session_id, project, text, type, title, subtitle, facts, narrative,
         concepts, files_read, files_modified, prompt_number, created_at, created_at_epoch, content_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(memory_session_id, content_hash) DO NOTHING
    `);
    const upsertSummary = db.prepare(`
      INSERT INTO session_summaries
        (memory_session_id, project, request, investigated, learned, completed,
         next_steps, files_read, files_edited, notes, prompt_number, created_at, created_at_epoch)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const upsertPrompt = db.prepare(`
      INSERT INTO user_prompts
        (content_session_id, prompt_number, prompt_text, created_at, created_at_epoch)
      VALUES (?, ?, ?, ?, ?)
    `);

    const now = Date.now();
    const tx = db.transaction((p: SyncIngestPayload) => {
      for (const s of p.sessions) {
        const sourceUid = s.content_session_id;
        if (inboxHas.get(p.user_label, 'sdk_sessions', sourceUid)) {
          applied.sessions.skipped++;
          continue;
        }
        upsertSession.run(
          s.content_session_id,
          s.memory_session_id ?? null,
          s.project,
          s.platform_source,
          s.user_prompt ?? null,
          s.custom_title ?? null,
          s.started_at,
          s.started_at_epoch,
          s.completed_at ?? null,
          s.completed_at_epoch ?? null,
          s.status,
          s.user_name ?? null,
          s.user_label ?? p.user_label,
        );
        recordInbox.run(p.user_label, 'sdk_sessions', sourceUid, now, s.id);
        applied.sessions.inserted++;
      }

      for (const o of p.observations) {
        const sourceUid = `${o.memory_session_id}:${o.content_hash ?? `${o.id}-${o.created_at_epoch}`}`;
        if (inboxHas.get(p.user_label, 'observations', sourceUid)) {
          applied.observations.skipped++;
          continue;
        }
        upsertObs.run(
          o.memory_session_id,
          o.project,
          o.text ?? null,
          o.type,
          o.title ?? null,
          o.subtitle ?? null,
          o.facts ?? null,
          o.narrative ?? null,
          o.concepts ?? null,
          o.files_read ?? null,
          o.files_modified ?? null,
          o.prompt_number ?? null,
          o.created_at,
          o.created_at_epoch,
          o.content_hash ?? null,
        );
        recordInbox.run(p.user_label, 'observations', sourceUid, now, o.id);
        applied.observations.inserted++;
      }

      for (const s of p.summaries) {
        const sourceUid = `${s.memory_session_id}:${s.prompt_number ?? s.created_at_epoch}`;
        if (inboxHas.get(p.user_label, 'session_summaries', sourceUid)) {
          applied.summaries.skipped++;
          continue;
        }
        upsertSummary.run(
          s.memory_session_id,
          s.project,
          s.request ?? null,
          s.investigated ?? null,
          s.learned ?? null,
          s.completed ?? null,
          s.next_steps ?? null,
          s.files_read ?? null,
          s.files_edited ?? null,
          s.notes ?? null,
          s.prompt_number ?? null,
          s.created_at,
          s.created_at_epoch,
        );
        recordInbox.run(p.user_label, 'session_summaries', sourceUid, now, s.id);
        applied.summaries.inserted++;
      }

      for (const pr of p.prompts) {
        const sourceUid = `${pr.content_session_id}:${pr.prompt_number}`;
        if (inboxHas.get(p.user_label, 'user_prompts', sourceUid)) {
          applied.prompts.skipped++;
          continue;
        }
        upsertPrompt.run(
          pr.content_session_id,
          pr.prompt_number,
          pr.prompt_text,
          pr.created_at,
          pr.created_at_epoch,
        );
        recordInbox.run(p.user_label, 'user_prompts', sourceUid, now, pr.id);
        applied.prompts.inserted++;
      }
    });

    tx(payload);

    const nextWatermark = this.computeWatermark(payload.user_label);
    return { applied, nextWatermark };
  }

  /**
   * Watermark is the server's view of "the largest source_id we have
   * for this user_label, per source table." Client uses these as the
   * next `WHERE id > :wm` lower bound.
   */
  private computeWatermark(userLabel: string): Record<string, number> {
    const db = this.dbManager.getConnection();
    const row = db.prepare(`
      SELECT source_table, MAX(applied_row_id) AS max_id
      FROM sync_inbox
      WHERE user_label = ?
      GROUP BY source_table
    `).all(userLabel) as Array<{ source_table: string; max_id: number | null }>;

    const wm: Record<string, number> = { sessions: 0, observations: 0, summaries: 0, prompts: 0 };
    for (const r of row) {
      switch (r.source_table) {
        case 'sdk_sessions': wm.sessions = r.max_id ?? 0; break;
        case 'observations': wm.observations = r.max_id ?? 0; break;
        case 'session_summaries': wm.summaries = r.max_id ?? 0; break;
        case 'user_prompts': wm.prompts = r.max_id ?? 0; break;
      }
    }
    return wm;
  }

  /**
   * Broadcast SSE events for newly inserted items so the viewer UI
   * refreshes in real-time after a client sync push.
   */
  private broadcastBatchEvents(
    payload: SyncIngestPayload,
    applied: Record<string, { inserted: number; skipped: number }>,
  ): void {
    if (!this.sseBroadcaster) return;

    // Build content_session_id → project map from sessions for prompts.
    const sessionProject = new Map<string, string>();
    for (const s of payload.sessions) {
      if (s.project) sessionProject.set(s.content_session_id, s.project);
    }

    if (applied.observations.inserted > 0) {
      for (const o of payload.observations) {
        if (!shouldEmitProjectRow(o.project)) continue;
        this.sseBroadcaster.broadcast({
          type: 'new_observation',
          observation: {
            id: o.id,
            memory_session_id: o.memory_session_id,
            session_id: o.memory_session_id,
            platform_source: 'sync',
            type: o.type,
            title: o.title ?? null,
            subtitle: o.subtitle ?? null,
            text: o.text ?? null,
            narrative: o.narrative ?? null,
            facts: o.facts ?? '',
            concepts: o.concepts ?? '',
            files_read: o.files_read ?? '',
            files_modified: o.files_modified ?? '',
            project: o.project,
            prompt_number: o.prompt_number ?? 0,
            user_name: null,
            created_at_epoch: o.created_at_epoch,
          },
        });
      }
    }

    if (applied.summaries.inserted > 0) {
      for (const s of payload.summaries) {
        if (!shouldEmitProjectRow(s.project)) continue;
        this.sseBroadcaster.broadcast({
          type: 'new_summary',
          summary: {
            id: s.id,
            session_id: s.memory_session_id,
            platform_source: 'sync',
            request: s.request ?? null,
            investigated: s.investigated ?? null,
            learned: s.learned ?? null,
            completed: s.completed ?? null,
            next_steps: s.next_steps ?? null,
            notes: s.notes ?? null,
            project: s.project,
            prompt_number: s.prompt_number ?? 0,
            user_name: null,
            created_at_epoch: s.created_at_epoch,
          },
        });
      }
    }

    if (applied.prompts.inserted > 0) {
      for (const p of payload.prompts) {
        const project = sessionProject.get(p.content_session_id) ?? '';
        if (!shouldEmitProjectRow(project)) continue;
        this.sseBroadcaster.broadcast({
          type: 'new_prompt',
          prompt: {
            id: p.id,
            content_session_id: p.content_session_id,
            project,
            platform_source: 'sync',
            prompt_number: p.prompt_number,
            prompt_text: p.prompt_text,
            user_name: null,
            created_at_epoch: p.created_at_epoch,
          },
        } as any);
      }
    }
  }
}
