import { logger } from '../../../utils/logger.js';
import { ApiKeyAuth } from './ApiKeyAuth.js';
import { NoopAuth } from './NoopAuth.js';
import type { SyncAuthMode, SyncAuthStrategy } from './types.js';

export type { SyncAuthMode, SyncAuthStrategy, SyncContext } from './types.js';
export { NoopAuth, ApiKeyAuth };

export interface BuildAuthChainSettings {
  CLAUDE_MEM_SERVER_AUTH_MODE?: string;
}

/**
 * Build the active server-side sync auth strategy from settings.
 *
 * Returns NoopAuth for any unrecognised / unimplemented mode so the
 * server still boots and rejects via the allow-list rather than 5xx-ing
 * on every request. Misconfiguration is logged at WARN level so it
 * surfaces in the worker log without crashing.
 */
export function buildAuthChain(settings: BuildAuthChainSettings): SyncAuthStrategy {
  const raw = (settings.CLAUDE_MEM_SERVER_AUTH_MODE ?? 'none').trim().toLowerCase();
  const mode = (raw === '' ? 'none' : raw) as SyncAuthMode;

  switch (mode) {
    case 'none':
      return new NoopAuth();
    case 'apikey':
      return new ApiKeyAuth({ keys: {} });
    case 'jwt':
    case 'mtls':
      logger.warn('SYNC_AUTH', `auth mode '${mode}' not implemented yet, falling back to NoopAuth`);
      return new NoopAuth();
    default:
      logger.warn('SYNC_AUTH', `unknown auth mode '${raw}', falling back to NoopAuth`);
      return new NoopAuth();
  }
}
