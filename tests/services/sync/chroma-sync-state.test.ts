import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { ChromaSyncState } from '../../../src/services/sync/ChromaSyncState.js';

describe('ChromaSyncState pending gaps', () => {
  let dataDir: string;
  let previous: string | undefined;

  beforeEach(() => {
    previous = process.env.CLAUDE_MEM_DATA_DIR;
    dataDir = mkdtempSync(path.join(tmpdir(), 'claude-mem-chroma-state-'));
    process.env.CLAUDE_MEM_DATA_DIR = dataDir;
    ChromaSyncState.resetCache();
  });

  afterEach(() => {
    ChromaSyncState.resetCache();
    if (previous === undefined) delete process.env.CLAUDE_MEM_DATA_DIR;
    else process.env.CLAUDE_MEM_DATA_DIR = previous;
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('兼容旧状态并持久化、排序和清理缺口', () => {
    const statePath = path.join(dataDir, 'chroma-sync-state.json');
    writeFileSync(statePath, JSON.stringify({ project: { observations: 6, summaries: 0, prompts: 0 } }));
    expect(ChromaSyncState.getPending('project', 'observations')).toEqual([]);

    ChromaSyncState.markPending('project', 'observations', [5, 2, 5, -1]);
    expect(ChromaSyncState.getPending('project', 'observations')).toEqual([2, 5]);
    ChromaSyncState.resetCache();
    expect(ChromaSyncState.getPending('project', 'observations')).toEqual([2, 5]);

    ChromaSyncState.bump('project', 'observations', 5);
    expect(ChromaSyncState.get('project')).toEqual({
      observations: 6,
      summaries: 0,
      prompts: 0,
      pending: { observations: [2], summaries: [], prompts: [] },
    });
    expect(JSON.parse(readFileSync(statePath, 'utf8')).project.pending.observations).toEqual([2]);
  });
});
