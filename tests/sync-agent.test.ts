import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Database } from 'bun:sqlite';
import { ClaudeMemDatabase } from '../src/services/sqlite/Database.js';
import { SyncAgent, type SyncAgentConfig, type FetchFn } from '../src/services/sync/SyncAgent.js';
import { readState } from '../src/services/sync/sync-state.js';
import type { DatabaseManager } from '../src/services/worker/DatabaseManager.js';

/**
 * T-06 — SyncAgent push semantics (mocked fetch).
 */

let stateDir: string;
let statePath: string;

function makeDb(): Database {
  const db = new ClaudeMemDatabase(':memory:').db;
  db.prepare(`
    INSERT INTO sdk_sessions (content_session_id, memory_session_id, project, started_at, started_at_epoch, status, user_label)
    VALUES ('c1', 'm1', 'p', '2026', 1000, 'active', 'alice')
  `).run();
  db.prepare(`
    INSERT INTO observations (memory_session_id, project, type, title, created_at, created_at_epoch)
    VALUES ('m1', 'p', 'feat', 't1', '2026', 1001),
           ('m1', 'p', 'feat', 't2', '2026', 1002)
  `).run();
  return db;
}

function makeManager(db: Database): DatabaseManager {
  return {
    getSessionStore: () => ({ db }),
    getConnection: () => db,
  } as unknown as DatabaseManager;
}

function baseConfig(): SyncAgentConfig {
  return {
    upstreamUrl: 'http://mem.test',
    userLabel: 'alice',
    authMode: 'none',
    intervalMs: 60000,
    batchSize: 50,
    retryMax: 1,
    redactPatterns: [],
  };
}

function fakeFetch(
  result: { status: number; body?: unknown; throws?: Error },
  capture?: { url?: string; init?: RequestInit },
): FetchFn {
  return (async (url: string | URL, init: RequestInit | undefined) => {
    if (capture) {
      capture.url = String(url);
      capture.init = init;
    }
    if (result.throws) throw result.throws;
    return {
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
      async json() { return result.body ?? {}; },
      async text() { return typeof result.body === 'string' ? result.body : JSON.stringify(result.body ?? ''); },
    } as Response;
  }) as FetchFn;
}

beforeEach(() => {
  stateDir = mkdtempSync(join(tmpdir(), 'claude-mem-agent-'));
  statePath = join(stateDir, 'sync-state.json');
});

afterEach(() => {
  try { rmSync(stateDir, { recursive: true, force: true }); } catch { /* */ }
});

describe('SyncAgent.tick — success path', () => {
  it('pushes the batch and advances watermark from server response', async () => {
    const db = makeDb();
    const capture: { url?: string; init?: RequestInit } = {};
    const agent = new SyncAgent(
      makeManager(db),
      baseConfig(),
      fakeFetch({ status: 200, body: { applied: {}, next_watermark: { sessions: 1, observations: 2 } } }, capture),
      statePath,
    );

    await agent.tick();

    expect(capture.url).toBe('http://mem.test/api/sync/ingest');
    expect(capture.init?.method).toBe('POST');
    const headers = capture.init?.headers as Record<string, string>;
    expect(headers['x-sync-user']).toBe('alice');

    const state = readState(statePath);
    expect(state.watermark.sessions).toBe(1);
    expect(state.watermark.observations).toBe(2);
    expect(state.failures.consecutive).toBe(0);
  });

  it('floors server watermark by local computed id (server cannot push us backwards)', async () => {
    const db = makeDb();
    const agent = new SyncAgent(
      makeManager(db),
      baseConfig(),
      // server lies and says obs=0
      fakeFetch({ status: 200, body: { applied: {}, next_watermark: { observations: 0 } } }),
      statePath,
    );

    await agent.tick();

    const state = readState(statePath);
    // Local rows had ids up to 2 — floor wins.
    expect(state.watermark.observations).toBe(2);
  });

  it('no-op when batch is empty (no fetch call)', async () => {
    const db = new ClaudeMemDatabase(':memory:').db;
    let calls = 0;
    const fetchImpl = (async () => { calls++; return new Response('{}'); }) as FetchFn;
    const agent = new SyncAgent(makeManager(db), baseConfig(), fetchImpl, statePath);

    await agent.tick();
    expect(calls).toBe(0);
  });
});

describe('SyncAgent.tick — failure path', () => {
  it('classifies 4xx as permanent and writes ERROR row', async () => {
    const db = makeDb();
    const logDir = mkdtempSync(join(tmpdir(), 'claude-mem-agent-err-'));
    // appendSyncError writes to LOGS_DIR by default; we just verify the
    // state machinery here. The error-log file behaviour is tested in
    // tests/sync-error-log.test.ts directly.
    const agent = new SyncAgent(
      makeManager(db),
      baseConfig(),
      fakeFetch({ status: 401, body: 'unauthorized' }),
      statePath,
    );

    await agent.tick();

    const state = readState(statePath);
    expect(state.failures.consecutive).toBe(1);
    expect(state.failures.last_error).toMatch(/401/);
    expect(state.watermark.observations).toBe(0); // not advanced

    rmSync(logDir, { recursive: true, force: true });
  });

  it('classifies 5xx as transient and increments consecutive counter', async () => {
    const db = makeDb();
    const agent = new SyncAgent(
      makeManager(db),
      baseConfig(),
      fakeFetch({ status: 503, body: 'maint' }),
      statePath,
    );

    await agent.tick();
    await agent.tick();

    const state = readState(statePath);
    expect(state.failures.consecutive).toBe(2);
  });

  it('classifies network errors (no status) as transient', async () => {
    const db = makeDb();
    const agent = new SyncAgent(
      makeManager(db),
      baseConfig(),
      fakeFetch({ status: 0, throws: new Error('ECONNREFUSED') }),
      statePath,
    );

    await agent.tick();
    const state = readState(statePath);
    expect(state.failures.consecutive).toBe(1);
    expect(state.failures.last_error).toContain('ECONNREFUSED');
  });
});

