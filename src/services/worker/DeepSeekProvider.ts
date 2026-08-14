
import { DatabaseManager } from './DatabaseManager.js';
import { SessionManager } from './SessionManager.js';
import { logger } from '../../utils/logger.js';
import { buildInitPrompt, buildObservationPrompt, buildSummaryPrompt, buildContinuationPrompt } from '../../sdk/prompts.js';
import { SettingsDefaultsManager, type SettingsDefaults } from '../../shared/SettingsDefaultsManager.js';
import { getCredential } from '../../shared/EnvManager.js';
import { USER_SETTINGS_PATH } from '../../shared/paths.js';
import type { ActiveSession, ConversationMessage } from '../worker-types.js';
import { ModeManager } from '../domain/ModeManager.js';
import type { ModeConfig } from '../domain/types.js';
import {
  processAgentResponse,
  isAbortError,
  type WorkerRef
} from './agents/index.js';
import { ClassifiedProviderError } from './provider-errors.js';
import { withRetry } from './retry.js';
import { assertHttpEndpoint } from './provider-endpoint.js';

// ---------------------------------------------------------------------------
// DeepSeekProvider — 用 DeepSeek 驱动 observation / summary 生成。
// 结构与 QwenProvider 一致（REST + prompt 构建 + XML 解析 + 结果存储管线）。
// DeepSeek API 为 OpenAI 兼容协议 (chat/completions)：
//   凭证  CLAUDE_MEM_DEEPSEEK_API_KEY    (env > settings.json > ~/.claude-mem/.env)
//   端点  CLAUDE_MEM_DEEPSEEK_URL        (非空 = 调用方自担责保证 OpenAI 兼容；
//                                        空 = https://api.deepseek.com/chat/completions)
//   模型  CLAUDE_MEM_DEEPSEEK_MODEL      (空 = deepseek-v4-flash；
//                                        deepseek-chat/deepseek-reasoner 别名
//                                        已于 2026-07-24 停用)
// ---------------------------------------------------------------------------

export const DEEPSEEK_COMPLETIONS_URL = 'https://api.deepseek.com/chat/completions';
const DEFAULT_MODEL = 'deepseek-v4-flash';
const AI_TIMEOUT_MS = 90000;

/** OpenAI chat/completions 请求体 */
interface DeepSeekRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature: number;
  max_tokens: number;
}

/** OpenAI chat/completions 响应体 */
interface DeepSeekResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { total_tokens?: number };
}

/** 将 conversationHistory 转为 OpenAI messages 格式 */
function toOpenAiMessages(history: ConversationMessage[]): Array<{ role: string; content: string }> {
  return history.map(m => {
    const role = m.role === 'assistant' ? 'assistant' : 'user';
    return { role, content: m.content };
  });
}

/** 从 body 文本中提取 DeepSeek 错误信息 */
function parseDeepSeekError(body: string): string {
  try {
    const j = JSON.parse(body);
    return j.message || j.error?.message || body.substring(0, 200);
  } catch {
    return body.substring(0, 200);
  }
}

/** 将 DeepSeek fetch 失败归类为 ClassifiedProviderError */
export function classifyDeepSeekError(input: {
  status?: number;
  bodyText?: string;
  cause: unknown;
}): ClassifiedProviderError {
  const status = input.status;
  const body = input.bodyText ?? '';

  // X-034: fetch 中止(cause=AbortError)标 unrecoverable——不重试已中止的请求,
  // 避免会话中止时连发 3 次注定失败的 fetch。
  if (input.cause instanceof Error && input.cause.name === 'AbortError') {
    return new ClassifiedProviderError(
      'DeepSeek request aborted',
      { kind: 'unrecoverable', cause: input.cause },
    );
  }

  if (status === 401 || status === 403) {
    return new ClassifiedProviderError(
      `DeepSeek auth error (status ${status}): ${parseDeepSeekError(body)}`,
      { kind: 'auth_invalid', cause: input.cause },
    );
  }

  if (status === 429) {
    return new ClassifiedProviderError(
      'DeepSeek rate limit (429)',
      { kind: 'rate_limit', cause: input.cause },
    );
  }

  if (status === 400 || status === 404) {
    return new ClassifiedProviderError(
      `DeepSeek bad request: ${parseDeepSeekError(body)}`,
      { kind: 'unrecoverable', cause: input.cause },
    );
  }

  if (status !== undefined && status >= 500 && status < 600) {
    return new ClassifiedProviderError(
      `DeepSeek upstream error (status ${status})`,
      { kind: 'transient', cause: input.cause },
    );
  }

  return new ClassifiedProviderError(
    `DeepSeek API error: ${status ?? 'network'} - ${parseDeepSeekError(body)}`,
    { kind: status === undefined ? 'transient' : 'unrecoverable', cause: input.cause },
  );
}

