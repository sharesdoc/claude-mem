
import { statSync, readFileSync } from 'fs';
import path from 'path';

export interface WorktreeInfo {
  isWorktree: boolean;
  parentRepoPath: string | null;
}

const NOT_A_WORKTREE: WorktreeInfo = {
  isWorktree: false,
  parentRepoPath: null,
};

export function detectWorktree(cwd: string): WorktreeInfo {
  const gitPath = path.join(cwd, '.git');

  let stat;
  try {
    stat = statSync(gitPath);
  } catch (error: unknown) {
    if (error instanceof Error && (error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn(`[worktree] Unexpected error checking .git:`, error);
    }
    return NOT_A_WORKTREE;
  }

  if (!stat.isFile()) {
    return NOT_A_WORKTREE;
  }

  let content: string;
  try {
    content = readFileSync(gitPath, 'utf-8').trim();
  } catch (error: unknown) {
    console.warn(`[worktree] Failed to read .git file:`, error instanceof Error ? error.message : String(error));
    return NOT_A_WORKTREE;
  }

  const match = content.match(/^gitdir:\s*(.+)$/);
  if (!match) {
    return NOT_A_WORKTREE;
  }

  const rawGitdirPath = match[1];
  const gitdirPath = path.isAbsolute(rawGitdirPath)
    ? rawGitdirPath
    : path.resolve(cwd, rawGitdirPath);

  const worktreesMatch = gitdirPath.match(/^(.+)[/\\]\.git[/\\]worktrees[/\\]([^/\\]+)$/);
  if (!worktreesMatch) {
    return NOT_A_WORKTREE;
  }

  const parentRepoPath = worktreesMatch[1];

  return {
    isWorktree: true,
    parentRepoPath,
  };
}
