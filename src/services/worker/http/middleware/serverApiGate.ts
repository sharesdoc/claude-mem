import { timingSafeEqual } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { logger } from '../../../../utils/logger.js';
import type { AdminSessionStore } from '../AdminSessionStore.js';
import { extractBearerToken } from '../AdminSessionStore.js';
import { isLoopbackRequest } from '../middleware.js';
import { SettingsDefaultsManager } from '../../../../shared/SettingsDefaultsManager.js';
import { USER_SETTINGS_PATH } from '../../../../shared/paths.js';

/**
 * Server-mode default-deny gate (X-006). Mounted before every route in
 * server mode, so each request must satisfy ONE of:
 *   1. a valid Bearer credential — the shared access token (client↔server
 *      sync) or an admin session token (web login);
 *   2. a public path — the login page shell and the endpoints the viewer
 *      needs before a session exists;
 *   3. loopback origin with local auto-login enabled (X-005);
 *   4. for the SSE stream only: a valid `?token=` query parameter, because
 *      EventSource cannot send an Authorization header.
 * Everything else is rejected with 401. Client/standalone mode never mounts
 * this gate (the worker binds loopback there).
 */
const PUBLIC_PATHS = new Set([
  '/',
  '/health',
  '/favicon.ico',
  '/api/health',
  '/api/readiness',
  '/api/admin/login',
  '/api/admin/session',
  '/api/admin/role',
]);

const STATIC_ASSET_RE = /\.(?:js|css|map|webp|png|jpe?g|svg|gif|ico|woff2?|ttf)$/i;

function tokenMatches(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function serverApiGate(adminSessions: AdminSessionStore, serverToken: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.method === 'OPTIONS') {
      next();
      return;
    }

    const bearer = extractBearerToken(req) ?? '';
    if (tokenMatches(bearer, serverToken) || adminSessions.verify(bearer)) {
      res.locals.authVia = 'token';
      next();
      return;
    }

    if (PUBLIC_PATHS.has(req.path)) {
      next();
      return;
    }

    // Static UI assets (bundle, logo, fonts) — the login page shell needs
    // them before any credential exists. Data only ever lives under /api
    // and /stream, never in static files.
    if (
      (req.method === 'GET' || req.method === 'HEAD') &&
      !req.path.startsWith('/api/') &&
      STATIC_ASSET_RE.test(req.path)
    ) {
      next();
      return;
    }

    // X-005 local auto-login: the loopback operator skips credentials
    // unless CLAUDE_MEM_SERVER_LOCAL_AUTO_LOGIN=false (read fresh so the
    // switch takes effect without a restart).
    if (isLoopbackRequest(req)) {
      const settings = SettingsDefaultsManager.loadFromFile(USER_SETTINGS_PATH);
      if ((settings.CLAUDE_MEM_SERVER_LOCAL_AUTO_LOGIN ?? 'true') !== 'false') {
        res.locals.authVia = 'loopback';
        next();
        return;
      }
    }

    if (req.path === '/stream') {
      const queryToken = typeof req.query.token === 'string' ? req.query.token : '';
      if (tokenMatches(queryToken, serverToken) || adminSessions.verify(queryToken)) {
        res.locals.authVia = 'token';
        next();
        return;
      }
    }

    logger.warn('SECURITY', 'Request rejected by server API gate', {
      path: req.path,
      method: req.method,
      ip: req.ip ?? '(unknown)',
    });
    res.status(401).json({ error: 'unauthorized', reason: 'authentication required' });
  };
}
