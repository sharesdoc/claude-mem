import express, { Request, Response } from 'express';
import { readFileSync } from 'fs';
import { BaseRouteHandler } from '../BaseRouteHandler.js';
import { SettingsDefaultsManager } from '../../../../shared/SettingsDefaultsManager.js';
import { USER_SETTINGS_PATH } from '../../../../shared/paths.js';
import { resolveUserLabel } from '../../../../shared/user-label.js';

/**
 * Display-only refinement of `role` (see endpoint docs below).
 *
 * `role` defaults to 'client' for functional gating, so it can never tell
 * an explicit `--role client` install apart from a plain local-only one.
 * `deployment` answers that question by reading the *raw* configured value:
 *   - 'client' / 'server' → operator ran `install-claude-mem --role …`,
 *     which writes CLAUDE_MEM_NODE_ROLE into settings.json
 *   - 'standalone'        → the key is absent/empty/unrecognized, i.e. the
 *     user never opted into the sync architecture (local-only use)
 *
 * Env wins over the on-disk file so a one-boot `CLAUDE_MEM_NODE_ROLE=…`
 * override is reflected. We parse the file directly to bypass
 * SettingsDefaultsManager's default-merge, which would mask 'standalone'.
 */
function resolveDeployment(settingsPath: string): 'client' | 'server' | 'standalone' {
  const fromEnv = process.env.CLAUDE_MEM_NODE_ROLE;
  let raw = typeof fromEnv === 'string' ? fromEnv.trim().toLowerCase() : '';
  if (!raw) {
    try {
      const parsed = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      const flat = parsed?.env && typeof parsed.env === 'object' ? { ...parsed, ...parsed.env } : parsed;
      const value = flat?.CLAUDE_MEM_NODE_ROLE;
      raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
    } catch {
      // Missing/unreadable settings.json → treat as local-only.
      raw = '';
    }
  }
  if (raw === 'server') return 'server';
  if (raw === 'client') return 'client';
  return 'standalone';
}

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
      deployment: resolveDeployment(settingsPath),
      userLabel: resolveUserLabel(settingsPath),
    });
  });
}
