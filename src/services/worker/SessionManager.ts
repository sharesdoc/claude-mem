import { DatabaseManager } from './DatabaseManager.js';
import { logger } from '../../utils/logger.js';
import type { ActiveSession, PendingMessage, PendingMessageWithId, ObservationData } from '../worker-types.js';
import {
  SqliteObservationQueueEngine,
  type HealthCheckedObservationQueueEngine,
  type InspectableObservationQueueEngine,
  type ObservationQueueHealth
} from '../../server/queue/ObservationQueueEngine.js';
import { BullMqObservationQueueEngine } from '../../server/queue/BullMqObservationQueueEngine.js';
import { getObservationQueueEngineName } from '../../server/queue/redis-config.js';
import { getSdkProcessForSession, ensureSdkProcessExit } from '../../supervisor/process-registry.js';
import { getSupervisor } from '../../supervisor/index.js';
import { RestartGuard } from './RestartGuard.js';
import { RawEventStore } from '../sqlite/RawEventStore.js';
import { SettingsDefaultsManager } from '../../shared/SettingsDefaultsManager.js';
import { USER_SETTINGS_PATH } from '../../shared/paths.js';
import { InputRoundStore } from '../sqlite/InputRoundStore.js';

export class SessionManager {
  private dbManager: DatabaseManager;
  private sessions: Map<number, ActiveSession> = new Map();
  private onSessionDeletedCallback?: () => void;
  private queueEngine: InspectableObservationQueueEngine | null = null;
  private queueEngineName: 'sqlite' | 'bullmq' | null = null;
  private onPendingMutate?: () => void;

  constructor(dbManager: DatabaseManager) {
    this.dbManager = dbManager;
  }

  private getQueueEngine(): InspectableObservationQueueEngine {
    if (!this.queueEngine) {
      this.queueEngineName = getObservationQueueEngineName();
      const sessionStore = this.dbManager.getSessionStore();
      if (this.queueEngineName === 'bullmq') {
        this.queueEngine = new BullMqObservationQueueEngine({
          db: sessionStore.db,
          onMutate: () => this.onPendingMutate?.()
        });
      } else {
        this.queueEngine = new SqliteObservationQueueEngine(
          sessionStore.db,
          () => this.onPendingMutate?.()
        );
      }
    }
    return this.queueEngine;
  }

  async initializeQueueEngine(): Promise<void> {
    this.queueEngineName = getObservationQueueEngineName();
    if (this.queueEngineName === 'sqlite') {
      return;
    }
    const queue = this.getQueueEngine();
    if (isHealthCheckedQueue(queue)) {
      await queue.assertHealthy();
      await queue.getTotalQueueDepth();
    }
  }

  isBullMqQueueEnabled(): boolean {
    return (this.queueEngineName ?? getObservationQueueEngineName()) === 'bullmq';
  }

  async getQueueHealth(): Promise<ObservationQueueHealth | null> {
    const queue = this.getQueueEngine();
    if (isHealthCheckedQueue(queue)) {
      return queue.getHealth();
    }
    return null;
  }

  setOnSessionDeleted(callback: () => void): void {
    this.onSessionDeletedCallback = callback;
  }

  setOnPendingMutate(cb: () => void): void {
    this.onPendingMutate = cb;
  }

