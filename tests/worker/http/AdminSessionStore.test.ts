import { describe, it, expect } from 'bun:test';
import { AdminSessionStore, extractBearerToken } from '../../../src/services/worker/http/AdminSessionStore.js';
import type { Request } from 'express';

describe('AdminSessionStore', () => {
  it('mints a token that verifies as valid', () => {
    const store = new AdminSessionStore();
    const { token, expiresAt } = store.create();
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
    expect(expiresAt).toBeGreaterThan(Date.now());
    expect(store.verify(token)).toBe(true);
  });

  it('rejects null, empty, and unknown tokens', () => {
    const store = new AdminSessionStore();
    store.create();
    expect(store.verify(null)).toBe(false);
    expect(store.verify('')).toBe(false);
    expect(store.verify('not-a-real-token')).toBe(false);
  });

  it('treats an expired token as invalid and drops it', () => {
    const store = new AdminSessionStore();
    const base = 1_000_000;
    const { token, expiresAt } = store.create(base);
    // Just before expiry → valid; at/after expiry → invalid.
    expect(store.verify(token, expiresAt - 1)).toBe(true);
    expect(store.verify(token, expiresAt + 1)).toBe(false);
    // Second check at any time confirms it was pruned, not merely time-gated.
    expect(store.verify(token, base)).toBe(false);
  });

  it('destroy() invalidates a live token and is a no-op for null', () => {
    const store = new AdminSessionStore();
    const { token } = store.create();
    store.destroy(token);
    expect(store.verify(token)).toBe(false);
    expect(() => store.destroy(null)).not.toThrow();
  });

  it('extractBearerToken parses only well-formed Bearer headers', () => {
    const make = (authorization?: string) => ({ headers: { authorization } } as unknown as Request);
    expect(extractBearerToken(make('Bearer abc123'))).toBe('abc123');
    expect(extractBearerToken(make('bearer abc123'))).toBeNull(); // case-sensitive scheme
    expect(extractBearerToken(make('Token abc123'))).toBeNull();
    expect(extractBearerToken(make(undefined))).toBeNull();
  });
});
