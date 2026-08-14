
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import type { SettingsDefaults } from '../../../src/shared/SettingsDefaultsManager.js';
import {
  resolveQwenApiKey,
  resolveQwenEndpoint,
  resolveQwenModel,
  isQwenAvailable,
  classifyQwenError,
} from '../../../src/services/worker/QwenProvider.js';

// X-015: QwenProvider 切换到 CLAUDE_MEM_QWEN_* 配置组。
// 验收标准转写：
//   1) 新键三级回脱（env > settings > 凭证库），旧键不再参与
//   2) CLAUDE_MEM_QWEN_URL 非空用自定义端点，空回落 DASHSCOPE 兼容端点
//   3) 任意模型名直接采用，空回落 qwen3-max
//   4) isQwenAvailable 认新键

const ORIGINAL_QWEN_KEY = process.env.CLAUDE_MEM_QWEN_API_KEY;
const ORIGINAL_OLD_KEY = process.env.CLAUDE_MEM_REPORT_QWEN_API_KEY;
// X-029: 凭证库隔离——resolveQwenApiKey 三级回脱的最后一级读
// CLAUDE_MEM_ENV_FILE, 指向不存在路径保证"空 key"断言不受真实 .env 影响。
const ORIGINAL_ENV_FILE = process.env.CLAUDE_MEM_ENV_FILE;

beforeEach(() => {
  // X-029: 指向不存在路径, 保证三级回脱的凭证库一级读不到真实 .env
  process.env.CLAUDE_MEM_ENV_FILE = '/tmp/claude-mem-qwen-test-nonexistent.env';
});

