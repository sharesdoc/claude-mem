import type { DatabaseManager } from '../worker/DatabaseManager.js';
import { logger } from '../../utils/logger.js';
import { readState, writeState, type SyncState } from './sync-state.js';
import { collectIncremental, type IngestBatch } from './payload.js';
import { appendSyncError } from './error-log.js';

/**
 * T-06 — client-side SyncAgent.
 *
 * Lifecycle: start() runs `tick()` once at boot then on a setInterval
 * timer. Mutations (observation/summary/prompt insert) call
 * `scheduleSoon()` which debounces to one fast tick ~2s later — this
 * keeps watermark drift small without amplifying churn under bursts.
 *
 * Safety:
 *  - `pushing` guards re-entrancy; if a tick is in flight, scheduleSoon
 *    queues a follow-up rather than racing.
 *  - State writes are atomic (tmp+rename via writeState).
 *  - Errors are classified; permanent (4xx) failures emit ERROR-level
 *    rows to sync-errors.log so an operator can spot config issues.
 *  - timer.unref() so the agent never holds Node alive past shutdown.
 *
 * What this version does NOT do (left for follow-ups):
 *  - Exponential backoff beyond the per-tick interval (T-17 candidate).
 *  - Multi-batch chaining inside one tick (current rule: one batch per
 *    tick, next tick picks up the rest — keeps each push idempotent).
 */
export interface SyncAgentConfig {
  upstreamUrl: string;
  userLabel: string;
  authMode: 'none' | 'apikey' | 'jwt' | 'mtls';
  apiKey?: string;
  /** Shared access token for LAN deployments (simpler than apiKey). */
  accessToken?: string;
  /** X-036: '2' = 请求带 X-Claude-Mem-Auth-Version: 2, 服务端按 sha1(携带值)
   *  对 CLAUDE_MEM_SYNC_SHASUM_VALUE 校验; 空 = 老明文逻辑。 */
  authVersion?: string;
  intervalMs: number;
  batchSize: number;
  retryMax: number;
  redactPatterns: string[];
}

export type FetchFn = typeof fetch;

/**
 * X-037: 鉴权头构建抽为纯函数(可测)。
 * 版本头仅随 accessToken 分支发送——apikey/jwt/mtls 模式下误配
 * AUTH_VERSION='2' 不得让服务端按 sha1(apiKey) 比对而拒绝。
 */
export function buildSyncAuthHeaders(
  config: Pick<SyncAgentConfig, 'accessToken' | 'authMode' | 'apiKey' | 'authVersion'>,
): Record<string, string> {
  const headers: Record<string, string> = {};
  if (config.accessToken) {
    headers['authorization'] = `Bearer ${config.accessToken}`;
    if (config.authVersion === '2') {
      headers['x-claude-mem-auth-version'] = '2';
    }
  } else if (config.authMode === 'apikey' && config.apiKey) {
    headers['authorization'] = `Bearer ${config.apiKey}`;
  }
  return headers;
}

interface IngestResponse {
  applied: Record<string, unknown>;
  next_watermark: Partial<SyncState['watermark']>;
}

const DEBOUNCE_MS = 2000;

export class SyncAgent {
  private timer: ReturnType<typeof setInterval> | null = null;
  private debounce: ReturnType<typeof setTimeout> | null = null;
  private pushing = false;
  private pendingTick = false;
  private stopped = false;

  constructor(
    private readonly dbManager: DatabaseManager,
    private readonly config: SyncAgentConfig,
    private readonly fetchImpl: FetchFn = fetch,
    private readonly statePath?: string,
  ) {}

  async start(): Promise<void> {
    if (this.timer || this.stopped) return;
    logger.info('SYNC', 'SyncAgent starting', {
      upstream: this.config.upstreamUrl,
      userLabel: this.config.userLabel,
      authMode: this.config.authMode,
      intervalMs: this.config.intervalMs,
    });
    this.timer = setInterval(() => void this.tick(), this.config.intervalMs);
    this.timer.unref?.();
    try {
      await this.tick();
    } catch (error) {
      logger.error('SYNC', 'SyncAgent initial tick failed (interval already scheduled)', {}, error as Error);
    }
  }

