
import { describe, it, expect } from 'bun:test';
import { SettingsDefaultsManager } from '../../src/shared/SettingsDefaultsManager.js';

// TODO-llm-provider.md T-01（X-014）: 新增 Qwen / DeepSeek / 报表 provider 配置键。
// 断言出厂默认值——新增键的默认语义是设计的验收标准：
//   - Qwen/DeepSeek key 为空 = 未启用
//   - QWEN_URL 为空 = provider 内回落 DashScope 兼容端点
//   - DeepSeek 默认 deepseek-v4-flash（deepseek-chat 别名已于 2026-07-24 停用）
//   - REPORT_PROVIDER 为空 = 报表 AI 段禁用
describe('LLM provider settings defaults (X-014)', () => {
  it('should include the Qwen provider group with empty key/url defaults', () => {
    const defaults = SettingsDefaultsManager.getAllDefaults();
    expect(defaults.CLAUDE_MEM_QWEN_API_KEY).toBe('');
    expect(defaults.CLAUDE_MEM_QWEN_URL).toBe('');
    expect(defaults.CLAUDE_MEM_QWEN_MODEL).toBe('');
  });

  it('should include the DeepSeek provider group with v4-flash defaults', () => {
    const defaults = SettingsDefaultsManager.getAllDefaults();
    expect(defaults.CLAUDE_MEM_DEEPSEEK_API_KEY).toBe('');
    expect(defaults.CLAUDE_MEM_DEEPSEEK_MODEL).toBe('deepseek-v4-flash');
    expect(defaults.CLAUDE_MEM_DEEPSEEK_URL).toBe('https://api.deepseek.com');
  });

  it('should include CLAUDE_MEM_REPORT_PROVIDER defaulting to empty (AI disabled)', () => {
    const defaults = SettingsDefaultsManager.getAllDefaults();
    expect(defaults.CLAUDE_MEM_REPORT_PROVIDER).toBe('');
  });

  it('should persist new keys when creating a fresh settings file', async () => {
    const { mkdirSync, writeFileSync, existsSync, rmSync } = await import('fs');
    const { join } = await import('path');
    const { tmpdir } = await import('os');

    const tempDir = join(tmpdir(), `llm-settings-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const settingsPath = join(tempDir, 'settings.json');
    mkdirSync(tempDir, { recursive: true });
    try {
      writeFileSync(settingsPath, '{}');
      const result = SettingsDefaultsManager.loadFromFile(settingsPath);
      expect(result.CLAUDE_MEM_DEEPSEEK_MODEL).toBe('deepseek-v4-flash');
      expect(result.CLAUDE_MEM_REPORT_PROVIDER).toBe('');
      expect(existsSync(settingsPath)).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
