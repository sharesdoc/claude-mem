import { existsSync, statSync, renameSync, appendFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { LOGS_DIR } from '../../shared/paths.js';

/**
 * T-28 — append failure rows to `~/.claude-mem/logs/sync-errors.log`.
 *
 * Separate from the main worker log because SyncAgent errors are
 * actionable for operators (token expired, server down, mis-config)
 * and we want them line-buffered + grep-friendly without scrolling
 * through chroma chatter.
 *
 * Format (single line, tab-separated):
 *   <ISO-ts> <level> <status> <url> <message>
 *
 * Rotation: when the active file exceeds ~10MB it gets renamed to
 * `sync-errors.log.1` (overwriting any previous .1). One generation is
 * enough — the worker log already captures the full trail.
 */

const FILE_NAME = 'sync-errors.log';
const ROTATE_BYTES = 10 * 1024 * 1024;

export type SyncErrorLevel = 'WARN' | 'ERROR';

export interface SyncErrorEntry {
  level: SyncErrorLevel;
  status: number | null;     // HTTP status or null on network/timeout error
  url: string;
  message: string;
}

export function appendSyncError(entry: SyncErrorEntry, logsDir: string = LOGS_DIR): void {
  const filePath = join(logsDir, FILE_NAME);
  try {
    ensureDir(logsDir);
    rotateIfNeeded(filePath);
    appendFileSync(filePath, formatLine(entry) + '\n', { encoding: 'utf-8' });
  } catch {
    // Logging the logging failure is pointless — drop silently. The
    // SyncAgent's main loop also emits a structured warn() so nothing
    // is truly invisible.
  }
}

function rotateIfNeeded(filePath: string): void {
  if (!existsSync(filePath)) return;
  let size = 0;
  try {
    size = statSync(filePath).size;
  } catch {
    return;
  }
  if (size < ROTATE_BYTES) return;
  try {
    renameSync(filePath, filePath + '.1');
  } catch {
    // Best-effort: if rotation fails we just keep appending. Disk-full
    // is the only realistic failure mode here.
  }
}

function ensureDir(dir: string): void {
  if (existsSync(dir)) return;
  mkdirSync(dir, { recursive: true });
}

function formatLine(entry: SyncErrorEntry): string {
  const ts = new Date().toISOString();
  const status = entry.status == null ? 'NET' : String(entry.status);
  const safeMsg = entry.message.replace(/\r?\n/g, ' ').slice(0, 1024);
  return `${ts}\t${entry.level}\t${status}\t${entry.url}\t${safeMsg}`;
}

export function _rotateBytesForTests(): number {
  return ROTATE_BYTES;
}
