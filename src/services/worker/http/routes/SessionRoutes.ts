
import express, { Request, Response } from 'express';
import { z } from 'zod';
import { ingestObservation } from '../shared.js';
import { validateBody } from '../middleware/validateBody.js';
import { logger } from '../../../../utils/logger.js';
import { stripMemoryTagsFromPrompt, isInternalProtocolPayload } from '../../../../utils/tag-stripping.js';
import { SessionManager } from '../../SessionManager.js';
import { DatabaseManager } from '../../DatabaseManager.js';
import { ClaudeProvider } from '../../ClaudeProvider.js';
import { GeminiProvider } from '../../GeminiProvider.js';
import { OpenRouterProvider } from '../../OpenRouterProvider.js';
import { QwenProvider } from '../../QwenProvider.js';
import { DeepSeekProvider } from '../../DeepSeekProvider.js';
import { resolveProviderId, collectProviderFlags, type ProviderId } from '../../provider-selection.js';
import type { WorkerService } from '../../../worker-service.js';
import { BaseRouteHandler } from '../BaseRouteHandler.js';
import { SessionEventBroadcaster } from '../../events/SessionEventBroadcaster.js';
import { PrivacyCheckValidator } from '../../validation/PrivacyCheckValidator.js';
import { SettingsDefaultsManager } from '../../../../shared/SettingsDefaultsManager.js';
import { USER_SETTINGS_PATH } from '../../../../shared/paths.js';
import { getProjectContext } from '../../../../utils/project-name.js';
import { normalizePlatformSource } from '../../../../shared/platform-source.js';
import { handleGeneratorExit } from '../../session/GeneratorExitHandler.js';
import { SessionCompletionHandler } from '../../session/SessionCompletionHandler.js';
import { getUptimeSeconds } from '../../../../shared/uptime.js';
import { USER_PROMPT_DEDUPE_WINDOW_MS } from '../../../../shared/user-prompts.js';

const MAX_USER_PROMPT_BYTES = 256 * 1024;

export class SessionRoutes extends BaseRouteHandler {
  constructor(
    private sessionManager: SessionManager,
    private dbManager: DatabaseManager,
    private sdkAgent: ClaudeProvider,
    private geminiAgent: GeminiProvider,
    private openRouterAgent: OpenRouterProvider,
    private qwenAgent: QwenProvider,
    private deepSeekAgent: DeepSeekProvider,
    private eventBroadcaster: SessionEventBroadcaster,
    private workerService: WorkerService,
    private completionHandler: SessionCompletionHandler,
  ) {
    super();
  }

  // X-017: provider 选择唯一权威在 provider-selection.ts——
  // 严格按 CLAUDE_MEM_PROVIDER (selected && available), 无"有 key 自动抢跑"兜底,
  // 选中但 key 缺失时回落 claude。原 getActiveAgent 为死代码, 一并移除。
  private getSelectedProvider(): ProviderId {
    return resolveProviderId(collectProviderFlags());
  }

  public async ensureGeneratorRunning(sessionDbId: number, source: string): Promise<void> {
    const session = this.sessionManager.getSession(sessionDbId);
    if (!session) return;

    const selectedProvider = this.getSelectedProvider();

    if (!session.generatorPromise) {
      await this.applyTierRouting(session);
      await this.startGeneratorWithProvider(session, selectedProvider, source);
      return;
    }

    if (session.currentProvider && session.currentProvider !== selectedProvider) {
      logger.info('SESSION', `Provider changed, will switch after current generator finishes`, {
        sessionId: sessionDbId,
        currentProvider: session.currentProvider,
        selectedProvider,
        historyLength: session.conversationHistory.length
      });
      // Let current generator finish naturally, next one will use new provider
      // The shared conversationHistory ensures context is preserved
    }
  }