  initializeSession(sessionDbId: number, currentUserPrompt?: string, promptNumber?: number): ActiveSession {
    logger.debug('SESSION', 'initializeSession called', {
      sessionDbId,
      promptNumber,
      has_currentUserPrompt: !!currentUserPrompt
    });

    let session = this.sessions.get(sessionDbId);
    if (session) {
      logger.debug('SESSION', 'Returning cached session', {
        sessionDbId,
        contentSessionId: session.contentSessionId,
        lastPromptNumber: session.lastPromptNumber
      });

      const dbSession = this.dbManager.getSessionById(sessionDbId);
      if (dbSession.project && dbSession.project !== session.project) {
        logger.debug('SESSION', 'Updating project from database', {
          sessionDbId,
          oldProject: session.project,
          newProject: dbSession.project
        });
        session.project = dbSession.project;
      }
      if (dbSession.platform_source && dbSession.platform_source !== session.platformSource) {
        session.platformSource = dbSession.platform_source;
      }

      if (currentUserPrompt) {
        logger.debug('SESSION', 'Updating userPrompt for continuation', {
          sessionDbId,
          promptNumber,
          oldPrompt: session.userPrompt.substring(0, 80),
          newPrompt: currentUserPrompt.substring(0, 80)
        });
        session.userPrompt = currentUserPrompt;
        session.lastPromptNumber = promptNumber || session.lastPromptNumber;
      } else {
        logger.debug('SESSION', 'No currentUserPrompt provided for existing session', {
          sessionDbId,
          promptNumber,
          usingCachedPrompt: session.userPrompt.substring(0, 80)
        });
      }
      return session;
    }

    const dbSession = this.dbManager.getSessionById(sessionDbId);

    logger.debug('SESSION', 'Fetched session from database', {
      sessionDbId,
      content_session_id: dbSession.content_session_id,
      memory_session_id: dbSession.memory_session_id
    });

    if (dbSession.memory_session_id) {
      logger.warn('SESSION', `Discarding stale memory_session_id from previous worker instance (Issue #817)`, {
        sessionDbId,
        staleMemorySessionId: dbSession.memory_session_id,
        reason: 'SDK context lost on worker restart - will capture new ID'
      });
    }

    const userPrompt = currentUserPrompt || dbSession.user_prompt;

    if (!currentUserPrompt) {
      logger.debug('SESSION', 'No currentUserPrompt provided for new session, using database', {
        sessionDbId,
        promptNumber,
        dbPrompt: dbSession.user_prompt.substring(0, 80)
      });
    } else {
      logger.debug('SESSION', 'Initializing session with fresh userPrompt', {
        sessionDbId,
        promptNumber,
        userPrompt: currentUserPrompt.substring(0, 80)
      });
    }

    session = {
      sessionDbId,
      contentSessionId: dbSession.content_session_id,
      memorySessionId: null,  // Always start fresh - SDK will capture new ID
      project: dbSession.project,
      platformSource: dbSession.platform_source,
      userPrompt,
      pendingMessages: [],
      abortController: new AbortController(),
      generatorPromise: null,
      lastPromptNumber: promptNumber || this.dbManager.getSessionStore().getPromptNumberFromUserPrompts(dbSession.content_session_id),
      startTime: Date.now(),
      cumulativeInputTokens: 0,
      cumulativeOutputTokens: 0,
      earliestPendingTimestamp: null,
      claimedMessageIds: [],
      conversationHistory: [],  // Initialize empty - will be populated by agents
      currentProvider: null,  // Will be set when generator starts
      consecutiveRestarts: 0,  // DEPRECATED: use restartGuard. Kept for logging compat.
      restartGuard: new RestartGuard(),
      lastGeneratorActivity: Date.now(),  // Initialize for stale detection (Issue #1099)
      recoveryPending: false,
      pendingAgentId: null,   // Subagent identity carried from the most recent claimed message
      pendingAgentType: null,
      pendingRoundSlice: null
    };

    logger.debug('SESSION', 'Creating new session object (memorySessionId cleared to prevent stale resume)', {
      sessionDbId,
      contentSessionId: dbSession.content_session_id,
      dbMemorySessionId: dbSession.memory_session_id || '(none in DB)',
      memorySessionId: '(cleared - will capture fresh from SDK)',
      lastPromptNumber: promptNumber || this.dbManager.getSessionStore().getPromptNumberFromUserPrompts(dbSession.content_session_id)
    });

    this.sessions.set(sessionDbId, session);

    logger.info('SESSION', 'Session initialized', {
      sessionId: sessionDbId,
      project: session.project,
      contentSessionId: session.contentSessionId,
      queueDepth: 0,
      hasGenerator: false
    });

    return session;
  }

  getSession(sessionDbId: number): ActiveSession | undefined {
    return this.sessions.get(sessionDbId);
  }

