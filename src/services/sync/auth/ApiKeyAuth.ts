import type { Request } from 'express';
import { logger } from '../../../utils/logger.js';
import { NotImplementedAuthError, type SyncAuthStrategy } from './types.js';

/**
 * Placeholder for the cloud / public-internet posture (S-doc §4.2).
 *
 * Wired up so the auth chain factory can return a non-noop instance when
 * settings say `auth_mode=apikey`, but the verify call throws
 * NotImplementedAuthError. This is intentional for the first version —
 * we ship the wiring + tests so a future commit only has to fill in
 * `authenticate()` (constant-time compare + per-key user_label lookup).
 */
export class ApiKeyAuth implements SyncAuthStrategy {
  readonly mode = 'apikey' as const;

  constructor(_options: { keys: Record<string, string> }) {
    // keys layout (future): { '<sha256-of-key>': '<user_label>' }
  }

  async authenticate(_req: Request): Promise<string | null> {
    logger.warn('SYNC_AUTH', 'ApiKeyAuth.authenticate called before implementation lands');
    throw new NotImplementedAuthError('apikey');
  }
}
