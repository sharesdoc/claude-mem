
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import type { SettingsDefaults } from '../../../../src/shared/SettingsDefaultsManager.js';
import {
  resolveReportProviderConfig,
  callReportProvider,
  type ReportProviderConfig,
} from '../../../../src/services/worker/reports/report-provider.js';

// X-019: 报表 provider 配置解析与三协议调用分发。
// 验收标准转写：
//   1) REPORT_PROVIDER 空 → null(AI 段禁用)
//   2) 5 厂商各自解析, 缺 key → null
//   3) 三协议请求形状正确(OpenAI 兼容 / Anthropic / Gemini)

const ORIGINAL = {
  QWEN: process.env.CLAUDE_MEM_QWEN_API_KEY,
  DEEPSEEK: process.env.CLAUDE_MEM_DEEPSEEK_API_KEY,
  OPENROUTER: process.env.OPENROUTER_API_KEY,
  GEMINI: process.env.GEMINI_API_KEY,
  ANTHROPIC: process.env.ANTHROPIC_API_KEY,
};

// X-029: 凭证库隔离——key 三级回脱的最后一级读 CLAUDE_MEM_ENV_FILE,
// 指向不存在路径保证"无 key"断言不受真实 ~/.claude-mem/.env 影响。
const ORIGINAL_ENV_FILE = process.env.CLAUDE_MEM_ENV_FILE;

afterEach(() => {
  for (const [k, v] of Object.entries(ORIGINAL)) {
    if (v === undefined) delete process.env[k === 'ANTHROPIC' ? 'ANTHROPIC_API_KEY' : k === 'GEMINI' ? 'GEMINI_API_KEY' : k === 'OPENROUTER' ? 'OPENROUTER_API_KEY' : k === 'QWEN' ? 'CLAUDE_MEM_QWEN_API_KEY' : 'CLAUDE_MEM_DEEPSEEK_API_KEY'];
    else if (k === 'QWEN') process.env.CLAUDE_MEM_QWEN_API_KEY = v;
    else if (k === 'DEEPSEEK') process.env.CLAUDE_MEM_DEEPSEEK_API_KEY = v;
    else if (k === 'OPENROUTER') process.env.OPENROUTER_API_KEY = v;
    else if (k === 'GEMINI') process.env.GEMINI_API_KEY = v;
    else process.env.ANTHROPIC_API_KEY = v;
  }
  if (ORIGINAL_ENV_FILE === undefined) delete process.env.CLAUDE_MEM_ENV_FILE;
  else process.env.CLAUDE_MEM_ENV_FILE = ORIGINAL_ENV_FILE;
});

// X-029: 不用 getAllDefaults()——bun 并发执行时其它测试文件的
// mock.module(SettingsDefaultsManager) 会泄漏到本文件; 空对象即可满足
// resolveReportProviderConfig 的按需读取语义。
function freshSettings(): SettingsDefaults {
  return {} as unknown as SettingsDefaults;
}

beforeEach(() => {
  // X-029: 指向不存在路径, 保证三级回脱的凭证库一级读不到真实 .env
  process.env.CLAUDE_MEM_ENV_FILE = '/tmp/claude-mem-report-test-nonexistent.env';
});

