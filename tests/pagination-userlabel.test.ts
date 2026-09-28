import { describe, it, expect, beforeEach } from 'bun:test';
import { ClaudeMemDatabase } from '../src/services/sqlite/Database.js';
import type { Database } from 'bun:sqlite';
import { PaginationHelper } from '../src/services/worker/PaginationHelper.js';
import type { DatabaseManager } from '../src/services/worker/DatabaseManager.js';

/**
 * T-20 — userLabel filter on observations/summaries/prompts.
 *
 * We construct a minimal in-memory DB via ClaudeMemDatabase so the schema
 * matches production, then drive the helper directly to assert the
 * filter is composed in SQL (and not just discarded).
 */

let db: Database;
let helper: PaginationHelper;

function makeManager(_db: Database): DatabaseManager {
  return {
    getSessionStore: () => ({ db: _db }),
  } as unknown as DatabaseManager;
}

function seed(): void {
  db.prepare(`
    INSERT INTO sdk_sessions (content_session_id, memory_session_id, project, started_at, started_at_epoch, status, user_label)
    VALUES
      ('c1', 'm1', 'projA', '2026-05-17', 1000, 'active', 'alice'),
      ('c2', 'm2', 'projA', '2026-05-17', 2000, 'active', 'bob')
  `).run();

  // 3 alice obs + 2 bob obs
  const ins = db.prepare(`
    INSERT INTO observations (memory_session_id, project, type, title, created_at, created_at_epoch)
    VALUES (?, 'projA', 'feature', ?, '2026-05-17', ?)
  `);
  ins.run('m1', 'a-1', 1001);
  ins.run('m1', 'a-2', 1002);
  ins.run('m1', 'a-3', 1003);
  ins.run('m2', 'b-1', 2001);
  ins.run('m2', 'b-2', 2002);

  // 1 alice summary + 1 bob summary
  db.prepare(`
    INSERT INTO session_summaries (memory_session_id, project, request, created_at, created_at_epoch)
    VALUES ('m1', 'projA', 'alice', '2026-05-17', 1100),
           ('m2', 'projA', 'bob',   '2026-05-17', 2100)
  `).run();

  // 1 alice prompt + 1 bob prompt
  db.prepare(`
    INSERT INTO user_prompts (content_session_id, prompt_number, prompt_text, created_at, created_at_epoch)
    VALUES ('c1', 1, 'hi from alice', '2026-05-17', 1200),
           ('c2', 1, 'hi from bob',   '2026-05-17', 2200)
  `).run();
}

beforeEach(() => {
  db = new ClaudeMemDatabase(':memory:').db;
  seed();
  helper = new PaginationHelper(makeManager(db));
});

describe('PaginationHelper.getObservations with userLabel', () => {
  it('returns all rows when userLabel is undefined', () => {
    const r = helper.getObservations(0, 100);
    expect(r.items).toHaveLength(5);
  });
  it('filters to one user', () => {
    const r = helper.getObservations(0, 100, undefined, undefined, undefined, undefined, 'alice');
    expect(r.items).toHaveLength(3);
    expect(r.items.every(o => /^a-/.test(o.title as string))).toBe(true);
  });
  it('stacks with date filter', () => {
    const r = helper.getObservations(0, 100, undefined, undefined, 1002, undefined, 'alice');
    expect(r.items.map(o => o.title).sort()).toEqual(['a-2', 'a-3']);
  });
});

describe('PaginationHelper.getSummaries with userLabel', () => {
  it('filters by user_label', () => {
    const r = helper.getSummaries(0, 100, undefined, undefined, undefined, undefined, 'bob');
    expect(r.items).toHaveLength(1);
    expect(r.items[0].request).toBe('bob');
  });
});

describe('PaginationHelper.getPrompts with userLabel', () => {
  it('filters by user_label', () => {
    const r = helper.getPrompts(0, 100, undefined, undefined, undefined, undefined, 'alice');
    expect(r.items).toHaveLength(1);
    expect(r.items[0].prompt_text).toBe('hi from alice');
  });

  it('returns empty when no match', () => {
    const r = helper.getPrompts(0, 100, undefined, undefined, undefined, undefined, 'noone');
    expect(r.items).toEqual([]);
  });
});
