// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, afterEach } from 'bun:test';
import { buildServerGenerationProviderFromEnv } from '../../../src/server/runtime/create-server-beta-service.js';
import { SettingsDefaultsManager } from '../../../src/shared/SettingsDefaultsManager.js';
import { OpenRouterObservationProvider } from '../../../src/server/generation/providers/OpenRouterObservationProvider.js';
import type { ServerGenerationContext } from '../../../src/server/generation/providers/shared/types.js';
import { DASHSCOPE_URL } from '../../../src/services/worker/QwenProvider.js';
import { DEEPSEEK_COMPLETIONS_URL } from '../../../src/services/worker/DeepSeekProvider.js';

// X-020: server-beta 生成 provider 合并到 CLAUDE_MEM_PROVIDER。
// 验收标准转写:
//   1) 未配置 provider -> claude 默认, 有 ANTHROPIC_API_KEY 可用
//   2) claude 无 key -> null (生成禁用)
//   3) qwen/deepseek 走各自厂商组 key/model/endpoint (fetch 捕获验证)
//   4) gemini/openrouter 行为不变
//   5) CLAUDE_MEM_SERVER_PROVIDER 不再被读取 (回归护栏)

const ENV_KEYS = [
  'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'OPENROUTER_API_KEY',
  'CLAUDE_MEM_QWEN_API_KEY', 'CLAUDE_MEM_DEEPSEEK_API_KEY',
  'CLAUDE_MEM_SERVER_PROVIDER', 'CLAUDE_MEM_SERVER_MODEL', 'CLAUDE_MEM_PROVIDER',
] as const;

const ORIGINAL_ENV: Record<string, string | undefined> = {};
for (const k of ENV_KEYS) ORIGINAL_ENV[k] = process.env[k];

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (ORIGINAL_ENV[k] === undefined) delete process.env[k];
    else process.env[k] = ORIGINAL_ENV[k];
  }
});

function freshSettings() {
  const s = SettingsDefaultsManager.getAllDefaults();
  s.CLAUDE_MEM_PROVIDER = 'claude';
  s.CLAUDE_MEM_QWEN_API_KEY = '';
  s.CLAUDE_MEM_DEEPSEEK_API_KEY = '';
  s.CLAUDE_MEM_GEMINI_API_KEY = '';
  s.CLAUDE_MEM_OPENROUTER_API_KEY = '';
  return s;
}

describe('buildServerGenerationProviderFromEnv (X-020)', () => {
  it('should default to claude and use ANTHROPIC_API_KEY', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-env';
    delete process.env.CLAUDE_MEM_PROVIDER;
    const provider = buildServerGenerationProviderFromEnv(freshSettings());
    expect(provider).not.toBeNull();
    expect(provider!.providerLabel).toBe('claude');
  });

  it('should return null for claude without any API key', () => {
    delete process.env.ANTHROPIC_API_KEY;
    const provider = buildServerGenerationProviderFromEnv(freshSettings());
    expect(provider).toBeNull();
  });

  it('should resolve qwen from its provider group', () => {
    delete process.env.ANTHROPIC_API_KEY;
    const s = freshSettings();
    s.CLAUDE_MEM_PROVIDER = 'qwen';
    s.CLAUDE_MEM_QWEN_API_KEY = 'sk-q-srv';
    s.CLAUDE_MEM_QWEN_MODEL = 'qwen-plus';
    s.CLAUDE_MEM_QWEN_URL = 'https://qwen.srv/v1/chat/completions';
    const provider = buildServerGenerationProviderFromEnv(s);
    expect(provider).not.toBeNull();
    expect(provider!.providerLabel).toBe('qwen');
  });

  it('should resolve deepseek from its provider group', () => {
    delete process.env.ANTHROPIC_API_KEY;
    const s = freshSettings();
    s.CLAUDE_MEM_PROVIDER = 'deepseek';
    s.CLAUDE_MEM_DEEPSEEK_API_KEY = 'sk-ds-srv';
    const provider = buildServerGenerationProviderFromEnv(s);
    expect(provider).not.toBeNull();
    expect(provider!.providerLabel).toBe('deepseek');
  });

  it('should resolve gemini via GEMINI_API_KEY env', () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.GEMINI_API_KEY = 'sk-g-env';
    const s = freshSettings();
    s.CLAUDE_MEM_PROVIDER = 'gemini';
    const provider = buildServerGenerationProviderFromEnv(s);
    expect(provider).not.toBeNull();
    expect(provider!.providerLabel).toBe('gemini');
  });

  it('should resolve openrouter from its settings key', () => {
    delete process.env.ANTHROPIC_API_KEY;
    const s = freshSettings();
    s.CLAUDE_MEM_PROVIDER = 'openrouter';
    s.CLAUDE_MEM_OPENROUTER_API_KEY = 'sk-or-srv';
    const provider = buildServerGenerationProviderFromEnv(s);
    expect(provider).not.toBeNull();
    expect(provider!.providerLabel).toBe('openrouter');
  });

  it('should return null when the selected vendor has no key', () => {
    delete process.env.ANTHROPIC_API_KEY;
    const s = freshSettings();
    s.CLAUDE_MEM_PROVIDER = 'qwen';
    expect(buildServerGenerationProviderFromEnv(s)).toBeNull();
  });

  it('should ignore the deprecated CLAUDE_MEM_SERVER_PROVIDER (regression guard)', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-env';
    process.env.CLAUDE_MEM_SERVER_PROVIDER = 'qwen';
    delete process.env.CLAUDE_MEM_PROVIDER;
    const provider = buildServerGenerationProviderFromEnv(freshSettings());
    expect(provider).not.toBeNull();
    expect(provider!.providerLabel).toBe('claude');
  });

  // X-028: 默认端点常量契约——自定义端点告警的比较基准, 变更默认值必须同步。
  it('should keep the built-in default endpoint constants stable', () => {
    expect(DASHSCOPE_URL).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions');
    expect(DEEPSEEK_COMPLETIONS_URL).toBe('https://api.deepseek.com/chat/completions');
  });
});

