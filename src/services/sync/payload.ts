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
    SELECT id, content_session_id, prompt_number, prompt_text, created_at, created_at_epoch, completed_at_epoch
    FROM user_prompts
    WHERE id > ?
    ORDER BY id ASC
    LIMIT ?
  `).all(watermark.prompts, limit);

  const observations = redactObservations(observationsRaw, denyList);
  const summaries = redactSummaries(summariesRaw, denyList);

  const batch: IngestBatch = {
    schema_version: 1,
    user_label: userLabel,
    generated_at_epoch: now(),
    sessions,
    observations,
    summaries,
    prompts,
  };

  const nextLocalIds: SyncState['watermark'] = {
    sessions: lastId(sessions, watermark.sessions),
    observations: lastId(observationsRaw, watermark.observations),
    summaries: lastId(summariesRaw, watermark.summaries),
    prompts: lastId(prompts, watermark.prompts),
  };

  return { batch, nextLocalIds };
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
