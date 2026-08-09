import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdtempSync, rmSync, statSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

describe('ContextBuilder read-only database access', () => {
  let dataDir: string;
  let previous: string | undefined;

  beforeEach(() => {
    previous = process.env.CLAUDE_MEM_DATA_DIR;
    dataDir = mkdtempSync(path.join(tmpdir(), 'claude-mem-context-readonly-'));
  });

  afterEach(() => {
    if (previous === undefined) delete process.env.CLAUDE_MEM_DATA_DIR;
    else process.env.CLAUDE_MEM_DATA_DIR = previous;
    rmSync(dataDir, { recursive: true, force: true });
  });

  function runContext(): ReturnType<typeof Bun.spawnSync> {
    return Bun.spawnSync({
      cmd: [
        process.execPath,
        '-e',
        "import { ModeManager } from './src/services/domain/ModeManager.ts'; import { generateContext } from './src/services/context/ContextBuilder.ts'; ModeManager.getInstance().loadMode('code'); await generateContext({ cwd: process.cwd() });",
      ],
      cwd: process.cwd(),
      env: { ...process.env, CLAUDE_MEM_DATA_DIR: dataDir },
      stdout: 'pipe',
      stderr: 'pipe',
    });
  }

  function initializeDatabase(): void {
    const result = Bun.spawnSync({
      cmd: [
        process.execPath,
        '-e',
        "import { SessionStore } from './src/services/sqlite/SessionStore.ts'; const store = new SessionStore(); store.close();",
      ],
      cwd: process.cwd(),
      env: { ...process.env, CLAUDE_MEM_DATA_DIR: dataDir },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(result.exitCode).toBe(0);
  }

  it('数据库不存在时不创建目录或文件', () => {
    const result = runContext();
    expect(result.exitCode).toBe(0);
    expect(existsSync(path.join(dataDir, 'claude-mem.db'))).toBe(false);
  });

  it('已有数据库只读查询不修改主文件', async () => {
    initializeDatabase();
    const dbPath = path.join(dataDir, 'claude-mem.db');
    const before = statSync(dbPath).mtimeMs;
    await Bun.sleep(10);

    const result = runContext();
    expect(result.exitCode).toBe(0);
    expect(statSync(dbPath).mtimeMs).toBe(before);
  });
});
