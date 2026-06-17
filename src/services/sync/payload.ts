import type { Database } from 'bun:sqlite';
import type { SyncState } from './sync-state.js';

/**
 * T-08 — incremental payload collector for SyncAgent (S-doc §5.3).
 *
 * Pulls rows newer than the per-table watermark and packages them into an
 * IngestBatch the server can apply in dependency order:
 *
 *   1. sessions      (parents)
 *   2. observations  (FK → sdk_sessions.memory_session_id)
 *   3. summaries     (FK → sdk_sessions.memory_session_id)
 *   4. prompts       (FK → sdk_sessions.content_session_id)
 *
 * Each table is read with `WHERE id > :wm ORDER BY id ASC LIMIT :batchSize`
 * so server-side ingest can apply rows in source-id order without needing
 * to materialise a topology graph.
 *
 * Redaction (T-08 spec): `redactGlobs` are matched against the file path
 * lists stored in observations.files_read/files_modified and summaries
 * (files_read/files_edited). Matching entries are filtered out; an
 * observation whose *every* file lands in the deny list is dropped from
 * the payload entirely (it's almost certainly secrets metadata).
 *
 * JSON columns travel as opaque strings — we never parse-then-re-encode
 * to avoid byte-drift breaking the content_hash dedup the server uses.
 */

export interface IngestBatch {
  schema_version: 1;
  user_label: string;
  generated_at_epoch: number;
  /** Client's think-time cap (minutes). Server verifies/corrects upon ingest. */
  think_time_cap_minutes: number;
  sessions: SessionRow[];
  observations: ObservationRow[];
  summaries: SummaryRow[];
  prompts: PromptRow[];
}

export interface SessionRow {
  id: number;
  content_session_id: string;
  memory_session_id: string | null;
  project: string;
  platform_source: string;
  user_prompt: string | null;
  custom_title: string | null;
  started_at: string;
  started_at_epoch: number;
  completed_at: string | null;
  completed_at_epoch: number | null;
  status: string;
  user_name: string | null;
  user_label: string | null;
}

export interface ObservationRow {
  id: number;
  memory_session_id: string;
  project: string;
  text: string | null;
  type: string;
  title: string | null;
  subtitle: string | null;
  facts: string | null;
  narrative: string | null;
  concepts: string | null;
  files_read: string | null;
  files_modified: string | null;
  prompt_number: number | null;
  created_at: string;
  created_at_epoch: number;
  content_hash: string | null;
  user_label: string;
}

export interface SummaryRow {
  id: number;
  memory_session_id: string;
  project: string;
  request: string | null;
  investigated: string | null;
  learned: string | null;
  completed: string | null;
  next_steps: string | null;
  files_read: string | null;
  files_edited: string | null;
  notes: string | null;
  prompt_number: number | null;
  created_at: string;
  created_at_epoch: number;
  user_label: string;
}

export interface PromptRow {
  id: number;
  content_session_id: string;
  prompt_number: number;
  prompt_text: string;
  created_at: string;
  created_at_epoch: number;
  completed_at_epoch: number | null;
  think_time_ms: number;
  /** 真实活跃时长(liveness 计算),NULL=尚未回填 */
  active_ms: number | null;
  /** 挂起时长(liveness 计算),NULL=尚未回填 */
  idle_ms: number | null;
}

export interface CollectResult {
  batch: IngestBatch;
  nextLocalIds: SyncState['watermark'];
}

const DEFAULT_BATCH_SIZE = 200;

