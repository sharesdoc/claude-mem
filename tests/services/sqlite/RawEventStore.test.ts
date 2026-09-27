import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { Database } from 'bun:sqlite';
import { ClaudeMemDatabase } from '../../../src/services/sqlite/Database.js';
import { SessionStore } from '../../../src/services/sqlite/SessionStore.js';
import { RawEventStore } from '../../../src/services/sqlite/RawEventStore.js';

describe('RawEventStore', () => {
  let db: Database;
  let store: RawEventStore;

  beforeEach(() => {
    db = new ClaudeMemDatabase(':memory:').db;
    store = new RawEventStore(db);
  });

  afterEach(() => db.close());

  test('keeps the original payload independently from the pending queue', () => {
    const id = store.append({
      contentSessionId: 'raw-session',
      sessionDbId: 42,
      project: 'claude-mem',
      eventType: 'observation',
      toolUseId: 'tool-1',
      toolName: 'Read',
      toolInput: { file_path: 'README.md' },
      toolResponse: { content: 'original output' },
    });

    db.run('DELETE FROM pending_messages');
    const row = db.prepare('SELECT * FROM raw_events WHERE id = ?').get(id) as Record<string, unknown>;

    expect(row.content_session_id).toBe('raw-session');
    expect(row.tool_input).toBe(JSON.stringify({ file_path: 'README.md' }));
    expect(row.tool_response).toBe(JSON.stringify({ content: 'original output' }));
  });

  test('deduplicates repeated tool events with the same tool use id', () => {
    const first = store.append({ contentSessionId: 'raw-session', eventType: 'observation', toolUseId: 'tool-1' });
    const second = store.append({ contentSessionId: 'raw-session', eventType: 'observation', toolUseId: 'tool-1' });

    expect(first).toBeGreaterThan(0);
    expect(second).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS count FROM raw_events').get()).toEqual({ count: 1 });
  });

  test('does not consume the existing prompt-completion migration version', () => {
    new SessionStore(db);
    const promptColumns = db.prepare('PRAGMA table_info(user_prompts)').all() as Array<{ name: string }>;
    const versions = db.prepare('SELECT version FROM schema_versions WHERE version IN (40, 41) ORDER BY version').all();

    expect(promptColumns.some(column => column.name === 'completed_at_epoch')).toBe(true);
    expect(versions).toEqual([{ version: 40 }, { version: 41 }]);
  });
});
