/**
 * batch.ts — shared infrastructure for **batch report generation**.
 *
 * Three small pieces, all in-memory (a batch is an ephemeral operation; if the
 * worker restarts mid-run the job is simply lost and the client's poll 404s):
 *
 *   1. runPool        — a fixed-size concurrency pool ("take N tasks at a time").
 *   2. job registry   — tracks live batch progress so the UI can poll it.
 *   3. period helpers — derive the [start,end) boundary + the completeness flag.
 *
 * The completeness flag is DERIVED, not stored: a report "covers the full
 * period" iff it was generated at/after the period's end. We compare the row's
 * existing `generated_at_epoch` to the period-end epoch — no DB column needed.
 */

import type { Database } from 'bun:sqlite';
import { SettingsDefaultsManager } from '../../../shared/SettingsDefaultsManager.js';

const DAY_MS = 86400000;

/* ── 0. Shared roster / activity queries (used by daily + weekly batch) ─────── */

/** Every user_label that has ever had a session — the full report-table roster. */
export function rosterAllUsers(db: Database): string[] {
  return (db.prepare(`
    SELECT DISTINCT COALESCE(NULLIF(user_label, ''), 'unknown') AS user_label
    FROM sdk_sessions
    WHERE user_label IS NOT NULL AND user_label != ''
    ORDER BY user_label
  `).all() as Array<{ user_label: string }>).map(r => r.user_label);
}

/**
 * user_labels with ANY activity (prompt / observation / summary) in [start,end).
 * Drives both the "has content" greying flag and the batch candidate filter, so
 * an empty period never costs an AI call.
 */
export function activeUsersInRange(db: Database, start: number, end: number): Set<string> {
  const rows = db.prepare(`
    SELECT user_label FROM (
      SELECT COALESCE(NULLIF(s.user_label, ''), 'unknown') AS user_label
        FROM user_prompts up JOIN sdk_sessions s ON s.content_session_id = up.content_session_id
        WHERE up.created_at_epoch >= ? AND up.created_at_epoch < ?
      UNION ALL
      SELECT COALESCE(NULLIF(o.user_label, ''), 'unknown')
        FROM observations o WHERE o.created_at_epoch >= ? AND o.created_at_epoch < ?
      UNION ALL
      SELECT COALESCE(NULLIF(ss.user_label, ''), 'unknown')
        FROM session_summaries ss WHERE ss.created_at_epoch >= ? AND ss.created_at_epoch < ?
    ) GROUP BY user_label
  `).all(start, end, start, end, start, end) as Array<{ user_label: string }>;
  return new Set(rows.map(r => r.user_label));
}

/** True iff the given user has any activity in [start,end) — single-user check. */
export function userHasActivity(db: Database, user: string, start: number, end: number): boolean {
  const row = db.prepare(`
    SELECT (
      EXISTS(SELECT 1 FROM user_prompts up JOIN sdk_sessions s ON s.content_session_id = up.content_session_id
             WHERE s.user_label = ? COLLATE NOCASE AND up.created_at_epoch >= ? AND up.created_at_epoch < ?)
      OR EXISTS(SELECT 1 FROM observations o WHERE o.user_label = ? COLLATE NOCASE AND o.created_at_epoch >= ? AND o.created_at_epoch < ?)
      OR EXISTS(SELECT 1 FROM session_summaries ss WHERE ss.user_label = ? COLLATE NOCASE AND ss.created_at_epoch >= ? AND ss.created_at_epoch < ?)
    ) AS hit
  `).get(user, start, end, user, start, end, user, start, end) as { hit: number };
  return !!row.hit;
}

/* ── 1. Concurrency pool ──────────────────────────────────────────────────── */

/** Result of generating one report in a batch. */
export type BatchOutcome = 'generated' | 'skipped' | 'failed';

/**
 * Run `worker` over `items` with at most `limit` in flight at once — the
 * literal "每次取 N 个任务执行" model. `limit` worker loops each pull the next
 * index and await it; when the queue drains they finish. `onProgress` fires once
 * per completed item (including failures) so callers can update a live counter.
 * Never rejects: a worker that throws is reported as 'failed' and the pool
 * continues.
 */
