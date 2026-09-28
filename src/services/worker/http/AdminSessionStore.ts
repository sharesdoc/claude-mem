import { randomBytes } from 'crypto';
import type { Request } from 'express';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface SessionEntry {
  createdAt: number;
  expiresAt: number;
}

/**
 * In-memory registry of admin login sessions, shared between AuthRoutes
 * (which mints a session on successful password login) and any route that
 * must confirm the caller is the logged-in admin before acting (e.g. the
 * destructive delete endpoints in DataRoutes).
 *
 * The system has a single admin identity, so the only question a verifier
 * asks is "is this a valid, unexpired token?" — a yes means "the admin".
 * Sessions live only in process memory; a worker restart logs everyone out
 * (the viewer re-authenticates transparently from its stored token via the
 * /api/admin/session check).
 */
export class AdminSessionStore {
  private readonly sessions = new Map<string, SessionEntry>();

  /** Mint a new session token. Also opportunistically prunes expired ones. */
  create(now: number = Date.now()): { token: string; expiresAt: number } {
    const token = randomBytes(32).toString('hex');
    const expiresAt = now + SESSION_TTL_MS;
    this.sessions.set(token, { createdAt: now, expiresAt });
    this.pruneExpired(now);
    return { token, expiresAt };
  }

  /**
   * @returns true when `token` maps to a live (unexpired) session. Expired
   * tokens are dropped as a side effect so the map self-cleans on access.
   */
  verify(token: string | null, now: number = Date.now()): boolean {
    if (!token) return false;
    const entry = this.sessions.get(token);
    if (!entry) return false;
    if (entry.expiresAt < now) {
      this.sessions.delete(token);
      return false;
    }
    return true;
  }

  /** Invalidate a token (logout). No-op for null/unknown tokens. */
  destroy(token: string | null): void {
    if (token) this.sessions.delete(token);
  }

  private pruneExpired(now: number): void {
    for (const [k, v] of this.sessions) {
      if (v.expiresAt < now) this.sessions.delete(k);
    }
  }
}

/** Pull the bearer token out of an `Authorization: Bearer <token>` header. */
export function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice(7);
  }
  return null;
}
