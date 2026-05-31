import { createHash } from 'crypto';
import { homedir } from 'os';
import path from 'path';
import { logger } from './logger.js';
import { detectWorktree } from './worktree.js';

const PROJECT_ID_PREFIX_MAX_LENGTH = 160;

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
 * SHA1 哈希全路径后截取前 12 位 hex 作为后缀。哈希用于消除路径冲突
 * （不同路径映射到同一个 safePrefix 时靠 hash 区分）。
 *
 * 同时把 projectId → fullPath 写入反向映射，供 viewer UI 还原全路径。
 */
function toProjectId(normalizedPath: string): string {
  const safePrefix = normalizedPath
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, PROJECT_ID_PREFIX_MAX_LENGTH)
    .replace(/[._-]+$/g, '');
  const hash = createHash('sha1').update(normalizedPath).digest('hex').slice(0, 12);

  const projectId = `${safePrefix || 'project'}-${hash}`;
  // 反向映射：projectId → 全路径，供 viewer UI 显示完整路径
  projectPathMap.set(projectId, normalizedPath);
  return projectId;
}

/** projectId → 完整文件系统路径 */
const projectPathMap = new Map<string, string>();

/**
 * 从 projectId 反查当时的完整路径。
 * 仅在当前进程生命周期内调用过 toProjectId() 的路径可查；
 * 返回 null 表示未知（例如从其他机器同步来的 session）。
 */
export function getProjectPath(projectId: string): string | null {
  return projectPathMap.get(projectId) ?? null;
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