  async queueObservation(sessionDbId: number, data: ObservationData): Promise<void> {
    let session = this.sessions.get(sessionDbId);
    if (!session) {
      session = this.initializeSession(sessionDbId);
    }

    const message: PendingMessage = {
      type: 'observation',
      tool_name: data.tool_name,
      tool_input: data.tool_input,
      tool_response: data.tool_response,
      prompt_number: data.prompt_number,
      cwd: data.cwd,
      agentId: data.agentId,
      agentType: data.agentType,
      toolUseId: data.toolUseId,
    };

    this.storeRawEvent(session, message);

    const rounds = new InputRoundStore(this.dbManager.getSessionStore().db);
    if (data.prompt_number !== undefined && rounds.isOpen(session.contentSessionId, data.prompt_number)) {
      logger.debug('QUEUE', 'Observation held until input round closes', { sessionId: sessionDbId, promptNumber: data.prompt_number });
      return;
    }

    try {
      const queue = this.getQueueEngine();
      const messageId = await queue.enqueue(sessionDbId, session.contentSessionId, message);
      const queueDepth = await queue.getPendingCount(sessionDbId);
      const toolSummary = logger.formatTool(data.tool_name, data.tool_input);
      if (messageId === 0) {
        logger.debug('QUEUE', `DUP_SUPPRESSED | sessionDbId=${sessionDbId} | type=observation | tool=${toolSummary} | toolUseId=${data.toolUseId ?? 'null'} | depth=${queueDepth}`, {
          sessionId: sessionDbId
        });
      } else {
        logger.info('QUEUE', `ENQUEUED | sessionDbId=${sessionDbId} | messageId=${messageId} | type=observation | tool=${toolSummary} | depth=${queueDepth}`, {
          sessionId: sessionDbId
        });
      }
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      logger.info('QUEUE', 'enqueue failed; observation dropped', {
        sessionId: sessionDbId,
        tool: data.tool_name,
        err: normalized.message
      });
      throw normalized;
    }

  }

  async queueSummarize(sessionDbId: number, lastAssistantMessage?: string): Promise<void> {
    let session = this.sessions.get(sessionDbId);
    if (!session) {
      session = this.initializeSession(sessionDbId);
    }

    const message: PendingMessage = {
      type: 'summarize',
      last_assistant_message: lastAssistantMessage
      ,prompt_number: session.lastPromptNumber
    };

    this.storeRawEvent(session, message);

    const rounds = new InputRoundStore(this.dbManager.getSessionStore().db);
    if (rounds.isOpen(session.contentSessionId, session.lastPromptNumber)) {
      logger.debug('QUEUE', 'Summary held until input round closes', { sessionId: sessionDbId, promptNumber: session.lastPromptNumber });
      return;
    }

    try {
      const queue = this.getQueueEngine();
      const messageId = await queue.enqueue(sessionDbId, session.contentSessionId, message);
      const queueDepth = await queue.getPendingCount(sessionDbId);
      if (messageId === 0) {
        logger.debug('QUEUE', `DUP_SUPPRESSED | sessionDbId=${sessionDbId} | type=summarize | depth=${queueDepth}`, {
          sessionId: sessionDbId
        });
      } else {
        logger.info('QUEUE', `ENQUEUED | sessionDbId=${sessionDbId} | messageId=${messageId} | type=summarize | depth=${queueDepth}`, {
          sessionId: sessionDbId
        });
      }
    } catch (error) {
      if (error instanceof Error) {
        logger.error('SESSION', 'Failed to persist summarize to DB', {
          sessionId: sessionDbId
        }, error);
      } else {
        logger.error('SESSION', 'Failed to persist summarize to DB with non-Error', {
          sessionId: sessionDbId
        }, new Error(String(error)));
      }
      throw error; 
    }

  }

  private storeRawEvent(session: ActiveSession, message: PendingMessage): void {
    new RawEventStore(this.dbManager.getSessionStore().db).append({
      contentSessionId: session.contentSessionId,
      sessionDbId: session.sessionDbId,
      project: session.project,
      platformSource: session.platformSource,
      eventType: message.type,
      toolUseId: message.toolUseId,
      toolName: message.tool_name,
      toolInput: message.tool_input,
      toolResponse: message.tool_response,
      cwd: message.cwd,
      lastAssistantMessage: message.last_assistant_message,
      promptNumber: message.prompt_number,
      agentId: message.agentId,
      agentType: message.agentType,
    });
  }

