import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import { paths } from '../../shared/paths.js';
import { logger } from '../../utils/logger.js';

/**
 * Persisted sync state (T-07).
 *
 * Lives at `~/.claude-mem/sync-state.json` and stores the highest row id
 * already pushed upstream per table plus a small failure counter so the
 * SyncAgent can resume after restart without re-sending the world.
 *
 * Why a JSON file (not the SQLite DB):
 *   - Decoupling — sync errors must never corrupt the primary DB.
 *   - Cheap atomic write (tmp + rename) without a transaction.
 *   - Survives DB resets when an operator nukes ~/.claude-mem/claude-mem.db
 *     during debugging; the next SyncAgent boot rebuilds from zero anyway
 *     because the watermark is dropped together with the DB it indexed.
 */
export interface SyncState {
  upstream_url: string;
  last_sync_at: number;
  last_success_at: number;
  watermark: {
    sessions: number;
    observations: number;
    summaries: number;
    prompts: number;
    /**
     * 完成时间水位(epoch ms):已推送上游的 user_prompts 完成回填的最大
     * completed_at_epoch。prompt 行先插入(completed_at_epoch=NULL)后回填,
     * 仅按 id 水位推送会把回填永远漏掉 → 服务端显示 "Task status unclear"。
     * 旧 state 文件缺该字段时归零,触发一次全量完成回填重推(服务端幂等更新)。
     */
    prompt_completions: number;
  };
  failures: {
    consecutive: number;
    last_error: string | null;
  };
}

const ZERO_STATE: SyncState = Object.freeze({
  upstream_url: '',
  last_sync_at: 0,
  last_success_at: 0,
  watermark: Object.freeze({ sessions: 0, observations: 0, summaries: 0, prompts: 0, prompt_completions: 0 }),
  failures: Object.freeze({ consecutive: 0, last_error: null }),
}) as SyncState;

export function zeroState(): SyncState {
  return JSON.parse(JSON.stringify(ZERO_STATE));
}

/**
 * Read sync state. Never throws — corrupt or missing files yield the
 * zero state so the agent reboots from scratch instead of crashing.
 */
export function readState(path?: string): SyncState {
  const filePath = path ?? paths.syncState();

  if (!existsSync(filePath)) {
    return zeroState();
  }

  try {
    const raw = readFileSync(filePath, 'utf-8');
    if (!raw.trim()) {
      return zeroState();
    }
    const parsed = JSON.parse(raw) as Partial<SyncState>;
    return normaliseState(parsed);
  } catch (error: unknown) {
    logger.warn(
      'SYNC',
      'sync-state.json corrupt, returning zero state',
      { path: filePath },
      error instanceof Error ? error : new Error(String(error)),
    );
    return zeroState();
  }
}

/**
 * Persist sync state atomically (tmp + rename). Writes are best-effort —
 * an IO error logs but does not throw, so the agent's main loop keeps
 * running even if the file system briefly refuses writes.
 */
export function writeState(state: SyncState, path?: string): void {
  const filePath = path ?? paths.syncState();
  const dir = dirname(filePath);

  try {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const tmpDir = existsSync(dir) ? dir : tmpdir();
    const tmpPath = join(tmpDir, `.sync-state.${randomBytes(6).toString('hex')}.tmp`);

    writeFileSync(tmpPath, JSON.stringify(state, null, 2), { encoding: 'utf-8', mode: 0o600 });
    renameSync(tmpPath, filePath);
  } catch (error: unknown) {
    logger.warn(
      'SYNC',
      'Failed to persist sync-state.json',
      { path: filePath },
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}

function normaliseState(input: Partial<SyncState> | null | undefined): SyncState {
  const base = zeroState();
  if (!input || typeof input !== 'object') return base;

  const wm: Partial<SyncState['watermark']> = input.watermark ?? {};
  const failures: Partial<SyncState['failures']> = input.failures ?? {};

  return {
    upstream_url: typeof input.upstream_url === 'string' ? input.upstream_url : base.upstream_url,
    last_sync_at: Number.isFinite(input.last_sync_at as number) ? Number(input.last_sync_at) : base.last_sync_at,
    last_success_at: Number.isFinite(input.last_success_at as number) ? Number(input.last_success_at) : base.last_success_at,
    watermark: {
      sessions: numeric(wm.sessions),
      observations: numeric(wm.observations),
      summaries: numeric(wm.summaries),
      prompts: numeric(wm.prompts),
      prompt_completions: numeric(wm.prompt_completions),
    },
    failures: {
      consecutive: numeric(failures.consecutive),
      last_error: typeof failures.last_error === 'string' ? failures.last_error : null,
    },
  };
}

function numeric(value: unknown): number {
  return Number.isFinite(value as number) ? Number(value) : 0;
}
