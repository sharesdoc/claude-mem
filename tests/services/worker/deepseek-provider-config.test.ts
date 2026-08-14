
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import type { SettingsDefaults } from '../../../src/shared/SettingsDefaultsManager.js';
import {
  resolveDeepSeekApiKey,
  resolveDeepSeekEndpoint,
  resolveDeepSeekModel,
  classifyDeepSeekError,
  isDeepSeekAvailable,
  isDeepSeekSelected,
} from '../../../src/services/worker/DeepSeekProvider.js';

// X-016: DeepSeekProvider 配置解析与错误分类。
// 验收标准转写：
//   1) 三级回脱 key 解析，env 优先
//   2) 端点/模型回落语义（deepseek-v4-flash / https://api.deepseek.com）
//   3) 错误分类六类
//   4) isDeepSeekAvailable 认新键，isDeepSeekSelected 认 provider=deepseek

const ORIGINAL_KEY = process.env.CLAUDE_MEM_DEEPSEEK_API_KEY;
// X-029: 凭证库隔离——resolveDeepSeekApiKey 三级回脱的最后一级读
// CLAUDE_MEM_ENV_FILE, 全量跑时其它测试可能污染该环境变量; 指向不存在路径
// 保证"空 key"断言不受真实 ~/.claude-mem/.env 影响。
const ORIGINAL_ENV_FILE = process.env.CLAUDE_MEM_ENV_FILE;

beforeEach(() => {
  // X-029: 指向不存在路径, 保证三级回脱的凭证库一级读不到真实 .env
  process.env.CLAUDE_MEM_ENV_FILE = '/tmp/claude-mem-deepseek-test-nonexistent.env';
});

