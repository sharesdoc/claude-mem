import { timingSafeEqual } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { logger } from '../../../../utils/logger.js';
import type { AdminSessionStore } from '../AdminSessionStore.js';
import { extractBearerToken } from '../AdminSessionStore.js';
import { isAutoLoginAllowed } from '../middleware.js';
import { SettingsDefaultsManager } from '../../../../shared/SettingsDefaultsManager.js';
import { USER_SETTINGS_PATH } from '../../../../shared/paths.js';

/**
 * Local auto-login (X-005): loopback callers skip the token requirement
 * unless CLAUDE_MEM_SERVER_LOCAL_AUTO_LOGIN=false. Read fresh per check so
 * flipping the setting takes effect without a worker restart; only invoked
 * on requests that failed every other authenticator.
 */
function loopbackBypassAllowed(req: Request): boolean {
  if (!isAutoLoginAllowed(req)) return false;
  const settings = SettingsDefaultsManager.loadFromFile(USER_SETTINGS_PATH);
  return (settings.CLAUDE_MEM_SERVER_LOCAL_AUTO_LOGIN ?? 'true') !== 'false';
}

/**
 * Shared-access-token middleware for LAN deployments.
 *
 * Simpler than the full ApiKeyAuth / per-user-key system: the server
 * operator sets one shared token in settings, every client presents
 * the same token in the `Authorization: Bearer <token>` header.
 *
 * When the token is empty / unset the middleware is a no-op (allow all).
 * This is the default, keeping backward compatibility.
 *
 * When an `AdminSessionStore` is provided, the middleware also accepts a
 * valid admin session token (obtained via POST /api/admin/login). This
 * allows the viewer UI to reuse its existing login session instead of
 * requiring the user to separately configure the static access token in
 * every browser.
 *
 * Constant-time comparison prevents timing side-channel leakage of the
 * token length / prefix.
 */
export function tokenAuth(serverToken: string, adminSessions?: AdminSessionStore) {
  const expected = (serverToken ?? '').trim();
  const hasAdminFallback = adminSessions !== undefined;

  // No authenticator configured at all → pass through (standalone / client).
  if (!expected && !hasAdminFallback) {
    return (_req: Request, _res: Response, next: NextFunction): void => next();
  }

  const MAX = 256;
  const expectedBuf = Buffer.alloc(MAX, 0);
  Buffer.from(expected.slice(0, MAX), 'ascii').copy(expectedBuf);

  return (req: Request, res: Response, next: NextFunction): void => {
    const header = extractBearer(req);
    if (!header) {
      if (loopbackBypassAllowed(req)) {
        next();
        return;
      }
      logger.warn('HTTP', 'tokenAuth: missing Authorization header', {
        path: req.path,
        address: req.socket.remoteAddress ?? '(unknown)',
      });
      res.status(401).json({
        error: 'unauthorized',
        reason: 'missing access token — set Authorization: Bearer <token>',
      });
      return;
    }

    // 1) Try static access token (constant-time comparison).
    if (expected) {
      const userBuf = Buffer.alloc(MAX, 0);
      Buffer.from(header.slice(0, MAX), 'ascii').copy(userBuf);
      if (timingSafeEqual(userBuf, expectedBuf)) {
        next();
        return;
      }
    }

    // 2) Fall back to admin session token (viewer login).
    if (hasAdminFallback && adminSessions!.verify(extractBearerToken(req))) {
      next();
      return;
    }

    // 3) Loopback with a stale/foreign token — still the local operator.
    if (loopbackBypassAllowed(req)) {
      next();
      return;
    }

    logger.warn('HTTP', 'tokenAuth: invalid access token', {
      path: req.path,
      address: req.socket.remoteAddress ?? '(unknown)',
    });
    res.status(401).json({
      error: 'unauthorized',
      reason: 'invalid access token',
    });
  };
}

function extractBearer(req: Request): string | null {
  const header = req.headers['authorization'];
  if (typeof header !== 'string') return null;
  const trimmed = header.trim();
  if (!trimmed.startsWith('Bearer ')) return null;
  const token = trimmed.slice(7).trim();
  if (token.length === 0) return null;
  // Reject unreasonably long tokens before buffer allocation.
  if (token.length > 256) return null;
  return token;
}
