
// ---------------------------------------------------------------------------
// report-provider — 日报/周报 AI 段的 provider 解析与调用分发 (X-019)。
// 配置入口: CLAUDE_MEM_REPORT_PROVIDER (空 = AI 段禁用, 非空非法值 = WARN + 禁用)。
// 模型/key 复用各厂商配置组; 调用按厂商分发三种协议:
//   - OpenAI 兼容 (qwen / deepseek / openrouter): POST {endpoint} Bearer
//   - Anthropic Messages (claude): x-api-key + anthropic-version, system 分离
//   - Gemini generateContent: x-goog-api-key 请求头鉴权, systemInstruction 分离
// 任何失败/超时 → null (调用方降级为确定性简版)。
// ---------------------------------------------------------------------------

import { SettingsDefaultsManager, type SettingsDefaults } from '../../../shared/SettingsDefaultsManager.js';
import { USER_SETTINGS_PATH } from '../../../shared/paths.js';
import { getCredential } from '../../../shared/EnvManager.js';
import { logger } from '../../../utils/logger.js';
import { resolveQwenApiKey, resolveQwenEndpoint, resolveQwenModel } from '../QwenProvider.js';
import { resolveDeepSeekApiKey, resolveDeepSeekEndpoint, resolveDeepSeekModel } from '../DeepSeekProvider.js';
import { isHttpEndpoint } from '../provider-endpoint.js';

export type ReportProviderId = 'claude' | 'qwen' | 'gemini' | 'openrouter' | 'deepseek';

export interface ReportProviderConfig {
  provider: ReportProviderId;
  apiKey: string;
  model: string;
  endpoint: string;
}

export interface ReportPromptInput {
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}

const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const OPENROUTER_COMPLETIONS_URL = 'https://openrouter.ai/api/v1/chat/completions';
const GEMINI_GENERATE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const DASHSCOPE_COMPLETIONS_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const DEEPSEEK_COMPLETIONS_URL = 'https://api.deepseek.com/chat/completions';

/** X-027: 自定义端点告警——可配置端点属设计取舍(本地 vLLM/Ollama 场景),
 *  无法用地址白名单解决 SSRF 类风险, 改为端点非内置默认值时显式 WARN,
 *  提醒 key 将发往该主机(不打印 key)。 */
function warnOnCustomEndpoint(provider: 'qwen' | 'deepseek', endpoint: string, defaultEndpoint: string): void {
  if (endpoint === defaultEndpoint) return;
  let host = endpoint;
  try { host = new URL(endpoint).host; } catch { /* 保持原样打印 */ }
  logger.warn('WORKER', `custom ${provider} report endpoint configured — API key will be sent to ${host}`, {});
}
const AI_TIMEOUT_MS = 90000;
// OpenAI 兼容厂商与 Gemini 的输出上限(周报正文长,放开到 64K)。
const MAX_OUTPUT_TOKENS = 65536;
// Anthropic 各代模型的通用安全输出上限(部分模型高于此值)。
const CLAUDE_MAX_OUTPUT_TOKENS = 16384;

/**
 * 解析报表 AI provider 配置。返回 null 表示 AI 段禁用:
 * REPORT_PROVIDER 为空 → 静默禁用; 非空非法值 → WARN + 禁用;
 * 所选厂商 key 缺失 → 禁用。
 */
export function resolveReportProviderConfig(settings?: SettingsDefaults): ReportProviderConfig | null {
  const s = settings ?? SettingsDefaultsManager.loadFromFile(USER_SETTINGS_PATH);
  const raw = (s.CLAUDE_MEM_REPORT_PROVIDER ?? '').trim().toLowerCase();
  switch (raw) {
    case 'qwen': {
      const apiKey = resolveQwenApiKey(s);
      if (!apiKey) return null;
      const endpoint = resolveQwenEndpoint(s);
      // X-035: 非 http(s) 端点直接禁用 AI 段并告警(保持本函数"失败即 null"契约)。
      if (!isHttpEndpoint(endpoint)) {
        logger.warn('WORKER', `Invalid CLAUDE_MEM_QWEN_URL (not http(s)) — report AI section disabled`, {});
        return null;
      }
      warnOnCustomEndpoint('qwen', endpoint, DASHSCOPE_COMPLETIONS_URL);
      return { provider: 'qwen', apiKey, model: resolveQwenModel(s), endpoint };
    }
    case 'deepseek': {
      const apiKey = resolveDeepSeekApiKey(s);
      if (!apiKey) return null;
      const endpoint = resolveDeepSeekEndpoint(s);
      // X-035: 非 http(s) 端点直接禁用 AI 段并告警(保持本函数"失败即 null"契约)。
      if (!isHttpEndpoint(endpoint)) {
        logger.warn('WORKER', `Invalid CLAUDE_MEM_DEEPSEEK_URL (not http(s)) — report AI section disabled`, {});
        return null;
      }
      warnOnCustomEndpoint('deepseek', endpoint, DEEPSEEK_COMPLETIONS_URL);
      return { provider: 'deepseek', apiKey, model: resolveDeepSeekModel(s), endpoint };
    }
    case 'openrouter': {
      const apiKey = (process.env.OPENROUTER_API_KEY ?? '').trim()
        || (s.CLAUDE_MEM_OPENROUTER_API_KEY ?? '').trim()
        || getCredential('OPENROUTER_API_KEY') || '';
      if (!apiKey) return null;
      return {
        provider: 'openrouter',
        apiKey,
        model: (s.CLAUDE_MEM_OPENROUTER_MODEL ?? '').trim() || 'xiaomi/mimo-v2-flash:free',
        endpoint: OPENROUTER_COMPLETIONS_URL,
      };
    }
    case 'gemini': {
      const apiKey = (process.env.GEMINI_API_KEY ?? '').trim()
        || (s.CLAUDE_MEM_GEMINI_API_KEY ?? '').trim()
        || getCredential('GEMINI_API_KEY') || '';
      if (!apiKey) return null;
      return {
        provider: 'gemini',
        apiKey,
        model: (s.CLAUDE_MEM_GEMINI_MODEL ?? '').trim() || 'gemini-2.5-flash-lite',
        endpoint: GEMINI_GENERATE_URL,
      };
    }
    case 'claude': {
      // X-032: 认 CLAUDE_MEM_ANTHROPIC_API_KEY 别名, 与 server-beta claude 分支对齐。
      const apiKey = (process.env.ANTHROPIC_API_KEY ?? '').trim()
        || (process.env.CLAUDE_MEM_ANTHROPIC_API_KEY ?? '').trim()
        || getCredential('ANTHROPIC_API_KEY') || '';
      if (!apiKey) return null;
      return {
        provider: 'claude',
        apiKey,
        model: (s.CLAUDE_MEM_MODEL ?? '').trim() || 'claude-haiku-4-5-20251001',
        endpoint: ANTHROPIC_MESSAGES_URL,
      };
    }
    default:
      if (raw !== '') {
        logger.warn('WORKER', `Unknown CLAUDE_MEM_REPORT_PROVIDER "${raw}" — report AI section disabled`, {});
      }
      return null;
  }
}

