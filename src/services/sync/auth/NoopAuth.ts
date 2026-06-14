import type { Request } from 'express';
import { logger } from '../../../utils/logger.js';
import type { SyncAuthStrategy } from './types.js';

/**
 * NoopAuth — the first-version posture (S-doc §4.1, frpc tunnel).
 *
 * Doesn't validate anything; simply echoes the claimed user_label from
 * the request body (or X-Sync-User header) into `req.syncContext` so the
 * allow-list and ingest stages always have a single uniform place to
 * read identity from, regardless of the auth mode.
 *
 * Security note: NoopAuth provides ZERO attestation. It MUST only be
 * used behind a trusted network boundary (frpc tunnel inside an office
 * LAN, loopback-only nginx, etc.). The tokenAuth / serverApiGate
 * middleware is the actual perimeter when this strategy is selected.
 */
export class NoopAuth implements SyncAuthStrategy {
  readonly mode = 'none' as const;

  async authenticate(req: Request): Promise<string | null> {
    const headerLabel = pickString(req.headers['x-sync-user']);
    const bodyLabel = req.body && typeof req.body === 'object'
      ? pickString((req.body as Record<string, unknown>).user_label)
      : null;

    req.syncContext = {
      authMode: 'none',
      authenticatedUserLabel: bodyLabel ?? headerLabel ?? null,
    };

    if (!req.syncContext.authenticatedUserLabel) {
      logger.debug('SYNC_AUTH', 'NoopAuth: request has no user_label claim');
    }

    return null;
  }
}

function pickString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}
