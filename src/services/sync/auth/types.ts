import type { Request } from 'express';

export type SyncAuthMode = 'none' | 'apikey' | 'jwt' | 'mtls';

/**
 * Per-request sync identity context. Auth strategies populate this on the
 * Express request so downstream middlewares (allow-list, ingest) read a
 * normalised value without parsing headers/bodies again.
 *
 * `authenticatedUserLabel` is the *attested* identity:
 *   - NoopAuth   → echoes body.user_label / X-Sync-User (no attestation)
 *   - ApiKeyAuth → label bound to the key (lookup at validate time)
 *   - JwtAuth    → claim from verified token
 */
export interface SyncContext {
  authenticatedUserLabel: string | null;
  authMode: SyncAuthMode;
  reason?: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    syncContext?: SyncContext;
  }
}

/**
 * Pluggable sync auth strategy contract (T-10 / S-doc §6).
 *
 * `authenticate` MUST NOT throw — it returns `null` for success and a
 * short human-readable rejection reason on failure so the ingest route
 * can log it and emit 401/403 with a structured body.
 *
 * Strategies are responsible for setting `req.syncContext` on success.
 */
export interface SyncAuthStrategy {
  readonly mode: SyncAuthMode;
  authenticate(req: Request): Promise<string | null>;
}

export class NotImplementedAuthError extends Error {
  constructor(mode: SyncAuthMode) {
    super(`Sync auth mode '${mode}' is declared in settings but not implemented in this build`);
    this.name = 'NotImplementedAuthError';
  }
}