describe('resolveReportProviderConfig (X-019)', () => {
  it('should return null when REPORT_PROVIDER is empty (AI disabled)', () => {
    const s = freshSettings();
    expect(resolveReportProviderConfig(s)).toBeNull();
  });

  it('should return null for unknown provider values', () => {
    const s = freshSettings();
    s.CLAUDE_MEM_REPORT_PROVIDER = 'ollama';
    expect(resolveReportProviderConfig(s)).toBeNull();
  });

  it('should resolve qwen from the Qwen provider group', () => {
    const s = freshSettings();
    s.CLAUDE_MEM_REPORT_PROVIDER = 'qwen';
    s.CLAUDE_MEM_QWEN_API_KEY = 'sk-q';
    s.CLAUDE_MEM_QWEN_MODEL = 'qwen-plus';
    s.CLAUDE_MEM_QWEN_URL = 'https://qwen.local/v1/chat/completions';
    const c = resolveReportProviderConfig(s);
    expect(c).not.toBeNull();
    expect(c!.provider).toBe('qwen');
    expect(c!.apiKey).toBe('sk-q');
    expect(c!.model).toBe('qwen-plus');
    expect(c!.endpoint).toBe('https://qwen.local/v1/chat/completions');
  });

  it('should resolve deepseek with v4-flash default and complete the base-URL path', () => {
    const s = freshSettings();
    s.CLAUDE_MEM_REPORT_PROVIDER = 'deepseek';
    s.CLAUDE_MEM_DEEPSEEK_API_KEY = 'sk-ds';
    // 默认 CLAUDE_MEM_DEEPSEEK_URL 为 base URL https://api.deepseek.com,
    // 解析器须自动补全 /chat/completions(否则请求打到错误路径)。
    const c = resolveReportProviderConfig(s);
    expect(c).not.toBeNull();
    expect(c!.provider).toBe('deepseek');
    expect(c!.model).toBe('deepseek-v4-flash');
    expect(c!.endpoint).toBe('https://api.deepseek.com/chat/completions');
  });

  it('should resolve qwen with qwen3-max default when CLAUDE_MEM_QWEN_MODEL is not set', () => {
    const s = freshSettings();
    s.CLAUDE_MEM_REPORT_PROVIDER = 'qwen';
    s.CLAUDE_MEM_QWEN_API_KEY = 'sk-q';
    // 未显式配置 CLAUDE_MEM_QWEN_MODEL 时应回落到 qwen3-max 默认值
    // (与 resolveQwenModel 改为"未配置返回空串"之前的行为保持一致)。
    const c = resolveReportProviderConfig(s);
    expect(c).not.toBeNull();
    expect(c!.provider).toBe('qwen');
    expect(c!.model).toBe('qwen3-max');
  });

  it('should complete base-URL paths for qwen custom endpoints too', () => {
    const s = freshSettings();
    s.CLAUDE_MEM_REPORT_PROVIDER = 'qwen';
    s.CLAUDE_MEM_QWEN_API_KEY = 'sk-q';
    s.CLAUDE_MEM_QWEN_URL = 'https://qwen.local/compatible-mode/v1';
    const c = resolveReportProviderConfig(s);
    expect(c).not.toBeNull();
    expect(c!.endpoint).toBe('https://qwen.local/compatible-mode/v1/chat/completions');
  });

  it('should resolve openrouter from its group', () => {
    const s = freshSettings();
    s.CLAUDE_MEM_REPORT_PROVIDER = 'openrouter';
    s.CLAUDE_MEM_OPENROUTER_API_KEY = 'sk-or';
    const c = resolveReportProviderConfig(s);
    expect(c).not.toBeNull();
    expect(c!.provider).toBe('openrouter');
    expect(c!.endpoint).toBe('https://openrouter.ai/api/v1/chat/completions');
  });

  it('should resolve gemini from its group', () => {
    const s = freshSettings();
    s.CLAUDE_MEM_REPORT_PROVIDER = 'gemini';
    s.CLAUDE_MEM_GEMINI_API_KEY = 'sk-g';
    const c = resolveReportProviderConfig(s);
    expect(c).not.toBeNull();
    expect(c!.provider).toBe('gemini');
    expect(c!.endpoint).toBe('https://generativelanguage.googleapis.com/v1beta/models');
  });

  it('should resolve claude from ANTHROPIC_API_KEY env + CLAUDE_MEM_MODEL', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant';
    const s = freshSettings();
    s.CLAUDE_MEM_REPORT_PROVIDER = 'claude';
    const c = resolveReportProviderConfig(s);
    expect(c).not.toBeNull();
    expect(c!.provider).toBe('claude');
    expect(c!.apiKey).toBe('sk-ant');
    expect(c!.endpoint).toBe('https://api.anthropic.com/v1/messages');
  });

  it('should return null when the selected provider has no key', () => {
    const s = freshSettings();
    s.CLAUDE_MEM_REPORT_PROVIDER = 'qwen';
    expect(resolveReportProviderConfig(s)).toBeNull();
  });

  // X-035: 非 http(s) 端点禁用 AI 段(保持 null 契约)。
  it('should return null when the qwen endpoint is not http(s)', () => {
    const s = freshSettings();
    s.CLAUDE_MEM_REPORT_PROVIDER = 'qwen';
    s.CLAUDE_MEM_QWEN_API_KEY = 'sk-q';
    s.CLAUDE_MEM_QWEN_URL = 'ftp://evil.example/v1';
    expect(resolveReportProviderConfig(s)).toBeNull();
  });

  it('should return null when the deepseek endpoint is not http(s)', () => {
    const s = freshSettings();
    s.CLAUDE_MEM_REPORT_PROVIDER = 'deepseek';
    s.CLAUDE_MEM_DEEPSEEK_API_KEY = 'sk-ds';
    s.CLAUDE_MEM_DEEPSEEK_URL = 'not-a-url';
    expect(resolveReportProviderConfig(s)).toBeNull();
  });
});

