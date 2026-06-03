
export function mergeAndDeduplicateByProject<T extends { id: number; project?: string; content_hash?: string | null }>(
  liveItems: T[],
  paginatedItems: T[]
): T[] {
  // Dedup on BOTH id and content_hash, skipping an item if EITHER was already
  // seen. The two keys cover two distinct duplication sources that must both
  // collapse to a single rendered row:
  //   - same id, differing hash: the live SSE broadcast omits content_hash
  //     (see ResponseProcessor) while the REST/pagination row carries it, so
  //     the very same observation arrives once id-only and once hash-tagged.
  //     Keying on id alone would still drop it; keying on hash alone would NOT
  //     — leaving two cards with the same React key (`observation-<id>`), which
  //     corrupts list reconciliation and leaves orphaned DOM rows pinned to the
  //     top of the feed after a project-filter switch.
  //   - same hash, differing id: the local insert and its synced copy share
  //     content but get different ids; hash-keying collapses those.
  const seenIds = new Set<number>();
  const seenHashes = new Set<string>();
  return [...liveItems, ...paginatedItems].filter(item => {
    if (seenIds.has(item.id)) return false;
    if (item.content_hash && seenHashes.has(item.content_hash)) return false;
    seenIds.add(item.id);
    if (item.content_hash) seenHashes.add(item.content_hash);
    return true;
  });
}