export class DeepSeekProvider {
  private dbManager: DatabaseManager;
  private sessionManager: SessionManager;

  constructor(dbManager: DatabaseManager, sessionManager: SessionManager) {
    this.dbManager = dbManager;
    this.sessionManager = sessionManager;
  }

  // ── 公开入口 ──────────────────────────────────────────────────────────

  async startSession(session: ActiveSession, worker?: WorkerRef): Promise<void> {
    const { apiKey, model, endpoint } = this.getDeepSeekConfig();

    if (!apiKey) {
      throw new Error('DeepSeek API key not configured. Set CLAUDE_MEM_DEEPSEEK_API_KEY in settings or environment.');
    }

    // 合成 memorySessionId (与 Gemini/Qwen 模式一致)
    if (!session.memorySessionId) {
      const syntheticMemorySessionId = `deepseek-${session.contentSessionId}-${Date.now()}`;
      session.memorySessionId = syntheticMemorySessionId;
      this.dbManager.getSessionStore().updateMemorySessionId(session.sessionDbId, syntheticMemorySessionId);
      logger.info('SESSION', `MEMORY_ID_GENERATED | sessionDbId=${session.sessionDbId} | provider=DeepSeek`);
    }

    const mode = ModeManager.getInstance().getActiveMode();
    const initPrompt = session.lastPromptNumber === 1
      ? buildInitPrompt(session.project, session.contentSessionId, session.userPrompt, mode)
      : buildContinuationPrompt(session.userPrompt, session.lastPromptNumber, session.contentSessionId, mode);

    session.conversationHistory.push({ role: 'user', content: initPrompt });
    let initResponse: { content: string; tokensUsed?: number };
    try {
      initResponse = await this.queryDeepSeek(session.conversationHistory, apiKey, model, endpoint);
    } catch (error: unknown) {
      logger.error('SDK', 'DeepSeek init query failed', { sessionId: session.sessionDbId, model }, error instanceof Error ? error : new Error(String(error)));
      return this.handleDeepSeekError(error, session, worker);
    }

    if (initResponse.content) {
      session.conversationHistory.push({ role: 'assistant', content: initResponse.content });
      const tokensUsed = initResponse.tokensUsed || 0;
      session.cumulativeInputTokens += Math.floor(tokensUsed * 0.7);
      session.cumulativeOutputTokens += Math.floor(tokensUsed * 0.3);
      await processAgentResponse(initResponse.content, session, this.dbManager, this.sessionManager, worker, tokensUsed, null, 'DeepSeek', undefined, model);
    } else {
      logger.error('SDK', 'Empty DeepSeek init response', { sessionId: session.sessionDbId, model });
    }

    try {
      await this.processMessageLoop(session, worker, apiKey, model, endpoint, mode);
    } catch (error: unknown) {
      logger.error('SDK', 'DeepSeek message loop failed', { sessionId: session.sessionDbId, model }, error instanceof Error ? error : new Error(String(error)));
      return this.handleDeepSeekError(error, session, worker);
    }

    const sessionDuration = Date.now() - session.startTime;
    logger.success('SDK', 'DeepSeek agent completed', {
      sessionId: session.sessionDbId,
      duration: `${(sessionDuration / 1000).toFixed(1)}s`,
      historyLength: session.conversationHistory.length
    });
  }

  // ── 消息循环 ──────────────────────────────────────────────────────────

  private async processMessageLoop(
    session: ActiveSession,
    worker: WorkerRef | undefined,
    apiKey: string,
    model: string,
    endpoint: string,
    mode: ModeConfig
  ): Promise<void> {
    let lastCwd: string | undefined;

    for await (const message of this.sessionManager.getMessageIterator(session.sessionDbId)) {
      session.pendingAgentId = message.agentId ?? null;
      session.pendingAgentType = message.agentType ?? null;

      if (message.cwd) {
        lastCwd = message.cwd;
      }
      const originalTimestamp = session.earliestPendingTimestamp;

      if (message.type === 'observation') {
        await this.processObservationMessage(session, message, worker, apiKey, model, endpoint, originalTimestamp, lastCwd);
      } else if (message.type === 'summarize') {
        await this.processSummaryMessage(session, message, worker, apiKey, model, endpoint, mode, originalTimestamp, lastCwd);
      }
    }
  }