export async function runPool<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<BatchOutcome>,
  onProgress: (outcome: BatchOutcome, index: number) => void,
): Promise<void> {
  let next = 0;
  const lanes = Math.max(1, Math.min(limit, items.length));
  const runLane = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++;
      let outcome: BatchOutcome;
      try {
        outcome = await worker(items[i], i);
      } catch {
        outcome = 'failed';
      }
      onProgress(outcome, i);
    }
  };
  await Promise.all(Array.from({ length: lanes }, () => runLane()));
}

/** Resolve the configured batch concurrency (default 6, env/settings override). */
export function batchConcurrency(): number {
  const n = SettingsDefaultsManager.getInt('CLAUDE_MEM_REPORT_BATCH_CONCURRENCY');
  return Number.isFinite(n) && n > 0 ? n : 6;
}

/* ── 2. Job registry ──────────────────────────────────────────────────────── */

export interface BatchJob {
  id: string;
  total: number;       // tasks that will actually run (empty periods already filtered out)
  generated: number;   // reports (re)generated
  skipped: number;     // already-complete reports left untouched
  failed: number;      // generation errors (fell back to deterministic or failed)
  done: boolean;
  startedAt: number;
}

const jobs = new Map<string, BatchJob>();
const JOB_TTL_MS = 10 * 60 * 1000; // forget finished jobs after 10 min

/** Drop jobs that finished long ago so the map can't grow unbounded. */
function sweepJobs(now: number): void {
  for (const [id, j] of jobs) {
    if (j.done && now - j.startedAt > JOB_TTL_MS) jobs.delete(id);
  }
}

/** Create and register a new job. `total` = number of tasks that will run. */
export function createBatchJob(total: number): BatchJob {
  const now = Date.now();
  sweepJobs(now);
  const job: BatchJob = {
    id: crypto.randomUUID(),
    total, generated: 0, skipped: 0, failed: 0,
    done: total === 0, // an empty batch is immediately done
    startedAt: now,
  };
  jobs.set(job.id, job);
  return job;
}

/** Tally one finished task into its job. */
export function recordOutcome(jobId: string, outcome: BatchOutcome): void {
  const j = jobs.get(jobId);
  if (!j) return;
  if (outcome === 'generated') j.generated++;
  else if (outcome === 'skipped') j.skipped++;
  else j.failed++;
  if (j.generated + j.skipped + j.failed >= j.total) j.done = true;
}

/** Mark a job done (e.g. after the pool resolves), regardless of tallies. */
export function finishBatchJob(jobId: string): void {
  const j = jobs.get(jobId);
  if (j) j.done = true;
}

/** Progress snapshot for the poll endpoint; null if unknown/expired. */
export function getBatchJob(jobId: string): BatchJob | null {
  sweepJobs(Date.now());
  return jobs.get(jobId) ?? null;
}

/* ── 3. Period boundaries + completeness ──────────────────────────────────────
 * Mirrors the generators' own [start,end) math (Date.UTC of the wall-clock
 * boundary, shifted by tzOffsetMs to the true UTC instant in the viewer's TZ).
 * ──────────────────────────────────────────────────────────────────────────── */

/** Exclusive end epoch of a calendar day `YYYY-MM-DD` in the given TZ. */
export function dayEndEpoch(date: string, tzOffsetMs: number): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d) + DAY_MS - tzOffsetMs;
}

/** Exclusive end epoch of the ISO week starting at Monday `YYYY-MM-DD`. */
export function weekEndEpoch(monday: string, tzOffsetMs: number): number {
  const [y, m, d] = monday.split('-').map(Number);
  return Date.UTC(y, m - 1, d) + 7 * DAY_MS - tzOffsetMs;
}

/**
 * A report "covers the full period" (and is therefore locked against
 * regeneration) iff it was generated at/after the period's end — i.e. it saw
 * all 24h of the day / all 7 days of the week. Generated mid-period → incomplete
 * → still refreshable.
 */
export function isPeriodComplete(generatedAtEpoch: number | null | undefined, periodEndEpoch: number): boolean {
  return generatedAtEpoch != null && generatedAtEpoch >= periodEndEpoch;
}
