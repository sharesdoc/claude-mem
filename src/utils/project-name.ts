import { homedir } from 'os';
import path from 'path';
import { logger } from './logger.js';
import { detectWorktree } from './worktree.js';

function expandTilde(p: string): string {
  if (p === '~' || p.startsWith('~/')) {
    return p.replace(/^~/, homedir());
  }
  return p;
}

function normalizeProjectPath(p: string): string {
  const expanded = expandTilde(p);

  if (/^[A-Za-z]:([\\/].*)?$/.test(expanded)) {
    return path.win32.resolve(expanded);
  }

  return path.resolve(expanded);
}

/**
 * projectId 即归一化后的完整文件系统路径。
 * 旧版用 "安全前缀-SHA1前12位" 格式；现已废弃，直接以全路径作为项目标识。
 */
function toProjectId(normalizedPath: string): string {
  return normalizedPath;
}

const projectNameCache = new Map<string, string>();

export function getProjectName(cwd: string | null | undefined): string {
  if (!cwd || cwd.trim() === '') {
    logger.warn('PROJECT_NAME', 'Empty cwd provided, using fallback', { cwd });
    return 'unknown-project';
  }

  const normalized = normalizeProjectPath(cwd);
  const cached = projectNameCache.get(normalized);
  if (cached) return cached;

  const result = toProjectId(normalized);
  projectNameCache.set(normalized, result);
  return result;
}

export interface ProjectContext {
  primary: string;
  parent: string | null;
  isWorktree: boolean;
  allProjects: string[];
}

const UNKNOWN_PROJECT_CONTEXT: ProjectContext = {
  primary: 'unknown-project', parent: null, isWorktree: false, allProjects: ['unknown-project']
};

const projectContextCache = new Map<string, ProjectContext>();

export function getProjectContext(cwd: string | null | undefined): ProjectContext {
  if (!cwd || cwd.trim() === '') {
    return UNKNOWN_PROJECT_CONTEXT;
  }

  const normalized = normalizeProjectPath(cwd);
  const cached = projectContextCache.get(normalized);
  if (cached) return cached;

  const cwdProjectName = toProjectId(normalized);
  const worktreeInfo = detectWorktree(normalized);

  let result: ProjectContext;
  if (worktreeInfo.isWorktree && worktreeInfo.parentRepoPath) {
    const parentProject = getProjectName(worktreeInfo.parentRepoPath);
    result = {
      primary: cwdProjectName,
      parent: parentProject,
      isWorktree: true,
      allProjects: [parentProject, cwdProjectName]
    };
  } else {
    result = { primary: cwdProjectName, parent: null, isWorktree: false, allProjects: [cwdProjectName] };
  }

  projectContextCache.set(normalized, result);
  return result;
}

export function clearProjectCaches(): void {
  projectNameCache.clear();
  projectContextCache.clear();
}