describe('callReportProvider protocol dispatch (X-019)', () => {
  let fetchCalls: Array<{ url: string; init: RequestInit }> = [];
  let mockBody: unknown = {};

  function installFetch(responseBody: unknown) {
    mockBody = responseBody;
    fetchCalls = [];
    (globalThis as { fetch: unknown }).fetch = async (url: string | URL | Request, init?: RequestInit) => {
      fetchCalls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };
  }

  afterEach(() => {
    (globalThis as { fetch: unknown }).fetch = fetch;
  });

  const input = { system: 'sys-prompt', messages: [{ role: 'user' as const, content: 'user-prompt' }] };

  it('should send OpenAI-compatible requests with Bearer auth and merged system message', async () => {
    installFetch({ choices: [{ message: { content: 'ok' } }] });
    const config: ReportProviderConfig = {
      provider: 'qwen',
      apiKey: 'sk-q',
      model: 'qwen-plus',
      endpoint: 'https://qwen.local/v1/chat/completions',
    };
    const result = await callReportProvider(config, input);
    expect(result).toBe('ok');
    expect(fetchCalls.length).toBe(1);
    expect(fetchCalls[0].url).toBe('https://qwen.local/v1/chat/completions');
    const body = JSON.parse(String(fetchCalls[0].init.body));
    expect(body.model).toBe('qwen-plus');
    expect(body.messages[0]).toEqual({ role: 'system', content: 'sys-prompt' });
    expect(body.messages[1]).toEqual({ role: 'user', content: 'user-prompt' });
    expect((fetchCalls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer sk-q');
    // X-035: 凭据请求不自动跟随重定向。
    expect(fetchCalls[0].init.redirect).toBe('manual');
  });

  it('should send Anthropic requests with x-api-key and separated system', async () => {
    installFetch({ content: [{ type: 'text', text: 'ant-ok' }] });
    const config: ReportProviderConfig = {
      provider: 'claude',
      apiKey: 'sk-ant',
      model: 'claude-haiku-4-5-20251001',
      endpoint: 'https://api.anthropic.com/v1/messages',
    };
    const result = await callReportProvider(config, input);
    expect(result).toBe('ant-ok');
    const body = JSON.parse(String(fetchCalls[0].init.body));
    expect(body.system).toBe('sys-prompt');
    expect(body.messages).toEqual([{ role: 'user', content: 'user-prompt' }]);
    const headers = fetchCalls[0].init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-ant');
    expect(headers['anthropic-version']).toBe('2023-06-01');
  });

  it('should send Gemini generateContent requests with systemInstruction and header auth', async () => {
    installFetch({ candidates: [{ content: { parts: [{ text: 'g-ok' }] } }] });
    const config: ReportProviderConfig = {
      provider: 'gemini',
      apiKey: 'sk-g',
      model: 'gemini-2.5-flash-lite',
      endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    };
    const result = await callReportProvider(config, input);
    expect(result).toBe('g-ok');
    // X-027: key 不得出现在 URL query 中(避免日志/代理泄漏), 走 x-goog-api-key 头。
    expect(fetchCalls[0].url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent');
    expect(fetchCalls[0].url).not.toContain('sk-g');
    const headers = fetchCalls[0].init.headers as Record<string, string>;
    expect(headers['x-goog-api-key']).toBe('sk-g');
    const body = JSON.parse(String(fetchCalls[0].init.body));
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'sys-prompt' }] });
    expect(body.contents).toEqual([{ role: 'user', parts: [{ text: 'user-prompt' }] }]);
  });

  it('should return null on non-2xx responses', async () => {
    (globalThis as { fetch: unknown }).fetch = async () =>
      new Response('{"error":"boom"}', { status: 500, headers: { 'Content-Type': 'application/json' } });
    const config: ReportProviderConfig = {
      provider: 'qwen',
      apiKey: 'sk-q',
      model: 'qwen-plus',
      endpoint: 'https://qwen.local/v1/chat/completions',
    };
    const result = await callReportProvider(config, input);
    expect(result).toBeNull();
  });
});
