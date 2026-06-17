import { describe, it, expect, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { SessionStore } from '../src/services/sqlite/SessionStore.js';
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
  // SessionStore 跑全量迁移链(user_label/completed_at_epoch/think_time_ms 等
  // 列由迁移补齐),裸 ClaudeMemDatabase 的基础 schema 缺这些列。
  db = new SessionStore(':memory:').db;
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
      { sessions: 1, observations: 3, summaries: 0, prompts: 0, prompt_completions: 0, prompt_activity: 0 },
      200,
      [],
      'johnson',
    );

    // 水位窗口内只有 session 2;session 1(c1)是被 obs/prompt 引用闭包补带的
    // 旧行,会出现在批次里但不得推进水位。
    expect(batch.sessions.map(s => s.id).sort()).toEqual([1, 2]);
    expect(nextLocalIds.sessions).toBe(2);
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
    const wm = { sessions: 99, observations: 99, summaries: 99, prompts: 99, prompt_completions: 99, prompt_activity: 99 };
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

describe('prompt completion backfill', () => {
  it('re-collects a prompt whose completion landed after the id watermark passed it', () => {
    // 首推:prompt 还在执行中(completed_at_epoch=NULL)
    const first = collectIncremental(db, zeroState().watermark, 200, [], 'johnson');
    expect(first.batch.prompts).toHaveLength(1);
    expect(first.batch.prompts[0].completed_at_epoch).toBeNull();
    expect(first.nextLocalIds.prompt_completions).toBe(0);

    // 任务结束,本地回填完成时间(id 水位已越过该行)
    db.prepare('UPDATE user_prompts SET completed_at_epoch = ? WHERE id = 1').run(1700000090000);

    const second = collectIncremental(db, first.nextLocalIds, 200, [], 'johnson');
    expect(second.batch.prompts.map(p => p.id)).toEqual([1]);
    expect(second.batch.prompts[0].completed_at_epoch).toBe(1700000090000);
    expect(second.nextLocalIds.prompts).toBe(1);
    expect(second.nextLocalIds.prompt_completions).toBe(1700000090000);

    // 回填行也要带上引用闭包的会话行,服务端 FK 才一定通
    expect(second.batch.sessions.some(s => s.content_session_id === 'c1')).toBe(true);

    // 推完即止,不会无限重推
    const third = collectIncremental(db, second.nextLocalIds, 200, [], 'johnson');
    expect(third.batch.prompts).toHaveLength(0);
  });

  it('fresh prompts already completed at first push advance the completion watermark', () => {
    db.prepare('UPDATE user_prompts SET completed_at_epoch = ? WHERE id = 1').run(1700000090000);
    const { batch, nextLocalIds } = collectIncremental(db, zeroState().watermark, 200, [], 'johnson');
    expect(batch.prompts).toHaveLength(1);
    expect(nextLocalIds.prompt_completions).toBe(1700000090000);

    const again = collectIncremental(db, nextLocalIds, 200, [], 'johnson');
    expect(again.batch.prompts).toHaveLength(0);
  });

  it('caps backfill batches and resumes from the completion watermark', () => {
    const ins = db.prepare(`
      INSERT INTO user_prompts (content_session_id, prompt_number, prompt_text, created_at, created_at_epoch, completed_at_epoch)
      VALUES ('c1', ?, 'p', '2026-05-17T00:00:00Z', ?, ?)
    `);
    ins.run(2, 1700000001000, 1700000020000);
    ins.run(3, 1700000002000, 1700000030000);
    db.prepare('UPDATE user_prompts SET completed_at_epoch = ? WHERE id = 1').run(1700000010000);

    // 三行均已越过 id 水位(prompts: 3),完成水位从 0 起步,batchSize=2
    let wm = { sessions: 99, observations: 99, summaries: 99, prompts: 3, prompt_completions: 0, prompt_activity: 0 };
    const pushedIds: number[] = [];
    for (let i = 0; i < 4; i++) {
      const { batch, nextLocalIds } = collectIncremental(db, wm, 2, [], 'johnson');
      if (batch.prompts.length === 0) break;
      pushedIds.push(...batch.prompts.map(p => p.id));
      // 完成水位单调推进,id 水位不动
      expect(nextLocalIds.prompt_completions).toBeGreaterThan(wm.prompt_completions);
      expect(nextLocalIds.prompts).toBe(3);
      wm = nextLocalIds;
    }
    expect(pushedIds.sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });
});

describe('prompt activity backfill', () => {
  it('re-collects a prompt whose active_ms landed after the id watermark passed it', () => {
    // prompt 已完成(completed_at_epoch 已回填),活跃度尚未算 → 首推 active_ms 为 NULL。
    db.prepare('UPDATE user_prompts SET completed_at_epoch = ? WHERE id = 1').run(1700000080000);
    const first = collectIncremental(db, zeroState().watermark, 200, [], 'johnson');
    expect(first.batch.prompts).toHaveLength(1);
    expect(first.batch.prompts[0].active_ms).toBeNull();
    // active_ms 未回填,不推进活跃度水位(完成水位则随 completed_at_epoch 推进)。
    expect(first.nextLocalIds.prompt_activity).toBe(0);

    // 任务结束后算出活跃度,本地回填(id 水位已越过该行)。
    db.prepare('UPDATE user_prompts SET active_ms = ?, idle_ms = ?, activity_updated_epoch = ? WHERE id = 1')
      .run(12000, 3000, 1700000090000);

    const second = collectIncremental(db, first.nextLocalIds, 200, [], 'johnson');
    expect(second.batch.prompts.map(p => p.id)).toEqual([1]);
    expect(second.batch.prompts[0].active_ms).toBe(12000);
    expect(second.batch.prompts[0].idle_ms).toBe(3000);
    expect(second.nextLocalIds.prompts).toBe(1); // id 水位不动(旧行)
    expect(second.nextLocalIds.prompt_activity).toBe(1700000090000);

    // 推完即止,不会无限重推。
    const third = collectIncremental(db, second.nextLocalIds, 200, [], 'johnson');
    expect(third.batch.prompts).toHaveLength(0);
  });

  it('dedupes completion + activity backfills that hit the same prompt in one batch', () => {
    // 首推未完成、未算活跃 → 后续同时回填 completed 与 active(都晚于各自水位)。
    // completion 与 activity 两个查询都命中同一行,去重后本批只出现一次。
    const first = collectIncremental(db, zeroState().watermark, 200, [], 'johnson');
    expect(first.batch.prompts).toHaveLength(1);

    db.prepare('UPDATE user_prompts SET completed_at_epoch = ?, active_ms = ?, idle_ms = ?, activity_updated_epoch = ? WHERE id = 1')
      .run(1700000080000, 12000, 3000, 1700000090000);

    const second = collectIncremental(db, first.nextLocalIds, 200, [], 'johnson');
    // 去重:同一行被两个回填查询命中,本批仍只推一次。
    expect(second.batch.prompts).toHaveLength(1);
    expect(second.batch.prompts[0].id).toBe(1);
    expect(second.batch.prompts[0].active_ms).toBe(12000);
    expect(second.batch.prompts[0].completed_at_epoch).toBe(1700000080000);
    // 两个独立水位都推进。
    expect(second.nextLocalIds.prompt_completions).toBe(1700000080000);
    expect(second.nextLocalIds.prompt_activity).toBe(1700000090000);
  });
});
