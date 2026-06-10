import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import express from 'express';
import { Database } from 'bun:sqlite';
import { SessionStore } from '../src/services/sqlite/SessionStore.js';
import { SyncRoutes } from '../src/services/worker/http/routes/SyncRoutes.js';
import type { DatabaseManager } from '../src/services/worker/DatabaseManager.js';

/**
 * T-09 — /api/sync/ingest end-to-end (with role=server so the v37 inbox
 * migration runs in the in-memory DB).
 */

let prevRole: string | undefined;
beforeEach(() => {
  prevRole = process.env.CLAUDE_MEM_NODE_ROLE;
  process.env.CLAUDE_MEM_NODE_ROLE = 'server';
});
afterEach(() => {
  if (prevRole !== undefined) process.env.CLAUDE_MEM_NODE_ROLE = prevRole;
  else delete process.env.CLAUDE_MEM_NODE_ROLE;
});

function buildDb(): Database {
  // SessionStore 跑全量迁移链(user_label/completed_at_epoch/think_time_ms 等
  // 列由迁移补齐),裸 ClaudeMemDatabase 的基础 schema 缺这些列。
  return new SessionStore(':memory:').db;
}

function fakeManager(db: Database): DatabaseManager {
  return {
    getConnection: () => db,
  } as unknown as DatabaseManager;
}

async function spinUp(db: Database, settings: {
  CLAUDE_MEM_SERVER_TRUSTED_PROXIES?: string;
  CLAUDE_MEM_SERVER_REQUIRE_TLS?: string;
  CLAUDE_MEM_SERVER_AUTH_MODE?: string;
  CLAUDE_MEM_SERVER_ALLOWED_USERS?: string;
  CLAUDE_MEM_SERVER_INGEST_MAX_BATCH?: string;
} = {}): Promise<{ url: string; close: () => Promise<void> }> {
  const app = express();
  app.use(express.json());
  new SyncRoutes(fakeManager(db), {
    CLAUDE_MEM_SERVER_TRUSTED_PROXIES: '',
    CLAUDE_MEM_SERVER_REQUIRE_TLS: 'false',
    CLAUDE_MEM_SERVER_AUTH_MODE: 'none',
    CLAUDE_MEM_SERVER_ALLOWED_USERS: '',
    CLAUDE_MEM_SERVER_INGEST_MAX_BATCH: '1000',
    ...settings,
  }).setupRoutes(app);
  const server = app.listen(0);
  await new Promise<void>(r => server.on('listening', () => r()));
  const port = (server.address() as { port: number }).port;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>(r => server.close(() => r())),
  };
}

function basePayload(overrides: Partial<{
  sessions: unknown[]; observations: unknown[]; summaries: unknown[]; prompts: unknown[]; user_label: string;
}> = {}) {
  return {
    schema_version: 1,
    user_label: 'alice',
    generated_at_epoch: 1700000000000,
    sessions: [],
    observations: [],
    summaries: [],
    prompts: [],
    ...overrides,
  };
}