  private async processObservationMessage(
    session: ActiveSession,
    message: { type: string; prompt_number?: number; tool_name?: string; tool_input?: unknown; tool_response?: unknown; cwd?: string },
    worker: WorkerRef | undefined,
    apiKey: string,
    model: string,
    endpoint: string,
    originalTimestamp: number | null,
    lastCwd: string | undefined
  ): Promise<void> {
    if (message.prompt_number !== undefined) {
      session.lastPromptNumber = message.prompt_number;
    }

    if (!session.memorySessionId) {
      throw new Error('Cannot process observations: memorySessionId not yet captured.');
    }

    const obsPrompt = buildObservationPrompt({
      id: 0,
      tool_name: message.tool_name!,
      tool_input: JSON.stringify(message.tool_input),
      tool_output: JSON.stringify(message.tool_response),
      created_at_epoch: originalTimestamp ?? Date.now(),
      cwd: message.cwd
    });

    session.conversationHistory.push({ role: 'user', content: obsPrompt });
    const obsResponse = await this.queryDeepSeek(session.conversationHistory, apiKey, model, endpoint);

    let tokensUsed = 0;
    if (obsResponse.content) {
      session.conversationHistory.push({ role: 'assistant', content: obsResponse.content });
      tokensUsed = obsResponse.tokensUsed || 0;
      session.cumulativeInputTokens += Math.floor(tokensUsed * 0.7);
      session.cumulativeOutputTokens += Math.floor(tokensUsed * 0.3);
    }

    if (obsResponse.content) {
      await processAgentResponse(obsResponse.content, session, this.dbManager, this.sessionManager, worker, tokensUsed, originalTimestamp, 'DeepSeek', lastCwd, model);
    } else {
      logger.warn('SDK', 'Empty DeepSeek observation response, leaving queue intact', {
        sessionId: session.sessionDbId
      });
    }
  }

  private async processSummaryMessage(
    session: ActiveSession,
    message: { type: string; last_assistant_message?: string },
    worker: WorkerRef | undefined,
    apiKey: string,
    model: string,
    endpoint: string,
    mode: ModeConfig,
    originalTimestamp: number | null,
    lastCwd: string | undefined
  ): Promise<void> {
    if (!session.memorySessionId) {
      throw new Error('Cannot process summary: memorySessionId not yet captured.');
    }

    const summaryPrompt = buildSummaryPrompt({
      id: session.sessionDbId,
      memory_session_id: session.memorySessionId,
      project: session.project,
      user_prompt: session.userPrompt,
      last_assistant_message: message.last_assistant_message || ''
    }, mode);

    session.conversationHistory.push({ role: 'user', content: summaryPrompt });
    const summaryResponse = await this.queryDeepSeek(session.conversationHistory, apiKey, model, endpoint);

    let tokensUsed = 0;
    if (summaryResponse.content) {
      session.conversationHistory.push({ role: 'assistant', content: summaryResponse.content });
      tokensUsed = summaryResponse.tokensUsed || 0;
      session.cumulativeInputTokens += Math.floor(tokensUsed * 0.7);
      session.cumulativeOutputTokens += Math.floor(tokensUsed * 0.3);
    }

    if (summaryResponse.content) {
      await processAgentResponse(summaryResponse.content, session, this.dbManager, this.sessionManager, worker, tokensUsed, originalTimestamp, 'DeepSeek', lastCwd, model);
    } else {
      logger.warn('SDK', 'Empty DeepSeek summary response, leaving queue intact', {
        sessionId: session.sessionDbId
      });
    }
  }

  // ── API 调用 ──────────────────────────────────────────────────────────

