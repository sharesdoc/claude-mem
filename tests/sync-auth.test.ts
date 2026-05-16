import { describe, it, expect } from 'bun:test';
import { buildAuthChain, NoopAuth, ApiKeyAuth } from '../src/services/sync/auth/index.js';
import type { Request } from 'express';

/**
 * T-10 — SyncAuthStrategy factory + NoopAuth behaviour.
 *
 * Contracts verified:
 *  - factory returns NoopAuth for 'none' / unset / unknown / unimplemented
 *  - factory returns ApiKeyAuth (placeholder) for 'apikey'
 *  - NoopAuth.authenticate returns null and populates syncContext from
 *    body.user_label, falling back to X-Sync-User header
 *  - ApiKeyAuth.authenticate throws NotImplementedAuthError (placeholder)
 */

function mockReq(body: unknown, headers: Record<string, string | string[]> = {}): Request {
  return { body, headers } as unknown as Request;
}

describe('buildAuthChain', () => {
  it('returns NoopAuth for mode "none"', () => {
    const auth = buildAuthChain({ CLAUDE_MEM_SERVER_AUTH_MODE: 'none' });
    expect(auth).toBeInstanceOf(NoopAuth);
    expect(auth.mode).toBe('none');
  });

  it('defaults to NoopAuth when mode is missing', () => {
    const auth = buildAuthChain({});
    expect(auth).toBeInstanceOf(NoopAuth);
  });

  it('returns ApiKeyAuth placeholder for mode "apikey"', () => {
    const auth = buildAuthChain({ CLAUDE_MEM_SERVER_AUTH_MODE: 'apikey' });
    expect(auth).toBeInstanceOf(ApiKeyAuth);
    expect(auth.mode).toBe('apikey');
  });

  it('falls back to NoopAuth for unimplemented modes (jwt/mtls)', () => {
    expect(buildAuthChain({ CLAUDE_MEM_SERVER_AUTH_MODE: 'jwt' })).toBeInstanceOf(NoopAuth);
    expect(buildAuthChain({ CLAUDE_MEM_SERVER_AUTH_MODE: 'mtls' })).toBeInstanceOf(NoopAuth);
  });

  it('falls back to NoopAuth for unknown mode strings', () => {
    expect(buildAuthChain({ CLAUDE_MEM_SERVER_AUTH_MODE: 'totally-bogus' })).toBeInstanceOf(NoopAuth);
  });
});

describe('NoopAuth', () => {
  it('returns null and copies body.user_label into syncContext', async () => {
    const auth = new NoopAuth();
    const req = mockReq({ user_label: 'johnson' });
    const reason = await auth.authenticate(req);
    expect(reason).toBeNull();
    expect(req.syncContext?.authMode).toBe('none');
    expect(req.syncContext?.authenticatedUserLabel).toBe('johnson');
  });

  it('falls back to X-Sync-User header when body lacks user_label', async () => {
    const auth = new NoopAuth();
    const req = mockReq({}, { 'x-sync-user': 'alice' });
    const reason = await auth.authenticate(req);
    expect(reason).toBeNull();
    expect(req.syncContext?.authenticatedUserLabel).toBe('alice');
  });

  it('leaves authenticatedUserLabel null when neither source is present', async () => {
    const auth = new NoopAuth();
    const req = mockReq({});
    const reason = await auth.authenticate(req);
    expect(reason).toBeNull();
    expect(req.syncContext?.authenticatedUserLabel).toBeNull();
  });

  it('prefers body.user_label over header', async () => {
    const auth = new NoopAuth();
    const req = mockReq({ user_label: 'bob' }, { 'x-sync-user': 'eve' });
    await auth.authenticate(req);
    expect(req.syncContext?.authenticatedUserLabel).toBe('bob');
  });
});

describe('ApiKeyAuth', () => {
  it('throws NotImplementedAuthError on authenticate (placeholder)', async () => {
    const auth = new ApiKeyAuth({ keys: {} });
    await expect(auth.authenticate(mockReq({}))).rejects.toThrow(/not implemented/);
  });
});
