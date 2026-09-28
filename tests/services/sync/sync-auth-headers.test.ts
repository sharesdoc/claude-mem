
import { describe, it, expect } from 'bun:test';
import { buildSyncAuthHeaders } from '../../../src/services/sync/SyncAgent.js';

// X-037: SyncAgent 鉴权头构建纯函数。
// 版本头仅随 accessToken 分支发送——apikey/jwt/mtls 模式误配
// CLAUDE_MEM_SYNC_AUTH_VERSION='2' 时, 服务端会按 sha1(apiKey) 比对而拒绝,
// 因此版本头不得出现在这些分支。

describe('buildSyncAuthHeaders (X-037)', () => {
  it('should send Bearer + version header when accessToken and authVersion=2', () => {
    const h = buildSyncAuthHeaders({ accessToken: 'tok', authMode: 'none', authVersion: '2' });
    expect(h.authorization).toBe('Bearer tok');
    expect(h['x-claude-mem-auth-version']).toBe('2');
  });

  it('should send Bearer without version header when authVersion is unset', () => {
    const h = buildSyncAuthHeaders({ accessToken: 'tok', authMode: 'none', authVersion: undefined });
    expect(h.authorization).toBe('Bearer tok');
    expect(h['x-claude-mem-auth-version']).toBeUndefined();
  });

  it('should NOT send the version header in apikey mode even when authVersion=2', () => {
    const h = buildSyncAuthHeaders({ accessToken: undefined, authMode: 'apikey', apiKey: 'sk-x', authVersion: '2' });
    expect(h.authorization).toBe('Bearer sk-x');
    expect(h['x-claude-mem-auth-version']).toBeUndefined();
  });

  it('should return empty headers when nothing is configured', () => {
    const h = buildSyncAuthHeaders({ accessToken: undefined, authMode: 'none', authVersion: undefined });
    expect(h).toEqual({});
  });
});
