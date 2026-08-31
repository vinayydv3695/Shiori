import { api, isAndroid } from '@/lib/tauri';
import type { Chapter } from '@/lib/tauri';
import { applySearchHighlight, processEpubHtml } from './PremiumEpubReader';

// ─── Processed-chapter LRU cache ─────────────────────────────────────────────
// Back-navigation used to re-fetch + re-process + re-write every chapter
// resource on every visit. Cache the fully processed Chapter (HTML whose
// resources point at the lazy shiori-epub:// custom protocol) keyed by
// book+index+highlight-term so revisiting a chapter is a Map hit instead of N
// IPC round-trips. Module-level: survives reader unmount/remount within the
// session. Mirrors ContinuousEpubView's eviction approach (drop oldest beyond
// a small bound).
const MAX_PROCESSED_CHAPTERS = isAndroid ? 3 : 5;
const MAX_PROCESSED_CHAPTER_BYTES = (isAndroid ? 16 : 64) * 1024 * 1024;
const processedChapterCache = new Map<string, Chapter>();
let processedChapterCacheBytes = 0;
// Book whose chapters are currently cached; used to drop the previous book's
// entries when the user switches books mid-session (the cache is keyed by
// bookId, so stale entries from Book A would otherwise linger behind Book B).
let cachedBookId: number | undefined = undefined;
// In-flight processed-chapter fetches keyed by book+index. Both readers
// (PremiumEpubReader's loadChapter/preloads and ContinuousEpubView's batch
// loader) can request the same chapter concurrently; without this they would
// duplicate the IPC fetch and the processing pass.
const inFlightProcessedChapters = new Map<string, Promise<Chapter>>();

function estimateProcessedChapterBytes(chapter: Chapter): number {
  // JS strings are UTF-16; the rewritten protocol URLs still keep browser-side
  // decoded resources alive, so this is deliberately conservative not exact.
  return chapter.content.length * 2;
}

export function getCachedChapter(bookId: number, index: number, term: string | null | undefined): Chapter | undefined {
  const key = `${bookId}:${index}:${term ?? ''}`;
  const hit = processedChapterCache.get(key);
  if (hit !== undefined) {
    // Refresh recency
    processedChapterCache.delete(key);
    processedChapterCache.set(key, hit);
  }
  return hit;
}

export function setCachedChapter(bookId: number, index: number, term: string | null | undefined, chapter: Chapter): void {
  const key = `${bookId}:${index}:${term ?? ''}`;
  const size = estimateProcessedChapterBytes(chapter);
  const previous = processedChapterCache.get(key);
  if (previous) {
    processedChapterCacheBytes -= estimateProcessedChapterBytes(previous);
    processedChapterCache.delete(key);
  }
  if (size > MAX_PROCESSED_CHAPTER_BYTES) return;

  while (
    processedChapterCache.size > 0 &&
    (processedChapterCache.size >= MAX_PROCESSED_CHAPTERS ||
      processedChapterCacheBytes + size > MAX_PROCESSED_CHAPTER_BYTES)
  ) {
    const oldest = processedChapterCache.keys().next().value;
    if (oldest === undefined) break;
    const oldChapter = processedChapterCache.get(oldest);
    if (oldChapter) processedChapterCacheBytes -= estimateProcessedChapterBytes(oldChapter);
    processedChapterCache.delete(oldest);
  }

  processedChapterCache.set(key, chapter);
  processedChapterCacheBytes += size;
}

export function clearProcessedChapterCache(bookId?: number): void {
  const prefix = bookId === undefined ? undefined : `${bookId}:`;
  for (const [key, chapter] of processedChapterCache) {
    if (prefix === undefined || key.startsWith(prefix)) {
      processedChapterCacheBytes -= estimateProcessedChapterBytes(chapter);
      processedChapterCache.delete(key);
    }
  }
  if (processedChapterCache.size === 0) processedChapterCacheBytes = 0;
}

/**
 * Build (and cache) the search-highlighted variant of an already-processed
 * base chapter. The highlighted layer reuses the expensive resource rewriting
 * done for the base and only re-runs the cheap text-highlight pass.
 */
function cacheHighlightLayer(bookId: number, index: number, baseChapter: Chapter, safeTerm: string): Chapter {
  if (!safeTerm) return baseChapter;
  const termVariant = getCachedChapter(bookId, index, safeTerm);
  if (termVariant !== undefined) return termVariant;
  const highlighted: Chapter = { ...baseChapter, content: applySearchHighlight(baseChapter.content, safeTerm) };
  // Keep the "never cache empty chapters" rule, and skip caching if the user
  // switched books while the fetch was in flight — that switch already cleared
  // the previous book's entries, so re-adding them would pollute the LRU.
  if (baseChapter.content && baseChapter.content.trim().length > 0 && cachedBookId === bookId) {
    setCachedChapter(bookId, index, safeTerm, highlighted);
  }
  return highlighted;
}

/** Fetch a chapter and process its HTML, reusing the module-level cache. */
export async function loadProcessedChapter(bookId: number, index: number, term?: string | null): Promise<Chapter> {
  // Book switch: drop the previous book's cached chapters before loading the
  // first chapter of the new book (per-chapter LRU caps stay intact).
  if (cachedBookId !== undefined && cachedBookId !== bookId) {
    clearProcessedChapterCache(cachedBookId);
  }
  cachedBookId = bookId;
  // Two-layer cache: the expensive resource-rewritten base chapter is keyed
  // without the search term, so changing the search term reuses it and only
  // re-runs the cheap search-highlight pass. Term variants stay bounded by
  // the same byte/count eviction.
  const safeTerm = term?.trim() ? term : '';
  const termVariant = safeTerm ? getCachedChapter(bookId, index, safeTerm) : undefined;
  if (termVariant !== undefined) return termVariant;

  const base = getCachedChapter(bookId, index, '');
  if (base !== undefined) return cacheHighlightLayer(bookId, index, base, safeTerm);

  const key = `${bookId}:${index}`;
  const pending = inFlightProcessedChapters.get(key);
  if (pending) {
    return cacheHighlightLayer(bookId, index, await pending, safeTerm);
  }

  const request = (async () => {
    const chapter = await api.getBookChapter(bookId, index);
    const processed = await processEpubHtml(bookId, chapter.content);
    const processedChapter: Chapter = { ...chapter, content: processed };
    // Never cache empty chapters — the caller throws on them, so a cached empty
    // string would only poison the LRU slot.
    if (chapter.content && chapter.content.trim().length > 0 && cachedBookId === bookId) {
      setCachedChapter(bookId, index, '', processedChapter);
    }
    return processedChapter;
  })();
  inFlightProcessedChapters.set(key, request);
  try {
    return cacheHighlightLayer(bookId, index, await request, safeTerm);
  } finally {
    if (inFlightProcessedChapters.get(key) === request) {
      inFlightProcessedChapters.delete(key);
    }
  }
}