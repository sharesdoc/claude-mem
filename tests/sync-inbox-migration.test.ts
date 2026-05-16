import { describe, it, expect, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * T-05 — Migration v37 sync_inbox creates the table only when the node
 * boots in server mode. Client installs should NOT carry the table.
 *
 * We exercise the SessionStore constructor with CLAUDE_MEM_DATA_DIR
 * pointing at a fresh temp dir so settings.json controls the role —
 * env variable takes precedence over file when both are set.
 */

const SUBJECT_PATH = '../src/services/sqlite/SessionStore.js';

let tmpRoot: string | undefined;

function freshTempDataDir(role: 'client' | 'server' | null): string {
  const dir = mkdtempSync(join(tmpdir(), 'claude-mem-syncinbox-'));
  if (role !== null) {
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({
      env: { CLAUDE_MEM_NODE_ROLE: role },
    }, null, 2));
  }
  tmpRoot = dir;
  return dir;
}

async function loadSessionStoreFresh(): Promise<typeof import('../src/services/sqlite/SessionStore.js').SessionStore> {
  delete (globalThis as Record<string, unknown>).__paths_cache;
  // bun caches by absolute path; bust by appending a query string fragment via a dynamic import
  const url = require.resolve('../src/services/sqlite/SessionStore.js') + '?t=' + Date.now();
  // Bun supports require with URL-ish suffixes inconsistently; fall back to dynamic import
  const mod = await import(SUBJECT_PATH);
  return mod.SessionStore;
}

function tableExists(db: Database, name: string): boolean {
  const row = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name) as { name: string } | undefined;
  return !!row;
}

afterEach(() => {
  if (tmpRoot) {
    try { rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* */ }
    tmpRoot = undefined;
  }
  delete process.env.CLAUDE_MEM_NODE_ROLE;
  delete process.env.CLAUDE_MEM_DATA_DIR;
});

describe('migration v37 sync_inbox', () => {
  it('does NOT create sync_inbox in client mode (env)', async () => {
    freshTempDataDir(null);
    process.env.CLAUDE_MEM_NODE_ROLE = 'client';

    const db = new Database(':memory:');
    const { SessionStore } = await import(SUBJECT_PATH);
    new SessionStore(db);

    expect(tableExists(db, 'sync_inbox')).toBe(false);
    const ver = db.prepare('SELECT version FROM schema_versions WHERE version = 37').get();
    expect(ver == null).toBe(true);
  });

  it('creates sync_inbox + index in server mode (env)', async () => {
    freshTempDataDir(null);
    process.env.CLAUDE_MEM_NODE_ROLE = 'server';

    const db = new Database(':memory:');
    const { SessionStore } = await import(SUBJECT_PATH);
    new SessionStore(db);

    expect(tableExists(db, 'sync_inbox')).toBe(true);

    // index present
    const indexes = db.query("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='sync_inbox'").all() as { name: string }[];
    expect(indexes.some(i => i.name === 'idx_sync_inbox_user_time')).toBe(true);

    // schema_versions stamped
    const ver = db.prepare('SELECT version FROM schema_versions WHERE version = 37').get();
    expect(ver).toBeDefined();

    // CHECK constraint on source_table enforces the allow list
    expect(() => db.run("INSERT INTO sync_inbox (user_label, source_table, source_uid, applied_at_epoch) VALUES ('u','bogus','x',1)")).toThrow();
    db.run("INSERT INTO sync_inbox (user_label, source_table, source_uid, applied_at_epoch) VALUES ('u','observations','x',1)");
  });
});
