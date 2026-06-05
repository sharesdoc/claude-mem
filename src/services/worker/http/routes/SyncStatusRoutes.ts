import express, { Request, Response } from 'express';
import { BaseRouteHandler } from '../BaseRouteHandler.js';
import { readState } from '../../../sync/sync-state.js';
import type { DatabaseManager } from '../../DatabaseManager.js';
import { SettingsDefaultsManager } from '../../../../shared/SettingsDefaultsManager.js';
import { USER_SETTINGS_PATH } from '../../../../shared/paths.js';

/**
 * /api/sync/status — TODO T-25.
 *
 * Returns enough state for the viewer Header badge to render:
 *   - last_sync_at / last_success_at (timestamps)
 *   - consecutive failures + last error
 *   - watermark + lag (current max id - watermark per table)
 *   - role + sync-enabled flag (so the viewer knows when to hide the
 *     badge entirely, e.g. server mode or sync disabled)
 *
 * Read-only and cheap: 4 SELECT MAX(id) queries + one file read.
 */
export class SyncStatusRoutes extends BaseRouteHandler {
  constructor(
    private readonly dbManager: DatabaseManager,
    private readonly syncAgentAccessor?: () => { scheduleSoon(delayMs?: number): void } | undefined,
    private readonly settingsPathResolver: () => string = () => USER_SETTINGS_PATH,
    private readonly statePathResolver: () => string | undefined = () => undefined,
  ) {
    super();
  }

  setupRoutes(app: express.Application): void {
    app.get('/api/sync/status', this.handleGet.bind(this));
    app.post('/api/sync/trigger', this.handleTrigger.bind(this));
  }

  private handleGet = this.wrapHandler(async (_req: Request, res: Response): Promise<void> => {
    const settings = SettingsDefaultsManager.loadFromFile(this.settingsPathResolver());
    const role = (settings.CLAUDE_MEM_NODE_ROLE ?? 'client').trim().toLowerCase() === 'server' ? 'server' : 'client';
    const syncEnabled = (settings.CLAUDE_MEM_SYNC_ENABLED ?? 'true').trim().toLowerCase() === 'true';
    const upstream = (settings.CLAUDE_MEM_SYNC_UPSTREAM_URL ?? '').trim();

    const state = readState(this.statePathResolver());
    const lag = this.computeLag(state.watermark);

    res.json({
      role,
      sync_enabled: syncEnabled,
      upstream,
      last_sync_at: state.last_sync_at,
      last_success_at: state.last_success_at,
      consecutive_failures: state.failures.consecutive,
      last_error: state.failures.last_error,
      watermark: state.watermark,
      lag,
    });
  });

  /** POST /api/sync/trigger — force an immediate sync tick, wait, return status. */
  private handleTrigger = this.wrapHandler(async (_req: Request, res: Response): Promise<void> => {
    const agent = this.syncAgentAccessor?.();
    if (!agent) {
      res.status(400).json({ ok: false, error: 'Sync agent not available (client mode only)' });
      return;
    }
    agent.scheduleSoon(0);
    await new Promise(r => setTimeout(r, 3000));
    // Read fresh state and return it
    const settings = SettingsDefaultsManager.loadFromFile(this.settingsPathResolver());
    const role = (settings.CLAUDE_MEM_NODE_ROLE ?? 'client').trim().toLowerCase() === 'server' ? 'server' : 'client';
    const state = readState(this.statePathResolver());
    const lag = this.computeLag(state.watermark);
    res.json({
      ok: state.failures.consecutive === 0,
      error: state.failures.last_error,
      status: { role, sync_enabled: true, upstream: (settings.CLAUDE_MEM_SYNC_UPSTREAM_URL ?? '').trim(),
        last_sync_at: state.last_sync_at, last_success_at: state.last_success_at,
        consecutive_failures: state.failures.consecutive, last_error: state.failures.last_error,
        watermark: state.watermark, lag },
    });
  });

  /**
   * Lag = MAX(id) per table minus the per-table watermark. Negative
   * values clamp to 0 (DB was reset under us). The viewer shows the
   * sum as "{n} pending".
   */
  private computeLag(watermark: { sessions: number; observations: number; summaries: number; prompts: number }): {
    sessions: number; observations: number; summaries: number; prompts: number; total: number;
  } {
    const db = this.dbManager.getConnection();
    const ms = (db.prepare('SELECT COALESCE(MAX(id),0) AS m FROM sdk_sessions').get() as { m: number }).m;
    const mo = (db.prepare('SELECT COALESCE(MAX(id),0) AS m FROM observations').get() as { m: number }).m;
    const mu = (db.prepare('SELECT COALESCE(MAX(id),0) AS m FROM session_summaries').get() as { m: number }).m;
    const mp = (db.prepare('SELECT COALESCE(MAX(id),0) AS m FROM user_prompts').get() as { m: number }).m;
    const sessions = Math.max(0, ms - (watermark.sessions ?? 0));
    const observations = Math.max(0, mo - (watermark.observations ?? 0));
    const summaries = Math.max(0, mu - (watermark.summaries ?? 0));
    const prompts = Math.max(0, mp - (watermark.prompts ?? 0));
    return { sessions, observations, summaries, prompts, total: sessions + observations + summaries + prompts };
  }
}
