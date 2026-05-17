
export function mergeAndDeduplicateByProject<T extends { id: number; project?: string; content_hash?: string | null }>(
  liveItems: T[],
  paginatedItems: T[]
): T[] {
  const seen = new Set<string>();
  return [...liveItems, ...paginatedItems].filter(item => {
    // Prefer content_hash for dedup across local + sync sources; fall back to id.
    const key = item.content_hash ? `h:${item.content_hash}` : `id:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
