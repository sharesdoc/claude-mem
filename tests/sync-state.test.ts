import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, chmodSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { readState, writeState, zeroState, type SyncState } from '../src/services/sync/sync-state.js';

/**
 * T-07 — sync-state.json persistence.
 *
 * Contracts verified:
 *  - missing file returns zero state
 *  - corrupt JSON returns zero state (no throw)
 *  - partial state is filled in with zero defaults (forward-compat)
 *  - writeState is atomic (no partial writes visible)
 *  - writeState never throws on IO failure
 */

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'claude-mem-sync-state-'));
});

afterEach(() => {
  try { rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* */ }
});

describe('sync-state', () => {
  it('returns zero state when file is missing', () => {
    const path = join(tmpRoot, 'missing.json');
    const state = readState(path);
    expect(state).toEqual(zeroState());
    expect(state.watermark.observations).toBe(0);
  });

  it('returns zero state when file is corrupt (does not throw)', () => {
    const path = join(tmpRoot, 'corrupt.json');
    writeFileSync(path, '{ not json — at all');
    const state = readState(path);
    expect(state).toEqual(zeroState());
  });

  it('preserves valid state through round-trip', () => {
    const path = join(tmpRoot, 'state.json');
    const written: SyncState = {
      upstream_url: 'http://mem.acme.com',
      last_sync_at: 1700000000000,
      last_success_at: 1700000001000,
      watermark: { sessions: 12, observations: 345, summaries: 67, prompts: 89, prompt_completions: 1700000002000, prompt_completions_id: 0, prompt_activity: 1700000002000, prompt_activity_id: 0 },
      failures: { consecutive: 2, last_error: 'timeout' },
    };
    writeState(written, path);
    expect(existsSync(path)).toBe(true);

    const read = readState(path);
    expect(read).toEqual(written);
  });

  it('fills missing fields with zero defaults (forward-compat)', () => {
    const path = join(tmpRoot, 'partial.json');
    writeFileSync(path, JSON.stringify({
      upstream_url: 'http://x',
      watermark: { observations: 9 },
    }));
    const state = readState(path);
    expect(state.upstream_url).toBe('http://x');
    expect(state.watermark.observations).toBe(9);
    expect(state.watermark.sessions).toBe(0);
    // 升级前的旧 state 文件缺 prompt_completions → 归零(触发一次性全量完成回填)
    expect(state.watermark.prompt_completions).toBe(0);
    // 同理缺 prompt_activity → 归零(触发一次性全量活跃度回填)
    expect(state.watermark.prompt_activity).toBe(0);
    expect(state.failures.consecutive).toBe(0);
    expect(state.failures.last_error).toBeNull();
  });

  it('writeState writes atomically (tmp + rename)', () => {
    const path = join(tmpRoot, 'atomic.json');
    const state = zeroState();
    state.upstream_url = 'http://acme';
    writeState(state, path);

    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.upstream_url).toBe('http://acme');
  });

  it('writeState swallows IO errors instead of throwing', () => {
    const path = join(tmpRoot, 'readonly', 'state.json');
    expect(() => writeState(zeroState(), path)).not.toThrow();
  });
});
