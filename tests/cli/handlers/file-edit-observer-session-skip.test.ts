import { afterAll, afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { join } from 'path';
import { tmpdir } from 'os';

// X-029: mock 注册持有句柄并在 afterAll restore(防跨文件泄漏);
// worker-utils mock 补 fetchWithTimeout 导出(被测代码传递依赖)。
const dataDir = join(tmpdir(), 'claude-mem-file-edit-observer-test');
const workerCallLog: Array<{ path: string; method: string; body: unknown }> = [];

mock.module('../../../src/shared/SettingsDefaultsManager.js', () => ({
  SettingsDefaultsManager: {
    get: (key: string) => {
      if (key === 'CLAUDE_MEM_DATA_DIR') return dataDir;
      return '';
    },
    getInt: () => 0,
    loadFromFile: () => ({ CLAUDE_MEM_EXCLUDED_PROJECTS: '' }),
  },
}));

mock.module('../../../src/shared/hook-settings.js', () => ({
  loadFromFileOnce: () => ({ CLAUDE_MEM_EXCLUDED_PROJECTS: '' }),
}));

mock.module('../../../src/shared/worker-utils.js', () => ({
  fetchWithTimeout: async () => new Response('{}', { status: 200 }),
  executeWithWorkerFallback: (apiPath: string, method: string, body: unknown) => {
    workerCallLog.push({ path: apiPath, method, body });
    throw new Error(`worker must not be called for internal observer sessions: ${apiPath}`);
  },
  isWorkerFallback: () => false,
}));

afterAll(() => {
  mock.restore();
  
  
});

import { OBSERVER_SESSIONS_DIR } from '../../../src/shared/paths.js';
import { logger } from '../../../src/utils/logger.js';

let loggerSpies: ReturnType<typeof spyOn>[] = [];

beforeEach(() => {
  workerCallLog.length = 0;
  loggerSpies = [
    spyOn(logger, 'debug').mockImplementation(() => {}),
    spyOn(logger, 'dataIn').mockImplementation(() => {}),
  ];
});

afterEach(() => {
  loggerSpies.forEach(spy => spy.mockRestore());
});

describe('fileEditHandler internal observer sessions', () => {
  it('skips file edit observations before calling the worker', async () => {
    const { fileEditHandler } = await import('../../../src/cli/handlers/file-edit.js');

    const result = await fileEditHandler.execute({
      sessionId: 'observer-session-file-edit',
      cwd: OBSERVER_SESSIONS_DIR,
      platform: 'claude-code',
      filePath: join(OBSERVER_SESSIONS_DIR, 'transcript.jsonl'),
      edits: [{ oldText: 'before', newText: 'after' }],
    });

    expect(result.continue).toBe(true);
    expect(result.suppressOutput).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(workerCallLog).toEqual([]);
  });
});
