const HASH_PATTERN = /^(.+)-([0-9a-f]{12})$/;

export interface ParsedProjectId {
  prefix: string;
  hash: string;
  basename: string;
  /** Username extracted from the path segment after Users/ or home/. */
  username: string | null;
  raw: string;
}

/**
 * Extract the username segment from a hyphen-joined prefix. Recognises
 * macOS (`Users-<user>-...`) and Linux (`home-<user>-...`) layouts; returns
 * null when no canonical home root is found (Windows paths or roots like
 * `tmp`, `var`).
 */
function extractUsername(prefix: string): string | null {
  const segments = prefix.split('-');
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i].toLowerCase();
    if (seg === 'users' || seg === 'home') {
      return segments[i + 1] || null;
    }
  }
  return null;
}

export function parseProjectId(projectId: string): ParsedProjectId | null {
  if (!projectId) return null;
  const match = HASH_PATTERN.exec(projectId);
  if (!match) return null;

  const prefix = match[1];
  const hash = match[2];
  const lastDash = prefix.lastIndexOf('-');
  const basename = lastDash >= 0 ? prefix.slice(lastDash + 1) : prefix;
  const username = extractUsername(prefix);

  return { prefix, hash, basename, username, raw: projectId };
}

/**
 * 返回项目在 UI 中的显示名。
 *
 * 优先级：
 *   1. `projectPaths[projectId]`  — 后端传来的完整文件系统路径
 *   2. projectId 本身 — 降级（旧后端 / 跨机器 session 无映射时）
 */
export function getProjectDisplayName(
  projectId: string,
  projectPaths?: Record<string, string>,
): string {
  if (projectPaths?.[projectId]) return projectPaths[projectId];
  return projectId;
}

export function getProjectAlias(projectId: string): string {
  const parsed = parseProjectId(projectId);
  if (!parsed) return projectId;
  const hashUpper = parsed.hash.toUpperCase();
  const parts = [hashUpper];
  if (parsed.username) parts.push(parsed.username);
  if (parsed.basename) parts.push(parsed.basename);
  return parts.join('-');
}
