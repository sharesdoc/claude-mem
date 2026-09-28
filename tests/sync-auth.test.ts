import { describe, it, expect, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { buildAuthChain, NoopAuth, ApiKeyAuth } from '../src/services/sync/auth/index.js';
import type { Request } from 'express';

/**
 * T-10 + T-29 — SyncAuthStrategy factory + NoopAuth + ApiKeyAuth.
 */

function mockReq(body: unknown, headers: Record<string, string | string[]> = {}): Request {
  return { body, headers } as unknown as Request;
}

describe('buildAuthChain', () => {
  it('returns NoopAuth for mode "none"', () => {
    const auth = buildAuthChain({ settings: { CLAUDE_MEM_SERVER_AUTH_MODE: 'none' } });
    expect(auth).toBeInstanceOf(NoopAuth);
  });

  it('defaults to NoopAuth when mode is missing', () => {
    const auth = buildAuthChain({ settings: {} });
    expect(auth).toBeInstanceOf(NoopAuth);
  });

  it('returns ApiKeyAuth when mode=apikey and getDb is provided', () => {
    const db = new Database(':memory:');
    db.run('CREATE TABLE api_keys (id TEXT, key_hash TEXT, status TEXT, expires_at_epoch INTEGER)');
    const auth = buildAuthChain({
      settings: { CLAUDE_MEM_SERVER_AUTH_MODE: 'apikey' },
      getDb: () => db,
    });
    expect(auth).toBeInstanceOf(ApiKeyAuth);
    db.close();
  });

  it('falls back to NoopAuth when apikey has no getDb', () => {
    const auth = buildAuthChain({ settings: { CLAUDE_MEM_SERVER_AUTH_MODE: 'apikey' } });
    expect(auth).toBeInstanceOf(NoopAuth);
  });

  it('falls back to NoopAuth for unimplemented modes (jwt/mtls)', () => {
    expect(buildAuthChain({ settings: { CLAUDE_MEM_SERVER_AUTH_MODE: 'jwt' } })).toBeInstanceOf(NoopAuth);
    expect(buildAuthChain({ settings: { CLAUDE_MEM_SERVER_AUTH_MODE: 'mtls' } })).toBeInstanceOf(NoopAuth);
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
  let db: Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.run(`
      CREATE TABLE api_keys (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        key_hash TEXT NOT NULL UNIQUE,
        prefix TEXT,
        scopes TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'active',
        last_used_at_epoch INTEGER,
        expires_at_epoch INTEGER,
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at_epoch INTEGER NOT NULL,
        updated_at_epoch INTEGER NOT NULL,
        bound_user_label TEXT
      )
    `);
  });

  it('rejects missing Authorization header', async () => {
    const auth = new ApiKeyAuth(() => db);
    const reason = await auth.authenticate(mockReq({ user_label: 'alice' }));
    expect(reason).toContain('missing Authorization');
  });

  it('rejects invalid key', async () => {
    const auth = new ApiKeyAuth(() => db);
    const req = mockReq({ user_label: 'alice' }, {
      authorization: 'Bearer cmem_badkey',
    });
    const reason = await auth.authenticate(req);
    expect(reason).toContain('invalid API key');
  });

  it('accepts valid key and sets syncContext', async () => {
    const { createHash } = await import('crypto');
    const rawKey = 'cmem_test1234567890abcdef1234567890ab';
    const hash = createHash('sha256').update(rawKey).digest('hex');
    db.prepare(`
      INSERT INTO api_keys (id, name, key_hash, status, created_at_epoch, updated_at_epoch)
      VALUES ('k1', 'test', ?, 'active', 1, 1)
    `).run(hash);

    const auth = new ApiKeyAuth(() => db);
    const req = mockReq({ user_label: 'alice' }, {
      authorization: `Bearer ${rawKey}`,
    });
    const reason = await auth.authenticate(req);
    expect(reason).toBeNull();
    expect(req.syncContext?.authMode).toBe('apikey');
    expect(req.syncContext?.authenticatedUserLabel).toBe('alice');
  });

  it('rejects revoked key', async () => {
    const { createHash } = await import('crypto');
    const rawKey = 'cmem_revoked1234567890abcdef12345678';
    const hash = createHash('sha256').update(rawKey).digest('hex');
    db.prepare(`
      INSERT INTO api_keys (id, name, key_hash, status, created_at_epoch, updated_at_epoch)
      VALUES ('k2', 'revoked', ?, 'revoked', 1, 1)
    `).run(hash);

    const auth = new ApiKeyAuth(() => db);
    const req = mockReq({ user_label: 'alice' }, { authorization: `Bearer ${rawKey}` });
    const reason = await auth.authenticate(req);
    expect(reason).toContain('revoked');
  });

  it('rejects when bound_user_label does not match body', async () => {
    const { createHash } = await import('crypto');
    const rawKey = 'cmem_bound1234567890abcdef1234567890';
    const hash = createHash('sha256').update(rawKey).digest('hex');
    db.prepare(`
      INSERT INTO api_keys (id, name, key_hash, status, bound_user_label, created_at_epoch, updated_at_epoch)
      VALUES ('k3', 'bound', ?, 'active', 'alice', 1, 1)
    `).run(hash);

    const auth = new ApiKeyAuth(() => db);
    // Claim user_label=bob but key is bound to alice
    const req = mockReq({ user_label: 'bob' }, { authorization: `Bearer ${rawKey}` });
    const reason = await auth.authenticate(req);
    expect(reason).toContain('different user_label');
  });

  it('X-007: accepts case variants of bound_user_label (chenzhu == CHENZHU)', async () => {
    const { createHash } = await import('crypto');
    const rawKey = 'cmem_case1234567890abcdef1234567890ab';
    const hash = createHash('sha256').update(rawKey).digest('hex');
    // Key bound to UPPERCASE form (the canonical form persisted post-v44).
    db.prepare(`
      INSERT INTO api_keys (id, name, key_hash, status, bound_user_label, created_at_epoch, updated_at_epoch)
      VALUES ('k4', 'case-insensitive', ?, 'active', 'CHENZHU', 1, 1)
    `).run(hash);

    const auth = new ApiKeyAuth(() => db);
    // Client pushes lowercase — same human, must pass.
    const req = mockReq({ user_label: 'chenzhu' }, { authorization: `Bearer ${rawKey}` });
    const reason = await auth.authenticate(req);
    expect(reason).toBeNull();
    expect(req.syncContext?.authenticatedUserLabel).toBe('chenzhu');
  });

  it('X-007: rejects labels that differ by more than case', async () => {
    const { createHash } = await import('crypto');
    const rawKey = 'cmem_diff1234567890abcdef1234567890ab';
    const hash = createHash('sha256').update(rawKey).digest('hex');
    db.prepare(`
      INSERT INTO api_keys (id, name, key_hash, status, bound_user_label, created_at_epoch, updated_at_epoch)
      VALUES ('k5', 'strict', ?, 'active', 'CHENZHU', 1, 1)
    `).run(hash);

    const auth = new ApiKeyAuth(() => db);
    const req = mockReq({ user_label: 'ChenZhu2' }, { authorization: `Bearer ${rawKey}` });
    const reason = await auth.authenticate(req);
    expect(reason).toContain('different user_label');
  });
});