describe('POST /api/sync/ingest', () => {
  it('applies a session batch and returns watermark', async () => {
    const db = buildDb();
    const { url, close } = await spinUp(db);
    try {
      const body = basePayload({
        sessions: [{
          id: 1,
          content_session_id: 'c1',
          memory_session_id: 'm1',
          project: 'projA',
          platform_source: 'claude',
          user_prompt: null,
          custom_title: null,
          started_at: '2026',
          started_at_epoch: 1000,
          completed_at: null,
          completed_at_epoch: null,
          status: 'active',
          user_name: 'alice',
          user_label: 'alice',
        }],
      });
      const r = await fetch(`${url}/api/sync/ingest`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      expect(r.status).toBe(200);
      const json = await r.json();
      expect(json.applied.sessions.inserted).toBe(1);
      expect(json.next_watermark.sessions).toBe(1);

      const row = db.prepare("SELECT user_label FROM sdk_sessions WHERE content_session_id = 'c1'").get() as { user_label: string };
      expect(row.user_label).toBe('alice');
    } finally {
      await close();
    }
  });

  it('is idempotent — repeating the same payload does not double-insert', async () => {
    const db = buildDb();
    const { url, close } = await spinUp(db);
    try {
      const body = basePayload({
        sessions: [{
          id: 1, content_session_id: 'c1', memory_session_id: 'm1', project: 'p', platform_source: 'claude',
          user_prompt: null, custom_title: null, started_at: '2026', started_at_epoch: 1000,
          completed_at: null, completed_at_epoch: null, status: 'active', user_name: 'alice', user_label: 'alice',
        }],
      });
      await fetch(`${url}/api/sync/ingest`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const r2 = await fetch(`${url}/api/sync/ingest`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const json = await r2.json();
      expect(json.applied.sessions.skipped).toBe(1);
      expect(json.applied.sessions.inserted).toBe(0);
    } finally {
      await close();
    }
  });

  it('updates an already-synced session when the memory_session_id arrives later', async () => {
    const db = buildDb();
    const { url, close } = await spinUp(db);
    try {
      const initial = basePayload({
        sessions: [{
          id: 1,
          content_session_id: 'c-late-memory',
          memory_session_id: null,
          project: 'p',
          platform_source: 'claude',
          user_prompt: null,
          custom_title: null,
          started_at: '2026',
          started_at_epoch: 1000,
          completed_at: null,
          completed_at_epoch: null,
          status: 'active',
          user_name: 'alice',
          user_label: 'alice',
        }],
      });

      const first = await fetch(`${url}/api/sync/ingest`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(initial),
      });
      expect(first.status).toBe(200);

      const initialSession = initial.sessions[0] as Record<string, unknown>;
      const followup = basePayload({
        sessions: [{
          ...initialSession,
          id: 2,
          memory_session_id: 'm-late-memory',
        }],
        summaries: [{
          id: 1,
          memory_session_id: 'm-late-memory',
          project: 'p',
          request: 'summarize later',
          investigated: null,
          learned: null,
          completed: null,
          next_steps: null,
          files_read: null,
          files_edited: null,
          notes: null,
          prompt_number: 1,
          created_at: '2026',
          created_at_epoch: 2000,
        }],
      });

      const second = await fetch(`${url}/api/sync/ingest`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(followup),
      });
      expect(second.status).toBe(200);
      const json = await second.json();
      expect(json.applied.sessions.skipped).toBe(1);
      expect(json.applied.summaries.inserted).toBe(1);

      const session = db.prepare("SELECT memory_session_id FROM sdk_sessions WHERE content_session_id = 'c-late-memory'")
        .get() as { memory_session_id: string };
      expect(session.memory_session_id).toBe('m-late-memory');
    } finally {
      await close();
    }
  });

  it('backfills completion fields when a deduped prompt is re-pushed with completed_at_epoch', async () => {
    const db = buildDb();
    const { url, close } = await spinUp(db);
    try {
      const session = {
        id: 1, content_session_id: 'c1', memory_session_id: 'm1', project: 'p', platform_source: 'claude',
        user_prompt: null, custom_title: null, started_at: '2026', started_at_epoch: 1000,
        completed_at: null, completed_at_epoch: null, status: 'active', user_name: 'alice', user_label: 'alice',
      };
      const prompt = {
        id: 1, content_session_id: 'c1', prompt_number: 1, prompt_text: 'hi',
        created_at: '2026', created_at_epoch: 1000,
      };

      // 首推:prompt 还在执行中
      const first = await fetch(`${url}/api/sync/ingest`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(basePayload({ sessions: [session], prompts: [{ ...prompt, completed_at_epoch: null, think_time_ms: 0 }] })),
      });
      expect(first.status).toBe(200);
      expect((await first.json()).applied.prompts.inserted).toBe(1);

      // 完成回填重推:同一行带上完成时间
      const second = await fetch(`${url}/api/sync/ingest`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(basePayload({ sessions: [session], prompts: [{ ...prompt, completed_at_epoch: 91000, think_time_ms: 5000 }] })),
      });
      expect(second.status).toBe(200);
      expect((await second.json()).applied.prompts.skipped).toBe(1);

      const rows = db.prepare("SELECT completed_at_epoch, think_time_ms FROM user_prompts WHERE content_session_id = 'c1' AND prompt_number = 1")
        .all() as Array<{ completed_at_epoch: number | null; think_time_ms: number }>;
      expect(rows).toHaveLength(1); // 不重插
      expect(rows[0].completed_at_epoch).toBe(91000);
      expect(rows[0].think_time_ms).toBe(5000);
    } finally {
      await close();
    }
  });

  it('rejects payload over CLAUDE_MEM_SERVER_INGEST_MAX_BATCH with 413', async () => {
    const db = buildDb();
    const { url, close } = await spinUp(db, { CLAUDE_MEM_SERVER_INGEST_MAX_BATCH: '2' });
    try {
      const big = basePayload({
        prompts: [
          { id: 1, content_session_id: 'x', prompt_number: 1, prompt_text: 'a', created_at: '2026', created_at_epoch: 1 },
          { id: 2, content_session_id: 'x', prompt_number: 2, prompt_text: 'a', created_at: '2026', created_at_epoch: 2 },
          { id: 3, content_session_id: 'x', prompt_number: 3, prompt_text: 'a', created_at: '2026', created_at_epoch: 3 },
        ],
      });
      const r = await fetch(`${url}/api/sync/ingest`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(big) });
      expect(r.status).toBe(413);
    } finally {
      await close();
    }
  });

  it('rejects unknown user_label when allow-list is set (403)', async () => {
    const db = buildDb();
    const { url, close } = await spinUp(db, { CLAUDE_MEM_SERVER_ALLOWED_USERS: 'alice,bob' });
    try {
      const body = basePayload({ user_label: 'hacker' });
      const r = await fetch(`${url}/api/sync/ingest`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      expect(r.status).toBe(403);
    } finally {
      await close();
    }
  });

  it('rejects malformed body with 400 (zod)', async () => {
    const db = buildDb();
    const { url, close } = await spinUp(db);
    try {
      const r = await fetch(`${url}/api/sync/ingest`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ not: 'valid' }) });
      expect(r.status).toBe(400);
    } finally {
      await close();
    }
  });
});