  private async queryDeepSeek(
    history: ConversationMessage[],
    apiKey: string,
    model: string,
    endpoint: string
  ): Promise<{ content: string; tokensUsed?: number }> {
    const messages = toOpenAiMessages(history);
    const totalChars = history.reduce((sum, m) => sum + m.content.length, 0);

    logger.debug('SDK', `Querying DeepSeek (${model})`, {
      turns: history.length,
      totalChars,
      endpoint
    });

    // X-030: withRetry 每次尝试都传非空 attemptSignal 并自带 perAttemptTimeoutMs
    // 超时; 原本地 AbortController + 90s 定时器因 `attemptSignal ?? controller.signal`
    // 恒取前者而成为死代码(实际超时是 withRetry 默认 30s), 与 AI_TIMEOUT_MS 意图不符。
    const data = await withRetry<DeepSeekResponse>(async (attemptSignal) => {
      let response: Response;
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages,
            temperature: 0.3,
            max_tokens: 4096,
          } satisfies DeepSeekRequest),
          signal: attemptSignal,
          // X-035: 不自动跟随重定向, 防止自定义端点用 302 把带 Bearer 凭据的
          // 请求弹到任意目标(3xx 由 classifyDeepSeekError 归 unrecoverable)。
          redirect: 'manual',
        });
      } catch (networkError: unknown) {
        throw classifyDeepSeekError({ cause: networkError });
      }

      if (!response.ok) {
        const errorBody = await response.text();
        throw classifyDeepSeekError({ status: response.status, bodyText: errorBody, cause: new Error(`DeepSeek API ${response.status}`) });
      }

      return await response.json() as DeepSeekResponse;
    }, { label: `DeepSeek ${model}`, perAttemptTimeoutMs: AI_TIMEOUT_MS });

    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      logger.error('SDK', 'Empty response from DeepSeek');
      return { content: '' };
    }

    return { content, tokensUsed: data.usage?.total_tokens };
  }

  // ── 配置 ──────────────────────────────────────────────────────────────

  private getDeepSeekConfig(): { apiKey: string; model: string; endpoint: string } {
    const settings = SettingsDefaultsManager.loadFromFile(USER_SETTINGS_PATH);
    const endpoint = resolveDeepSeekEndpoint(settings);
    // X-035: 形状校验——非 http(s) 端点启动期快速失败, 而非 fetch 时报 opaque 网络错。
    assertHttpEndpoint(endpoint, 'CLAUDE_MEM_DEEPSEEK_URL');
    return {
      apiKey: resolveDeepSeekApiKey(settings),
      model: resolveDeepSeekModel(settings),
      endpoint,
    };
  }

  // ── 错误处理 ──────────────────────────────────────────────────────────

  private handleDeepSeekError(error: unknown, session: ActiveSession, _worker?: WorkerRef): never {
    if (isAbortError(error)) {
      logger.warn('SDK', 'DeepSeek agent aborted', { sessionId: session.sessionDbId });
      throw error;
    }

    logger.failure('SDK', 'DeepSeek agent error', { sessionDbId: session.sessionDbId }, error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}

/** DeepSeek 凭证解析 (X-016)：CLAUDE_MEM_DEEPSEEK_API_KEY 三级回脱
 *  env > settings.json > ~/.claude-mem/.env（经 getCredential）。 */
export function resolveDeepSeekApiKey(settings: SettingsDefaults): string {
  return (process.env.CLAUDE_MEM_DEEPSEEK_API_KEY ?? '').trim()
    || (settings.CLAUDE_MEM_DEEPSEEK_API_KEY ?? '').trim()
    || getCredential('CLAUDE_MEM_DEEPSEEK_API_KEY')
    || '';
}

/** DeepSeek 端点解析 (X-016/X-019)：CLAUDE_MEM_DEEPSEEK_URL 支持两种形态——
 *  完整 completions 路径原样采用；base URL（官方默认值 https://api.deepseek.com
 *  即此形态）自动补全 /chat/completions。空回落官方 completions 端点。
 *  调用方自担责保证端点 OpenAI 兼容。 */
export function resolveDeepSeekEndpoint(settings: SettingsDefaults): string {
  const configured = (settings.CLAUDE_MEM_DEEPSEEK_URL ?? '').trim();
  if (!configured) return DEEPSEEK_COMPLETIONS_URL;
  // X-030: 先归一化尾斜杠再判断, 避免 ".../chat/completions/" 被重复补全。
  const normalized = configured.replace(/\/+$/, '');
  if (/\/chat\/completions$/.test(normalized)) return normalized;
  return `${normalized}/chat/completions`;
}

/** DeepSeek 模型解析 (X-016)：任意模型名直接采用，空回落 DEFAULT_MODEL。 */
export function resolveDeepSeekModel(settings: SettingsDefaults): string {
  return (settings.CLAUDE_MEM_DEEPSEEK_MODEL ?? '').trim() || DEFAULT_MODEL;
}

/** 检查 DeepSeek 是否可用 (有 key 即可)。 */
export function isDeepSeekAvailable(): boolean {
  // env 优先
  if ((process.env.CLAUDE_MEM_DEEPSEEK_API_KEY ?? '').trim()) return true;

  try {
    const settings = SettingsDefaultsManager.loadFromFile(USER_SETTINGS_PATH);
    if ((settings.CLAUDE_MEM_DEEPSEEK_API_KEY ?? '').trim()) return true;
  } catch {
    // settings 文件不可读时回退到凭据存储，而非直接判不可用
  }

  return !!getCredential('CLAUDE_MEM_DEEPSEEK_API_KEY');
}

/** 检查 DeepSeek 是否被选为 Provider。 */
export function isDeepSeekSelected(): boolean {
  try {
    const settings = SettingsDefaultsManager.loadFromFile(USER_SETTINGS_PATH);
    return (settings.CLAUDE_MEM_PROVIDER ?? '').trim().toLowerCase() === 'deepseek';
  } catch {
    return false;
  }
}
