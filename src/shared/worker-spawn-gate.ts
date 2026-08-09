import { dirname, join } from 'path';
import { mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { SettingsDefaultsManager } from './SettingsDefaultsManager.js';
import { logger } from '../utils/logger.js';

/** Spawn ownership expires only after the longest platform readiness window. */
const SPAWN_LOCK_STALE_MS = 90_000;

function getSpawnLockPath(): string {
  return join(SettingsDefaultsManager.get('CLAUDE_MEM_DATA_DIR'), 'spawn.lock');
}

/**
 * Atomically claims daemon spawn ownership. A false result means another
 * launcher owns a fresh lock and this caller must wait for its worker.
 */
export function acquireSpawnLock(): boolean {
  const lockPath = getSpawnLockPath();
  const payload = JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() });

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      mkdirSync(dirname(lockPath), { recursive: true });
      writeFileSync(lockPath, payload, { flag: 'wx' });
      return true;
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') {
        logger.warn('SYSTEM', 'Spawn lock unavailable; failing open', { lockPath, code }, err);
        return true;
      }
      if (attempt > 0) return false;

      let observedMtime: number;
      try {
        observedMtime = statSync(lockPath).mtimeMs;
      } catch {
        continue;
      }
      if (Date.now() - observedMtime <= SPAWN_LOCK_STALE_MS) return false;

      try {
        if (statSync(lockPath).mtimeMs !== observedMtime) return false;
        unlinkSync(lockPath);
      } catch {
        return false;
      }
    }
  }
  return false;
}

/** Releases only a lock owned by this process. */
export function releaseSpawnLock(): void {
  const lockPath = getSpawnLockPath();
  try {
    const lock = JSON.parse(readFileSync(lockPath, 'utf8')) as { pid?: unknown };
    if (lock.pid === process.pid) unlinkSync(lockPath);
  } catch {
    // Best effort; stale ownership self-heals on the next acquisition.
  }
}
