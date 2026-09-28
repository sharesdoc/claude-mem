import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { MigrationRunner } from '../../../src/services/sqlite/migrations/runner.js';
import { InputRoundStore } from '../../../src/services/sqlite/InputRoundStore.js';
import { PendingMessageStore } from '../../../src/services/sqlite/PendingMessageStore.js';

describe('InputRoundStore', () => {
  let db: Database;
  let store: InputRoundStore;

  beforeEach(() => {
    db = new Database(':memory:');
    new MigrationRunner(db).runAllMigrations();
    store = new InputRoundStore(db, { maxSliceBytes: 10 });
  });

  afterEach(() => db.close());

  test('opens a prompt, closes the previous prompt, and creates immutable ordered slices', () => {
    store.openRound('session-1', 1);
    const first = store.appendEvent('session-1', 1, JSON.stringify({ n: 1 }));
    const second = store.appendEvent('session-1', 1, JSON.stringify({ n: 2 }));
    store.openRound('session-1', 2);

    const round = store.getRound('session-1', 1);
    expect(round?.status).toBe('closed');
    expect(store.getRound('session-1', 2)?.status).toBe('open');
    expect(store.getSlices('session-1', 1)).toEqual([
      expect.objectContaining({ slice_number: 1, start_raw_event_id: first, end_raw_event_id: first }),
      expect.objectContaining({ slice_number: 2, start_raw_event_id: second, end_raw_event_id: second }),
    ]);
  });

  test('slice creation is idempotent and session close flushes the open round', () => {
    store.openRound('session-1', 1);
    store.appendEvent('session-1', 1, 'event');
    expect(store.closeOpenRound('session-1')).toBe(1);
    expect(store.closeOpenRound('session-1')).toBe(0);
    expect(store.createSlices('session-1', 1)).toBe(0);
    expect(store.getRound('session-1', 1)?.status).toBe('closed');
  });

  test('does not require pending rows and preserves raw event ids', () => {
    store.openRound('session-1', 1);
    const rawId = store.appendEvent('session-1', 1, 'permanent');
    store.closeOpenRound('session-1');
    expect(db.prepare('SELECT id, payload FROM raw_events WHERE id = ?').get(rawId)).toEqual({ id: rawId, payload: 'permanent' });
    db.run('DELETE FROM pending_messages');
    expect(store.getSlices('session-1', 1)[0]?.start_raw_event_id).toBe(rawId);
  });

  test('concatenates completed slice results in slice order without another generation step', () => {
    store.openRound('session-1', 1);
    store.appendEvent('session-1', 1, 'abcdefgh');
    store.appendEvent('session-1', 1, 'ijklmnop');
    store.closeOpenRound('session-1');
    store.recordSliceResult('session-1', 1, 2, 'second');
    expect(store.getRoundResult('session-1', 1)).toBeNull();
    store.recordSliceResult('session-1', 1, 1, 'first');
    expect(store.getRoundResult('session-1', 1)).toBe('first\nsecond');
    expect(store.getRound('session-1', 1)?.status).toBe('completed');
    store.recordSliceResult('session-1', 1, 1, 'different retry result');
    expect(store.getRoundResult('session-1', 1)).toBe('first\nsecond');
  });

  test('slice size includes tool input, tool response, and payload', () => {
    store.openRound('session-size', 1);
    db.prepare(`
      INSERT INTO raw_events (
        content_session_id, event_type, prompt_number, tool_input,
        tool_response, payload, created_at_epoch
      ) VALUES ('session-size', 'observation', 1, '12345', '67890', 'abcde', ?)
    `).run(Date.now());
    db.prepare(`
      INSERT INTO raw_events (
        content_session_id, event_type, prompt_number, payload, created_at_epoch
      ) VALUES ('session-size', 'observation', 1, 'z', ?)
    `).run(Date.now());

    store.closeOpenRound('session-size');
    expect(store.getSlices('session-size', 1)).toEqual([
      expect.objectContaining({ slice_number: 1 }),
      expect.objectContaining({ slice_number: 2 }),
    ]);
  });

  test('does not claim an open-round pending row until its closed slice exists', () => {
    const now = new Date().toISOString();
    const sessionId = Number(db.prepare(`
      INSERT INTO sdk_sessions (content_session_id, project, started_at, started_at_epoch)
      VALUES ('queue-session', 'project', ?, ?)
    `).run(now, Date.now()).lastInsertRowid);
    const queue = new PendingMessageStore(db);
    store.openRound('queue-session', 1);
    store.appendEvent('queue-session', 1, 'event');
    queue.enqueue(sessionId, 'queue-session', { type: 'observation', prompt_number: 1, tool_name: 'Read' });
    expect(queue.claimNextMessage(sessionId)).toBeNull();
    store.closeOpenRound('queue-session');
    expect(queue.claimNextMessage(sessionId)?.prompt_number).toBe(1);
  });
});