describe('QwenProvider config resolvers (X-015)', () => {
  afterEach(() => {
    if (ORIGINAL_QWEN_KEY === undefined) delete process.env.CLAUDE_MEM_QWEN_API_KEY;
    else process.env.CLAUDE_MEM_QWEN_API_KEY = ORIGINAL_QWEN_KEY;
    if (ORIGINAL_OLD_KEY === undefined) delete process.env.CLAUDE_MEM_REPORT_QWEN_API_KEY;
    else process.env.CLAUDE_MEM_REPORT_QWEN_API_KEY = ORIGINAL_OLD_KEY;
    if (ORIGINAL_ENV_FILE === undefined) delete process.env.CLAUDE_MEM_ENV_FILE;
    else process.env.CLAUDE_MEM_ENV_FILE = ORIGINAL_ENV_FILE;
  });

  describe('resolveQwenApiKey', () => {
    it('should return empty string when no key configured anywhere', () => {
      delete process.env.CLAUDE_MEM_QWEN_API_KEY;
      // X-029: 纯对象构造——bun 并发执行时其它文件的 mock.module(SettingsDefaultsManager)
      // 会泄漏到本文件使 getAllDefaults 失效; resolver 只按需读取字段, 空对象即可。
      const settings = {} as unknown as SettingsDefaults;
      expect(resolveQwenApiKey(settings)).toBe('');
    });

    it('should read the key from settings', () => {
      delete process.env.CLAUDE_MEM_QWEN_API_KEY;
      // X-029: 纯对象构造——bun 并发执行时其它文件的 mock.module(SettingsDefaultsManager)
      // 会泄漏到本文件使 getAllDefaults 失效; resolver 只按需读取字段, 空对象即可。
      const settings = {} as unknown as SettingsDefaults;
      settings.CLAUDE_MEM_QWEN_API_KEY = 'sk-settings';
      expect(resolveQwenApiKey(settings)).toBe('sk-settings');
    });

    it('should prefer env over settings', () => {
      process.env.CLAUDE_MEM_QWEN_API_KEY = 'sk-env';
      // X-029: 纯对象构造——bun 并发执行时其它文件的 mock.module(SettingsDefaultsManager)
      // 会泄漏到本文件使 getAllDefaults 失效; resolver 只按需读取字段, 空对象即可。
      const settings = {} as unknown as SettingsDefaults;
      settings.CLAUDE_MEM_QWEN_API_KEY = 'sk-settings';
      expect(resolveQwenApiKey(settings)).toBe('sk-env');
    });

    it('should ignore the deprecated REPORT_QWEN_API_KEY', () => {
      delete process.env.CLAUDE_MEM_QWEN_API_KEY;
      process.env.CLAUDE_MEM_REPORT_QWEN_API_KEY = 'sk-old';
      // X-029: 纯对象构造——bun 并发执行时其它文件的 mock.module(SettingsDefaultsManager)
      // 会泄漏到本文件使 getAllDefaults 失效; resolver 只按需读取字段, 空对象即可。
      const settings = {} as unknown as SettingsDefaults;
      settings.CLAUDE_MEM_REPORT_QWEN_API_KEY = 'sk-old';
      expect(resolveQwenApiKey(settings)).toBe('');
    });
  });

  describe('resolveQwenEndpoint', () => {
    it('should fall back to the DashScope compatible endpoint when URL is empty', () => {
      // X-029: 纯对象构造——bun 并发执行时其它文件的 mock.module(SettingsDefaultsManager)
      // 会泄漏到本文件使 getAllDefaults 失效; resolver 只按需读取字段, 空对象即可。
      const settings = {} as unknown as SettingsDefaults;
      settings.CLAUDE_MEM_QWEN_URL = '';
      expect(resolveQwenEndpoint(settings)).toBe(
        'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      );
    });

    it('should use the custom OpenAI-compatible endpoint when configured', () => {
      // X-029: 纯对象构造——bun 并发执行时其它文件的 mock.module(SettingsDefaultsManager)
      // 会泄漏到本文件使 getAllDefaults 失效; resolver 只按需读取字段, 空对象即可。
      const settings = {} as unknown as SettingsDefaults;
      settings.CLAUDE_MEM_QWEN_URL = 'https://qwen.local/v1/chat/completions';
      expect(resolveQwenEndpoint(settings)).toBe('https://qwen.local/v1/chat/completions');
    });

    it('should trim whitespace before deciding fallback', () => {
      // X-029: 纯对象构造——bun 并发执行时其它文件的 mock.module(SettingsDefaultsManager)
      // 会泄漏到本文件使 getAllDefaults 失效; resolver 只按需读取字段, 空对象即可。
      const settings = {} as unknown as SettingsDefaults;
      settings.CLAUDE_MEM_QWEN_URL = '   ';
      expect(resolveQwenEndpoint(settings)).toBe(
        'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      );
    });

    // X-030: 端点解析边界——base 补全 / 尾斜杠归一 / 完整路径不重复补全。
    it('should append /chat/completions to a base URL', () => {
      const settings = {} as unknown as SettingsDefaults;
      settings.CLAUDE_MEM_QWEN_URL = 'https://qwen.local/compatible-mode/v1';
      expect(resolveQwenEndpoint(settings)).toBe('https://qwen.local/compatible-mode/v1/chat/completions');
    });

    it('should strip trailing slashes from a base URL before appending', () => {
      const settings = {} as unknown as SettingsDefaults;
      settings.CLAUDE_MEM_QWEN_URL = 'https://qwen.local/compatible-mode/v1/';
      expect(resolveQwenEndpoint(settings)).toBe('https://qwen.local/compatible-mode/v1/chat/completions');
    });

    it('should NOT double-append when the full path already has a trailing slash', () => {
      const settings = {} as unknown as SettingsDefaults;
      settings.CLAUDE_MEM_QWEN_URL = 'https://qwen.local/v1/chat/completions/';
      expect(resolveQwenEndpoint(settings)).toBe('https://qwen.local/v1/chat/completions');
    });
  });

  describe('resolveQwenModel', () => {
    it('should fall back to qwen3-max when model is empty', () => {
      // X-029: 纯对象构造——bun 并发执行时其它文件的 mock.module(SettingsDefaultsManager)
      // 会泄漏到本文件使 getAllDefaults 失效; resolver 只按需读取字段, 空对象即可。
      const settings = {} as unknown as SettingsDefaults;
      settings.CLAUDE_MEM_QWEN_MODEL = '';
      expect(resolveQwenModel(settings)).toBe('qwen3-max');
    });

    it('should accept arbitrary model ids (custom OpenAI-compatible endpoints)', () => {
      // X-029: 纯对象构造——bun 并发执行时其它文件的 mock.module(SettingsDefaultsManager)
      // 会泄漏到本文件使 getAllDefaults 失效; resolver 只按需读取字段, 空对象即可。
      const settings = {} as unknown as SettingsDefaults;
      settings.CLAUDE_MEM_QWEN_MODEL = 'my-custom-qwen-72b';
      expect(resolveQwenModel(settings)).toBe('my-custom-qwen-72b');
    });
  });

  describe('classifyQwenError (X-034)', () => {
    it('should classify fetch aborts as unrecoverable (no retry)', () => {
      const abort = new Error('The operation was aborted');
      abort.name = 'AbortError';
      expect(classifyQwenError({ cause: abort }).kind).toBe('unrecoverable');
    });
  });

  describe('isQwenAvailable', () => {
    it('should be true when CLAUDE_MEM_QWEN_API_KEY env is set', () => {
      process.env.CLAUDE_MEM_QWEN_API_KEY = 'sk-env';
      expect(isQwenAvailable()).toBe(true);
    });
  });
});
