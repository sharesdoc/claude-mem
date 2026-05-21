import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import express from 'express';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * T-18 — /api/admin/role endpoint.
 *
 * Tests the route in isolation with a fresh tmp data dir so settings
 * resolution picks up CLAUDE_MEM_NODE_ROLE we plant. We exercise via
 * Express's listen+fetch path to keep the assertions close to real HTTP.
 */

let tmpRoot: string;
let prevDataDir: string | undefined;
let prevUserLabel: string | undefined;
let prevRole: string | undefined;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'claude-mem-admin-role-'));
  prevDataDir = process.env.CLAUDE_MEM_DATA_DIR;
  prevUserLabel = process.env.CLAUDE_MEM_USER_LABEL;
  prevRole = process.env.CLAUDE_MEM_NODE_ROLE;
  process.env.CLAUDE_MEM_DATA_DIR = tmpRoot;
  delete process.env.CLAUDE_MEM_USER_LABEL;
  delete process.env.CLAUDE_MEM_NODE_ROLE;
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
  if (prevDataDir !== undefined) process.env.CLAUDE_MEM_DATA_DIR = prevDataDir;
  else delete process.env.CLAUDE_MEM_DATA_DIR;
  if (prevUserLabel !== undefined) process.env.CLAUDE_MEM_USER_LABEL = prevUserLabel;
  else delete process.env.CLAUDE_MEM_USER_LABEL;
  if (prevRole !== undefined) process.env.CLAUDE_MEM_NODE_ROLE = prevRole;
  else delete process.env.CLAUDE_MEM_NODE_ROLE;
});

async function spinUpServer(settingsPath: string): Promise<{ url: string; close: () => Promise<void> }> {
  const { AdminRoutes } = await import('../src/services/worker/http/routes/AdminRoutes.js');
  const { _resetUserLabelCacheForTests } = await import('../src/shared/user-label.js');
  _resetUserLabelCacheForTests();
  const app = express();
  new AdminRoutes(() => settingsPath).setupRoutes(app);
  const server = app.listen(0);
  await new Promise<void>(r => server.on('listening', () => r()));
  const port = (server.address() as { port: number }).port;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>(r => server.close(() => r())),
  };
}

describe('GET /api/admin/role', () => {
  it('returns role=client by default', async () => {
    writeFileSync(join(tmpRoot, 'settings.json'), JSON.stringify({ env: { CLAUDE_MEM_USER_LABEL: 'johnson' } }));
    const { url, close } = await spinUpServer(join(tmpRoot, 'settings.json'));
    try {
      const r = await fetch(`${url}/api/admin/role`);
      expect(r.status).toBe(200);
      const body = await r.json();
      expect(body.role).toBe('client');
      expect(body.userLabel).toBe('johnson');
    } finally {
      await close();
    }
  });

  it('returns role=server when settings.CLAUDE_MEM_NODE_ROLE=server', async () => {
    writeFileSync(join(tmpRoot, 'settings.json'), JSON.stringify({
      env: { CLAUDE_MEM_NODE_ROLE: 'server', CLAUDE_MEM_USER_LABEL: 'boss' },
    }));
    const { url, close } = await spinUpServer(join(tmpRoot, 'settings.json'));
    try {
      const body = await fetch(`${url}/api/admin/role`).then(r => r.json());
      expect(body.role).toBe('server');
      expect(body.userLabel).toBe('boss');
    } finally {
      await close();
    }
  });

  it('falls back to client for unknown role values', async () => {
    writeFileSync(join(tmpRoot, 'settings.json'), JSON.stringify({
      env: { CLAUDE_MEM_NODE_ROLE: 'edge-cluster-overlord', CLAUDE_MEM_USER_LABEL: 'x' },
    }));
    const { url, close } = await spinUpServer(join(tmpRoot, 'settings.json'));
    try {
      const body = await fetch(`${url}/api/admin/role`).then(r => r.json());
      expect(body.role).toBe('client');
    } finally {
      await close();
    }
  });
});

/**
 * `deployment` is a display-only refinement of `role`. It reflects what the
 * operator explicitly chose at install time via `install-claude-mem --role`
 * (which writes CLAUDE_MEM_NODE_ROLE to settings.json). When neither client
 * nor server was specified the key is absent, so a plain local-only install
 * reports 'standalone' — the viewer header then shows generic branding
 * instead of "Claude-Mem Client". Read raw so SettingsDefaultsManager's
 * default-merge ('client') can't mask the unconfigured state.
 */
describe('GET /api/admin/role — deployment field', () => {
  it('reports standalone when CLAUDE_MEM_NODE_ROLE is absent (local-only install)', async () => {
    writeFileSync(join(tmpRoot, 'settings.json'), JSON.stringify({ env: { CLAUDE_MEM_USER_LABEL: 'johnson' } }));
    const { url, close } = await spinUpServer(join(tmpRoot, 'settings.json'));
    try {
      const body = await fetch(`${url}/api/admin/role`).then(r => r.json());
      expect(body.role).toBe('client');
      expect(body.deployment).toBe('standalone');
    } finally {
      await close();
    }
  });

  it('reports client when explicitly installed with --role client', async () => {
    writeFileSync(join(tmpRoot, 'settings.json'), JSON.stringify({
      env: { CLAUDE_MEM_NODE_ROLE: 'client', CLAUDE_MEM_USER_LABEL: 'johnson' },
    }));
    const { url, close } = await spinUpServer(join(tmpRoot, 'settings.json'));
    try {
      const body = await fetch(`${url}/api/admin/role`).then(r => r.json());
      expect(body.deployment).toBe('client');
    } finally {
      await close();
    }
  });

  it('reports server when explicitly installed with --role server', async () => {
    writeFileSync(join(tmpRoot, 'settings.json'), JSON.stringify({
      env: { CLAUDE_MEM_NODE_ROLE: 'server', CLAUDE_MEM_USER_LABEL: 'boss' },
    }));
    const { url, close } = await spinUpServer(join(tmpRoot, 'settings.json'));
    try {
      const body = await fetch(`${url}/api/admin/role`).then(r => r.json());
      expect(body.deployment).toBe('server');
    } finally {
      await close();
    }
  });

  it('reports standalone for unknown role values', async () => {
    writeFileSync(join(tmpRoot, 'settings.json'), JSON.stringify({
      env: { CLAUDE_MEM_NODE_ROLE: 'edge-cluster-overlord', CLAUDE_MEM_USER_LABEL: 'x' },
    }));
    const { url, close } = await spinUpServer(join(tmpRoot, 'settings.json'));
    try {
      const body = await fetch(`${url}/api/admin/role`).then(r => r.json());
      expect(body.deployment).toBe('standalone');
    } finally {
      await close();
    }
  });
});
