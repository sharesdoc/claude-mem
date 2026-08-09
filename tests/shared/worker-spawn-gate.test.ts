import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { acquireSpawnLock, releaseSpawnLock } from '../../src/shared/worker-spawn-gate.js';

describe('worker spawn gate', () => {
  let dataDir: string;
  let previousDataDir: string | undefined;

  beforeEach(() => {
    previousDataDir = process.env.CLAUDE_MEM_DATA_DIR;
    dataDir = mkdtempSync(path.join(tmpdir(), 'claude-mem-spawn-gate-'));
    process.env.CLAUDE_MEM_DATA_DIR = dataDir;
  });

  afterEach(() => {
    releaseSpawnLock();
    if (previousDataDir === undefined) delete process.env.CLAUDE_MEM_DATA_DIR;
    else process.env.CLAUDE_MEM_DATA_DIR = previousDataDir;
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('只允许一个 launcher 获得锁，释放后可重新获得', () => {
    expect(acquireSpawnLock()).toBe(true);
    expect(acquireSpawnLock()).toBe(false);
    releaseSpawnLock();
    expect(acquireSpawnLock()).toBe(true);
  });

  it('接管超过 90 秒的陈旧锁，但不接管 89 秒锁', () => {
    const lockPath = path.join(dataDir, 'spawn.lock');
    writeFileSync(lockPath, JSON.stringify({ pid: 999_999 }));
    const fresh = new Date(Date.now() - 89_000);
    utimesSync(lockPath, fresh, fresh);
    expect(acquireSpawnLock()).toBe(false);

    const stale = new Date(Date.now() - 91_000);
    utimesSync(lockPath, stale, stale);
    expect(acquireSpawnLock()).toBe(true);
  });

  it('只允许 owner 释放锁', () => {
    const lockPath = path.join(dataDir, 'spawn.lock');
    writeFileSync(lockPath, JSON.stringify({ pid: process.pid + 1 }));
    releaseSpawnLock();
    expect(JSON.parse(readFileSync(lockPath, 'utf8')).pid).toBe(process.pid + 1);
  });

  it('锁路径发生非竞争 I/O 错误时拒绝无协调启动', () => {
    const invalidDataPath = path.join(dataDir, 'not-a-directory');
    writeFileSync(invalidDataPath, 'file');
    process.env.CLAUDE_MEM_DATA_DIR = invalidDataPath;
    expect(acquireSpawnLock()).toBe(false);
  });
});