  beginInputRound(sessionDbId: number, promptNumber: number, prompt: string, agentId?: string, agentType?: string): void {
    const session = this.sessions.get(sessionDbId) ?? this.initializeSession(sessionDbId, prompt, promptNumber);
    const db = this.dbManager.getSessionStore().db;
    const rounds = new InputRoundStore(db);
    rounds.openRound(session.contentSessionId, promptNumber);
    new RawEventStore(db).append({
      contentSessionId: session.contentSessionId,
      sessionDbId,
      project: session.project,
      platformSource: session.platformSource,
      eventType: 'user_input',
      toolInput: prompt,
      promptNumber,
      agentId,
      agentType,
      payload: prompt,
    });
  }

  /** Archive an input that cannot open a normal round (private or duplicate). */
  recordUserInputEvent(sessionDbId: number, prompt: string, promptNumber: number, agentId?: string, agentType?: string): void {
    const session = this.sessions.get(sessionDbId) ?? this.initializeSession(sessionDbId);
    new RawEventStore(this.dbManager.getSessionStore().db).append({
      contentSessionId: session.contentSessionId,
      sessionDbId,
      project: session.project,
      platformSource: session.platformSource,
      eventType: 'user_input',
      promptNumber,
      agentId,
      agentType,
      toolInput: prompt,
      payload: prompt,
    });
  }

  async flushInputRound(sessionDbId: number): Promise<number> {
    // Finalization can run after a worker restart, so recover the content
    // session from sdk_sessions instead of depending on the in-memory map.
    const session = this.sessions.get(sessionDbId) ?? this.initializeSession(sessionDbId);
    const db = this.dbManager.getSessionStore().db;
    const rounds = new InputRoundStore(db);
    const openRound = rounds.getOpenRound(session.contentSessionId);
    if (!openRound) return 0;
    const closed = rounds.closeOpenRound(session.contentSessionId);
    if (closed === 0) return 0;
    const promptNumber = openRound.prompt_number;
    const slices = rounds.getClosedSlices(session.contentSessionId, promptNumber);
    let queued = 0;
    const queue = this.getQueueEngine();
    for (const slice of slices) {
      const events = rounds.getSliceEvents(session.contentSessionId, slice);
      if (events.length === 0) continue;
      const firstEvent = events[0];
      // Round slices intentionally do not participate in tier routing's simple/summary
      // classification today. These fixed placeholders describe the slice envelope,
      // not the real mix of events inside it, so tier routing keeps the default model
      // for round-slice work. Restoring model-cost savings here requires the
      // batch-content-aware classification described as option 1 in
      // doc/Issue-20260928183041382-P1.md; that redesign is not implemented yet.
      queued += await queue.enqueue(sessionDbId, session.contentSessionId, {
        type: 'observation',
        tool_name: 'input_round_slice',
        tool_input: events.map(event => ({
          id: event.id,
          event_type: event.event_type,
          tool_use_id: event.tool_use_id,
          tool_name: event.tool_name,
          tool_input: parseJson(event.tool_input),
          tool_response: parseJson(event.tool_response),
          payload: parseJson(event.payload),
          agent_id: event.agent_id,
          agent_type: event.agent_type,
        })),
        tool_response: { start_raw_event_id: slice.start_raw_event_id, end_raw_event_id: slice.end_raw_event_id },
        cwd: firstEvent.cwd ?? undefined,
        last_assistant_message: events.at(-1)?.last_assistant_message ?? undefined,
        prompt_number: promptNumber,
        agentId: firstEvent.agent_id ?? undefined,
        agentType: firstEvent.agent_type ?? undefined,
        roundSlice: {
          promptNumber,
          sliceNumber: slice.slice_number,
          startRawEventId: slice.start_raw_event_id,
          endRawEventId: slice.end_raw_event_id,
          idempotencyKey: slice.idempotency_key,
        },
      });
    }
    return queued;
  }

