import { describe, it, expect, beforeEach, afterEach, afterAll, spyOn, mock } from 'bun:test';
import { homedir } from 'os';
import { join } from 'path';

// X-029: mock 注册持有句柄并在 afterAll restore(防跨文件泄漏);
// worker-utils mock 补 fetchWithTimeout 导出(被测代码传递依赖)。
mock.module('../../../src/shared/SettingsDefaultsManager.js', () => ({
  SettingsDefaultsManager: {
    get: (key: string) => {
      if (key === 'CLAUDE_MEM_DATA_DIR') return join(homedir(), '.claude-mem');
      return '';
    },
    getInt: () => 0,
    // X-033: 消费端 project-filter.ts:24 对 EXCLUDED_PROJECTS 执行 .trim(),
    // 必须是字符串而非数组。
    loadFromFile: () => ({ CLAUDE_MEM_EXCLUDED_PROJECTS: '' }),
  },
}));

const workerCallLog: Array<{ path: string; options: any }> = [];
mock.module('../../../src/shared/worker-utils.js', () => ({
  ensureWorkerRunning: () => Promise.resolve(true),
  getWorkerPort: () => 37777,
  fetchWithTimeout: async () => new Response('{}', { status: 200 }),
  workerHttpRequest: (apiPath: string, options?: any) => {
    workerCallLog.push({ path: apiPath, options });
    throw new Error(
      `workerHttpRequest MUST NOT be called in subagent context (called with ${apiPath})`
    );
  },
  // X-033: summarize.ts:3 直接 import 该导出, 缺失导致本文件全部用例模块加载失败。
  executeWithWorkerFallback: async (apiPath: string, method: string, body: unknown) => {
    workerCallLog.push({ path: apiPath, options: { method, body } });
    return { status: 'queued' };
  },
  isWorkerFallback: () => false,
}));

afterAll(() => {
  mock.restore();
  
});

import { logger } from '../../../src/utils/logger.js';

let loggerSpies: ReturnType<typeof spyOn>[] = [];

beforeEach(() => {
  workerCallLog.length = 0;
  loggerSpies = [
    spyOn(logger, 'info').mockImplementation(() => {}),
    spyOn(logger, 'debug').mockImplementation(() => {}),
    spyOn(logger, 'warn').mockImplementation(() => {}),
    spyOn(logger, 'error').mockImplementation(() => {}),
    spyOn(logger, 'failure').mockImplementation(() => {}),
    spyOn(logger, 'dataIn').mockImplementation(() => {}),
  ];
});

afterEach(() => {
  loggerSpies.forEach(spy => spy.mockRestore());
});

describe('summarizeHandler — subagent short-circuit', () => {
  it('skips summary and returns SUCCESS when agentId is set', async () => {
    const { summarizeHandler } = await import('../../../src/cli/handlers/summarize.js');

    const result = await summarizeHandler.execute({
      sessionId: 'session-abc',
      cwd: '/tmp',
      platform: 'claude-code',
      transcriptPath: '/tmp/does-not-matter.jsonl',
      agentId: 'agent-abc',
    });

    expect(result.continue).toBe(true);
    expect(result.suppressOutput).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(workerCallLog.length).toBe(0);
  });

  it('does NOT skip when only agentType is set (--agent main session still owns its summary)', async () => {
    const { summarizeHandler } = await import('../../../src/cli/handlers/summarize.js');

    const result = await summarizeHandler.execute({
      sessionId: 'session-def',
      cwd: '/tmp',
      platform: 'claude-code',
      agentType: 'Explore',
      // transcriptPath intentionally omitted
    });

    expect(result.continue).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(workerCallLog.length).toBe(0);
  });

  it('skips summary when both agentId and agentType are set', async () => {
    const { summarizeHandler } = await import('../../../src/cli/handlers/summarize.js');

    const result = await summarizeHandler.execute({
      sessionId: 'session-both',
      cwd: '/tmp',
      platform: 'claude-code',
      transcriptPath: '/tmp/does-not-matter.jsonl',
      agentId: 'agent-xyz',
      agentType: 'Plan',
    });

    expect(result.continue).toBe(true);
    expect(result.suppressOutput).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(workerCallLog.length).toBe(0);
  });

  it('falls through to existing no-transcriptPath guard in main-session context', async () => {
    const { summarizeHandler } = await import('../../../src/cli/handlers/summarize.js');

    const result = await summarizeHandler.execute({
      sessionId: 'session-main',
      cwd: '/tmp',
      platform: 'claude-code',
      // transcriptPath intentionally omitted
    });

    expect(result.continue).toBe(true);
    expect(result.suppressOutput).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(workerCallLog.length).toBe(0);
  });
});
