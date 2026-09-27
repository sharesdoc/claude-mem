
import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { OpenRouterProvider, isOpenRouterAvailable } from '../../../src/services/worker/OpenRouterProvider.js';
import { SettingsDefaultsManager, type SettingsDefaults } from '../../../src/shared/SettingsDefaultsManager.js';
import type { DatabaseManager } from '../../../src/services/worker/DatabaseManager.js';
import type { SessionManager } from '../../../src/services/worker/SessionManager.js';

// 依据: Task-20260927091425627-P2 — OpenRouter 模型名不再有出厂默认值
// (xiaomi/mimo-v2-flash:free 回落已移除)。未显式配置模型名时:
//   1) isOpenRouterAvailable() 判不可用(即便 apiKey 已配), 与 apiKey 门槛并列
//   2) startSession() 自身也拒绝空模型名, 双重保险

const ORIGINAL_ENV_FILE = process.env.CLAUDE_MEM_ENV_FILE;
const ORIGINAL_OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;

beforeEach(() => {
  // 指向不存在路径，保证 getCredential('OPENROUTER_API_KEY') 读不到真实 .env
  process.env.CLAUDE_MEM_ENV_FILE = '/tmp/claude-mem-openrouter-test-nonexistent.env';
  delete process.env.OPENROUTER_API_KEY;
});

afterEach(() => {
  if (ORIGINAL_ENV_FILE === undefined) delete process.env.CLAUDE_MEM_ENV_FILE;
  else process.env.CLAUDE_MEM_ENV_FILE = ORIGINAL_ENV_FILE;
  if (ORIGINAL_OPENROUTER_KEY === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = ORIGINAL_OPENROUTER_KEY;
});

describe('isOpenRouterAvailable (Task-20260927091425627-P2)', () => {
  it('should be true when API key and model are both configured', () => {
    // X-029: 纯对象构造——bun 并发执行时其它文件的 mock.module(SettingsDefaultsManager)
    // 会泄漏到本文件使 getAllDefaults 失效; resolver 只按需读取字段, 纯对象即可。
    const settings = {
      CLAUDE_MEM_OPENROUTER_API_KEY: 'sk-or-test',
      CLAUDE_MEM_OPENROUTER_MODEL: 'xiaomi/mimo-v2-flash:free',
    } as unknown as SettingsDefaults;
    const loadFromFileSpy = spyOn(SettingsDefaultsManager, 'loadFromFile').mockImplementation(() => settings);
    try {
      expect(isOpenRouterAvailable()).toBe(true);
    } finally {
      loadFromFileSpy.mockRestore();
    }
  });

  it('should be false when API key is configured but model is NOT configured', () => {
    const settings = {
      CLAUDE_MEM_OPENROUTER_API_KEY: 'sk-or-test',
      CLAUDE_MEM_OPENROUTER_MODEL: '',
    } as unknown as SettingsDefaults;
    const loadFromFileSpy = spyOn(SettingsDefaultsManager, 'loadFromFile').mockImplementation(() => settings);
    try {
      expect(isOpenRouterAvailable()).toBe(false);
    } finally {
      loadFromFileSpy.mockRestore();
    }
  });
});

describe('OpenRouterProvider.startSession model guard (Task-20260927091425627-P2)', () => {
  it('should throw when API key is configured but model is empty', async () => {
    const settings = {
      CLAUDE_MEM_OPENROUTER_API_KEY: 'sk-or-test',
      CLAUDE_MEM_OPENROUTER_MODEL: '',
    } as unknown as SettingsDefaults;
    const loadFromFileSpy = spyOn(SettingsDefaultsManager, 'loadFromFile').mockImplementation(() => settings);

    try {
      const provider = new OpenRouterProvider({} as DatabaseManager, {} as SessionManager);
      const session = { sessionDbId: 1 } as any;
      await expect(provider.startSession(session)).rejects.toThrow(/CLAUDE_MEM_OPENROUTER_MODEL/);
    } finally {
      loadFromFileSpy.mockRestore();
    }
  });

  // 依据: doc/rev-report-20260927102826977.md P2 —
  // getOpenRouterConfig() 原先 `settings.CLAUDE_MEM_OPENROUTER_MODEL || ''` 未 trim，
  // 与 isOpenRouterAvailable() 的 trim 口径不一致，纯空格值能绕过这里的判空校验。
  it('should throw when API key is configured but model is a whitespace-only string', async () => {
    const settings = {
      CLAUDE_MEM_OPENROUTER_API_KEY: 'sk-or-test',
      CLAUDE_MEM_OPENROUTER_MODEL: '   ',
    } as unknown as SettingsDefaults;
    const loadFromFileSpy = spyOn(SettingsDefaultsManager, 'loadFromFile').mockImplementation(() => settings);

    try {
      const provider = new OpenRouterProvider({} as DatabaseManager, {} as SessionManager);
      const session = { sessionDbId: 1 } as any;
      await expect(provider.startSession(session)).rejects.toThrow(/CLAUDE_MEM_OPENROUTER_MODEL/);
    } finally {
      loadFromFileSpy.mockRestore();
    }
  });
});
