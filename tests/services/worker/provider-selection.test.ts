
import { describe, it, expect } from 'bun:test';
import { resolveProviderId, type ProviderFlags } from '../../../src/services/worker/provider-selection.js';

// X-017: provider 选择唯一权威纯函数。
// 核心回归护栏: "Qwen 有 key 就自动抢跑"已删除——qwenAvailable 为 true 但
// 未被选中时必须仍返回 claude。

const ALL_OFF: ProviderFlags = {
  qwenSelected: false, qwenAvailable: false,
  deepseekSelected: false, deepseekAvailable: false,
  openrouterSelected: false, openrouterAvailable: false,
  geminiSelected: false, geminiAvailable: false,
};

describe('resolveProviderId (X-017)', () => {
  it('should return claude when nothing is selected', () => {
    expect(resolveProviderId(ALL_OFF)).toBe('claude');
  });

  it('should NOT auto-select qwen when its key exists but it is not selected (regression guard)', () => {
    expect(resolveProviderId({ ...ALL_OFF, qwenAvailable: true })).toBe('claude');
  });

  it('should NOT auto-select deepseek when its key exists but it is not selected', () => {
    expect(resolveProviderId({ ...ALL_OFF, deepseekAvailable: true })).toBe('claude');
  });

  it('should return qwen when selected and available', () => {
    expect(resolveProviderId({ ...ALL_OFF, qwenSelected: true, qwenAvailable: true })).toBe('qwen');
  });

  it('should return deepseek when selected and available', () => {
    expect(resolveProviderId({ ...ALL_OFF, deepseekSelected: true, deepseekAvailable: true })).toBe('deepseek');
  });

  it('should return openrouter when selected and available', () => {
    expect(resolveProviderId({ ...ALL_OFF, openrouterSelected: true, openrouterAvailable: true })).toBe('openrouter');
  });

  it('should return gemini when selected and available', () => {
    expect(resolveProviderId({ ...ALL_OFF, geminiSelected: true, geminiAvailable: true })).toBe('gemini');
  });

  it('should fall back to claude when the selected provider has no key (live-path semantics)', () => {
    expect(resolveProviderId({ ...ALL_OFF, qwenSelected: true, qwenAvailable: false })).toBe('claude');
    expect(resolveProviderId({ ...ALL_OFF, deepseekSelected: true, deepseekAvailable: false })).toBe('claude');
  });

  it('should prefer the explicitly selected provider over others with keys', () => {
    expect(resolveProviderId({
      qwenSelected: false, qwenAvailable: true,
      deepseekSelected: true, deepseekAvailable: true,
      openrouterSelected: false, openrouterAvailable: true,
      geminiSelected: false, geminiAvailable: true,
    })).toBe('deepseek');
  });
});