  private async startGeneratorWithProvider(
    session: ReturnType<typeof this.sessionManager.getSession>,
    provider: ProviderId,
    source: string
  ): Promise<void> {
    if (!session) return;

    const dbSession = this.dbManager.getSessionById(session.sessionDbId);
    if (dbSession.status !== 'active') {
      logger.info('SESSION', 'Skipping generator recovery for non-active session', {
        sessionId: session.sessionDbId,
        status: dbSession.status,
      });
      return;
    }

    if (session.abortController.signal.aborted) {
      logger.debug('SESSION', 'Resetting aborted AbortController before starting generator', {
        sessionId: session.sessionDbId
      });
      session.abortController = new AbortController();
    }

    const agent = provider === 'qwen' ? this.qwenAgent
      : provider === 'deepseek' ? this.deepSeekAgent
      : provider === 'openrouter' ? this.openRouterAgent
      : provider === 'gemini' ? this.geminiAgent
      : this.sdkAgent;
    const agentName = provider === 'qwen' ? 'Qwen'
      : provider === 'deepseek' ? 'DeepSeek'
      : provider === 'openrouter' ? 'OpenRouter'
      : provider === 'gemini' ? 'Gemini'
      : 'Claude SDK';

    const pendingStore = this.sessionManager.getPendingMessageStore();
    const actualQueueDepth = await pendingStore.getPendingCount(session.sessionDbId);

    if (session.recoveryPending || actualQueueDepth > 0) {
      const recovery = await this.sessionManager.prepareActiveSessionRecovery(session.sessionDbId);
      session.recoveryPending = false;
      logger.info('SESSION', 'Bounded active-session recovery prepared', {
        sessionId: session.sessionDbId,
        eligibleCount: recovery.eligibleCount,
        discardedCount: recovery.discardedCount,
        skippedBecauseOverLimit: recovery.skippedBecauseOverLimit,
      });
      if (recovery.skippedBecauseOverLimit) {
        return;
      }
    }

    logger.info('SESSION', `Generator auto-starting (${source}) using ${agentName}`, {
      sessionId: session.sessionDbId,
      queueDepth: actualQueueDepth,
      historyLength: session.conversationHistory.length
    });

    session.currentProvider = provider;
    session.lastGeneratorActivity = Date.now();

    const myController = session.abortController;

    session.generatorPromise = agent.startSession(session, this.workerService)
      .catch(async error => {
        if (myController.signal.aborted) {
          logger.debug('HTTP', 'Generator catch: ignoring error after abort', { sessionId: session.sessionDbId });
          return;
        }

        const errorMsg = error instanceof Error ? error.message : String(error);

        if (errorMsg.includes('code 143') || errorMsg.includes('signal SIGTERM')) {
          logger.warn('SESSION', 'Generator killed by external signal — aborting session to prevent respawn', {
            sessionId: session.sessionDbId,
            provider,
            error: errorMsg
          });
          myController.abort();
          return;
        }

        logger.error('SESSION', `Generator failed`, {
          sessionId: session.sessionDbId,
          provider: provider,
          error: errorMsg
        }, error);

        session.recoveryPending = true;
        session.abortReason = 'provider-unavailable';

        try {
          const reset = await this.sessionManager.resetProcessingToPending(session.sessionDbId);
          if (reset > 0) {
            logger.warn('SESSION', `Reset processing messages after generator error`, {
              sessionId: session.sessionDbId,
              reset
            });
          }
        } catch (dbError) {
          const normalizedDbError = dbError instanceof Error ? dbError : new Error(String(dbError));
          logger.error('HTTP', 'Failed to reset processing messages after generator error', {
            sessionId: session.sessionDbId
          }, normalizedDbError);
        }
      })
      .finally(async () => {
        const reason = session.abortReason ?? null;
        session.abortReason = null;  // consume the reason
        await handleGeneratorExit(session, reason, {
          sessionManager: this.sessionManager,
          completionHandler: this.completionHandler,
          restartGenerator: (s, source) => {
            void (async () => {
              await this.applyTierRouting(s);
              await this.startGeneratorWithProvider(s, this.getSelectedProvider(), source);
            })();
          },
        });
      });
  }

  setupRoutes(app: express.Application): void {
    app.post(
      '/api/sessions/init',
      validateBody(SessionRoutes.sessionInitByClaudeIdSchema),
      this.handleSessionInitByClaudeId.bind(this)
    );
    app.post(
      '/api/sessions/observations',
      validateBody(SessionRoutes.observationsByClaudeIdSchema),
      this.handleObservationsByClaudeId.bind(this)
    );
    app.post(
      '/api/sessions/summarize',
      validateBody(SessionRoutes.summarizeByClaudeIdSchema),
      this.handleSummarizeByClaudeId.bind(this)
    );
    app.get('/api/sessions/status', this.handleStatusByClaudeId.bind(this));
  }

  private static readonly sessionInitByClaudeIdSchema = z.object({
    contentSessionId: z.string().min(1),
    project: z.string().optional(),
    prompt: z.string().optional(),
    platformSource: z.string().optional(),
    customTitle: z.string().optional(),
  }).passthrough();