  async clearPendingForSession(sessionDbId: number): Promise<number> {
    return await this.getQueueEngine().clearPendingForSession(sessionDbId);
  }

  async resetProcessingToPending(sessionDbId: number): Promise<number> {
    const session = this.sessions.get(sessionDbId);
    if (session) {
      session.claimedMessageIds = [];
    }
    return await this.getQueueEngine().resetProcessingToPending(sessionDbId);
  }

  async confirmClaimedMessages(sessionDbId: number): Promise<number> {
    const session = this.sessions.get(sessionDbId);
    const claimedIds = session?.claimedMessageIds ?? [];
    let confirmed = 0;
    for (const messageId of claimedIds) {
      confirmed += await this.getQueueEngine().confirmProcessed(messageId);
    }
    if (session) {
      session.claimedMessageIds = [];
      session.earliestPendingTimestamp = null;
      session.pendingRoundSlice = null;
    }
    return confirmed;
  }

  async deleteSession(sessionDbId: number): Promise<void> {
    const session = this.sessions.get(sessionDbId);
    if (!session) {
      return;
    }

    const sessionDuration = Date.now() - session.startTime;

    if (session.respawnTimer) {
      clearTimeout(session.respawnTimer);
      session.respawnTimer = undefined;
    }

    session.abortReason = 'shutdown';
    session.abortController.abort();

    if (session.generatorPromise) {
      const generatorDone = session.generatorPromise.catch(() => {
        logger.debug('SYSTEM', 'Generator already failed, cleaning up', { sessionId: session.sessionDbId });
      });
      const timeoutDone = new Promise<void>(resolve => {
        AbortSignal.timeout(30_000).addEventListener('abort', () => resolve(), { once: true });
      });
      await Promise.race([generatorDone, timeoutDone]).then(() => {}, () => {
        logger.warn('SESSION', 'Generator did not exit within 30s after abort, forcing cleanup (#1099)', { sessionDbId });
      });
    }

    const tracked = getSdkProcessForSession(sessionDbId);
    if (tracked && tracked.process.exitCode === null) {
      logger.debug('SESSION', `Waiting for subprocess PID ${tracked.pid} (pgid ${tracked.pgid}) to exit`, {
        sessionId: sessionDbId,
        pid: tracked.pid,
        pgid: tracked.pgid
      });
      await ensureSdkProcessExit(tracked, 5000);
    }

    try {
      await getSupervisor().getRegistry().reapSession(sessionDbId);
    } catch (error) {
      if (error instanceof Error) {
        logger.warn('SESSION', 'Supervisor reapSession failed (non-blocking)', {
          sessionId: sessionDbId
        }, error);
      } else {
        logger.warn('SESSION', 'Supervisor reapSession failed (non-blocking) with non-Error', {
          sessionId: sessionDbId
        }, new Error(String(error)));
      }
    }

    this.sessions.delete(sessionDbId);
    logger.info('SESSION', 'Session deleted', {
      sessionId: sessionDbId,
      duration: `${(sessionDuration / 1000).toFixed(1)}s`,
      project: session.project
    });

    if (this.onSessionDeletedCallback) {
      this.onSessionDeletedCallback();
    }
  }

  removeSessionImmediate(sessionDbId: number): void {
    const session = this.sessions.get(sessionDbId);
    if (!session) return;

    if (session.respawnTimer) {
      clearTimeout(session.respawnTimer);
      session.respawnTimer = undefined;
    }

    this.sessions.delete(sessionDbId);
    logger.info('SESSION', 'Session removed from active sessions', {
      sessionId: sessionDbId,
      project: session.project
    });

    if (this.onSessionDeletedCallback) {
      this.onSessionDeletedCallback();
    }
  }

  async shutdownAll(): Promise<void> {
    const sessionIds = Array.from(this.sessions.keys());
    await Promise.all(sessionIds.map(id => this.deleteSession(id)));
    await this.queueEngine?.close();
    this.queueEngine = null;
  }

  async hasPendingMessages(): Promise<boolean> {
    return (await this.getTotalQueueDepth()) > 0;
  }

  getActiveSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Return the set of project IDs that currently have at least one live
   * in-memory session. Used by the project-delete admin path to refuse
   * destruction of projects with active AI activity.
   *
   * Note: only covers worker in-memory sessions. Pending DB rows are
   * checked separately via PendingMessageStore + sdk_sessions JOIN so we
   * also catch the "worker just restarted, queue not yet drained" case.
   */
  getProjectsInUse(): Set<string> {
    const projects = new Set<string>();
    for (const session of this.sessions.values()) {
      if (session.project) projects.add(session.project);
    }
    return projects;
  }

  async getTotalQueueDepth(): Promise<number> {
    return await this.getQueueEngine().getTotalQueueDepth();
  }

  async getTotalActiveWork(): Promise<number> {
    return await this.getTotalQueueDepth();
  }

  async prepareActiveSessionRecovery(sessionDbId: number): Promise<{
    eligibleCount: number;
    discardedCount: number;
    skippedBecauseOverLimit: boolean;
  }> {
    const settings = SettingsDefaultsManager.loadFromFile(USER_SETTINGS_PATH);
    const maxAgeHours = parsePositiveSetting(settings.CLAUDE_MEM_RAW_EVENT_MAX_AGE_HOURS, 24);
    const maxCompensation = parsePositiveSetting(settings.CLAUDE_MEM_RAW_EVENT_MAX_COMPENSATION, 10);
    const cutoffEpoch = Date.now() - maxAgeHours * 60 * 60 * 1000;
    return this.getQueueEngine().prepareRecovery(sessionDbId, cutoffEpoch, maxCompensation);
  }

  async isAnySessionProcessing(): Promise<boolean> {
    return (await this.getTotalQueueDepth()) > 0;
  }

  async *getMessageIterator(sessionDbId: number): AsyncIterableIterator<PendingMessageWithId> {
    let session = this.sessions.get(sessionDbId);
    if (!session) {
      session = this.initializeSession(sessionDbId);
    }

    const queue = this.getQueueEngine();
    await this.resetProcessingToPending(sessionDbId);
    for await (const message of queue.createIterator({
      sessionDbId,
      // Closed round slices and legacy non-slice messages must share the
      // queue. PendingMessageStore excludes only slices belonging to an open
      // round, preserving compatibility with pre-round queue rows.
      roundSlicesOnly: false,
      signal: session.abortController.signal,
      onIdleTimeout: () => {
        logger.info('SESSION', 'Triggering abort due to idle timeout to kill subprocess', { sessionDbId });
        session.idleTimedOut = true;
        session.abortReason = 'idle';
        session.abortController.abort();
      }
    })) {
      session.claimedMessageIds.push(message._persistentId);
      session.pendingRoundSlice = message.roundSlice ?? null;
      if (session.earliestPendingTimestamp === null) {
        session.earliestPendingTimestamp = message._originalTimestamp;
      } else {
        session.earliestPendingTimestamp = Math.min(session.earliestPendingTimestamp, message._originalTimestamp);
      }

      session.lastGeneratorActivity = Date.now();

      yield message;
    }
  }

  /**
   * Persists the provider response for the claimed slice. Slice results are
   * later concatenated by slice number; no second model request is made for a
   * completed round. Repeated provider confirmation is harmless because the
   * same row is updated with the same result.
   */
  recordCurrentSliceResult(sessionDbId: number, result: string): void {
    const session = this.sessions.get(sessionDbId);
    const slice = session?.pendingRoundSlice;
    if (!session || !slice) return;
    new InputRoundStore(this.dbManager.getSessionStore().db).recordSliceResult(
      session.contentSessionId,
      slice.promptNumber,
      slice.sliceNumber,
      result,
    );
  }

  getPendingMessageStore(): InspectableObservationQueueEngine {
    return this.getQueueEngine();
  }
}

function parsePositiveSetting(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseJson(value: string | null): unknown {
  if (value === null) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function isHealthCheckedQueue(queue: InspectableObservationQueueEngine): queue is HealthCheckedObservationQueueEngine {
  return 'getHealth' in queue && 'assertHealthy' in queue;
}