// OpenRouterObservationProvider 泛化 (baseUrl/providerLabel) 的协议级验证:
// qwen/deepseek 复用该实现, 请求须打到配置端点并携带正确模型与 Bearer 鉴权。
describe('OpenRouterObservationProvider generalization (X-020)', () => {
  function makeContext(): ServerGenerationContext {
    return {
      job: {
        id: 'job-1', projectId: 'proj-1', teamId: 'team-1', agentEventId: 'evt-1',
        sourceType: 'agent_event', sourceId: 'evt-1', serverSessionId: null,
        jobType: 'observation_generate_for_event', status: 'processing',
        idempotencyKey: 'k', bullmqJobId: null, attempts: 1, maxAttempts: 3,
        nextAttemptAtEpoch: null, lockedAtEpoch: null, lockedBy: null,
        completedAtEpoch: null, failedAtEpoch: null, cancelledAtEpoch: null,
        lastError: null, payload: {}, createdAtEpoch: 0, updatedAtEpoch: 0,
      },
      events: [{
        id: 'evt-1', projectId: 'proj-1', teamId: 'team-1', serverSessionId: null,
        sourceAdapter: 'api', sourceEventId: null, idempotencyKey: 'k',
        eventType: 'tool_use', payload: { tool: 'bash', input: 'ls' },
        metadata: {}, occurredAtEpoch: 0, receivedAtEpoch: 0, createdAtEpoch: 0,
      }],
      project: { projectId: 'proj-1', teamId: 'team-1', serverSessionId: null },
    };
  }

  it('should call the configured baseUrl with configured model and Bearer auth', async () => {
    let captured: { url: string; body: string; auth: string | null } | null = null;
    const fakeFetch: typeof fetch = async (url, init) => {
      captured = {
        url: String(url),
        body: String(init?.body ?? ''),
        auth: (init?.headers as Record<string, string> | undefined)?.Authorization ?? null,
      };
      return new Response(JSON.stringify({
        choices: [{ message: { content: '<observation><type>x</type><title>t</title></observation>' } }],
        usage: { total_tokens: 10 },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    const provider = new OpenRouterObservationProvider({
      apiKey: 'sk-q',
      model: 'qwen-plus',
      baseUrl: 'https://qwen.srv/v1/chat/completions',
      providerLabel: 'qwen',
      fetchImpl: fakeFetch,
    });
    const result = await provider.generate(makeContext());
    expect(result.providerLabel).toBe('qwen');
    expect(result.rawText).toContain('<observation>');
    expect(captured!.url).toBe('https://qwen.srv/v1/chat/completions');
    expect(captured!.auth).toBe('Bearer sk-q');
    expect(JSON.parse(captured!.body).model).toBe('qwen-plus');
  });
});
