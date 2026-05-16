import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import express from 'express';
import { Database } from 'bun:sqlite';
import { ClaudeMemDatabase } from '../src/services/sqlite/Database.js';
import { UsersRoutes } from '../src/services/worker/http/routes/UsersRoutes.js';
import type { DatabaseManager } from '../src/services/worker/DatabaseManager.js';

/**
 * T-19 — /api/users aggregates sdk_sessions by user_label, ordered by
 * most-recent activity desc. Filters out NULL/empty labels.
 */

function buildDb(): Database {
  const db = new ClaudeMemDatabase(':memory:').db;
  db.prepare(`
    INSERT INTO sdk_sessions (content_session_id, memory_session_id, project, started_at, started_at_epoch, status, user_label)
    VALUES ('c1', 'm1', 'p', '2026-05-17', 1000, 'active', 'zhangsan'),
           ('c2', 'm2', 'p', '2026-05-17', 3000, 'active', 'lisi'),
           ('c3', 'm3', 'p', '2026-05-17', 5000, 'active', 'zhangsan'),
           ('c4', 'm4', 'p', '2026-05-17', 2000, 'active', NULL),
           ('c5', 'm5', 'p', '2026-05-17', 7000, 'active', '')
  `).run();
  return db;
}

async function spinUp(db: Database): Promise<{ url: string; close: () => Promise<void> }> {
  const fakeManager = {
    getConnection: () => db,
  } as unknown as DatabaseManager;

  const app = express();
  new UsersRoutes(fakeManager).setupRoutes(app);
  const server = app.listen(0);
  await new Promise<void>(r => server.on('listening', () => r()));
  const port = (server.address() as { port: number }).port;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>(r => server.close(() => r())),
  };
}

describe('GET /api/users', () => {
  it('returns one row per user_label, ordered by last_active desc', async () => {
    const db = buildDb();
    const { url, close } = await spinUp(db);
    try {
      const body = await fetch(`${url}/api/users`).then(r => r.json());
      expect(body.users).toHaveLength(2);
      expect(body.users[0].user_label).toBe('zhangsan');
      expect(body.users[0].sessions).toBe(2);
      expect(body.users[0].last_active).toBe(5000);
      expect(body.users[1].user_label).toBe('lisi');
      expect(body.users[1].sessions).toBe(1);
    } finally {
      await close();
    }
  });

  it('excludes NULL and empty user_label', async () => {
    const db = buildDb();
    const { url, close } = await spinUp(db);
    try {
      const body = await fetch(`${url}/api/users`).then(r => r.json());
      const labels = body.users.map((u: { user_label: string }) => u.user_label);
      expect(labels).not.toContain(null);
      expect(labels).not.toContain('');
    } finally {
      await close();
    }
  });

  it('returns empty array when no labelled sessions exist', async () => {
    const db = new ClaudeMemDatabase(':memory:').db;
    const { url, close } = await spinUp(db);
    try {
      const body = await fetch(`${url}/api/users`).then(r => r.json());
      expect(body.users).toEqual([]);
    } finally {
      await close();
    }
  });
});
