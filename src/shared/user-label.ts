import { existsSync, readFileSync, writeFileSync, renameSync } from 'fs';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import { getOsUserName } from './os-user.js';
import { paths } from './paths.js';
import { logger } from '../utils/logger.js';

const SAFE_CHARS = /^[A-Za-z0-9._-]+$/;

/**
 * Resolved user label for this worker process. Cached for the life of the
 * process so we never re-evaluate (and never accidentally change identity
 * mid-session if settings.json is hand-edited while running).
 */
let cached: string | undefined;

/**
 * Resolve the sync identity for this worker.
 *
 * Order:
 *   1. CLAUDE_MEM_USER_LABEL from settings.json (if non-empty, trimmed)
 *   2. OS username (Mac/Win/Linux via os.userInfo().username)
 *   3. literal 'unknown' as a last resort
 *
 * Side effect (only when settings has an empty/missing value AND the OS
 * lookup succeeded): write the resolved value back to settings.json so
 * future worker boots have a stable label even if the OS user changes.
 * The persistence is atomic (tmp + rename) and *additive* — it never
 * touches other keys.
 */
export function resolveUserLabel(settingsPath?: string): string {
  if (cached !== undefined) return cached;
  const path = settingsPath ?? paths.settings();

  const explicit = readSettingsValue(path, 'CLAUDE_MEM_USER_LABEL');
  if (explicit && explicit.trim().length > 0) {
    cached = sanitize(explicit.trim());
    return cached;
  }

  const fromOs = getOsUserName();
  const fallback = sanitize(fromOs ?? 'unknown');

  // Best-effort: persist so subsequent boots have a stable label even if
  // the OS user changes (e.g. user runs the worker under a service account
  // later). A failure here is non-fatal — we still return the fallback.
  try {
    persistUserLabel(path, fallback);
  } catch (error: unknown) {
    logger.warn(
      'SETTINGS',
      'Failed to persist resolved user_label back to settings.json (continuing in-memory)',
      { path },
      error instanceof Error ? error : new Error(String(error)),
    );
  }

  cached = fallback;
  return cached;
}

/** Test/dev only: clear the in-process cache so the next resolve re-reads settings. */
export function _resetUserLabelCacheForTests(): void {
  cached = undefined;
}

/**
 * Sanitise a label to the same character class accepted by the sync ingest
 * route. Non-safe characters are collapsed to '-'; empty strings yield
 * 'unknown' so downstream code never has to handle the empty case.
 */
function sanitize(raw: string): string {
  if (SAFE_CHARS.test(raw)) return raw;
  const cleaned = raw.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned.length > 0 ? cleaned : 'unknown';
}

/**
 * Read a single top-level string value from settings.json. Returns
 * undefined if the file is missing, unreadable, or the key is absent.
 * Tolerates both flat schema and the legacy `{env: {...}}` nested form
 * (same migration logic SettingsDefaultsManager applies elsewhere).
 */
function readSettingsValue(settingsPath: string, key: string): string | undefined {
  try {
    if (!existsSync(settingsPath)) return undefined;
    const raw = readFileSync(settingsPath, 'utf-8');
    const parsed = JSON.parse(raw);
    const flat = parsed && typeof parsed === 'object' && parsed.env && typeof parsed.env === 'object'
      ? parsed.env
      : parsed;
    const value = flat?.[key];
    return typeof value === 'string' ? value : undefined;
  } catch (error: unknown) {
    logger.debug(
      'SETTINGS',
      'Failed to read user_label from settings.json (treating as missing)',
      { settingsPath },
      error instanceof Error ? error : new Error(String(error)),
    );
    return undefined;
  }
}

/**
 * Persist CLAUDE_MEM_USER_LABEL into settings.json atomically. Preserves
 * every other key/value and the file's existing nested/flat shape.
 *
 * Atomic write: write to a tmp file in the same directory, then rename
 * over the target — guarantees the file is never observed half-written.
 */
function persistUserLabel(settingsPath: string, value: string): void {
  let existing: Record<string, unknown> = {};
  if (existsSync(settingsPath)) {
    try {
      existing = JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>;
    } catch {
      existing = {};
    }
  }

  const flatHost = existing.env && typeof existing.env === 'object'
    ? (existing.env as Record<string, unknown>)
    : existing;

  if (flatHost.CLAUDE_MEM_USER_LABEL === value) return;

  flatHost.CLAUDE_MEM_USER_LABEL = value;

  const targetDir = dirname(settingsPath);
  const tmpName = `.user-label.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  const tmpPath = existsSync(targetDir) ? join(targetDir, tmpName) : join(tmpdir(), tmpName);

  writeFileSync(tmpPath, JSON.stringify(existing, null, 2), 'utf-8');
  renameSync(tmpPath, settingsPath);
}
