import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import express from 'express';
import { Database } from 'bun:sqlite';
import { SessionStore } from '../src/services/sqlite/SessionStore.js';
import { SyncStatusRoutes } from '../src/services/worker/http/routes/SyncStatusRoutes.js';
import type { DatabaseManager } from '../src/services/worker/DatabaseManager.js';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * T-25 — /api/sync/status surfaces watermark lag + last error so the
 * viewer header can render a colour-coded chip.
 */

let tmpRoot: string;
let prevDataDir: string | undefined;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'claude-mem-sync-status-'));
  prevDataDir = process.env.CLAUDE_MEM_DATA_DIR;
  process.env.CLAUDE_MEM_DATA_DIR = tmpRoot;
  writeFileSync(join(tmpRoot, 'settings.json'), JSON.stringify({
    env: { CLAUDE_MEM_NODE_ROLE: 'client', CLAUDE_MEM_SYNC_UPSTREAM_URL: 'http://mem.test' },
  }));
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
  if (prevDataDir !== undefined) process.env.CLAUDE_MEM_DATA_DIR = prevDataDir;
  else delete process.env.CLAUDE_MEM_DATA_DIR;
});

function seedDb(db: Database): void {
  db.prepare(`
    INSERT INTO sdk_sessions (content_session_id, memory_session_id, project, started_at, started_at_epoch, status)
    VALUES ('c1', 'm1', 'p', '2026', 1000, 'active')
  `).run();
  db.prepare(`
    INSERT INTO observations (memory_session_id, project, type, created_at, created_at_epoch)
    VALUES ('m1', 'p', 'feat', '2026', 1001),
           ('m1', 'p', 'feat', '2026', 1002),
           ('m1', 'p', 'feat', '2026', 1003)
  `).run();
}

async function spinUp(db: Database): Promise<{ url: string; close: () => Promise<void> }> {
  const mgr = { getConnection: () => db } as unknown as DatabaseManager;
  const app = express();
  const settingsPath = join(tmpRoot, 'settings.json');
  const statePath = join(tmpRoot, 'sync-state.json');
  // 第 2 参是 syncAgentAccessor(此处不需要),settings/state 路径在 3/4 位
  new SyncStatusRoutes(mgr, undefined, () => settingsPath, () => statePath).setupRoutes(app);
  const server = app.listen(0);
  await new Promise<void>(r => server.on('listening', () => r()));
  const port = (server.address() as { port: number }).port;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>(r => server.close(() => r())),
  };
}

describe('GET /api/sync/status', () => {
  it('reports zero lag when watermark matches max(id) for every table', async () => {
    const db = new SessionStore(':memory:').db;
    seedDb(db);
    writeFileSync(join(tmpRoot, 'sync-state.json'), JSON.stringify({
      upstream_url: 'http://mem.test',
      last_sync_at: 1700000000000,
      last_success_at: 1700000000000,
      watermark: { sessions: 1, observations: 3, summaries: 0, prompts: 0 },
      failures: { consecutive: 0, last_error: null },
    }));
    const { url, close } = await spinUp(db);
    try {
      const body = await fetch(`${url}/api/sync/status`).then(r => r.json());
      expect(body.role).toBe('client');
      expect(body.sync_enabled).toBe(true);
      expect(body.lag.total).toBe(0);
      expect(body.consecutive_failures).toBe(0);
    } finally {
      await close();
    }
  });

  it('reports non-zero lag when watermark trails max(id)', async () => {
    const db = new SessionStore(':memory:').db;
    seedDb(db);
    writeFileSync(join(tmpRoot, 'sync-state.json'), JSON.stringify({
      upstream_url: 'http://mem.test',
      watermark: { sessions: 0, observations: 1, summaries: 0, prompts: 0 },
      failures: { consecutive: 0, last_error: null },
      last_sync_at: 0, last_success_at: 0,
    }));
    const { url, close } = await spinUp(db);
    try {
      const body = await fetch(`${url}/api/sync/status`).then(r => r.json());
      expect(body.lag.observations).toBe(2); // 3 - 1
      expect(body.lag.sessions).toBe(1);     // 1 - 0
      expect(body.lag.total).toBeGreaterThan(0);
    } finally {
      await close();
    }
  });

  it('returns zero state when sync-state.json is missing', async () => {
    const db = new SessionStore(':memory:').db;
    const { url, close } = await spinUp(db);
    try {
      const body = await fetch(`${url}/api/sync/status`).then(r => r.json());
      expect(body.consecutive_failures).toBe(0);
      expect(body.last_error).toBeNull();
      expect(body.lag.total).toBe(0);
    } finally {
      await close();
    }
  });
});