/** 单次报表提炼调用; 失败/超时返回 null (调用方降级)。 */
export async function callReportProvider(
  config: ReportProviderConfig,
  input: ReportPromptInput,
): Promise<string | null> {
  try {
    if (config.provider === 'claude') return await callAnthropic(config, input);
    if (config.provider === 'gemini') return await callGemini(config, input);
    return await callOpenAiCompatible(config, input);
  } catch (err) {
    logger.warn('WORKER', `${config.provider} report call failed`, { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/** OpenAI 兼容协议 (qwen / deepseek / openrouter)。 */
async function callOpenAiCompatible(
  config: ReportProviderConfig,
  input: ReportPromptInput,
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const resp = await fetch(config.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'system', content: input.system }, ...input.messages],
        temperature: 0.4,
        max_tokens: MAX_OUTPUT_TOKENS,
      }),
      signal: controller.signal,
      // X-035: 不自动跟随重定向, 防 302 把带凭据的请求弹到任意目标。
      redirect: 'manual',
    });
    if (!resp.ok) {
      logger.warn('WORKER', `${config.provider} non-2xx`, { status: resp.status });
      return null;
    }
    const data = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content?.trim();
    return content && content.length > 0 ? content : null;
  } catch (err) {
    logger.warn('WORKER', `${config.provider} call failed`, { error: err instanceof Error ? err.message : String(err) });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Anthropic Messages 协议 (claude)。 */
async function callAnthropic(
  config: ReportProviderConfig,
  input: ReportPromptInput,
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const resp = await fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: CLAUDE_MAX_OUTPUT_TOKENS,
        // X-032: 显式 0.4 与 OpenAI 兼容/Gemini 协议对齐, 降低默认 1.0 的随机性。
        temperature: 0.4,
        system: input.system,
        messages: input.messages,
      }),
      signal: controller.signal,
      // X-035: 不自动跟随重定向, 防 302 把带凭据的请求弹到任意目标。
      redirect: 'manual',
    });
    if (!resp.ok) {
      logger.warn('WORKER', `claude non-2xx`, { status: resp.status });
      return null;
    }
    const data = await resp.json() as { content?: Array<{ type?: string; text?: string }> };
    const content = (data.content ?? [])
      .filter(b => b.type === 'text')
      .map(b => b.text ?? '')
      .join('')
      .trim();
    return content.length > 0 ? content : null;
  } catch (err) {
    logger.warn('WORKER', 'claude call failed', { error: err instanceof Error ? err.message : String(err) });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Gemini generateContent 协议。X-027: key 走 x-goog-api-key 请求头,
 *  不拼 URL query(避免密钥进入代理/访问日志)。 */
async function callGemini(
  config: ReportProviderConfig,
  input: ReportPromptInput,
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const url = `${config.endpoint}/${config.model}:generateContent`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: input.system }] },
        contents: input.messages.map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
        generationConfig: { temperature: 0.4, maxOutputTokens: MAX_OUTPUT_TOKENS },
      }),
      signal: controller.signal,
      // X-035: 不自动跟随重定向, 防 302 把带凭据的请求弹到任意目标。
      redirect: 'manual',
    });
    if (!resp.ok) {
      logger.warn('WORKER', `gemini non-2xx`, { status: resp.status });
      return null;
    }
    const data = await resp.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = (data.candidates ?? [])
      .flatMap(c => c.content?.parts ?? [])
      .map(p => p.text ?? '')
      .join('')
      .trim();
    return text.length > 0 ? text : null;
  } catch (err) {
    logger.warn('WORKER', 'gemini call failed', { error: err instanceof Error ? err.message : String(err) });
    return null;
  } finally {
    clearTimeout(timer);
  }
}
