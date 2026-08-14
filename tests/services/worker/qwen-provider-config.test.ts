
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { SettingsDefaultsManager } from '../../../src/shared/SettingsDefaultsManager.js';
import {
  resolveQwenApiKey,
  resolveQwenEndpoint,
  resolveQwenModel,
  isQwenAvailable,
} from '../../../src/services/worker/QwenProvider.js';

// X-015: QwenProvider 切换到 CLAUDE_MEM_QWEN_* 配置组。
// 验收标准转写：
//   1) 新键三级回脱（env > settings > 凭证库），旧键不再参与
//   2) CLAUDE_MEM_QWEN_URL 非空用自定义端点，空回落 DASHSCOPE 兼容端点
//   3) 任意模型名直接采用，空回落 qwen3-max
//   4) isQwenAvailable 认新键

const ORIGINAL_QWEN_KEY = process.env.CLAUDE_MEM_QWEN_API_KEY;
const ORIGINAL_OLD_KEY = process.env.CLAUDE_MEM_REPORT_QWEN_API_KEY;

describe('QwenProvider config resolvers (X-015)', () => {
  afterEach(() => {
    if (ORIGINAL_QWEN_KEY === undefined) delete process.env.CLAUDE_MEM_QWEN_API_KEY;
    else process.env.CLAUDE_MEM_QWEN_API_KEY = ORIGINAL_QWEN_KEY;
    if (ORIGINAL_OLD_KEY === undefined) delete process.env.CLAUDE_MEM_REPORT_QWEN_API_KEY;
    else process.env.CLAUDE_MEM_REPORT_QWEN_API_KEY = ORIGINAL_OLD_KEY;
  });

  describe('resolveQwenApiKey', () => {
    it('should return empty string when no key configured anywhere', () => {
      delete process.env.CLAUDE_MEM_QWEN_API_KEY;
      const settings = SettingsDefaultsManager.getAllDefaults();
      expect(resolveQwenApiKey(settings)).toBe('');
    });

    it('should read the key from settings', () => {
      delete process.env.CLAUDE_MEM_QWEN_API_KEY;
      const settings = SettingsDefaultsManager.getAllDefaults();
      settings.CLAUDE_MEM_QWEN_API_KEY = 'sk-settings';
      expect(resolveQwenApiKey(settings)).toBe('sk-settings');
    });

    it('should prefer env over settings', () => {
      process.env.CLAUDE_MEM_QWEN_API_KEY = 'sk-env';
      const settings = SettingsDefaultsManager.getAllDefaults();
      settings.CLAUDE_MEM_QWEN_API_KEY = 'sk-settings';
      expect(resolveQwenApiKey(settings)).toBe('sk-env');
    });

    it('should ignore the deprecated REPORT_QWEN_API_KEY', () => {
      delete process.env.CLAUDE_MEM_QWEN_API_KEY;
      process.env.CLAUDE_MEM_REPORT_QWEN_API_KEY = 'sk-old';
      const settings = SettingsDefaultsManager.getAllDefaults();
      settings.CLAUDE_MEM_REPORT_QWEN_API_KEY = 'sk-old';
      expect(resolveQwenApiKey(settings)).toBe('');
    });
  });

  describe('resolveQwenEndpoint', () => {
    it('should fall back to the DashScope compatible endpoint when URL is empty', () => {
      const settings = SettingsDefaultsManager.getAllDefaults();
      settings.CLAUDE_MEM_QWEN_URL = '';
      expect(resolveQwenEndpoint(settings)).toBe(
        'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      );
    });

    it('should use the custom OpenAI-compatible endpoint when configured', () => {
      const settings = SettingsDefaultsManager.getAllDefaults();
      settings.CLAUDE_MEM_QWEN_URL = 'https://qwen.local/v1/chat/completions';
      expect(resolveQwenEndpoint(settings)).toBe('https://qwen.local/v1/chat/completions');
    });

    it('should trim whitespace before deciding fallback', () => {
      const settings = SettingsDefaultsManager.getAllDefaults();
      settings.CLAUDE_MEM_QWEN_URL = '   ';
      expect(resolveQwenEndpoint(settings)).toBe(
        'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      );
    });
  });

  describe('resolveQwenModel', () => {
    it('should fall back to qwen3-max when model is empty', () => {
      const settings = SettingsDefaultsManager.getAllDefaults();
      settings.CLAUDE_MEM_QWEN_MODEL = '';
      expect(resolveQwenModel(settings)).toBe('qwen3-max');
    });

    it('should accept arbitrary model ids (custom OpenAI-compatible endpoints)', () => {
      const settings = SettingsDefaultsManager.getAllDefaults();
      settings.CLAUDE_MEM_QWEN_MODEL = 'my-custom-qwen-72b';
      expect(resolveQwenModel(settings)).toBe('my-custom-qwen-72b');
    });
  });

  describe('isQwenAvailable', () => {
    it('should be true when CLAUDE_MEM_QWEN_API_KEY env is set', () => {
      process.env.CLAUDE_MEM_QWEN_API_KEY = 'sk-env';
      expect(isQwenAvailable()).toBe(true);
    });
  });
});
