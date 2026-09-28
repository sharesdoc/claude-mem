import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { ClaudeMemDatabase } from '../../../src/services/sqlite/Database.js';
import { SessionStore } from '../../../src/services/sqlite/SessionStore.js';
import type { DatabaseManager } from '../../../src/services/worker/DatabaseManager.js';
import { SessionManager } from '../../../src/services/worker/SessionManager.js';

describe('SessionManager queue integration', () => {
  let db: Database;
  let store: SessionStore;
  let manager: SessionManager;

  beforeEach(() => {
    db = new ClaudeMemDatabase(':memory:').db;
    store = new SessionStore(db);

    const dbManager = {
      getSessionStore: () => store,
      getSessionById: (sessionDbId: number) => {
        const session = store.getSessionById(sessionDbId);
        if (!session) {
          throw new Error(`Session ${sessionDbId} not found`);
        }
        return session;
      },
    } as unknown as DatabaseManager;

    manager = new SessionManager(dbManager);
  });

  afterEach(async () => {
    await manager.shutdownAll();
    db.close();
  });

  test('confirmClaimedMessages only deletes claimed rows and preserves newly queued work', async () => {
    const sessionDbId = store.createSDKSession(
      'content-ack-invariant',
      'test-project',
      'Test prompt'
    );
    manager.initializeSession(sessionDbId);

    await manager.queueObservation(sessionDbId, {
      tool_name: 'FirstTool',
      tool_input: { step: 1 },
      tool_response: { ok: true },
      prompt_number: 1,
      toolUseId: 'tool-a',
    });

    const iterator = manager.getMessageIterator(sessionDbId);
    const first = await iterator.next();
    expect(first.done).toBe(false);
    expect(first.value?._persistentId).toBeGreaterThan(0);

    await manager.queueObservation(sessionDbId, {
      tool_name: 'SecondTool',
      tool_input: { step: 2 },
      tool_response: { ok: true },
      prompt_number: 1,
      toolUseId: 'tool-b',
    });

    expect(await manager.confirmClaimedMessages(sessionDbId)).toBe(1);
    await iterator.return?.();

    const rows = db.prepare(`
      SELECT tool_use_id, status
      FROM pending_messages
      WHERE session_db_id = ?
      ORDER BY id ASC
    `).all(sessionDbId) as Array<{ tool_use_id: string; status: string }>;

    expect(rows).toEqual([{ tool_use_id: 'tool-b', status: 'pending' }]);
    expect(await manager.getTotalQueueDepth()).toBe(1);
  });

  test('initializeQueueEngine does not require the database before sqlite mode is used', async () => {
    const previous = process.env.CLAUDE_MEM_QUEUE_ENGINE;
    process.env.CLAUDE_MEM_QUEUE_ENGINE = 'sqlite';
    try {
      const earlyManager = new SessionManager({
        getSessionStore: () => {
          throw new Error('Database not initialized');
        },
      } as unknown as DatabaseManager);

      await expect(earlyManager.initializeQueueEngine()).resolves.toBeUndefined();
    } finally {
      if (previous === undefined) {
        delete process.env.CLAUDE_MEM_QUEUE_ENGINE;
      } else {
        process.env.CLAUDE_MEM_QUEUE_ENGINE = previous;
      }
    }
  });

  test('flushes one closed slice without mixing events from the next round', async () => {
    const sessionDbId = store.createSDKSession('round-isolation', 'project', 'first');
    manager.initializeSession(sessionDbId, 'first', 1);
    manager.beginInputRound(sessionDbId, 1, 'first');
    await manager.queueObservation(sessionDbId, {
      tool_name: 'Read', tool_input: { round: 1 }, tool_response: { ok: true },
      prompt_number: 1, toolUseId: 'round-1-tool'
    });

    expect(await manager.flushInputRound(sessionDbId)).toBe(1);

    manager.beginInputRound(sessionDbId, 2, 'second');
    await manager.queueObservation(sessionDbId, {
      tool_name: 'Grep', tool_input: { round: 2 }, tool_response: { ok: true },
      prompt_number: 2, toolUseId: 'round-2-tool'
    });

    const pending = db.prepare(`
      SELECT prompt_number, round_slice_number, round_slice_start_raw_event_id,
             round_slice_end_raw_event_id, round_slice_key, tool_input
      FROM pending_messages WHERE session_db_id = ? ORDER BY id
    `).all(sessionDbId) as Array<Record<string, unknown>>;
    expect(pending).toHaveLength(1);
    expect(pending[0].prompt_number).toBe(1);
    expect(pending[0].round_slice_number).toBe(1);
    expect(pending[0].round_slice_key).toBe('round-isolation:1:1');
    expect(String(pending[0].tool_input)).toContain('round-1-tool');
    expect(String(pending[0].tool_input)).not.toContain('round-2-tool');
  });

  test('session-end flush delivers the closed slice once and duplicate slice enqueue is idempotent', async () => {
    const sessionDbId = store.createSDKSession('round-end', 'project', 'last');
    manager.initializeSession(sessionDbId, 'last', 1);
    manager.beginInputRound(sessionDbId, 1, 'last');
    await manager.queueObservation(sessionDbId, {
      tool_name: 'Read', tool_input: { last: true }, tool_response: { ok: true },
      prompt_number: 1, toolUseId: 'last-tool'
    });

    expect(await manager.flushInputRound(sessionDbId)).toBe(1);
    expect(await manager.flushInputRound(sessionDbId)).toBe(0);
    expect(await manager.getTotalQueueDepth()).toBe(1);

    const iterator = manager.getMessageIterator(sessionDbId);
    const item = await iterator.next();
    expect(item.value?.roundSlice).toEqual(expect.objectContaining({
      promptNumber: 1, sliceNumber: 1,
      idempotencyKey: 'round-end:1:1'
    }));
    await iterator.return?.();
  });

  test('does not consume an open round slice and consumes closed slices in slice order', async () => {
    const sessionDbId = store.createSDKSession('slice-consumer', 'project', 'prompt');
    manager.initializeSession(sessionDbId, 'prompt', 1);
    manager.beginInputRound(sessionDbId, 1, 'prompt');

    const rounds = db.prepare(`
      SELECT content_session_id, prompt_number FROM input_rounds
      WHERE content_session_id = 'slice-consumer' AND prompt_number = 1
    `).get() as { content_session_id: string; prompt_number: number };
    db.prepare(`
      INSERT INTO round_slices
        (content_session_id, prompt_number, slice_number, start_raw_event_id,
         end_raw_event_id, status, idempotency_key)
      VALUES (?, ?, ?, ?, ?, 'pending', ?)
    `).run(rounds.content_session_id, rounds.prompt_number, 1, 1, 1, 'slice-consumer:1:1');

    const queue = manager.getPendingMessageStore();
    await queue.enqueue(sessionDbId, 'slice-consumer', {
      type: 'observation', tool_name: 'input_round_slice',
      roundSlice: {
        promptNumber: 1, sliceNumber: 1, startRawEventId: 1,
        endRawEventId: 1, idempotencyKey: 'slice-consumer:1:1'
      }
    });

    const openAbort = new AbortController();
    const openIterator = queue.createIterator({
      sessionDbId,
      signal: openAbort.signal,
      idleTimeoutMs: 20,
      roundSlicesOnly: true,
    });
    const openRead = await Promise.race([
      openIterator.next(),
      new Promise<{ done: true }>(resolve => setTimeout(() => resolve({ done: true }), 30))
    ]);
    expect(openRead.done).toBe(true);
    openAbort.abort();
    await openIterator.return?.();
    expect(db.prepare(`SELECT status FROM pending_messages WHERE round_slice_key = 'slice-consumer:1:1'`).get()).toEqual({ status: 'pending' });

    db.run(`UPDATE input_rounds SET status = 'closed', closed_at_epoch = ? WHERE content_session_id = 'slice-consumer' AND prompt_number = 1`, Date.now());
    const secondSlice = db.prepare(`
      INSERT INTO round_slices
        (content_session_id, prompt_number, slice_number, start_raw_event_id,
         end_raw_event_id, status, idempotency_key)
      VALUES (?, ?, ?, ?, ?, 'pending', ?)
    `).run('slice-consumer', 1, 2, 2, 2, 'slice-consumer:1:2');
    await queue.enqueue(sessionDbId, 'slice-consumer', {
      type: 'observation', tool_name: 'input_round_slice',
      roundSlice: {
        promptNumber: 1, sliceNumber: 2, startRawEventId: 2,
        endRawEventId: 2, idempotencyKey: 'slice-consumer:1:2'
      }
    });

    const closedIterator = manager.getMessageIterator(sessionDbId);
    const first = await closedIterator.next();
    expect(first.value?.roundSlice?.sliceNumber).toBe(1);
    await manager.confirmClaimedMessages(sessionDbId);
    const second = await closedIterator.next();
    expect(second.value?.roundSlice?.sliceNumber).toBe(2);
    expect(secondSlice).toBeDefined();
    await closedIterator.return?.();
  });
});