export function collectIncremental(
  db: Database,
  watermark: SyncState['watermark'],
  batchSize: number,
  redactGlobs: string[],
  userLabel: string,
  now: () => number = () => Date.now(),
): CollectResult {
  const limit = Math.max(1, Math.min(batchSize | 0, DEFAULT_BATCH_SIZE * 10));
  const denyList = compileGlobs(redactGlobs);

  const sessions = db.query<SessionRow, [number, number]>(`
    SELECT id, content_session_id, memory_session_id, project, platform_source, user_prompt,
           custom_title, started_at, started_at_epoch, completed_at, completed_at_epoch,
           status, user_name, user_label
    FROM sdk_sessions
    WHERE id > ?
    ORDER BY id ASC
    LIMIT ?
  `).all(watermark.sessions, limit);

  const observationsRaw = db.query<ObservationRow, [number, number]>(`
    SELECT id, memory_session_id, project, text, type, title, subtitle, facts, narrative,
           concepts, files_read, files_modified, prompt_number, created_at, created_at_epoch,
           content_hash, user_label
    FROM observations
    WHERE id > ?
    ORDER BY id ASC
    LIMIT ?
  `).all(watermark.observations, limit);

  const summariesRaw = db.query<SummaryRow, [number, number]>(`
    SELECT id, memory_session_id, project, request, investigated, learned, completed,
           next_steps, files_read, files_edited, notes, prompt_number, created_at, created_at_epoch, user_label
    FROM session_summaries
    WHERE id > ?
    ORDER BY id ASC
    LIMIT ?
  `).all(watermark.summaries, limit);

  const prompts = db.query<PromptRow, [number, number]>(`
    SELECT id, content_session_id, prompt_number, prompt_text, created_at, created_at_epoch, completed_at_epoch, think_time_ms, active_ms, idle_ms
    FROM user_prompts
    WHERE id > ?
    ORDER BY id ASC
    LIMIT ?
  `).all(watermark.prompts, limit);

  // 完成时间回填(任务状态自愈):prompt 行在提交时插入(completed_at_epoch=NULL),
  // 任务结束后才 UPDATE 回填。id 水位只看新行,几乎必然在回填前就把行推走 →
  // 服务端该行 completed_at_epoch 永远 NULL → viewer 显示 "Task status unclear"。
  // 这里按完成时间二级水位(prompt_completions)重推已越过 id 水位、且完成时间
  // 新于上次推送的行;服务端按 (content_session_id, prompt_number) 幂等补全。
  const { backfills: promptBackfills, nextCompletions } = collectPromptCompletionBackfills(
    db,
    watermark.prompts,
    watermark.prompt_completions,
    limit,
    prompts,
  );

  const observations = redactObservations(observationsRaw, denyList);
  const summaries = redactSummaries(summariesRaw, denyList);

  // 引用闭包(FK 自愈):observations/summaries/prompts 引用到、但不在本批
  // sessions 里的会话行,无视水位强制带上。否则会卡死:会话行先以
  // memory_session_id=NULL 创建、几秒后才 UPDATE 回填;若 5s 一次的 tick 恰好
  // 在回填前把该行推走,水位越过它、永不重推,服务端该行 memory_session_id
  // 永远是 NULL → 之后推其 observations 必 "FOREIGN KEY constraint failed",
  // 整批事务回滚、同一批次每 tick 重试到永远。带上引用会话后,服务端 upsert
  // 的 COALESCE 会补上 memory_session_id,FK 即通,卡死批次自愈。
  // 注意 nextLocalIds.sessions 仍按水位窗口内的 sessions 计算(闭包补带的是
  // 旧行,不得推进水位)。
  // 回填行 id 均 <= id 水位、新行 id 均 > id 水位,二者不会重复。
  const allPrompts = [...prompts, ...promptBackfills];
  const allSessions = withReferencedSessions(db, sessions, observations, summaries, allPrompts);

  const batch: IngestBatch = {
    schema_version: 1,
    user_label: userLabel,
    generated_at_epoch: now(),
    think_time_cap_minutes: parseInt(process.env.CLAUDE_MEM_THINK_TIME_CAP_MINUTES ?? '0', 10) || 0,
    sessions: allSessions,
    observations,
    summaries,
    prompts: allPrompts,
  };

  const nextLocalIds: SyncState['watermark'] = {
    sessions: lastId(sessions, watermark.sessions),
    observations: lastId(observationsRaw, watermark.observations),
    summaries: lastId(summariesRaw, watermark.summaries),
    prompts: lastId(prompts, watermark.prompts),
    prompt_completions: nextCompletions,
  };

  return { batch, nextLocalIds };
}

