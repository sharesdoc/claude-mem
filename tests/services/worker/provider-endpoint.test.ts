
import { describe, it, expect } from 'bun:test';
import { isHttpEndpoint, assertHttpEndpoint } from '../../../src/services/worker/provider-endpoint.js';

// X-035: 自定义 LLM 端点的 http(s) 形状校验。
// 设计取舍: 不封锁 loopback/内网(本地 vLLM/Ollama 是核心用例), 仅做 scheme 校验 +
// 调用方 redirect: 'manual' + 自定义端点 WARN 三层兜底。

describe('provider-endpoint validation (X-035)', () => {
  it('should accept https endpoints', () => {
    expect(isHttpEndpoint('https://api.deepseek.com/chat/completions')).toBe(true);
    expect(isHttpEndpoint('https://dashscope.aliyuncs.com/compatible-mode/v1')).toBe(true);
  });

  it('should accept http endpoints (local vLLM/Ollama deployments)', () => {
    expect(isHttpEndpoint('http://localhost:11434/v1/chat/completions')).toBe(true);
    expect(isHttpEndpoint('http://192.168.1.10:8000/v1')).toBe(true);
  });

  it('should reject non-http(s) schemes and garbage', () => {
    expect(isHttpEndpoint('ftp://host/v1')).toBe(false);
    expect(isHttpEndpoint('file:///etc/passwd')).toBe(false);
    expect(isHttpEndpoint('not-a-url')).toBe(false);
    expect(isHttpEndpoint('')).toBe(false);
  });

  it('assertHttpEndpoint should throw for invalid values with the setting name', () => {
    expect(() => assertHttpEndpoint('not-a-url', 'CLAUDE_MEM_QWEN_URL')).toThrow(/CLAUDE_MEM_QWEN_URL/);
    expect(() => assertHttpEndpoint('https://ok.example/v1', 'CLAUDE_MEM_QWEN_URL')).not.toThrow();
  });
});