  private static readonly observationsByClaudeIdSchema = z.object({
    contentSessionId: z.string().min(1),
    tool_name: z.string().min(1),
    tool_input: z.unknown().optional(),
    tool_response: z.unknown().optional(),
    cwd: z.string().optional(),
    agentId: z.string().optional(),
    agentType: z.string().optional(),
    platformSource: z.string().optional(),
    tool_use_id: z.string().optional(),
    toolUseId: z.string().optional(),
  }).passthrough();

  private static readonly summarizeByClaudeIdSchema = z.object({
    contentSessionId: z.string().min(1),
    last_assistant_message: z.string().optional(),
    agentId: z.string().optional(),
    platformSource: z.string().optional(),
    project: z.string().optional(),
    user_prompt: z.string().optional(),
  }).passthrough();

  private handleObservationsByClaudeId = this.wrapHandler(async (req: Request, res: Response): Promise<void> => {
    const {
      contentSessionId,
      tool_name,
      tool_input,
      tool_response,
      cwd,
      platformSource,
      agentId,
      agentType,
      tool_use_id,
      toolUseId,
    } = req.body;

    const result = await ingestObservation({
      contentSessionId,
      toolName: tool_name,
      toolInput: tool_input,
      toolResponse: tool_response,
      cwd,
      platformSource,
      agentId,
      agentType,
      toolUseId: typeof tool_use_id === 'string' ? tool_use_id : (typeof toolUseId === 'string' ? toolUseId : undefined),
    });

    if (!result.ok) {
      res.status(result.status ?? 500).json({ stored: false, reason: result.reason });
      return;
    }

    if ('status' in result && result.status === 'skipped') {
      res.json({ status: 'skipped', reason: result.reason });
      return;
    }

    res.json({ status: 'queued' });
  });