/**
 * 收集需要重推的"完成回填"prompt 行,并计算下一个完成时间水位。
 *
 * 取已越过 id 水位(idWatermark)、completed_at_epoch 晚于完成水位
 * (completionWatermark)的行,按完成时间升序限量收集。水位推进规则:
 *  - 命中 limit(可能还有更多):水位只推进到本批最后一行的完成时间,且为
 *    避免同毫秒并列行被 `>` 过滤器跳过,裁掉与最后一行同完成时间的尾部并列
 *    行留到下个 tick(全批同毫秒时保留,否则无法推进);本批新行即使带有
 *    更新的完成时间也不得越过该边界,否则会跳过未收完的剩余回填。
 *  - 未命中 limit(已收完):可一并吸收本批新行自带的完成时间,避免这些行
 *    下个 tick 被无谓重推。
 */
function collectPromptCompletionBackfills(
  db: Database,
  idWatermark: number,
  completionWatermark: number,
  limit: number,
  freshPrompts: PromptRow[],
): { backfills: PromptRow[]; nextCompletions: number } {
  let backfills = db.query<PromptRow, [number, number, number]>(`
    SELECT id, content_session_id, prompt_number, prompt_text, created_at, created_at_epoch, completed_at_epoch, think_time_ms, active_ms, idle_ms
    FROM user_prompts
    WHERE id <= ? AND completed_at_epoch IS NOT NULL AND completed_at_epoch > ?
    ORDER BY completed_at_epoch ASC, id ASC
    LIMIT ?
  `).all(idWatermark, completionWatermark, limit);

  const truncated = backfills.length === limit;
  if (truncated) {
    const lastEpoch = backfills[backfills.length - 1].completed_at_epoch!;
    const trimmed = backfills.filter(p => p.completed_at_epoch! < lastEpoch);
    if (trimmed.length > 0) backfills = trimmed;
  }

  let nextCompletions = completionWatermark;
  for (const p of backfills) {
    if (p.completed_at_epoch! > nextCompletions) nextCompletions = p.completed_at_epoch!;
  }
  if (!truncated) {
    for (const p of freshPrompts) {
      if (p.completed_at_epoch != null && p.completed_at_epoch > nextCompletions) {
        nextCompletions = p.completed_at_epoch;
      }
    }
  }

  return { backfills, nextCompletions };
}

const SESSION_COLS = `id, content_session_id, memory_session_id, project, platform_source, user_prompt,
         custom_title, started_at, started_at_epoch, completed_at, completed_at_epoch,
         status, user_name, user_label`;

/**
 * 把本批数据行引用到的会话补进 sessions 列表(按 content_session_id 去重),
 * 保证批次的引用闭包:observations/summaries 经 memory_session_id、prompts 经
 * content_session_id 引用 sdk_sessions。补带行均为水位以下的旧行,数量上限为
 * 本批引用的去重会话数(实际通常只有零星几条,不会顶到服务端 maxBatch)。
 */
function withReferencedSessions(
  db: Database,
  sessions: SessionRow[],
  observations: ObservationRow[],
  summaries: SummaryRow[],
  prompts: PromptRow[],
): SessionRow[] {
  const haveMem = new Set<string>();
  const haveContent = new Set<string>();
  for (const s of sessions) {
    if (s.memory_session_id) haveMem.add(s.memory_session_id);
    haveContent.add(s.content_session_id);
  }

  const needMem = new Set<string>();
  for (const o of observations) {
    if (o.memory_session_id && !haveMem.has(o.memory_session_id)) needMem.add(o.memory_session_id);
  }
  for (const s of summaries) {
    if (s.memory_session_id && !haveMem.has(s.memory_session_id)) needMem.add(s.memory_session_id);
  }
  const needContent = new Set<string>();
  for (const p of prompts) {
    if (p.content_session_id && !haveContent.has(p.content_session_id)) needContent.add(p.content_session_id);
  }

  if (needMem.size === 0 && needContent.size === 0) return sessions;

  const byMem = db.query<SessionRow, [string]>(
    `SELECT ${SESSION_COLS} FROM sdk_sessions WHERE memory_session_id = ?`
  );
  const byContent = db.query<SessionRow, [string]>(
    `SELECT ${SESSION_COLS} FROM sdk_sessions WHERE content_session_id = ?`
  );

  const extras: SessionRow[] = [];
  for (const id of needMem) {
    const row = byMem.get(id);
    if (row && !haveContent.has(row.content_session_id)) {
      extras.push(row);
      haveContent.add(row.content_session_id);
    }
  }
  for (const id of needContent) {
    const row = byContent.get(id);
    if (row && !haveContent.has(row.content_session_id)) {
      extras.push(row);
      haveContent.add(row.content_session_id);
    }
  }
  return extras.length === 0 ? sessions : sessions.concat(extras);
}