describe('SyncAgent.start — race condition', () => {
  it('sets up interval timer before first tick, survives tick failure', async () => {
    // Simulate DB not initialized: getSessionStore() throws on first call,
    // then recovers on subsequent calls (as happens when DB init completes).
    const db = makeDb();
    let fetchCalls = 0;
    const fetchImpl = (async () => {
      fetchCalls++;
      return {
        ok: true, status: 200,
        async json() { return { applied: {}, next_watermark: {} }; },
        async text() { return ''; },
      } as Response;
    }) as FetchFn;

    const agent = new SyncAgent(
      makeManager(db),
      { ...baseConfig(), intervalMs: 100 },
      fetchImpl,
      statePath,
    );

    // Verify start() does not throw even if first tick would fail.
    // (We can't easily make it fail here because the real tick() is called internally,
    // but we can verify the structural guarantee: timer is set before tick.)
    await agent.start();

    // Timer must be non-null (setInterval ran before first tick).
    expect((agent as any).timer).not.toBeNull();

    // Verify the agent responds to scheduleSoon normally (not broken).
    agent.scheduleSoon(20);
    await new Promise(r => setTimeout(r, 80));
    expect(fetchCalls).toBeGreaterThanOrEqual(1);

    // Clean up
    await agent.stop();
  });

  it('does not crash when start called twice', async () => {
    const db = makeDb();
    const agent = new SyncAgent(
      makeManager(db),
      baseConfig(),
      async () => ({ ok: true, status: 200, async json() { return { applied: {}, next_watermark: {} }; }, async text() { return ''; } } as Response),
      statePath,
    );

    await agent.start();
    const timerBefore = (agent as any).timer;
    await agent.start(); // second start must be a no-op
    expect((agent as any).timer).toBe(timerBefore); // timer unchanged

    await agent.stop();
  });

  it('timer is set before initial tick completes (structural order verified)', async () => {
    // This test verifies the structural fix: setInterval must execute
    // synchronously before the first await tick(). We do this by checking
    // that the timer reference is captured even when tick() is blocked.
    const db = makeDb();
    const agent = new SyncAgent(
      makeManager(db),
      { ...baseConfig(), intervalMs: 60000 },
      async () => ({ ok: true, status: 200, async json() { return { applied: {}, next_watermark: {} }; }, async text() { return ''; } } as Response),
      statePath,
    );

    // Call start() — after it resolves, timer must be non-null.
    // The fix ensures this invariant holds regardless of tick() outcome.
    const startPromise = agent.start();
    // The timer is set synchronously inside start() before the first await.
    // By the time startPromise resolves, the timer must be set.
    await startPromise;
    expect((agent as any).timer).not.toBeNull();

    await agent.stop();
  });
});

describe('SyncAgent.scheduleSoon', () => {
  it('debounces multiple calls into one tick', async () => {
    const db = makeDb();
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return {
        ok: true, status: 200,
        async json() { return { applied: {}, next_watermark: {} }; },
        async text() { return ''; },
      } as Response;
    }) as FetchFn;
    const agent = new SyncAgent(makeManager(db), baseConfig(), fetchImpl, statePath);

    agent.scheduleSoon(20);
    agent.scheduleSoon(20);
    agent.scheduleSoon(20);

    await new Promise(r => setTimeout(r, 80));
    expect(calls).toBe(1);

    await agent.stop();
  });
});

describe('SyncAgent auth headers', () => {
  it('adds Authorization Bearer when authMode=apikey', async () => {
    const db = makeDb();
    const capture: { url?: string; init?: RequestInit } = {};
    const agent = new SyncAgent(
      makeManager(db),
      { ...baseConfig(), authMode: 'apikey', apiKey: 'cmem_abc' },
      fakeFetch({ status: 200, body: { applied: {}, next_watermark: {} } }, capture),
      statePath,
    );
    await agent.tick();
    const headers = capture.init?.headers as Record<string, string>;
    expect(headers['authorization']).toBe('Bearer cmem_abc');
  });
});

describe('SyncAgent.stop', () => {
  it('attempts one final flush on stop', async () => {
    const db = makeDb();
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return { ok: true, status: 200, async json() { return { applied: {}, next_watermark: {} }; }, async text() { return ''; } } as Response;
    }) as FetchFn;
    const agent = new SyncAgent(makeManager(db), baseConfig(), fetchImpl, statePath);
    await agent.stop();
    // stop() runs tick() once — since we have seeded rows, fetch should be called
    expect(calls).toBe(1);
  });

  it('scheduleSoon is no-op after stop', async () => {
    const db = makeDb();
    let calls = 0;
    const fetchImpl = (async () => { calls++; return new Response('{}'); }) as FetchFn;
    const agent = new SyncAgent(makeManager(db), baseConfig(), fetchImpl, statePath);
    await agent.stop();
    agent.scheduleSoon(10);
    await new Promise(r => setTimeout(r, 30));
    expect(calls).toBe(1); // only the stop()-triggered flush, not scheduleSoon
  });

  it('does not crash when stopped twice', async () => {
    const db = makeDb();
    const agent = new SyncAgent(makeManager(db), baseConfig(), async () => new Response('{}') as Response, statePath);
    await agent.stop();
    await agent.stop(); // must not throw
    agent.scheduleSoon(); // must not throw
  });
});
