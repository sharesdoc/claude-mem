
import { describe, it, expect } from 'bun:test';
import type { SettingsDefaults } from '../../../src/shared/SettingsDefaultsManager.js';
import { verifyAccessToken, sha1Hex, loadAccessAuth } from '../../../src/services/worker/http/middleware/tokenAuth.js';

// X-036: 令牌哈希版本化校验(双轨迁移)。
//   无版本头 → 老路径: 明文恒时比对 CLAUDE_MEM_SERVER_ACCESS_TOKEN
//   版本头=2 → 新路径: sha1(presented) 恒时比对 CLAUDE_MEM_SYNC_SHASUM_VALUE
//   两键皆空 → false(由调用方的"未配置直通"逻辑处理, 保持旧语义)
// 隔离: settings 注入(loadAccessAuth 的可选参数), 不依赖文件 IO——
// 全量跑时模块缓存会冻结 USER_SETTINGS_PATH, 文件级隔离不可靠。

const TOKEN = 'shared-secret-token';
const TOKEN_SHA1 = sha1Hex(TOKEN);

function settings(keys: Partial<SettingsDefaults>): SettingsDefaults {
  return keys as SettingsDefaults;
}

function fakeReq(versionHeader?: string) {
  return { headers: versionHeader === undefined ? {} : { 'x-claude-mem-auth-version': versionHeader } } as never;
}

describe('verifyAccessToken (X-036)', () => {
  it('should accept a matching plaintext token on the legacy path (no version header)', () => {
    const s = settings({ CLAUDE_MEM_SERVER_ACCESS_TOKEN: TOKEN });
    expect(verifyAccessToken(fakeReq(), TOKEN, s)).toBe(true);
    expect(verifyAccessToken(fakeReq(), 'wrong', s)).toBe(false);
  });

  it('should accept sha1(presented) against CLAUDE_MEM_SYNC_SHASUM_VALUE on the v2 path', () => {
    const s = settings({ CLAUDE_MEM_SYNC_SHASUM_VALUE: TOKEN_SHA1 });
    expect(verifyAccessToken(fakeReq('2'), TOKEN, s)).toBe(true);
    expect(verifyAccessToken(fakeReq('2'), 'wrong', s)).toBe(false);
  });

  it('should reject v2 requests when the server has no shasum value configured', () => {
    const s = settings({ CLAUDE_MEM_SERVER_ACCESS_TOKEN: TOKEN });
    expect(verifyAccessToken(fakeReq('2'), TOKEN, s)).toBe(false);
  });

  it('should return false when neither key is configured (caller handles passthrough)', () => {
    const s = settings({});
    expect(verifyAccessToken(fakeReq(), TOKEN, s)).toBe(false);
    expect(verifyAccessToken(fakeReq('2'), TOKEN, s)).toBe(false);
  });

  it('should normalize the stored shasum to lowercase before comparing', () => {
    const s = settings({ CLAUDE_MEM_SYNC_SHASUM_VALUE: TOKEN_SHA1.toUpperCase() });
    expect(verifyAccessToken(fakeReq('2'), TOKEN, s)).toBe(true);
  });

  it('should trim whitespace in the version header', () => {
    const s = settings({ CLAUDE_MEM_SYNC_SHASUM_VALUE: TOKEN_SHA1 });
    expect(verifyAccessToken(fakeReq(' 2 '), TOKEN, s)).toBe(true);
  });

  it('loadAccessAuth should surface both keys trimmed', () => {
    const s = settings({
      CLAUDE_MEM_SERVER_ACCESS_TOKEN: '  plain  ',
      CLAUDE_MEM_SYNC_SHASUM_VALUE: '  ' + TOKEN_SHA1 + '  ',
    });
    const auth = loadAccessAuth(s);
    expect(auth.plain).toBe('plain');
    expect(auth.shasum).toBe(TOKEN_SHA1);
  });
});
