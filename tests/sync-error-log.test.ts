import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { appendSyncError, _rotateBytesForTests } from '../src/services/sync/error-log.js';

/**
 * T-28 — sync-errors.log writer.
 */

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'claude-mem-syncerr-'));
});

afterEach(() => {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* */ }
});

describe('appendSyncError', () => {
  it('writes a single tab-separated line per call', () => {
    appendSyncError({ level: 'ERROR', status: 401, url: 'https://mem/api/sync/ingest', message: 'no key' }, dir);
    const lines = readFileSync(join(dir, 'sync-errors.log'), 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^\d{4}-\d{2}-\d{2}T.+\tERROR\t401\thttps:\/\/mem\/api\/sync\/ingest\tno key$/);
  });

  it('handles NET (status=null) for network errors', () => {
    appendSyncError({ level: 'WARN', status: null, url: 'http://x', message: 'ECONNREFUSED' }, dir);
    const line = readFileSync(join(dir, 'sync-errors.log'), 'utf-8').trim();
    expect(line).toContain('\tWARN\tNET\thttp://x\tECONNREFUSED');
  });

  it('rotates when file exceeds rotate threshold', () => {
    const filePath = join(dir, 'sync-errors.log');
    const big = 'x'.repeat(_rotateBytesForTests());
    writeFileSync(filePath, big + '\n');
    expect(statSync(filePath).size).toBeGreaterThanOrEqual(_rotateBytesForTests());

    appendSyncError({ level: 'ERROR', status: 500, url: 'http://x', message: 'boom' }, dir);

    expect(existsSync(filePath + '.1')).toBe(true);
    // active file now small + has only the new line
    expect(statSync(filePath).size).toBeLessThan(1024);
  });

  it('truncates messages with newlines to a single safe line', () => {
    appendSyncError({ level: 'ERROR', status: 500, url: 'http://x', message: 'line1\nline2\nline3' }, dir);
    const lines = readFileSync(join(dir, 'sync-errors.log'), 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('line1 line2 line3');
  });

  it('does not throw when dir is unwritable', () => {
    expect(() =>
      appendSyncError({ level: 'ERROR', status: 1, url: 'x', message: 'y' }, '/this/path/does/not/exist/and/cannot/be/made/xxxx')
    ).not.toThrow();
  });
});