  private handleSummarizeByClaudeId = this.wrapHandler(async (req: Request, res: Response): Promise<void> => {
    const { contentSessionId, last_assistant_message, agentId } = req.body;
    const platformSource = normalizePlatformSource(req.body.platformSource);
    // 远程客户端通过 hook 上报的 project 与 user_prompt,用于补全会话上下文。
    const project = typeof req.body.project === 'string' ? req.body.project : '';
    const hookUserPrompt = typeof req.body.user_prompt === 'string' ? req.body.user_prompt : '';

    if (agentId) {
      res.json({ status: 'skipped', reason: 'subagent_context' });
      return;
    }

    const store = this.dbManager.getSessionStore();

    // 创建/更新会话时带入 project 和 hookUserPrompt,确保 generator 有足够上下文生成总结。
    const sessionDbId = store.createSDKSession(contentSessionId, project, hookUserPrompt, undefined, platformSource);
    const promptNumber = store.getPromptNumberFromUserPrompts(contentSessionId);

    const userPrompt = PrivacyCheckValidator.checkUserPromptPrivacy(
      store,
      contentSessionId,
      promptNumber,
      'summarize',
      sessionDbId
    );
    if (!userPrompt) {
      res.json({ status: 'skipped', reason: 'private' });
      return;
    }

    // ── 完成时间写入(按来源优先级) ──────────────────────────────────
    // 1. transcript 末条 assistant 墙钟时间 → 最高可信度,无条件覆盖
    // 2. observation 截断(15min) → 兜底,仅填 NULL
    // 3. Date.now() → 最差,仅填 NULL
    const lastPromptNumber = store.getPromptNumberFromUserPrompts(contentSessionId);
    if (lastPromptNumber > 0) {
      const transcriptCompletedAt = typeof req.body.transcript_completed_at_epoch === 'number'
        ? req.body.transcript_completed_at_epoch : null;

      if (transcriptCompletedAt && Number.isFinite(transcriptCompletedAt) && transcriptCompletedAt > 0) {
        // transcript 时间:最高优先级,无条件覆盖
        store.updatePromptCompletedAt(contentSessionId, lastPromptNumber, transcriptCompletedAt, 'transcript');
      } else {
        // 无 transcript 时间 → 回落:取 Stop hook 时间戳或 Date.now()
        const stopHookTimestamp = req.body.timestamp;
        let completedAtEpoch = typeof stopHookTimestamp === 'number' ? stopHookTimestamp
          : typeof stopHookTimestamp === 'string' ? new Date(stopHookTimestamp).getTime()
          : Date.now();

        // observation 截断:防止跨夜/闲置 session 的时间膨胀
        const T_MS = 15 * 60 * 1000; // 15 分钟宽限
        const lastObsEpoch = store.getLastObservationEpoch(contentSessionId);
        if (lastObsEpoch && lastObsEpoch > 0 && (completedAtEpoch - lastObsEpoch) > T_MS) {
          completedAtEpoch = lastObsEpoch;
        }

        store.updatePromptCompletedAt(contentSessionId, lastPromptNumber, completedAtEpoch, 'stop_hook');
      }
    }

    // ── 活跃/挂起时长回填(liveness 检测,替代墙钟) ───────────────────
    // transcript 的 turn 数可能多于 DB prompt(用户在任务中追加输入,未单独记为
    // prompt 行)。按"区间归属"聚合:turn 归属 created_at ≤ turn.promptedAt 的最近
    // prompt,把该 prompt 名下所有 turn 的 active/idle 合计后回填。
    // DB prompt.created_at 比 transcript 的 turn.promptedAt 晚约 1-2s(UserPromptSubmit
    // hook 写库的固有延迟),严格 ≤ 会把 turn 漏配到前一条 prompt。带 5s 容差对齐,
    // 远小于相邻轮次间隔(实测最短 ~2min),不会跨轮误归属。
    const ACTIVITY_ALIGN_TOLERANCE_MS = 5_000;
    const turnActivities = Array.isArray(req.body.turn_activities) ? req.body.turn_activities : null;
    if (turnActivities && turnActivities.length > 0) {
      const timeline = store.getSessionPromptTimeline(contentSessionId);
      if (timeline.length > 0) {
        const agg = new Map<number, { active: number; idle: number }>();
        for (const t of turnActivities) {
          const promptedAt = typeof t.promptedAt === 'number' ? t.promptedAt : null;
          if (promptedAt == null) continue;
          // 区间归属:timeline 升序,取最后一个 created_at ≤ promptedAt+容差 的 prompt
          let ownerPrompt: number | null = null;
          for (const p of timeline) {
            if (p.created_at_epoch <= promptedAt + ACTIVITY_ALIGN_TOLERANCE_MS) ownerPrompt = p.prompt_number;
            else break;
          }
          if (ownerPrompt == null) continue;
          const cur = agg.get(ownerPrompt) ?? { active: 0, idle: 0 };
          cur.active += Math.max(0, Math.floor(Number(t.activeMs) || 0));
          cur.idle += Math.max(0, Math.floor(Number(t.idleMs) || 0));
          agg.set(ownerPrompt, cur);
        }
        for (const [pn, v] of agg) {
          store.updatePromptActivity(contentSessionId, pn, v.active, v.idle);
        }
      }
    }

    const cleanedLastAssistantMessage = last_assistant_message
      ? stripMemoryTagsFromPrompt(String(last_assistant_message))
      : last_assistant_message;
    await this.sessionManager.queueSummarize(sessionDbId, cleanedLastAssistantMessage);

    await this.ensureGeneratorRunning(sessionDbId, 'summarize');

    this.eventBroadcaster.broadcastSummarizeQueued();

    res.json({ status: 'queued' });
  });

  private handleStatusByClaudeId = this.wrapHandler(async (req: Request, res: Response): Promise<void> => {
    const contentSessionId = req.query.contentSessionId as string;

    if (!contentSessionId) {
      return this.badRequest(res, 'Missing contentSessionId query parameter');
    }

    const store = this.dbManager.getSessionStore();
    const sessionDbId = store.createSDKSession(contentSessionId, '', '');
    const session = this.sessionManager.getSession(sessionDbId);

    if (!session) {
      res.json({ status: 'not_found', queueLength: 0 });
      return;
    }

    const pendingStore = this.sessionManager.getPendingMessageStore();
    const queueLength = await pendingStore.getPendingCount(sessionDbId);

    res.json({
      status: 'active',
      sessionDbId,
      queueLength,
      summaryStored: session.lastSummaryStored ?? null,
      uptime: getUptimeSeconds(session.startTime)
    });
  });

