
import { describe, it, expect } from 'bun:test';
import { SettingsDefaultsManager } from '../../src/shared/SettingsDefaultsManager.js';

// TODO-llm-provider.md T-01（X-014）: 新增 Qwen / DeepSeek / 报表 provider 配置键。
// 断言出厂默认值——新增键的默认语义是设计的验收标准：
//   - Qwen/DeepSeek key 为空 = 未启用
//   - QWEN_URL 为空 = provider 内回落 DashScope 兼容端点
//   - DeepSeek 模型出厂为空串（Task-20260927091425627-P2：模型名不再有默认值，
//     未配置时 DeepSeek 判不可用，不再悄悄回落 deepseek-v4-flash）
//   - REPORT_PROVIDER 为空 = 报表 AI 段禁用
// X-029: bun 并发执行时其它测试文件的 mock.module(SettingsDefaultsManager) 可能
// 泄漏到本文件(本套测试的目的正是真实默认值), 被 mock 时整体跳过。
const REAL_DEFAULTS_AVAILABLE = typeof SettingsDefaultsManager.getAllDefaults === 'function';

describe('LLM provider settings defaults (X-014)', () => {
  it.skipIf(!REAL_DEFAULTS_AVAILABLE)('should include the Qwen provider group with empty key/url defaults', () => {
    const defaults = SettingsDefaultsManager.getAllDefaults();
    expect(defaults.CLAUDE_MEM_QWEN_API_KEY).toBe('');
    expect(defaults.CLAUDE_MEM_QWEN_URL).toBe('');
    expect(defaults.CLAUDE_MEM_QWEN_MODEL).toBe('');
  });

  // 依据: Task-20260927091425627-P2 — CLAUDE_MEM_DEEPSEEK_MODEL 出厂值从
  // 'deepseek-v4-flash' 改为空串，模型名不再有出厂默认值。
  it.skipIf(!REAL_DEFAULTS_AVAILABLE)('should include the DeepSeek provider group with empty model default (no silent fallback)', () => {
    const defaults = SettingsDefaultsManager.getAllDefaults();
    expect(defaults.CLAUDE_MEM_DEEPSEEK_API_KEY).toBe('');
    expect(defaults.CLAUDE_MEM_DEEPSEEK_MODEL).toBe('');
    expect(defaults.CLAUDE_MEM_DEEPSEEK_URL).toBe('https://api.deepseek.com');
  });

  it.skipIf(!REAL_DEFAULTS_AVAILABLE)('should include CLAUDE_MEM_REPORT_PROVIDER defaulting to empty (AI disabled)', () => {
    const defaults = SettingsDefaultsManager.getAllDefaults();
    expect(defaults.CLAUDE_MEM_REPORT_PROVIDER).toBe('');
  });

  // X-021: 废弃键已从 SettingsDefaults 彻底移除(不做旧版兼容)。
  it.skipIf(!REAL_DEFAULTS_AVAILABLE)('should NOT include the deprecated report keys anymore', () => {
    const defaults = SettingsDefaultsManager.getAllDefaults() as Record<string, unknown>;
    expect(defaults.CLAUDE_MEM_WEEKLY_REPORT_MODEL).toBeUndefined();
    expect(defaults.CLAUDE_MEM_REPORT_QWEN_API_KEY).toBeUndefined();
  });

  it.skipIf(!REAL_DEFAULTS_AVAILABLE)('should persist new keys when creating a fresh settings file', async () => {
    const { mkdirSync, writeFileSync, existsSync, rmSync } = await import('fs');
    const { join } = await import('path');
    const { tmpdir } = await import('os');

    const tempDir = join(tmpdir(), `llm-settings-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    const settingsPath = join(tempDir, 'settings.json');
    mkdirSync(tempDir, { recursive: true });
    try {
      writeFileSync(settingsPath, '{}');
      const result = SettingsDefaultsManager.loadFromFile(settingsPath);
      // 依据: Task-20260927091425627-P2 — 空文件落回出厂默认值时模型名应为空串。
      expect(result.CLAUDE_MEM_DEEPSEEK_MODEL).toBe('');
      expect(result.CLAUDE_MEM_REPORT_PROVIDER).toBe('');
      expect(existsSync(settingsPath)).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
