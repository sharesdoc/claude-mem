
import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { GeminiProvider, isGeminiAvailable } from '../../../src/services/worker/GeminiProvider.js';
import { SettingsDefaultsManager, type SettingsDefaults } from '../../../src/shared/SettingsDefaultsManager.js';
import { paths } from '../../../src/shared/paths.js';
import type { DatabaseManager } from '../../../src/services/worker/DatabaseManager.js';
import type { SessionManager } from '../../../src/services/worker/SessionManager.js';

// 依据: Task-20260927091425627-P2 — Gemini 模型名不再有出厂默认值
// (gemini-2.5-flash-lite 回落已移除)。区分两种情况：
//   - "未配置"(空串): 不再回落默认值——isGeminiAvailable() 判不可用，
//     startSession() 拒绝空模型名
//   - "配置了但不在白名单里"(非空但无效): 现有 warn + 回落 defaultModel
//     行为保持不变，不在本任务范围

const ORIGINAL_GEMINI_KEY = process.env.GEMINI_API_KEY;
const ORIGINAL_ENV_FILE = process.env.CLAUDE_MEM_ENV_FILE;

// 第二轮独立验证发现: 全量套件里有些旧测试文件(如
// tests/worker/http/routes/data-routes-delete-auth.test.ts、
// tests/services/queue/redis-config.test.ts 等)用
// mock.module('.../shared/paths.js', ...) 把整个 paths 对象换成残缺对象(缺
// settings 字段)且从不还原——GeminiProvider 内部的 getGeminiConfig() /
// isGeminiAvailable() / isGeminiSelected() 都先调用 paths.settings() 再把结果
// 传给下面已 mock 好的 loadFromFile，若残缺对象没有 settings 字段就会在到达
// loadFromFile 之前先抛 "paths.settings is not a function"。这里自愈: 不管
// paths 对象当前是否被污染，每个 test 前主动把 settings 恢复成可用函数,
// test 后还原原状，不反过来污染排在自己后面的文件。
let originalSettingsFn: (() => string) | undefined;

beforeEach(() => {
  process.env.CLAUDE_MEM_ENV_FILE = '/tmp/claude-mem-gemini-test-nonexistent.env';
  delete process.env.GEMINI_API_KEY;
  originalSettingsFn = (paths as { settings?: () => string }).settings;
  (paths as { settings: () => string }).settings = () => '/tmp/claude-mem-test-settings.json';
});

afterEach(() => {
  if (ORIGINAL_GEMINI_KEY === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = ORIGINAL_GEMINI_KEY;
  if (ORIGINAL_ENV_FILE === undefined) delete process.env.CLAUDE_MEM_ENV_FILE;
  else process.env.CLAUDE_MEM_ENV_FILE = ORIGINAL_ENV_FILE;
  (paths as { settings?: () => string }).settings = originalSettingsFn;
});

describe('isGeminiAvailable (Task-20260927091425627-P2)', () => {
  it('should be true when API key and model are both configured', () => {
    // X-029: 纯对象构造——bun 并发执行时其它文件的 mock.module(SettingsDefaultsManager)
    // 会泄漏到本文件使 getAllDefaults 失效; resolver 只按需读取字段, 纯对象即可。
    const settings = {
      CLAUDE_MEM_GEMINI_API_KEY: 'sk-g-test',
      CLAUDE_MEM_GEMINI_MODEL: 'gemini-2.5-flash-lite',
    } as unknown as SettingsDefaults;
    const loadFromFileSpy = spyOn(SettingsDefaultsManager, 'loadFromFile').mockImplementation(() => settings);
    try {
      expect(isGeminiAvailable()).toBe(true);
    } finally {
      loadFromFileSpy.mockRestore();
    }
  });

  it('should be false when API key is configured but model is NOT configured', () => {
    const settings = {
      CLAUDE_MEM_GEMINI_API_KEY: 'sk-g-test',
      CLAUDE_MEM_GEMINI_MODEL: '',
    } as unknown as SettingsDefaults;
    const loadFromFileSpy = spyOn(SettingsDefaultsManager, 'loadFromFile').mockImplementation(() => settings);
    try {
      expect(isGeminiAvailable()).toBe(false);
    } finally {
      loadFromFileSpy.mockRestore();
    }
  });
});

describe('GeminiProvider.startSession model guard (Task-20260927091425627-P2)', () => {
  it('should throw when API key is configured but model is empty', async () => {
    const settings = {
      CLAUDE_MEM_GEMINI_API_KEY: 'sk-g-test',
      CLAUDE_MEM_GEMINI_MODEL: '',
    } as unknown as SettingsDefaults;
    const loadFromFileSpy = spyOn(SettingsDefaultsManager, 'loadFromFile').mockImplementation(() => settings);

    try {
      const provider = new GeminiProvider({} as DatabaseManager, {} as SessionManager);
      const session = { sessionDbId: 1 } as any;
      await expect(provider.startSession(session)).rejects.toThrow(/CLAUDE_MEM_GEMINI_MODEL/);
    } finally {
      loadFromFileSpy.mockRestore();
    }
  });
});
