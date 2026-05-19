
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

function isPrivateOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname;
    if (host === 'localhost' || host === '::1') return true;
    const m = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (!m) return false;
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 127) return true;                          // 127.0.0.0/8
    if (a === 10) return true;                           // 10.0.0.0/8
    if (a === 192 && b === 168) return true;             // 192.168.0.0/16
    if (a === 172 && b >= 16 && b <= 31) return true;    // 172.16.0.0/12
    return false;
  } catch {
    return false;
  }
}

// In server mode the worker binds 0.0.0.0 and is meant to be reached from
// LAN browsers (e.g. http://192.168.0.110:37701). The auth layer (admin
// password + sync access token) is the real security boundary; CORS is
// only defense-in-depth, so widening the allowlist to RFC1918 origins is
// safe and unblocks the deployed-server login flow.
export function createCorsMiddleware(opts: { role?: 'client' | 'server' } = {}): RequestHandler {
  const role = opts.role ?? 'client';
  return cors({
    origin: (origin, callback) => {
      if (!origin ||
          origin.startsWith('http://localhost:') ||
          origin.startsWith('http://127.0.0.1:')) {
        callback(null, true);
        return;
      }
      if (role === 'server' && isPrivateOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('CORS not allowed'));
    },
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: false
  });
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
