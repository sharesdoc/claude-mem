
import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import type { SettingsDefaults } from '../../../src/shared/SettingsDefaultsManager.js';
import {
  resolveDeepSeekApiKey,
  resolveDeepSeekEndpoint,
  resolveDeepSeekModel,
  classifyDeepSeekError,
  isDeepSeekAvailable,
  isDeepSeekSelected,
  DeepSeekProvider,
} from '../../../src/services/worker/DeepSeekProvider.js';
import type { DatabaseManager } from '../../../src/services/worker/DatabaseManager.js';
import type { SessionManager } from '../../../src/services/worker/SessionManager.js';
import { SettingsDefaultsManager } from '../../../src/shared/SettingsDefaultsManager.js';

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
    // 依据: Task-20260927091425627-P2 — 模型名未配置时不再回落 deepseek-v4-flash，
    // 如实返回空串, 交由 isDeepSeekAvailable()/startSession() 判定为不可用。
    it('should return empty string when model is not configured (no default fallback)', () => {
      // X-029: 纯对象构造——bun 并发执行时其它文件的 mock.module(SettingsDefaultsManager)
      // 会泄漏到本文件使 getAllDefaults 失效; resolver 只按需读取字段, 空对象即可。
      const settings = {} as unknown as SettingsDefaults;
      settings.CLAUDE_MEM_DEEPSEEK_MODEL = '';
      expect(resolveDeepSeekModel(settings)).toBe('');
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
    it('should be true when env key set and a model is configured', () => {
      process.env.CLAUDE_MEM_DEEPSEEK_API_KEY = 'sk-ds-env';
      // X-029: 纯对象构造——bun 并发执行时其它文件的 mock.module(SettingsDefaultsManager)
      // 会泄漏到本文件使 getAllDefaults 失效; resolver 只按需读取字段, 纯对象即可。
      const settings = { CLAUDE_MEM_DEEPSEEK_MODEL: 'deepseek-v4-flash' } as unknown as SettingsDefaults;
      const loadFromFileSpy = spyOn(SettingsDefaultsManager, 'loadFromFile').mockImplementation(() => settings);
      try {
        expect(isDeepSeekAvailable()).toBe(true);
      } finally {
        loadFromFileSpy.mockRestore();
      }
    });

    // 依据: Task-20260927091425627-P2 — apiKey 已配但模型名未配时应判不可用。
    it('should be false when API key is set but model is NOT configured', () => {
      process.env.CLAUDE_MEM_DEEPSEEK_API_KEY = 'sk-ds-env';
      const settings = { CLAUDE_MEM_DEEPSEEK_MODEL: '' } as unknown as SettingsDefaults;
      const loadFromFileSpy = spyOn(SettingsDefaultsManager, 'loadFromFile').mockImplementation(() => settings);
      try {
        expect(isDeepSeekAvailable()).toBe(false);
      } finally {
        loadFromFileSpy.mockRestore();
      }
    });

    // 依据: doc/rev-report-20260927102826977.md R-003 —
    // settings.json 损坏（loadFromFile 抛异常）时，模型名校验的 catch 分支不应
    // 直接判不可用，需保留"env 优先"这条原有容错路径——env 已配置 API key 时
    // 仍应判为可用，而不是被无关的模型名校验短路。
    it('should still be true when settings.json is corrupted (loadFromFile throws) but env API key is configured', () => {
      process.env.CLAUDE_MEM_DEEPSEEK_API_KEY = 'sk-ds-env';
      const loadFromFileSpy = spyOn(SettingsDefaultsManager, 'loadFromFile').mockImplementation(() => {
        throw new Error('settings.json is corrupted');
      });
      try {
        expect(isDeepSeekAvailable()).toBe(true);
      } finally {
        loadFromFileSpy.mockRestore();
      }
    });
  });

  describe('isDeepSeekSelected', () => {
    it('should return false when provider is claude', () => {
      // 默认 provider 为 claude，不额外改 settings 时必为 false
      expect(isDeepSeekSelected()).toBe(false);
    });
  });

  describe('DeepSeekProvider.startSession model guard', () => {
    // 依据: Task-20260927091425627-P2 — 双重保险: startSession() 自身也拒绝
    // 空模型名, 不依赖 isDeepSeekAvailable() 单点把关。
    it('should throw when API key is configured but model is empty', async () => {
      const settings = {
        CLAUDE_MEM_DEEPSEEK_API_KEY: 'sk-ds-test',
        CLAUDE_MEM_DEEPSEEK_MODEL: '',
        CLAUDE_MEM_DEEPSEEK_URL: '',
      } as unknown as SettingsDefaults;
      const loadFromFileSpy = spyOn(SettingsDefaultsManager, 'loadFromFile').mockImplementation(() => settings);
      delete process.env.CLAUDE_MEM_DEEPSEEK_API_KEY;

      try {
        const provider = new DeepSeekProvider({} as DatabaseManager, {} as SessionManager);
        const session = { sessionDbId: 1 } as any;
        await expect(provider.startSession(session)).rejects.toThrow(/CLAUDE_MEM_DEEPSEEK_MODEL/);
      } finally {
        loadFromFileSpy.mockRestore();
      }
    });
  });
});