describe('DeepSeekProvider config resolvers (X-016)', () => {
  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.CLAUDE_MEM_DEEPSEEK_API_KEY;
    else process.env.CLAUDE_MEM_DEEPSEEK_API_KEY = ORIGINAL_KEY;
    if (ORIGINAL_ENV_FILE === undefined) delete process.env.CLAUDE_MEM_ENV_FILE;
    else process.env.CLAUDE_MEM_ENV_FILE = ORIGINAL_ENV_FILE;
  });

  describe('resolveDeepSeekApiKey', () => {
    it('should return empty when nothing configured', () => {
      delete process.env.CLAUDE_MEM_DEEPSEEK_API_KEY;
      // X-029: 纯对象构造——bun 并发执行时其它文件的 mock.module(SettingsDefaultsManager)
      // 会泄漏到本文件使 getAllDefaults 失效; resolver 只按需读取字段, 空对象即可。
      const settings = {} as unknown as SettingsDefaults;
      expect(resolveDeepSeekApiKey(settings)).toBe('');
    });

    it('should read key from settings', () => {
      delete process.env.CLAUDE_MEM_DEEPSEEK_API_KEY;
      // X-029: 纯对象构造——bun 并发执行时其它文件的 mock.module(SettingsDefaultsManager)
      // 会泄漏到本文件使 getAllDefaults 失效; resolver 只按需读取字段, 空对象即可。
      const settings = {} as unknown as SettingsDefaults;
      settings.CLAUDE_MEM_DEEPSEEK_API_KEY = 'sk-ds-settings';
      expect(resolveDeepSeekApiKey(settings)).toBe('sk-ds-settings');
    });

    it('should prefer env over settings', () => {
      process.env.CLAUDE_MEM_DEEPSEEK_API_KEY = 'sk-ds-env';
      // X-029: 纯对象构造——bun 并发执行时其它文件的 mock.module(SettingsDefaultsManager)
      // 会泄漏到本文件使 getAllDefaults 失效; resolver 只按需读取字段, 空对象即可。
      const settings = {} as unknown as SettingsDefaults;
      settings.CLAUDE_MEM_DEEPSEEK_API_KEY = 'sk-ds-settings';
      expect(resolveDeepSeekApiKey(settings)).toBe('sk-ds-env');
    });
  });

  describe('resolveDeepSeekEndpoint', () => {
    it('should fall back to api.deepseek.com when empty', () => {
      // X-029: 纯对象构造——bun 并发执行时其它文件的 mock.module(SettingsDefaultsManager)
      // 会泄漏到本文件使 getAllDefaults 失效; resolver 只按需读取字段, 空对象即可。
      const settings = {} as unknown as SettingsDefaults;
      settings.CLAUDE_MEM_DEEPSEEK_URL = '';
      expect(resolveDeepSeekEndpoint(settings)).toBe('https://api.deepseek.com/chat/completions');
    });

    it('should use custom endpoint when configured', () => {
      // X-029: 纯对象构造——bun 并发执行时其它文件的 mock.module(SettingsDefaultsManager)
      // 会泄漏到本文件使 getAllDefaults 失效; resolver 只按需读取字段, 空对象即可。
      const settings = {} as unknown as SettingsDefaults;
      settings.CLAUDE_MEM_DEEPSEEK_URL = 'https://deepseek.local/v1/chat/completions';
      expect(resolveDeepSeekEndpoint(settings)).toBe('https://deepseek.local/v1/chat/completions');
    });

    // X-030: 端点解析边界——base 补全 / 尾斜杠归一 / 完整路径不重复补全。
    it('should append /chat/completions to a base URL', () => {
      const settings = {} as unknown as SettingsDefaults;
      settings.CLAUDE_MEM_DEEPSEEK_URL = 'https://deepseek.local/v1';
      expect(resolveDeepSeekEndpoint(settings)).toBe('https://deepseek.local/v1/chat/completions');
    });

    it('should strip trailing slashes from a base URL before appending', () => {
      const settings = {} as unknown as SettingsDefaults;
      settings.CLAUDE_MEM_DEEPSEEK_URL = 'https://deepseek.local/v1/';
      expect(resolveDeepSeekEndpoint(settings)).toBe('https://deepseek.local/v1/chat/completions');
    });

    it('should NOT double-append when the full path already has a trailing slash', () => {
      const settings = {} as unknown as SettingsDefaults;
      settings.CLAUDE_MEM_DEEPSEEK_URL = 'https://deepseek.local/v1/chat/completions/';
      expect(resolveDeepSeekEndpoint(settings)).toBe('https://deepseek.local/v1/chat/completions');
    });
  });

  describe('resolveDeepSeekModel', () => {
    it('should fall back to deepseek-v4-flash when empty', () => {
      // X-029: 纯对象构造——bun 并发执行时其它文件的 mock.module(SettingsDefaultsManager)
      // 会泄漏到本文件使 getAllDefaults 失效; resolver 只按需读取字段, 空对象即可。
      const settings = {} as unknown as SettingsDefaults;
      settings.CLAUDE_MEM_DEEPSEEK_MODEL = '';
      expect(resolveDeepSeekModel(settings)).toBe('deepseek-v4-flash');
    });

    it('should accept arbitrary model ids', () => {
      // X-029: 纯对象构造——bun 并发执行时其它文件的 mock.module(SettingsDefaultsManager)
      // 会泄漏到本文件使 getAllDefaults 失效; resolver 只按需读取字段, 空对象即可。
      const settings = {} as unknown as SettingsDefaults;
      settings.CLAUDE_MEM_DEEPSEEK_MODEL = 'deepseek-v4-pro';
      expect(resolveDeepSeekModel(settings)).toBe('deepseek-v4-pro');
    });
  });

  describe('classifyDeepSeekError', () => {
    it('should classify 401 as auth_invalid', () => {
      const err = classifyDeepSeekError({ status: 401, bodyText: '{"message":"bad key"}', cause: new Error('x') });
      expect(err.kind).toBe('auth_invalid');
    });

    it('should classify 429 as rate_limit', () => {
      const err = classifyDeepSeekError({ status: 429, cause: new Error('x') });
      expect(err.kind).toBe('rate_limit');
    });

    it('should classify 400 as unrecoverable', () => {
      const err = classifyDeepSeekError({ status: 400, bodyText: 'bad', cause: new Error('x') });
      expect(err.kind).toBe('unrecoverable');
    });

    it('should classify 5xx as transient', () => {
      const err = classifyDeepSeekError({ status: 503, cause: new Error('x') });
      expect(err.kind).toBe('transient');
    });

    it('should classify network errors as transient', () => {
      const err = classifyDeepSeekError({ cause: new Error('ECONNREFUSED') });
      expect(err.kind).toBe('transient');
    });

    // X-034: abort 不得被当作 transient 重试。
    it('should classify fetch aborts as unrecoverable (no retry)', () => {
      const abort = new Error('The operation was aborted');
      abort.name = 'AbortError';
      const err = classifyDeepSeekError({ cause: abort });
      expect(err.kind).toBe('unrecoverable');
    });
  });

  describe('isDeepSeekAvailable', () => {
    it('should be true when env key set', () => {
      process.env.CLAUDE_MEM_DEEPSEEK_API_KEY = 'sk-ds-env';
      expect(isDeepSeekAvailable()).toBe(true);
    });
  });

  describe('isDeepSeekSelected', () => {
    it('should return false when provider is claude', () => {
      // 默认 provider 为 claude，不额外改 settings 时必为 false
      expect(isDeepSeekSelected()).toBe(false);
    });
  });
});
