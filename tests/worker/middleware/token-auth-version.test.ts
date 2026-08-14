
import { describe, it, expect, afterAll } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// X-036: 令牌哈希版本化校验(双轨迁移)。
//   无版本头 → 老路径: 明文恒时比对 CLAUDE_MEM_SERVER_ACCESS_TOKEN
//   版本头=2 → 新路径: sha1(presented) 恒时比对 CLAUDE_MEM_SYNC_SHASUM_VALUE
//   两键皆空 → false(由调用方的"未配置直通"逻辑处理, 保持旧语义)
// 隔离: DATA_DIR 在 paths.ts 模块加载期解析, 必须先在 env 里指向临时目录,
// 再动态 import tokenAuth(否则 USER_SETTINGS_PATH 冻结为真实路径)。

const tmpRoot = mkdtempSync(join(tmpdir(), 'claude-mem-token-auth-'));
const prevDataDir = process.env.CLAUDE_MEM_DATA_DIR;
process.env.CLAUDE_MEM_DATA_DIR = tmpRoot;

const { verifyAccessToken, sha1Hex, loadAccessAuth } = await import(
  '../../../src/services/worker/http/middleware/tokenAuth.js'
);

afterAll(() => {
  if (prevDataDir === undefined) delete process.env.CLAUDE_MEM_DATA_DIR;
  else process.env.CLAUDE_MEM_DATA_DIR = prevDataDir;
  rmSync(tmpRoot, { recursive: true, force: true });
});

const TOKEN = 'shared-secret-token';
const TOKEN_SHA1 = sha1Hex(TOKEN);

function writeSettings(keys: Record<string, string>) {
  writeFileSync(join(tmpRoot, 'settings.json'), JSON.stringify(keys), 'utf-8');
}

function fakeReq(versionHeader?: string) {
  return { headers: versionHeader === undefined ? {} : { 'x-claude-mem-auth-version': versionHeader } } as never;
}

describe('verifyAccessToken (X-036)', () => {
  it('should accept a matching plaintext token on the legacy path (no version header)', () => {
    writeSettings({ CLAUDE_MEM_SERVER_ACCESS_TOKEN: TOKEN });
    expect(verifyAccessToken(fakeReq(), TOKEN)).toBe(true);
    expect(verifyAccessToken(fakeReq(), 'wrong')).toBe(false);
  });

  it('should accept sha1(presented) against CLAUDE_MEM_SYNC_SHASUM_VALUE on the v2 path', () => {
    writeSettings({ CLAUDE_MEM_SYNC_SHASUM_VALUE: TOKEN_SHA1 });
    expect(verifyAccessToken(fakeReq('2'), TOKEN)).toBe(true);
    expect(verifyAccessToken(fakeReq('2'), 'wrong')).toBe(false);
  });

  it('should reject v2 requests when the server has no shasum value configured', () => {
    writeSettings({ CLAUDE_MEM_SERVER_ACCESS_TOKEN: TOKEN });
    expect(verifyAccessToken(fakeReq('2'), TOKEN)).toBe(false);
  });

  it('should return false when neither key is configured (caller handles passthrough)', () => {
    writeSettings({});
    expect(verifyAccessToken(fakeReq(), TOKEN)).toBe(false);
    expect(verifyAccessToken(fakeReq('2'), TOKEN)).toBe(false);
  });

  it('should normalize the stored shasum to lowercase before comparing', () => {
    writeSettings({ CLAUDE_MEM_SYNC_SHASUM_VALUE: TOKEN_SHA1.toUpperCase() });
    expect(verifyAccessToken(fakeReq('2'), TOKEN)).toBe(true);
  });

  it('should trim whitespace in the version header', () => {
    writeSettings({ CLAUDE_MEM_SYNC_SHASUM_VALUE: TOKEN_SHA1 });
    expect(verifyAccessToken(fakeReq(' 2 '), TOKEN)).toBe(true);
  });

  it('loadAccessAuth should surface both keys trimmed', () => {
    writeSettings({
      CLAUDE_MEM_SERVER_ACCESS_TOKEN: '  plain  ',
      CLAUDE_MEM_SYNC_SHASUM_VALUE: '  ' + TOKEN_SHA1 + '  ',
    });
    const auth = loadAccessAuth();
    expect(auth.plain).toBe('plain');
    expect(auth.shasum).toBe(TOKEN_SHA1);
  });
});
