import { createHash } from 'crypto';
import type { Request } from 'express';
import type { Database } from 'bun:sqlite';
import { logger } from '../../../utils/logger.js';
import type { SyncAuthStrategy } from './types.js';

interface ApiKeyRow {
  id: string;
  key_hash: string;
  status: string;
  expires_at_epoch: number | null;
  bound_user_label: string | null;
}

/**
 * Full ApiKeyAuth implementation (T-29 / S-doc §8.2).
 *
 * Verifies Bearer tokens against the `api_keys` table and enforces
 * user_label binding so an employee cannot use their key to push as a
 * different identity.
 *
 * Verify flow:
 *   1. Extract `Authorization: Bearer cmem_xxx`
 *   2. SHA-256 the raw key
 *   3. SELECT from api_keys WHERE key_hash = :hash
 *   4. Reject if not found, revoked, or expired
 *   5. Reject if bound_user_label ≠ req.body.user_label
 *   6. Set req.syncContext.authenticatedUserLabel
 */
export class ApiKeyAuth implements SyncAuthStrategy {
  readonly mode = 'apikey' as const;

  constructor(private readonly getDb: () => Database) {}

  async authenticate(req: Request): Promise<string | null> {
    const token = extractBearer(req);
    if (!token) {
      return 'missing Authorization: Bearer header';
    }

    const hash = createHash('sha256').update(token).digest('hex');

    let db: Database;
    try {
      db = this.getDb();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('SYNC_AUTH', 'ApiKeyAuth: failed to get database connection', {}, err instanceof Error ? err : new Error(msg));
      return 'internal auth error: db unavailable';
    }

    const row = db.prepare(`
      SELECT id, key_hash, status, expires_at_epoch, bound_user_label
      FROM api_keys
      WHERE key_hash = ?
    `).get(hash) as ApiKeyRow | undefined;

    if (!row) {
      logger.warn('SYNC_AUTH', 'ApiKeyAuth: no key matched hash', { prefix: token.slice(0, 10) });
      return 'invalid API key';
    }

    if (row.status !== 'active') {
      logger.warn('SYNC_AUTH', 'ApiKeyAuth: key is revoked', { keyId: row.id });
      return 'API key has been revoked';
    }

    if (row.expires_at_epoch !== null && row.expires_at_epoch <= Date.now()) {
      logger.warn('SYNC_AUTH', 'ApiKeyAuth: key is expired', { keyId: row.id, expiresAt: row.expires_at_epoch });
      return 'API key has expired';
    }

    // Mark last_used_at so the admin CLI can show activity.
    db.prepare('UPDATE api_keys SET last_used_at_epoch = ? WHERE id = ?')
      .run(Date.now(), row.id);

    const bodyLabel = req.body && typeof req.body === 'object'
      ? pickString((req.body as Record<string, unknown>).user_label)
      : null;

    // Enforce user_label binding when the key has one.
    if (row.bound_user_label) {
      if (!bodyLabel) {
        return 'request body must include user_label';
      }
      if (row.bound_user_label !== bodyLabel) {
        logger.warn('SYNC_AUTH', 'ApiKeyAuth: user_label mismatch', {
          keyId: row.id,
          bound: row.bound_user_label,
          claimed: bodyLabel,
        });
        return 'API key is bound to a different user_label';
      }
    }

    req.syncContext = {
      authMode: 'apikey',
      authenticatedUserLabel: bodyLabel ?? row.bound_user_label ?? null,
    };

    return null;
  }
}

function extractBearer(req: Request): string | null {
  const header = req.headers['authorization'];
  if (typeof header !== 'string') return null;
  const trimmed = header.trim();
  if (!trimmed.startsWith('Bearer ')) return null;
  const token = trimmed.slice(7).trim();
  return token.length > 0 ? token : null;
}

function pickString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}
