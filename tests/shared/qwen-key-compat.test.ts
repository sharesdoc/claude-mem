import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadClaudeMemEnv, getCredential } from '../../src/shared/EnvManager.js';
import { SettingsDefaultsManager } from '../../src/shared/SettingsDefaultsManager.js';
import { isQwenAvailable } from '../../src/services/worker/QwenProvider.js';

/**
 * X-015/X-021: Qwen 凭证改 CLAUDE_MEM_QWEN_API_KEY 后 isQwenAvailable()
 * 与 resolveQwenApiKey() 三级回脱（env > settings.json > ~/.claude-mem/.env）
 * 的一致性。旧键兼容（X-008 DASHSCOPE_API_KEY → CLAUDE_MEM_REPORT_QWEN_API_KEY）
 * 已按统一化方案移除（不做旧版兼容）。
 *
 * 隔离：CLAUDE_MEM_ENV_FILE 指向临时 .env，避免读写用户真实 ~/.claude-mem/.env；
 * isQwenAvailable 的 settings 读取用 spyOn mock 成空默认值，聚焦 getCredential 回退。
 */

const TEST_DIR = fs.mkdtempSync(join(tmpdir(), 'claude-mem-qwen-key-compat-'));
const TEST_ENV_FILE = join(TEST_DIR, '.env');
const ORIGINAL_ENV_FILE = process.env.CLAUDE_MEM_ENV_FILE;
const ORIGINAL_NEW_KEY = process.env.CLAUDE_MEM_QWEN_API_KEY;

describe('Qwen key resolution via new CLAUDE_MEM_QWEN_API_KEY (X-015/X-021)', () => {
  beforeEach(() => {
    process.env.CLAUDE_MEM_ENV_FILE = TEST_ENV_FILE;
    delete process.env.CLAUDE_MEM_QWEN_API_KEY;
    if (fs.existsSync(TEST_ENV_FILE)) fs.unlinkSync(TEST_ENV_FILE);
  });

  afterEach(() => {
    if (ORIGINAL_ENV_FILE === undefined) delete process.env.CLAUDE_MEM_ENV_FILE;
    else process.env.CLAUDE_MEM_ENV_FILE = ORIGINAL_ENV_FILE;
    if (ORIGINAL_NEW_KEY === undefined) delete process.env.CLAUDE_MEM_QWEN_API_KEY;
    else process.env.CLAUDE_MEM_QWEN_API_KEY = ORIGINAL_NEW_KEY;
  });

  describe('loadClaudeMemEnv — .env new key', () => {
    it('should parse CLAUDE_MEM_QWEN_API_KEY from .env', () => {
      fs.writeFileSync(TEST_ENV_FILE, 'CLAUDE_MEM_QWEN_API_KEY=sk-dotenv-new\n');

      const env = loadClaudeMemEnv();

      expect(env.CLAUDE_MEM_QWEN_API_KEY).toBe('sk-dotenv-new');
    });

    it('getCredential should resolve the .env key via the new name', () => {
      fs.writeFileSync(TEST_ENV_FILE, 'CLAUDE_MEM_QWEN_API_KEY=sk-dotenv-cred\n');

      expect(getCredential('CLAUDE_MEM_QWEN_API_KEY')).toBe('sk-dotenv-cred');
    });

    it('should not map legacy DASHSCOPE_API_KEY anymore (no back-compat by design)', () => {
      fs.writeFileSync(TEST_ENV_FILE, 'DASHSCOPE_API_KEY=sk-legacy\n');

      const env = loadClaudeMemEnv();

      expect(env.CLAUDE_MEM_QWEN_API_KEY).toBeUndefined();
    });
  });

  describe('isQwenAvailable — getCredential fallback (R-005, X-015 新键)', () => {
    it('should return true when CLAUDE_MEM_QWEN_API_KEY is only in .env (env + settings empty)', () => {
      // settings.json 不参与（mock 成全空默认，但补一个模型名），env 未设，仅 .env 有 key。
      // 依据: Task-20260927091425627-P2 — isQwenAvailable() 新增模型名非空门槛，
      // 本测试的关注点是 apiKey 的 getCredential(.env) 回退，因此显式配置模型名，
      // 避免与本任务新加的"模型未配置判不可用"门槛混淆。
      const emptyDefaults = {
        ...SettingsDefaultsManager.getAllDefaults(),
        CLAUDE_MEM_QWEN_MODEL: 'qwen3-max',
      };
      const spy = spyOnSettings(emptyDefaults);
      fs.writeFileSync(TEST_ENV_FILE, 'CLAUDE_MEM_QWEN_API_KEY=sk-only-dotenv\n');

      try {
        expect(isQwenAvailable()).toBe(true);
      } finally {
        spy.mockRestore();
      }
    });
  });
});

// spyOn 辅助：SettingsDefaultsManager.loadFromFile 在 isQwenAvailable 内被调用，
// mock 成空默认值以隔离用户真实 ~/.claude-mem/settings.json。
function spyOnSettings(defaults: ReturnType<typeof SettingsDefaultsManager.getAllDefaults>) {
  // bun:test 兼容：用模块对象的 mock 方法
  const mod = SettingsDefaultsManager as unknown as {
    loadFromFile: (p: string) => typeof defaults;
  };
  const original = mod.loadFromFile;
  mod.loadFromFile = ((_p: string) => defaults) as typeof mod.loadFromFile;
  return { mockRestore: () => { mod.loadFromFile = original; } };
}
