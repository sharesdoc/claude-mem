
import { describe, it, expect, afterEach } from 'bun:test';
import { SettingsDefaultsManager } from '../../../src/shared/SettingsDefaultsManager.js';
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

describe('DeepSeekProvider config resolvers (X-016)', () => {
  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.CLAUDE_MEM_DEEPSEEK_API_KEY;
    else process.env.CLAUDE_MEM_DEEPSEEK_API_KEY = ORIGINAL_KEY;
  });

  describe('resolveDeepSeekApiKey', () => {
    it('should return empty when nothing configured', () => {
      delete process.env.CLAUDE_MEM_DEEPSEEK_API_KEY;
      const settings = SettingsDefaultsManager.getAllDefaults();
      expect(resolveDeepSeekApiKey(settings)).toBe('');
    });

    it('should read key from settings', () => {
      delete process.env.CLAUDE_MEM_DEEPSEEK_API_KEY;
      const settings = SettingsDefaultsManager.getAllDefaults();
      settings.CLAUDE_MEM_DEEPSEEK_API_KEY = 'sk-ds-settings';
      expect(resolveDeepSeekApiKey(settings)).toBe('sk-ds-settings');
    });

    it('should prefer env over settings', () => {
      process.env.CLAUDE_MEM_DEEPSEEK_API_KEY = 'sk-ds-env';
      const settings = SettingsDefaultsManager.getAllDefaults();
      settings.CLAUDE_MEM_DEEPSEEK_API_KEY = 'sk-ds-settings';
      expect(resolveDeepSeekApiKey(settings)).toBe('sk-ds-env');
    });
  });

  describe('resolveDeepSeekEndpoint', () => {
    it('should fall back to api.deepseek.com when empty', () => {
      const settings = SettingsDefaultsManager.getAllDefaults();
      settings.CLAUDE_MEM_DEEPSEEK_URL = '';
      expect(resolveDeepSeekEndpoint(settings)).toBe('https://api.deepseek.com/chat/completions');
    });

    it('should use custom endpoint when configured', () => {
      const settings = SettingsDefaultsManager.getAllDefaults();
      settings.CLAUDE_MEM_DEEPSEEK_URL = 'https://deepseek.local/v1/chat/completions';
      expect(resolveDeepSeekEndpoint(settings)).toBe('https://deepseek.local/v1/chat/completions');
    });
  });

  describe('resolveDeepSeekModel', () => {
    it('should fall back to deepseek-v4-flash when empty', () => {
      const settings = SettingsDefaultsManager.getAllDefaults();
      settings.CLAUDE_MEM_DEEPSEEK_MODEL = '';
      expect(resolveDeepSeekModel(settings)).toBe('deepseek-v4-flash');
    });

    it('should accept arbitrary model ids', () => {
      const settings = SettingsDefaultsManager.getAllDefaults();
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
