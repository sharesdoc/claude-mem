import type { Request, Response, NextFunction } from 'express';
import { logger } from '../../../../utils/logger.js';

/**
 * Server-mode middleware enforcing CLAUDE_MEM_SERVER_ALLOWED_USERS as a
 * whitelist of permitted `user_label` values on inbound sync ingest
 * requests. Empty list = allow all (developer / single-user mode).
 *
 * Why this exists separately from auth: even when CLAUDE_MEM_SERVER_AUTH_MODE
 * is `none` (the frpc-tunnel first-version posture), we still want a cheap
 * application-layer guard against accidental data injection from
 * unrecognised employee names. This middleware is the "second wall" — it
 * rejects unknown `user_label`s regardless of the auth strategy.
 *
 * Expected request shape:
 *   body.user_label : string  (also accepted from `X-Sync-User` header)
 *
 * On reject: 403 with a structured body so the client SyncAgent can log
 * the precise reason and surface it to the user.
 */
export function enforceAllowList(allowedCsv: string) {
  const raw = (allowedCsv ?? '').trim();
  const allowed = raw.length === 0
    ? null
    : new Set(
        raw
          .split(',')
          .map(s => s.trim())
          .filter(Boolean),
      );

  return function allowListMiddleware(req: Request, res: Response, next: NextFunction): void {
    // Permit-all when whitelist is empty (operator opted out / dev mode).
    if (allowed === null) {
      next();
      return;
    }

    const headerLabel = req.header('X-Sync-User');
    const bodyLabel = (req.body as { user_label?: unknown } | undefined)?.user_label;
    const label = typeof bodyLabel === 'string' && bodyLabel.length > 0
      ? bodyLabel
      : typeof headerLabel === 'string' ? headerLabel : '';

    if (!label) {
      logger.warn('HTTP', 'enforceAllowList: rejecting request with no user_label', {
        path: req.path,
        ip: req.socket.remoteAddress,
      });
      res.status(403).json({ error: 'user_label_missing', detail: 'Request lacks a user_label.' });
      return;
    }

    if (!allowed.has(label)) {
      logger.warn('HTTP', 'enforceAllowList: rejecting non-whitelisted user_label', {
        path: req.path,
        user_label: label,
        ip: req.socket.remoteAddress,
      });
      res.status(403).json({
        error: 'user_label_not_allowed',
        detail: `user_label "${label}" is not in CLAUDE_MEM_SERVER_ALLOWED_USERS.`,
      });
      return;
    }

    next();
  };
}
