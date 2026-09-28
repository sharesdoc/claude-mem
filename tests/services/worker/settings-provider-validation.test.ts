
import { describe, it, expect } from 'bun:test';
import { isValidProviderValue, normalizeProviderValue, VALID_PROVIDERS } from '../../../src/services/worker/http/routes/SettingsRoutes.js';

// X-018: provider 值校验（CLAUDE_MEM_PROVIDER 与 CLAUDE_MEM_REPORT_PROVIDER 共用）。
// 验收标准转写：5 厂商合法；空/undefined 允许（默认值或禁用语义）；非法值拒绝。

describe('isValidProviderValue (X-018)', () => {
  it('should expose exactly the five supported providers', () => {
    expect([...VALID_PROVIDERS].sort()).toEqual(
      ['claude', 'deepseek', 'gemini', 'openrouter', 'qwen'].sort(),
    );
  });

  it('should accept all five providers', () => {
    for (const p of VALID_PROVIDERS) {
      expect(isValidProviderValue(p)).toBe(true);
    }
  });

  it('should accept empty and undefined (default / disabled semantics)', () => {
    expect(isValidProviderValue('')).toBe(true);
    expect(isValidProviderValue(undefined)).toBe(true);
  });

  it('should reject unknown provider values', () => {
    expect(isValidProviderValue('ollama')).toBe(false);
    expect(isValidProviderValue('qwen3')).toBe(false);
    expect(isValidProviderValue('deepseekx')).toBe(false);
  });

  it('should trim and lowercase before matching (consistent with is*Selected helpers)', () => {
    expect(isValidProviderValue('  QWEN  ')).toBe(true);
    expect(isValidProviderValue('Claude')).toBe(true);
  });

  // X-026: type-confusion 回归护栏——非字符串输入必须拒绝而非抛 TypeError。
  it('should reject non-string values without throwing', () => {
    expect(isValidProviderValue(123 as unknown as string)).toBe(false);
    expect(isValidProviderValue({ provider: 'qwen' } as unknown as string)).toBe(false);
    expect(isValidProviderValue(null as unknown as string)).toBe(false);
  });
});

describe('normalizeProviderValue (X-026)', () => {
  it('should normalize trimmed lowercase provider values', () => {
    expect(normalizeProviderValue('  QWEN ')).toBe('qwen');
    expect(normalizeProviderValue('Claude')).toBe('claude');
    expect(normalizeProviderValue('deepseek')).toBe('deepseek');
  });

  it('should return undefined for empty strings', () => {
    expect(normalizeProviderValue('')).toBeUndefined();
    expect(normalizeProviderValue('   ')).toBeUndefined();
  });

  it('should return undefined for non-string values', () => {
    expect(normalizeProviderValue(123)).toBeUndefined();
    expect(normalizeProviderValue(null)).toBeUndefined();
    expect(normalizeProviderValue({})).toBeUndefined();
  });
});