  private handleSessionInitByClaudeId = this.wrapHandler(async (req: Request, res: Response): Promise<void> => {
    const { contentSessionId } = req.body;

    const project = req.body.project || 'unknown';
    const rawPrompt = typeof req.body.prompt === 'string' ? req.body.prompt : undefined;
    // Use the hook event's own timestamp for accurate processing time measurement.
    // Date.now() in saveUserPrompt is the hook handler execution time, which can
    // lag seconds behind the actual user submission due to hook dispatch delay.
    const hookTimestamp = req.body.timestamp;
    const submittedAtEpoch = typeof hookTimestamp === 'number' ? hookTimestamp
      : typeof hookTimestamp === 'string' ? new Date(hookTimestamp).getTime()
      : undefined;
    const platformSource = normalizePlatformSource(req.body.platformSource);
    const customTitle = req.body.customTitle || undefined;

    if (rawPrompt && isInternalProtocolPayload(rawPrompt)) {
      logger.debug('HTTP', 'session-init: skipping internal protocol payload before session creation', { contentSessionId });
      res.json({ skipped: true, reason: 'internal_protocol' });
      return;
    }

    let prompt = rawPrompt || '[media prompt]';

    const promptByteLength = Buffer.byteLength(prompt, 'utf8');
    if (promptByteLength > MAX_USER_PROMPT_BYTES) {
      logger.warn('HTTP', 'SessionRoutes: oversized prompt truncated at session-init boundary', {
        project,
        contentSessionId,
        promptByteLength,
        maxBytes: MAX_USER_PROMPT_BYTES,
        preview: prompt.slice(0, 200)
      });
      const buf = Buffer.from(prompt, 'utf8');
      let end = MAX_USER_PROMPT_BYTES;
      while (end > 0 && (buf[end] & 0xc0) === 0x80) end--;
      prompt = buf.subarray(0, end).toString('utf8');
    }

    logger.info('HTTP', 'SessionRoutes: handleSessionInitByClaudeId called', {
      contentSessionId,
      project,
      platformSource,
      prompt_length: prompt?.length,
      customTitle
    });

    const store = this.dbManager.getSessionStore();

    const sessionDbId = store.createSDKSession(contentSessionId, project, prompt, customTitle, platformSource);

    const dbSession = store.getSessionById(sessionDbId);
    const isNewSession = !dbSession?.memory_session_id;
    logger.info('SESSION', `CREATED | contentSessionId=${contentSessionId} → sessionDbId=${sessionDbId} | isNew=${isNewSession} | project=${project}`, {
      sessionId: sessionDbId
    });

    const currentCount = store.getPromptNumberFromUserPrompts(contentSessionId);
    const promptNumber = currentCount + 1;

    const memorySessionId = dbSession?.memory_session_id || null;
    if (promptNumber > 1) {
      logger.debug('HTTP', `[ALIGNMENT] DB Lookup Proof | contentSessionId=${contentSessionId} → memorySessionId=${memorySessionId || '(not yet captured)'} | prompt#=${promptNumber}`);
    } else {
      logger.debug('HTTP', `[ALIGNMENT] New Session | contentSessionId=${contentSessionId} | prompt#=${promptNumber} | memorySessionId will be captured on first SDK response`);
    }

    const cleanedPrompt = stripMemoryTagsFromPrompt(prompt);

    if (!cleanedPrompt || cleanedPrompt.trim() === '') {
      logger.debug('HOOK', 'Session init - prompt entirely private', {
        sessionId: sessionDbId,
        promptNumber,
        originalLength: prompt.length
      });

      res.json({
        sessionDbId,
        promptNumber,
        skipped: true,
        reason: 'private'
      });
      return;
    }

    const duplicatePrompt = store.findRecentDuplicateUserPrompt(
      contentSessionId,
      cleanedPrompt,
      USER_PROMPT_DEDUPE_WINDOW_MS
    );

    if (duplicatePrompt) {
      const contextInjected = this.sessionManager.getSession(sessionDbId) !== undefined;
      logger.debug('SESSION', 'Duplicate user prompt skipped', {
        sessionId: sessionDbId,
        promptNumber: duplicatePrompt.prompt_number,
        duplicatePromptId: duplicatePrompt.id,
        contextInjected
      });

      res.json({
        sessionDbId,
        promptNumber: duplicatePrompt.prompt_number,
        skipped: true,
        reason: 'duplicate',
        contextInjected
      });
      return;
    }

    // Compute think time: gap from previous prompt completion to now, capped.
    let thinkTimeMs = 0;
    if (promptNumber > 1) {
      const prevCompleted = store.getPromptCompletedAt(contentSessionId, promptNumber - 1);
      if (prevCompleted != null) {
        const settings = SettingsDefaultsManager.loadFromFile(USER_SETTINGS_PATH);
        const capMinutes = Math.max(0, parseInt(settings.CLAUDE_MEM_THINK_TIME_CAP_MINUTES, 10) || 0);
        if (capMinutes > 0) {
          const nowEpoch = submittedAtEpoch ?? Date.now();
          const gapMs = Math.max(0, nowEpoch - prevCompleted);
          thinkTimeMs = Math.min(gapMs, capMinutes * 60_000);
        }
      }
    }

    store.saveUserPrompt(contentSessionId, promptNumber, cleanedPrompt, submittedAtEpoch, thinkTimeMs);

    const contextInjected = this.sessionManager.getSession(sessionDbId) !== undefined;

    logger.debug('SESSION', 'User prompt saved', {
      sessionId: sessionDbId,
      promptNumber,
      contextInjected
    });

    if (platformSource !== 'cursor') {
      const sdkPrompt = cleanedPrompt.startsWith('/') ? cleanedPrompt.substring(1) : cleanedPrompt;
      const session = this.sessionManager.initializeSession(sessionDbId, sdkPrompt, promptNumber);

      const latestPrompt = store.getLatestUserPrompt(session.contentSessionId);

      if (latestPrompt) {
        this.eventBroadcaster.broadcastNewPrompt({
          id: latestPrompt.id,
          content_session_id: latestPrompt.content_session_id,
          project: latestPrompt.project,
          platform_source: latestPrompt.platform_source,
          prompt_number: latestPrompt.prompt_number,
          prompt_text: latestPrompt.prompt_text,
          created_at_epoch: latestPrompt.created_at_epoch
        });

        const chromaStart = Date.now();
        const promptText = latestPrompt.prompt_text;
        this.dbManager.getChromaSync()?.syncUserPrompt(
          latestPrompt.id,
          latestPrompt.memory_session_id,
          latestPrompt.project,
          promptText,
          latestPrompt.prompt_number,
          latestPrompt.created_at_epoch
        ).then(() => {
          const chromaDuration = Date.now() - chromaStart;
          const truncatedPrompt = promptText.length > 60
            ? promptText.substring(0, 60) + '...'
            : promptText;
          logger.debug('CHROMA', 'User prompt synced', {
            promptId: latestPrompt.id,
            duration: `${chromaDuration}ms`,
            prompt: truncatedPrompt
          });
        }).catch((error) => {
          logger.error('CHROMA', 'User prompt sync failed, continuing without vector search', {
            promptId: latestPrompt.id,
            prompt: promptText.length > 60 ? promptText.substring(0, 60) + '...' : promptText
          }, error);
        });
      }

      await this.ensureGeneratorRunning(sessionDbId, 'init');

      this.eventBroadcaster.broadcastSessionStarted(sessionDbId, session.project);
    } else {
      logger.debug('HTTP', 'session-init: Skipping SDK agent init for Cursor platform', { sessionDbId, promptNumber });
    }

    res.json({
      sessionDbId,
      promptNumber,
      skipped: false,
      contextInjected,
      status: 'initialized'
    });
  });

