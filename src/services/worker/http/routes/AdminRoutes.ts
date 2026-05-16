import express, { Request, Response } from 'express';
import { BaseRouteHandler } from '../BaseRouteHandler.js';
import { SettingsDefaultsManager } from '../../../../shared/SettingsDefaultsManager.js';
import { USER_SETTINGS_PATH } from '../../../../shared/paths.js';
import { resolveUserLabel } from '../../../../shared/user-label.js';

/**
 * /api/admin/role (TODO T-18 / S-doc §11)
 *
 * Single-purpose endpoint the viewer hits once at boot to learn whether
 * it is rendering data from a `client` (single-user) or `server`
 * (multi-user fleet) worker. The viewer uses the answer to decide
 * whether to render the employee selector / per-user stats panes.
 *
 * Why a dedicated namespace instead of folding into /api/stats:
 *  - The viewer needs this before any data fetch (it gates UI shape)
 *  - Keeping role/identity introspection on /api/admin keeps it out of
 *    /api/sync where future auth strategies live
 */
export class AdminRoutes extends BaseRouteHandler {
  /**
   * `settingsPathResolver` defaults to the canonical USER_SETTINGS_PATH
   * resolved at module load. Tests pass a per-test path so they can
   * exercise the endpoint without mutating the real `~/.claude-mem`.
   */
  constructor(private readonly settingsPathResolver: () => string = () => USER_SETTINGS_PATH) {
    super();
  }

  setupRoutes(app: express.Application): void {
    app.get('/api/admin/role', this.handleGetRole.bind(this));
  }

  private handleGetRole = this.wrapHandler(async (_req: Request, res: Response): Promise<void> => {
    const settingsPath = this.settingsPathResolver();
    const settings = SettingsDefaultsManager.loadFromFile(settingsPath);
    const raw = (settings.CLAUDE_MEM_NODE_ROLE ?? 'client').trim().toLowerCase();
    const role: 'client' | 'server' = raw === 'server' ? 'server' : 'client';

    res.json({
      role,
      userLabel: resolveUserLabel(settingsPath),
    });
  });
}
