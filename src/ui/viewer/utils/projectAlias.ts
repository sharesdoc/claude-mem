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

// Alias shape: <HASH_UPPER>-<username>-<basename>
//   - hash always 12 hex chars → fixed-width left column for visual alignment
//   - username dropped when not extractable (uncommon path roots)
//   - basename keeps its original casing
export function getProjectAlias(projectId: string): string {
  const parsed = parseProjectId(projectId);
  if (!parsed) return projectId;
  const hashUpper = parsed.hash.toUpperCase();
  const parts = [hashUpper];
  if (parsed.username) parts.push(parsed.username);
  if (parsed.basename) parts.push(parsed.basename);
  return parts.join('-');
}
