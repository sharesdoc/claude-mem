
import express, { Request, Response, NextFunction, RequestHandler } from 'express';
import cors from 'cors';
import path from 'path';
import { getPackageRoot } from '../../../shared/paths.js';
import { logger } from '../../../utils/logger.js';

export function createMiddleware(
  summarizeRequestBody: (method: string, path: string, body: any) => string,
  options: { includeCors?: boolean } = {}
): RequestHandler[] {
  const middlewares: RequestHandler[] = [];

  if (options.includeCors !== false) {
    middlewares.push(createCorsMiddleware());
  }

  middlewares.push(express.json({ limit: '5mb' }));

  middlewares.push((req: Request, res: Response, next: NextFunction) => {
    const staticExtensions = ['.html', '.js', '.css', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.woff', '.woff2', '.ttf', '.eot'];
    const isStaticAsset = staticExtensions.some(ext => req.path.endsWith(ext));
    const isPollingEndpoint = req.path === '/api/logs'; 
    if (req.path.startsWith('/health') || req.path === '/' || isStaticAsset || isPollingEndpoint) {
      return next();
    }

    const start = Date.now();
    const requestId = `${req.method}-${Date.now()}`;

    const bodySummary = summarizeRequestBody(req.method, req.path, req.body);
    logger.debug('HTTP', `→ ${req.method} ${req.path}`, { requestId }, bodySummary);

    const originalSend = res.send.bind(res);
    res.send = function(body: any) {
      const duration = Date.now() - start;
      logger.debug('HTTP', `← ${res.statusCode} ${req.path}`, { requestId, duration: `${duration}ms` });
      return originalSend(body);
    };

    next();
  });

  const packageRoot = getPackageRoot();
  const uiDir = path.join(packageRoot, 'plugin', 'ui');
  middlewares.push(express.static(uiDir));

  return middlewares;
}


// In server mode the worker binds 0.0.0.0 and is meant to be reached from
// any network (LAN or WAN). The auth layer (admin password + sync access
// token) is the real security boundary; CORS is only defense-in-depth, so
// allowing all origins in server mode ensures token-authenticated clients
// can connect from any IP without CORS preflight blocking them.
export function createCorsMiddleware(opts: {
  role?: 'client' | 'server';
} = {}): RequestHandler {
  const role = opts.role ?? 'client';
  return cors({
    origin: (origin, callback) => {
      // No origin header (non-browser client) — always allow.
      if (!origin) {
        callback(null, true);
        return;
      }
      // Client/standalone mode: only loopback origins.
      if (role !== 'server') {
        if (origin.startsWith('http://localhost:') ||
            origin.startsWith('http://127.0.0.1:')) {
          callback(null, true);
          return;
        }
        logger.warn('HTTP', 'CORS origin not allowed in client mode', { origin, role });
        callback(null, false);
        return;
      }
      // Server mode: allow all origins. The serverApiGate middleware
      // (mounted before all routes) enforces token/password auth on
      // every request; CORS here is purely defense-in-depth and should
      // never block a legitimate token-carrying client.
      callback(null, true);
    },
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: false
  });
}

const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost']);

/**
 * True only when the request demonstrably originates from this machine:
 * both the express-resolved client IP (honours trusted-proxy resolution,
 * so a remote client behind a local trusted reverse proxy is NOT loopback)
 * and the raw socket peer address must be loopback.
 */
export function isLoopbackRequest(req: Request): boolean {
  const clientIp = req.ip || '';
  const socketIp = req.socket?.remoteAddress ?? '';
  return LOOPBACK_ADDRESSES.has(clientIp) && LOOPBACK_ADDRESSES.has(socketIp);
}

/** IPv4 loopback addresses that qualify for auto-login (X-005).
 *  Only 127.0.0.1 and its IPv4-mapped IPv6 form — ::1 and localhost are
 *  excluded so that auto-login is restricted to the unambiguous IPv4
 *  loopback address. */
const AUTO_LOGIN_IPS = new Set(['127.0.0.1', '::ffff:127.0.0.1']);

/**
 * True when the request comes from 127.0.0.1 (or its IPv4-mapped IPv6
 * equivalent), the only addresses allowed to auto-login without a password.
 * Both the express-resolved IP and the raw socket peer must match.
 */
export function isAutoLoginAllowed(req: Request): boolean {
  const clientIp = req.ip || '';
  const socketIp = req.socket?.remoteAddress ?? '';
  return AUTO_LOGIN_IPS.has(clientIp) && AUTO_LOGIN_IPS.has(socketIp);
}

export function requireLocalhost(req: Request, res: Response, next: NextFunction): void {
  const clientIp = req.ip || req.connection.remoteAddress || '';
  const isLocalhost =
    clientIp === '127.0.0.1' ||
    clientIp === '::1' ||
    clientIp === '::ffff:127.0.0.1' ||
    clientIp === 'localhost';

  if (!isLocalhost) {
    logger.warn('SECURITY', 'Admin endpoint access denied - not localhost', {
      endpoint: req.path,
      clientIp,
      method: req.method
    });
    res.status(403).json({
      error: 'Forbidden',
      message: 'Admin endpoints are only accessible from localhost'
    });
    return;
  }

  next();
}

export function summarizeRequestBody(method: string, path: string, body: any): string {
  if (!body || Object.keys(body).length === 0) return '';

  if (path.includes('/init')) {
    return '';
  }

  if (path.includes('/observations')) {
    const toolName = body.tool_name || '?';
    const toolInput = body.tool_input;
    const toolSummary = logger.formatTool(toolName, toolInput);
    return `tool=${toolSummary}`;
  }

  if (path.includes('/summarize')) {
    return 'requesting summary';
  }

  return '';
}
