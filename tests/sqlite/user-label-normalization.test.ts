import { describe, it, expect, afterEach } from 'bun:test';
import { SessionStore } from '../../src/services/sqlite/SessionStore.js';

/**
 * X-007 — v46 migration collapses user_label case variants into a single
 * UPPERCASE identity. We pre-seed a fresh in-memory DB with mixed-case
 * labels (bypassing worker writes), then re-run the v46 SQL primitives by
 * hand and assert the post-conditions:
 *   1. sync_inbox has UNIQUE(user_label, source_table, source_uid), so
 *      (chenzhu, t, u) and (ChenZhu, t, u) must collapse to 1 row.
 *   2. Every remaining label column is UPPERCASE.
 *
 * The migration is idempotent — running it twice changes nothing.
 *
 * sync_inbox only exists under server role, so we force the env for the
 * duration of these tests and reset it in afterEach.
 */
describe('v46 user_label normalization migration', () => {
  const previousRole = process.env.CLAUDE_MEM_NODE_ROLE;

  afterEach(() => {
    if (previousRole === undefined) delete process.env.CLAUDE_MEM_NODE_ROLE;
    else process.env.CLAUDE_MEM_NODE_ROLE = previousRole;
  });

  it('dedupes sync_inbox by (UPPER(user_label), source_table, source_uid)', () => {
    process.env.CLAUDE_MEM_NODE_ROLE = 'server';
    const store = new SessionStore(':memory:');
    const db = store.db;

    // Sanity: sync_inbox must exist under server role.
    const hasTable = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='sync_inbox'").get();
    expect(hasTable).toBeDefined();

    // Simulate a server that received the same record under two case
    // variants of the same identity (pre-v46 worker would have written
    // them verbatim).
    db.run(
      `INSERT INTO sync_inbox (user_label, source_table, source_uid, applied_at_epoch, applied_row_id) VALUES (?, ?, ?, ?, ?)`,
      ['chenzhu', 'observations', 'mem-1:hash-a', 1, 100],
    );
    db.run(
      `INSERT INTO sync_inbox (user_label, source_table, source_uid, applied_at_epoch, applied_row_id) VALUES (?, ?, ?, ?, ?)`,
      ['ChenZhu', 'observations', 'mem-1:hash-a', 2, 101],
    );
    db.run(
      `INSERT INTO sync_inbox (user_label, source_table, source_uid, applied_at_epoch, applied_row_id) VALUES (?, ?, ?, ?, ?)`,
      ['CHENZHU', 'observations', 'mem-1:hash-a', 3, 102],
    );
    // A truly different record must be preserved.
    db.run(
      `INSERT INTO sync_inbox (user_label, source_table, source_uid, applied_at_epoch, applied_row_id) VALUES (?, ?, ?, ?, ?)`,
      ['alice', 'observations', 'mem-2:hash-b', 4, 103],
    );

    // Re-run the dedupe primitive exactly as v46 does.
    db.run(`
      DELETE FROM sync_inbox
      WHERE rowid NOT IN (
        SELECT MIN(rowid) FROM sync_inbox
        GROUP BY UPPER(user_label), source_table, source_uid
      )
    `);

    const rows = db.query('SELECT user_label, source_uid FROM sync_inbox ORDER BY user_label').all() as Array<{ user_label: string; source_uid: string }>;
    expect(rows.length).toBe(2);
    // Both surviving rows must be the earliest rowid of their group.
    const chenzhuRows = rows.filter(r => r.source_uid === 'mem-1:hash-a');
    expect(chenzhuRows.length).toBe(1);
    expect(chenzhuRows[0].user_label).toBe('chenzhu'); // earliest rowid kept verbatim; UPPER comes in step 2

    db.close();
  });

  it('uppercases every label column in place and is idempotent', () => {
    const store = new SessionStore(':memory:');
    const db = store.db;

    // Seed mixed-case labels directly into each table that v44 touches.
    db.run(`INSERT INTO sdk_sessions (content_session_id, memory_session_id, project, platform_source, user_prompt, started_at, started_at_epoch, status, user_label)
            VALUES ('cs-1', 'ms-1', 'p', 'cli', 'q', '2024-01-01T00:00:00Z', 0, 'completed', 'chenzhu')`);
    db.run(`INSERT INTO observations (memory_session_id, project, type, title, narrative, facts, concepts, files_read, files_modified, content_hash, created_at, created_at_epoch, user_label)
            VALUES ('ms-1', 'p', 'feature', 't', 'n', '[]', '[]', '[]', '[]', 'h', '2024-01-01T00:00:00Z', 0, 'ChenZhu')`);
    db.run(`INSERT INTO session_summaries (memory_session_id, project, request, investigated, learned, completed, next_steps, notes, created_at, created_at_epoch, user_label)
            VALUES ('ms-1', 'p', 'r', 'i', 'l', 'c', 'n', 'no', '2024-01-01T00:00:00Z', 0, 'ChenZhu')`);

    const uppercase = (table: string, column: string, nullable: boolean) => {
      const pred = nullable ? `${column} IS NOT NULL` : `${column} != ''`;
      db.run(`UPDATE ${table} SET ${column} = UPPER(${column}) WHERE ${pred} AND ${column} != UPPER(${column})`);
    };

    uppercase('sdk_sessions', 'user_label', true);
    uppercase('observations', 'user_label', false);
    uppercase('session_summaries', 'user_label', false);

    const s = db.query('SELECT user_label FROM sdk_sessions WHERE content_session_id = ?').get('cs-1') as { user_label: string };
    const o = db.query('SELECT user_label FROM observations WHERE memory_session_id = ?').get('ms-1') as { user_label: string };
    const sm = db.query('SELECT user_label FROM session_summaries WHERE memory_session_id = ?').get('ms-1') as { user_label: string };
    expect(s.user_label).toBe('CHENZHU');
    expect(o.user_label).toBe('CHENZHU');
    expect(sm.user_label).toBe('CHENZHU');

    // Idempotent: re-running changes nothing.
    uppercase('sdk_sessions', 'user_label', true);
    uppercase('observations', 'user_label', false);
    uppercase('session_summaries', 'user_label', false);
    const s2 = db.query('SELECT user_label FROM sdk_sessions WHERE content_session_id = ?').get('cs-1') as { user_label: string };
    expect(s2.user_label).toBe('CHENZHU');

    db.close();
  });

  it('marks v46 as applied on a fresh DB so subsequent boots skip the work', () => {
    const store = new SessionStore(':memory:');
    const db = store.db;
    const row = db.query('SELECT version FROM schema_versions WHERE version = ?').get(46) as { version: number } | undefined;
    expect(row).toBeDefined();
    expect(row?.version).toBe(46);
    db.close();
  });
});
