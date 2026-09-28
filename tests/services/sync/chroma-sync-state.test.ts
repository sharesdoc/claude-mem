import { describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

describe('ChromaSyncState pending gaps', () => {
  it('兼容旧状态并持久化、排序和清理缺口', () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'claude-mem-chroma-state-'));
    try {
      const result = Bun.spawnSync({
        cmd: [process.execPath, '-e', `
          import { writeFileSync, readFileSync } from 'fs';
          import path from 'path';
          import { ChromaSyncState } from './src/services/sync/ChromaSyncState.ts';
          const statePath = path.join(process.env.CLAUDE_MEM_DATA_DIR, 'chroma-sync-state.json');
          writeFileSync(statePath, JSON.stringify({ project: { observations: 6, summaries: 0, prompts: 0 } }));
          const legacy = ChromaSyncState.getPending('project', 'observations');
          ChromaSyncState.markPending('project', 'observations', [5, 2, 5, -1]);
          const marked = ChromaSyncState.getPending('project', 'observations');
          ChromaSyncState.resetCache();
          const persisted = ChromaSyncState.getPending('project', 'observations');
          ChromaSyncState.bump('project', 'observations', 5);
          console.log(JSON.stringify({ legacy, marked, persisted, state: ChromaSyncState.get('project'), disk: JSON.parse(readFileSync(statePath, 'utf8')) }));
        `],
        cwd: process.cwd(),
        env: { ...process.env, CLAUDE_MEM_DATA_DIR: dataDir },
        stdout: 'pipe',
        stderr: 'pipe',
      });
      expect(result.exitCode).toBe(0);
      const output = JSON.parse(new TextDecoder().decode(result.stdout).trim());
      expect(output.legacy).toEqual([]);
      expect(output.marked).toEqual([2, 5]);
      expect(output.persisted).toEqual([2, 5]);
      expect(output.state).toEqual({
        observations: 6,
        summaries: 0,
        prompts: 0,
        pending: { observations: [2], summaries: [], prompts: [] },
      });
      expect(output.disk.project.pending.observations).toEqual([2]);
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
