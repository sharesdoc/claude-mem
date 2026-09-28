import { afterEach, describe, expect, it } from 'bun:test';
import { verifyRestartedWorker } from '../../src/services/restart-verify.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('restart verification', () => {
  it('accepts only a new pid with the expected version', async () => {
    const payloads = [
      { pid: 10, version: '1.0.0' },
      { pid: 11, version: '0.9.0' },
      { pid: 11, version: '1.0.0' },
    ];
    globalThis.fetch = (async () => new Response(JSON.stringify(payloads.shift()), { status: 503 })) as typeof fetch;

    const result = await verifyRestartedWorker(37777, 10, '1.0.0', 100, {
      pollIntervalMs: 1,
      requestTimeoutMs: 20,
    });
    expect(result).toEqual({ ok: true, pid: 11, version: '1.0.0' });
  });

  it('fails when only the old pid remains', async () => {
    globalThis.fetch = (async () => new Response(
      JSON.stringify({ pid: 10, version: '1.0.0' })
    )) as typeof fetch;

    const result = await verifyRestartedWorker(37777, 10, '1.0.0', 10, {
      pollIntervalMs: 1,
      requestTimeoutMs: 5,
    });
    expect(result.ok).toBe(false);
  });
});