function lastId(rows: Array<{ id: number }>, fallback: number): number {
  if (rows.length === 0) return fallback;
  return rows[rows.length - 1].id;
}

/**
 * Compile csv/array of globs into a single matcher.
 * Supports `*` (any non-/ chars) and `**` (any chars incl. /).
 * Match is case-sensitive (file paths usually are on Linux servers).
 */
function compileGlobs(globs: string[]): (path: string) => boolean {
  const clean = globs.map(g => g.trim()).filter(Boolean);
  if (clean.length === 0) return () => false;

  const regex = new RegExp('^(?:' + clean.map(globToRegex).join('|') + ')$');
  return (path: string) => regex.test(path);
}

function globToRegex(glob: string): string {
  let out = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        out += '.*';
        i++;
      } else {
        out += '[^/]*';
      }
    } else if (/[.+^${}()|[\]\\]/.test(c)) {
      out += '\\' + c;
    } else if (c === '?') {
      out += '[^/]';
    } else {
      out += c;
    }
  }
  return out;
}

function redactObservations(rows: ObservationRow[], deny: (p: string) => boolean): ObservationRow[] {
  const out: ObservationRow[] = [];
  for (const row of rows) {
    const read = filterCsv(row.files_read, deny);
    const written = filterCsv(row.files_modified, deny);

    const origRead = countCsv(row.files_read);
    const origWritten = countCsv(row.files_modified);
    const survivedRead = countCsv(read);
    const survivedWritten = countCsv(written);

    // Drop the entire observation only when it originally referenced
    // files AND every single one of them was redacted — otherwise emit
    // the observation with the partially-cleaned lists so downstream
    // still sees the narrative/title.
    const hadFiles = origRead + origWritten > 0;
    const allRedacted = hadFiles && (survivedRead + survivedWritten === 0);
    if (allRedacted) continue;

    out.push({ ...row, files_read: read, files_modified: written });
  }
  return out;
}

function redactSummaries(rows: SummaryRow[], deny: (p: string) => boolean): SummaryRow[] {
  return rows.map(row => ({
    ...row,
    files_read: filterCsv(row.files_read, deny),
    files_edited: filterCsv(row.files_edited, deny),
  }));
}

function filterCsv(value: string | null, deny: (p: string) => boolean): string | null {
  if (!value) return value;
  const trimmed = value.trim();
  if (!trimmed) return value;

  // The schema stores file lists as either JSON arrays or comma-separated
  // plain strings (historical drift). Detect JSON arrays first so we
  // preserve the encoding when re-emitting.
  if (trimmed.startsWith('[')) {
    try {
      const arr = JSON.parse(trimmed);
      if (Array.isArray(arr)) {
        const kept = arr.filter(item => typeof item !== 'string' || !deny(item));
        return JSON.stringify(kept);
      }
    } catch {
      /* fall through to csv */
    }
  }

  const kept = trimmed.split(',').map(s => s.trim()).filter(s => s.length > 0 && !deny(s));
  return kept.length === 0 ? '' : kept.join(',');
}

function countCsv(value: string | null): number {
  if (!value) return 0;
  const trimmed = value.trim();
  if (!trimmed) return 0;
  if (trimmed.startsWith('[')) {
    try {
      const arr = JSON.parse(trimmed);
      if (Array.isArray(arr)) return arr.length;
    } catch { /* */ }
  }
  return trimmed.split(',').filter(s => s.trim().length > 0).length;
}