  private static readonly SIMPLE_TOOLS = new Set([
    'Read', 'Glob', 'Grep', 'LS', 'ListMcpResourcesTool'
  ]);

  private async applyTierRouting(session: NonNullable<ReturnType<typeof this.sessionManager.getSession>>): Promise<void> {
    const settings = SettingsDefaultsManager.loadFromFile(USER_SETTINGS_PATH);
    if (settings.CLAUDE_MEM_TIER_ROUTING_ENABLED === 'false') {
      session.modelOverride = undefined;
      return;
    }

    session.modelOverride = undefined;

    const pendingStore = this.sessionManager.getPendingMessageStore();
    const pending = await pendingStore.peekPendingTypes(session.sessionDbId);

    if (pending.length === 0) {
      session.modelOverride = undefined;
      return;
    }

    const hasSummarize = pending.some(m => m.message_type === 'summarize');
    const allSimple = pending.every(m =>
      m.message_type === 'observation' && m.tool_name && SessionRoutes.SIMPLE_TOOLS.has(m.tool_name)
    );

    if (hasSummarize) {
      const summaryModel = settings.CLAUDE_MEM_TIER_SUMMARY_MODEL;
      if (summaryModel) {
        session.modelOverride = summaryModel;
        logger.debug('SESSION', `Tier routing: summary model`, {
          sessionId: session.sessionDbId, model: summaryModel
        });
      }
    } else if (allSimple) {
      const simpleModel = settings.CLAUDE_MEM_TIER_SIMPLE_MODEL;
      if (simpleModel) {
        session.modelOverride = simpleModel;
        logger.debug('SESSION', `Tier routing: simple model`, {
          sessionId: session.sessionDbId, model: simpleModel
        });
      }
    } else {
      session.modelOverride = undefined;
    }
  }
}
