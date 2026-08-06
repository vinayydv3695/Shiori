/**
 * lruCache.ts
 *
 * Minimal size-guarded LRU helpers for module-level caches (coverCache,
 * useThumbnail). A plain Map preserves insertion order, which is enough for a
 * simple LRU: `lruGet` refreshes recency by re-inserting, `lruSet` evicts the
 * oldest entry once the map exceeds `maxSize`.
 */

/** Read a value and refresh its recency (re-insert at the end). */
export function lruGet<K, V>(map: Map<K, V>, key: K): V | undefined {
  if (!map.has(key)) return undefined;
  const value = map.get(key) as V;
  map.delete(key);
  map.set(key, value);
  return value;
}

/** Insert/overwrite a value, evicting the oldest entry past `maxSize`. */
export function lruSet<K, V>(map: Map<K, V>, key: K, value: V, maxSize: number): void {
  if (map.has(key)) map.delete(key);
  map.set(key, value);
  while (map.size > maxSize) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}