  /**
   * Debounced trigger called by ResponseProcessor + SessionEventBroadcaster
   * after a fresh row lands. Multiple calls within DEBOUNCE_MS collapse
   * to a single tick.
   */
  scheduleSoon(delayMs: number = DEBOUNCE_MS): void {
    if (this.stopped) return;
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => {
      this.debounce = null;
      void this.tick();
    }, delayMs);
    this.debounce.unref?.();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.debounce) {
      clearTimeout(this.debounce);
      this.debounce = null;
    }
    // One last flush so locally-buffered rows make it upstream before
    // shutdown — best-effort; ignore any failure.
    try {
      await this.tick();
    } catch {
      /* swallow shutdown errors */
    }
  }

  async tick(): Promise<void> {
    if (this.pushing) {
      this.pendingTick = true;
      return;
    }
    this.pushing = true;
    try {
      await this.runOnce();
      if (this.pendingTick) {
        this.pendingTick = false;
        // re-enter on next microtask so the lock is fully released
        queueMicrotask(() => void this.tick());
      }
    } finally {
      this.pushing = false;
    }
  }

  private async runOnce(): Promise<void> {
    const state = readState(this.statePath);
    const db = this.dbManager.getSessionStore().db;

    const { batch, nextLocalIds } = collectIncremental(
      db,
      state.watermark,
      this.config.batchSize,
      this.config.redactPatterns,
      this.config.userLabel,
    );

    if (isEmptyBatch(batch)) {
      return;
    }

    const url = joinUrl(this.config.upstreamUrl, '/api/sync/ingest');
    try {
      const response = await this.post(url, batch);
      const merged: SyncState = {
        ...state,
        upstream_url: this.config.upstreamUrl,
        last_sync_at: Date.now(),
        last_success_at: Date.now(),
        watermark: mergeWatermark(state.watermark, response.next_watermark, nextLocalIds),
        failures: { consecutive: 0, last_error: null },
      };
      writeState(merged, this.statePath);
      logger.debug('SYNC', 'tick pushed', {
        sessions: batch.sessions.length,
        observations: batch.observations.length,
        summaries: batch.summaries.length,
        prompts: batch.prompts.length,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const status = err instanceof PushError ? err.status : null;
      const failures = state.failures.consecutive + 1;
      writeState({
        ...state,
        upstream_url: this.config.upstreamUrl,
        last_sync_at: Date.now(),
        failures: { consecutive: failures, last_error: message },
      }, this.statePath);

      const permanent = isPermanentError(status);
      appendSyncError({
        level: permanent ? 'ERROR' : 'WARN',
        status,
        url,
        message,
      });

      const logMeta = { status, failures, url };
      if (permanent) {
        logger.error('SYNC', 'permanent push failure', logMeta, err instanceof Error ? err : new Error(message));
      } else {
        logger.warn('SYNC', 'transient push failure (will retry)', logMeta, err instanceof Error ? err : new Error(message));
      }
    }
  }

  private async post(url: string, batch: IngestBatch): Promise<IngestResponse> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'x-sync-user': this.config.userLabel,
      ...buildSyncAuthHeaders(this.config),
    };

    const response = await this.fetchImpl(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(batch),
    });

    if (!response.ok) {
      const text = await safeBody(response);
      throw new PushError(response.status, `HTTP ${response.status}: ${text}`);
    }

    const json = (await response.json()) as IngestResponse;
    return json;
  }
}

export class PushError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'PushError';
  }
}

async function safeBody(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.slice(0, 512);
  } catch {
    return '<no body>';
  }
}

function isEmptyBatch(b: IngestBatch): boolean {
  return b.sessions.length === 0 && b.observations.length === 0 && b.summaries.length === 0 && b.prompts.length === 0;
}

function isPermanentError(status: number | null): boolean {
  if (status === null) return false;
  return status >= 400 && status < 500;
}

/**
 * Merge server-reported next_watermark with the locally-computed
 * nextLocalIds. Server wins per-key (it just told us what it accepted)
 * but we floor by the local id so a buggy server can't push us
 * backwards and trigger re-sends.
 */
function mergeWatermark(
  prev: SyncState['watermark'],
  fromServer: Partial<SyncState['watermark']> | undefined,
  local: SyncState['watermark'],
): SyncState['watermark'] {
  const server = fromServer ?? {};
  const completions = compositeMax(prev.prompt_completions, prev.prompt_completions_id, local.prompt_completions, local.prompt_completions_id);
  const activity = compositeMax(prev.prompt_activity, prev.prompt_activity_id, local.prompt_activity, local.prompt_activity_id);
  return {
    sessions: pickMax(prev.sessions, server.sessions, local.sessions),
    observations: pickMax(prev.observations, server.observations, local.observations),
    summaries: pickMax(prev.summaries, server.summaries, local.summaries),
    prompts: pickMax(prev.prompts, server.prompts, local.prompts),
    // 完成/活跃度水位是纯客户端概念(epoch ms + 配对 id),服务端 next_watermark 不下发。
    // 复合 (epoch, id) 字典序合并:仅 epoch 相等时 id 取大,避免跨 epoch 的 id 错配漏推(X-001)。
    prompt_completions: completions.epoch,
    prompt_completions_id: completions.id,
    prompt_activity: activity.epoch,
    prompt_activity_id: activity.id,
  };
}

function pickMax(...values: Array<number | undefined>): number {
  let max = 0;
  for (const v of values) {
    if (typeof v === 'number' && Number.isFinite(v) && v > max) max = v;
  }
  return max;
}

/**
 * 复合水位 (epoch, id) 字典序取大:epoch 为主键,仅当 epoch 相等时才比较 id。
 * 防止 prev/local 两侧的 id 分量属于不同 epoch 时被错配合并 —— 否则较大 epoch
 * 一方的小 id 会被另一方的大 id 顶替,下次 `epoch = ? AND id > ?` 会跳过同毫秒
 * 未推行(漏推,见 X-001)。
 */
function compositeMax(
  prevEpoch: number, prevId: number,
  localEpoch: number, localId: number,
): { epoch: number; id: number } {
  if (localEpoch > prevEpoch) return { epoch: localEpoch, id: localId };
  if (prevEpoch > localEpoch) return { epoch: prevEpoch, id: prevId };
  return { epoch: prevEpoch, id: Math.max(prevId, localId) };
}

function joinUrl(base: string, path: string): string {
  const b = base.endsWith('/') ? base.slice(0, -1) : base;
  const p = path.startsWith('/') ? path : `/${path}`;
  return b + p;
}
