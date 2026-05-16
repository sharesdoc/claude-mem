const HASH_PATTERN = /^(.+)-([0-9a-f]{12})$/;

export interface ParsedProjectId {
  prefix: string;
  hash: string;
  basename: string;
  raw: string;
}

export function parseProjectId(projectId: string): ParsedProjectId | null {
  if (!projectId) return null;
  const match = HASH_PATTERN.exec(projectId);
  if (!match) return null;

  const prefix = match[1];
  const hash = match[2];
  const lastDash = prefix.lastIndexOf('-');
  const basename = lastDash >= 0 ? prefix.slice(lastDash + 1) : prefix;

  return { prefix, hash, basename, raw: projectId };
}

// Alias shape: <HASH_UPPER>-<basename>
//   - hash always 12 hex chars → fixed-width left column for visual alignment
//   - basename keeps its original casing (we only normalised path separators
//     at ID-creation time; the basename itself is verbatim)
export function getProjectAlias(projectId: string): string {
  const parsed = parseProjectId(projectId);
  if (!parsed) return projectId;
  const hashUpper = parsed.hash.toUpperCase();
  if (!parsed.basename) return hashUpper;
  return `${hashUpper}-${parsed.basename}`;
}
