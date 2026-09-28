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

    const verification = Bun.spawnSync({
      cmd: [process.execPath, '-e', `
        import { Database } from 'bun:sqlite';
        const db = new Database(process.env.DB_PATH, { readonly: true, create: false });
        console.log(JSON.stringify({
          versions: db.prepare('SELECT COUNT(*) count FROM schema_versions').get().count,
          integrity: db.prepare('PRAGMA integrity_check').get().integrity_check
        }));
        db.close();
      `],
      env: { ...process.env, DB_PATH: dbPath },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const state = JSON.parse(new TextDecoder().decode(verification.stdout).trim());
    expect(state.versions).toBeGreaterThan(0);
    expect(state.integrity).toBe('ok');
  });

  it('只读连接会等待短暂的独占写锁', async () => {
    initializeDatabase();
    const dbPath = path.join(dataDir, 'claude-mem.db');
    const readyPath = path.join(dataDir, 'lock-ready');
    const prepare = Bun.spawnSync({
      cmd: [process.execPath, '-e', "import { Database } from 'bun:sqlite'; const db=new Database(process.env.DB_PATH); db.exec('PRAGMA journal_mode=DELETE'); db.close();"],
      env: { ...process.env, DB_PATH: dbPath },
    });
    expect(prepare.exitCode).toBe(0);
    const holder = Bun.spawn({
      cmd: [process.execPath, '-e', `
        import { Database } from 'bun:sqlite';
        const db = new Database(process.env.DB_PATH);
        db.exec('BEGIN EXCLUSIVE');
        await Bun.write(process.env.READY_PATH, 'ready');
        await Bun.sleep(350);
        db.exec('ROLLBACK');
        db.close();
      `],
      env: { ...process.env, DB_PATH: dbPath, READY_PATH: readyPath },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    while (!existsSync(readyPath)) await Bun.sleep(10);
    const startedAt = performance.now();
    const result = runContext();
    const elapsedMs = performance.now() - startedAt;
    await holder.exited;
    expect(result.exitCode).toBe(0);
    expect(elapsedMs).toBeGreaterThan(250);
  });

  it('只读取已提交记录且不改变 schema 与记录数', () => {
    const result = Bun.spawnSync({
      cmd: [process.execPath, '-e', `
        import { Database } from 'bun:sqlite';
        import { SessionStore } from './src/services/sqlite/SessionStore.ts';
        import { generateContext } from './src/services/context/ContextBuilder.ts';
        import { ModeManager } from './src/services/domain/ModeManager.ts';
        ModeManager.getInstance().loadMode('code');
        const dbPath = process.env.CLAUDE_MEM_DATA_DIR + '/claude-mem.db';
        const store = new SessionStore(dbPath);
        const session = store.createSDKSession('readonly-content', 'readonly-project', 'prompt');
        store.ensureMemorySessionIdRegistered(session, 'readonly-memory');
        store.storeObservation('readonly-memory', 'readonly-project', {
          type: 'discovery', title: 'COMMITTED_READONLY_RECORD', subtitle: null,
          facts: [], narrative: 'committed narrative', concepts: ['how-it-works'], files_read: [], files_modified: []
        }, 1, 0, Date.now() - 1000);
        store.close();
        const writer = new Database(dbPath);
        const counts = () => ({
          schema: writer.prepare('SELECT COUNT(*) count FROM schema_versions').get().count,
          observations: writer.prepare('SELECT COUNT(*) count FROM observations').get().count,
          summaries: writer.prepare('SELECT COUNT(*) count FROM session_summaries').get().count,
        });
        const before = counts();
        writer.exec('BEGIN IMMEDIATE');
        writer.prepare('INSERT INTO observations (memory_session_id, project, text, type, title, subtitle, facts, narrative, concepts, files_read, files_modified, prompt_number, discovery_tokens, created_at, created_at_epoch) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
          'readonly-memory', 'readonly-project', 'pending', 'discovery', 'UNCOMMITTED_READONLY_RECORD', null,
          '[]', 'pending narrative', '["how-it-works"]', '[]', '[]', 2, 0, new Date().toISOString(), Date.now()
        );
        const text = await generateContext({ projects: ['readonly-project'] });
        writer.exec('ROLLBACK');
        const after = counts();
        const integrity = writer.prepare('PRAGMA integrity_check').get().integrity_check;
        writer.close();
        console.log(JSON.stringify({ text, before, after, integrity }));
      `],
      cwd: process.cwd(),
      env: {
        ...process.env,
        CLAUDE_MEM_DATA_DIR: dataDir,
        CLAUDE_MEM_MODES_DIR: path.join(process.cwd(), 'plugin', 'modes'),
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(result.exitCode).toBe(0);
    const output = JSON.parse(new TextDecoder().decode(result.stdout).trim());
    expect(output.text).toContain('COMMITTED_READONLY_RECORD');
    expect(output.text).not.toContain('UNCOMMITTED_READONLY_RECORD');
    expect(output.after).toEqual(output.before);
    expect(output.integrity).toBe('ok');
  });
});
