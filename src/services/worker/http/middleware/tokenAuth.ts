import { timingSafeEqual } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { logger } from '../../../../utils/logger.js';

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
 * Constant-time comparison prevents timing side-channel leakage of the
 * token length / prefix.
 */
export function tokenAuth(serverToken: string) {
  const expected = (serverToken ?? '').trim();
  if (!expected) {
    return (_req: Request, _res: Response, next: NextFunction): void => next();
  }

  const MAX = 256;
  const expectedBuf = Buffer.alloc(MAX, 0);
  Buffer.from(expected.slice(0, MAX), 'ascii').copy(expectedBuf);

  return (req: Request, res: Response, next: NextFunction): void => {
    const header = extractBearer(req);
    if (!header) {
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

    // Pad user input to the same fixed length before comparison so
    // timingSafeEqual always sees equal-length buffers and the
    // comparison time leaks no information about token length.
    const userBuf = Buffer.alloc(MAX, 0);
    Buffer.from(header.slice(0, MAX), 'ascii').copy(userBuf);

    if (!timingSafeEqual(userBuf, expectedBuf)) {
      logger.warn('HTTP', 'tokenAuth: invalid access token', {
        path: req.path,
        address: req.socket.remoteAddress ?? '(unknown)',
      });
      res.status(401).json({
        error: 'unauthorized',
        reason: 'invalid access token',
      });
      return;
    }

    next();
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
