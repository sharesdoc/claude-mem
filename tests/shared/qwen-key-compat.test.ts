import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadClaudeMemEnv, getCredential } from '../../src/shared/EnvManager.js';
import { SettingsDefaultsManager } from '../../src/shared/SettingsDefaultsManager.js';
import { isQwenAvailable } from '../../src/services/worker/QwenProvider.js';

/**
 * X-008: DASHSCOPE_API_KEY → CLAUDE_MEM_REPORT_QWEN_API_KEY 改名的向后兼容，
 * 以及 isQwenAvailable() 与 getQwenConfig() 三级回脱的一致性。
 *
 * 隔离：CLAUDE_MEM_ENV_FILE 指向临时 .env，避免读写用户真实 ~/.claude-mem/.env；
 * isQwenAvailable 的 settings 读取用 spyOn mock 成空默认值，聚焦 getCredential 回退。
 */

const TEST_DIR = fs.mkdtempSync(join(tmpdir(), 'claude-mem-qwen-key-compat-'));
const TEST_ENV_FILE = join(TEST_DIR, '.env');
const ORIGINAL_ENV_FILE = process.env.CLAUDE_MEM_ENV_FILE;
const ORIGINAL_ENV_KEY = process.env.CLAUDE_MEM_REPORT_QWEN_API_KEY;

describe('X-008 Qwen key rename backward compat', () => {
  beforeEach(() => {
    process.env.CLAUDE_MEM_ENV_FILE = TEST_ENV_FILE;
    delete process.env.CLAUDE_MEM_REPORT_QWEN_API_KEY;
    if (fs.existsSync(TEST_ENV_FILE)) fs.unlinkSync(TEST_ENV_FILE);
  });

  afterEach(() => {
    if (ORIGINAL_ENV_FILE === undefined) delete process.env.CLAUDE_MEM_ENV_FILE;
    else process.env.CLAUDE_MEM_ENV_FILE = ORIGINAL_ENV_FILE;
    if (ORIGINAL_ENV_KEY === undefined) delete process.env.CLAUDE_MEM_REPORT_QWEN_API_KEY;
    else process.env.CLAUDE_MEM_REPORT_QWEN_API_KEY = ORIGINAL_ENV_KEY;
  });

  describe('loadClaudeMemEnv — legacy .env key', () => {
    it('should map legacy DASHSCOPE_API_KEY in .env to CLAUDE_MEM_REPORT_QWEN_API_KEY when new key absent', () => {
      fs.writeFileSync(TEST_ENV_FILE, 'DASHSCOPE_API_KEY=sk-dotenv-legacy\n');

      const env = loadClaudeMemEnv();

      expect(env.CLAUDE_MEM_REPORT_QWEN_API_KEY).toBe('sk-dotenv-legacy');
    });

    it('getCredential should resolve the legacy .env key via the new name', () => {
      fs.writeFileSync(TEST_ENV_FILE, 'DASHSCOPE_API_KEY=sk-dotenv-cred\n');

      expect(getCredential('CLAUDE_MEM_REPORT_QWEN_API_KEY')).toBe('sk-dotenv-cred');
    });

    it('should prefer the new key over the legacy key when both are in .env', () => {
      fs.writeFileSync(TEST_ENV_FILE, [
        'DASHSCOPE_API_KEY=sk-legacy',
        'CLAUDE_MEM_REPORT_QWEN_API_KEY=sk-new',
        '',
      ].join('\n'));

      expect(getCredential('CLAUDE_MEM_REPORT_QWEN_API_KEY')).toBe('sk-new');
    });
  });

  describe('isQwenAvailable — getCredential fallback (R-005)', () => {
    it('should return true when key is only in .env (env + settings empty)', () => {
      // settings.json 不参与（mock 成全空默认），env 未设，仅 .env 有 key
      const emptyDefaults = SettingsDefaultsManager.getAllDefaults();
      const spy = spyOnSettings(emptyDefaults);
      fs.writeFileSync(TEST_ENV_FILE, 'DASHSCOPE_API_KEY=sk-only-dotenv\n');

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
