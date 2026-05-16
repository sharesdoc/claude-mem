import type { Database } from 'bun:sqlite';
import { logger } from '../../../utils/logger.js';
import { ApiKeyAuth } from './ApiKeyAuth.js';
import { NoopAuth } from './NoopAuth.js';
import type { SyncAuthMode, SyncAuthStrategy } from './types.js';

export type { SyncAuthMode, SyncAuthStrategy, SyncContext } from './types.js';
export { NoopAuth, ApiKeyAuth };

export interface BuildAuthChainSettings {
  CLAUDE_MEM_SERVER_AUTH_MODE?: string;
}

export interface BuildAuthChainOptions {
  settings: BuildAuthChainSettings;
  /** Lazy DB access so ApiKeyAuth can query api_keys at verify time. */
  getDb?: () => Database;
}

/**
 * Build the active server-side sync auth strategy from settings.
 *
 * Returns NoopAuth for any unrecognised / unimplemented mode.
 * Misconfiguration is logged at WARN level.
 */
export function buildAuthChain(opts: BuildAuthChainOptions): SyncAuthStrategy {
  const raw = (opts.settings.CLAUDE_MEM_SERVER_AUTH_MODE ?? 'none').trim().toLowerCase();
  const mode = (raw === '' ? 'none' : raw) as SyncAuthMode;

  switch (mode) {
    case 'none':
      return new NoopAuth();
    case 'apikey':
      if (!opts.getDb) {
        logger.warn('SYNC_AUTH', 'apikey mode selected but no DB access provided, falling back to NoopAuth');
        return new NoopAuth();
      }
      return new ApiKeyAuth(opts.getDb);
    case 'jwt':
    case 'mtls':
      logger.warn('SYNC_AUTH', `auth mode '${mode}' not implemented yet, falling back to NoopAuth`);
      return new NoopAuth();
    default:
      logger.warn('SYNC_AUTH', `unknown auth mode '${raw}', falling back to NoopAuth`);
      return new NoopAuth();
  }
}
