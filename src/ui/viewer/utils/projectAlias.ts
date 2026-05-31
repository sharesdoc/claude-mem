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
 * null when no canonical home root is found.
 *
 * Also works on raw file-system paths (the current projectId format).
 */
function extractUsername(prefix: string): string | null {
  // Raw path: e.g. /Users/johnson/wks/... → split by /
  if (prefix.startsWith('/')) {
    const segs = prefix.split('/');
    for (let i = 0; i < segs.length - 1; i++) {
      const s = segs[i].toLowerCase();
      if (s === 'users' || s === 'home') return segs[i + 1] || null;
    }
    return null;
  }
  // Old hash-based format: Users-johnson-... (hyphen-separated)
  const segments = prefix.split('-');
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i].toLowerCase();
    if (seg === 'users' || seg === 'home') {
      return segments[i + 1] || null;
    }
  }
  return null;
}

/**
 * Parse a projectId into its components.
 *
 * Backward-compatible: new-format project IDs (full paths like `/Users/johnson/...`)
 * won't match the legacy HASH_PATTERN, so we fall back to path-aware extraction.
 */
export function parseProjectId(projectId: string): ParsedProjectId | null {
  if (!projectId) return null;

  // New format: projectId IS the full path
  if (projectId.startsWith('/') || /^[A-Za-z]:[\\/]/.test(projectId)) {
    const segments = projectId.replace(/\\/g, '/').split('/').filter(Boolean);
    const basename = segments[segments.length - 1] || projectId;
    const username = extractUsername(projectId);
    return { prefix: projectId, hash: '', basename, username, raw: projectId };
  }

  // Legacy format: prefix-hash
  const match = HASH_PATTERN.exec(projectId);
  if (!match) return null;

  const prefix = match[1];
  const hash = match[2];
  const lastDash = prefix.lastIndexOf('-');
  const basename = lastDash >= 0 ? prefix.slice(lastDash + 1) : prefix;
  const username = extractUsername(prefix);

  return { prefix, hash, basename, username, raw: projectId };
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
