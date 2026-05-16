import { describe, it, expect, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { ClaudeMemDatabase } from '../src/services/sqlite/Database.js';
import { collectIncremental } from '../src/services/sync/payload.js';
import { zeroState } from '../src/services/sync/sync-state.js';

/**
 * T-08 — incremental payload collection.
 *
 * We exercise the real schema via ClaudeMemDatabase so the column list
 * stays in lockstep with migrations.
 */

let db: Database;

function seed() {
  // Two sessions, one with memory_session_id (eligible for obs/summary FK),
  // one without.
  db.prepare(`
    INSERT INTO sdk_sessions (content_session_id, memory_session_id, project, started_at, started_at_epoch, status, user_name, user_label)
    VALUES ('c1', 'm1', 'proj-a', '2026-05-17T00:00:00Z', 1700000000000, 'active', 'os-user', 'johnson')
  `).run();
  db.prepare(`
    INSERT INTO sdk_sessions (content_session_id, memory_session_id, project, started_at, started_at_epoch, status, user_name, user_label)
    VALUES ('c2', 'm2', 'proj-b', '2026-05-17T00:01:00Z', 1700000060000, 'active', 'os-user', 'johnson')
  `).run();

  // 5 observations on m1, varied files_read/files_modified
  const insertObs = db.prepare(`
    INSERT INTO observations (memory_session_id, project, type, title, files_read, files_modified, created_at, created_at_epoch, prompt_number)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertObs.run('m1', 'proj-a', 'feature', 'no files', null, null, '2026-05-17T00:00:01Z', 1700000001000, 1);
  insertObs.run('m1', 'proj-a', 'feature', 'mixed files', 'src/foo.ts,src/bar.env', 'src/baz.ts', '2026-05-17T00:00:02Z', 1700000002000, 1);
  insertObs.run('m1', 'proj-a', 'feature', 'all redacted', 'src/a.env,src/b.env', 'src/c.env', '2026-05-17T00:00:03Z', 1700000003000, 1);
  insertObs.run('m1', 'proj-a', 'feature', 'json files', '["src/keep.ts","src/secrets/x.json"]', '["src/y.ts"]', '2026-05-17T00:00:04Z', 1700000004000, 1);
  insertObs.run('m1', 'proj-a', 'feature', 'extra row', 'src/last.ts', null, '2026-05-17T00:00:05Z', 1700000005000, 1);

  // 1 summary on m1
  db.prepare(`
    INSERT INTO session_summaries (memory_session_id, project, request, files_read, files_edited, created_at, created_at_epoch, prompt_number)
    VALUES ('m1', 'proj-a', 'do stuff', 'src/a.ts,src/.env', 'src/b.ts', '2026-05-17T00:00:10Z', 1700000010000, 1)
  `).run();

  // 1 prompt on c1
  db.prepare(`
    INSERT INTO user_prompts (content_session_id, prompt_number, prompt_text, created_at, created_at_epoch)
    VALUES ('c1', 1, 'hello', '2026-05-17T00:00:00Z', 1700000000000)
  `).run();
}

beforeEach(() => {
  db = new ClaudeMemDatabase(':memory:').db;
  seed();
});

describe('collectIncremental', () => {
  it('returns all rows when watermark is zero and no redaction', () => {
    const { batch, nextLocalIds } = collectIncremental(
      db,
      zeroState().watermark,
      200,
      [],
      'johnson',
      () => 1700000999000,
    );

    expect(batch.user_label).toBe('johnson');
    expect(batch.generated_at_epoch).toBe(1700000999000);
    expect(batch.sessions).toHaveLength(2);
    expect(batch.observations).toHaveLength(5);
    expect(batch.summaries).toHaveLength(1);
    expect(batch.prompts).toHaveLength(1);

    expect(nextLocalIds.sessions).toBe(2);
    expect(nextLocalIds.observations).toBe(5);
    expect(nextLocalIds.summaries).toBe(1);
    expect(nextLocalIds.prompts).toBe(1);
  });

  it('respects per-table watermark (skips rows with id <= wm)', () => {
    const { batch, nextLocalIds } = collectIncremental(
      db,
      { sessions: 1, observations: 3, summaries: 0, prompts: 0 },
      200,
      [],
      'johnson',
    );

    expect(batch.sessions.map(s => s.id)).toEqual([2]);
    expect(batch.observations.map(o => o.id)).toEqual([4, 5]);
    expect(nextLocalIds.observations).toBe(5);
  });

  it('honours batchSize (caps each table independently)', () => {
    const { batch, nextLocalIds } = collectIncremental(
      db,
      zeroState().watermark,
      2,
      [],
      'johnson',
    );
    expect(batch.observations).toHaveLength(2);
    expect(batch.observations.map(o => o.id)).toEqual([1, 2]);
    expect(nextLocalIds.observations).toBe(2);
  });

  it('redacts matching files from CSV lists', () => {
    const { batch } = collectIncremental(
      db,
      zeroState().watermark,
      200,
      ['**/*.env'],
      'johnson',
    );

    // obs 2 had `src/bar.env` redacted, `src/foo.ts` kept
    const obs2 = batch.observations.find(o => o.id === 2)!;
    expect(obs2.files_read).toBe('src/foo.ts');
    expect(obs2.files_modified).toBe('src/baz.ts');
  });

  it('drops observations whose every file is redacted', () => {
    const { batch } = collectIncremental(
      db,
      zeroState().watermark,
      200,
      ['**/*.env'],
      'johnson',
    );

    expect(batch.observations.find(o => o.id === 3)).toBeUndefined();
    expect(batch.observations.find(o => o.title === 'all redacted')).toBeUndefined();
  });

  it('redacts JSON-array file lists while preserving JSON encoding', () => {
    const { batch } = collectIncremental(
      db,
      zeroState().watermark,
      200,
      ['**/secrets/**'],
      'johnson',
    );

    const obs4 = batch.observations.find(o => o.id === 4)!;
    expect(obs4.files_read).toBe('["src/keep.ts"]');
    expect(obs4.files_modified).toBe('["src/y.ts"]');
  });

  it('preserves rows with no files even when redact globs are set', () => {
    const { batch } = collectIncremental(
      db,
      zeroState().watermark,
      200,
      ['**/*.env'],
      'johnson',
    );
    expect(batch.observations.find(o => o.id === 1)).toBeDefined();
  });

  it('returns empty batch + unchanged watermark when no new rows', () => {
    const wm = { sessions: 99, observations: 99, summaries: 99, prompts: 99 };
    const { batch, nextLocalIds } = collectIncremental(db, wm, 200, [], 'johnson');
    expect(batch.sessions).toHaveLength(0);
    expect(batch.observations).toHaveLength(0);
    expect(nextLocalIds).toEqual(wm);
  });

  it('returns rows sorted ascending by id within each table', () => {
    const { batch } = collectIncremental(db, zeroState().watermark, 200, [], 'johnson');
    const ids = batch.observations.map(o => o.id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });
});
