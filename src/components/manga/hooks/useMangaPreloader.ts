import { logger } from '@/lib/logger';
import { useCallback } from 'react';
import { useMangaContentStore, useMangaSettingsStore, type ReadingMode } from '@/store/mangaReaderStore';

/**
 * Image preloader with LRU blob cache.
 * Manages background preloading and memory-bounded caching.
 */

/** Derive the maxDimension used for IPC from the store's imageQuality setting (0 = native fast passthrough). */
export function getEffectiveMaxDimension(mode?: ReadingMode): number {
    const { imageQuality, readingMode } = useMangaSettingsStore.getState();
    // When quality is high/default (>= 0.95), pass 0 to stream raw archive bytes directly in <1ms without CPU re-encoding
    if (imageQuality >= 0.95) {
        return 0;
    }
    const effectiveMode = mode ?? readingMode;
    // Scroll modes use lower res since images are scaled to viewport width anyway
    const baseMax = (effectiveMode === 'strip' || effectiveMode === 'webtoon' || effectiveMode === 'manhwa') ? 1200 : 1600;
    return Math.round(baseMax * imageQuality);
}

interface CacheEntry {
    url: string;
    lastAccess: number;
    size: number;
    type: 'blob' | 'path';
    blob?: Blob;
}

class MangaImageCache {
    private cache = new Map<string, CacheEntry>();
    private maxEntries = 80;
    private maxBytes = 300 * 1024 * 1024; // 300MB
    private currentBytes = 0;

    get(key: string): string | null {
        const entry = this.cache.get(key);
        if (!entry) return null;
        entry.lastAccess = Date.now();
        // Refresh recency in Map insertion order
        this.cache.delete(key);
        this.cache.set(key, entry);
        return entry.url;
    }

    set(key: string, blob: Blob): string {
        const existing = this.cache.get(key);
        if (existing) {
            if (existing.type === 'blob' && existing.blob) {
                URL.revokeObjectURL(existing.url);
            }
            this.currentBytes -= existing.size;
            this.cache.delete(key);
        }

        while (this.cache.size >= this.maxEntries || this.currentBytes + blob.size > this.maxBytes) {
            this.evictOldest();
            if (this.cache.size === 0) break;
        }

        const url = URL.createObjectURL(blob);
        this.cache.set(key, {
            type: 'blob',
            blob,
            url,
            lastAccess: Date.now(),
            size: blob.size,
        });
        this.currentBytes += blob.size;
        return url;
    }

    setPath(key: string, url: string): string {
        const existing = this.cache.get(key);
        if (existing) {
            if (existing.type === 'blob' && existing.blob) {
                URL.revokeObjectURL(existing.url);
            }
            this.currentBytes -= existing.size;
            this.cache.delete(key);
        }

        const estimatedSize = 1024;
        while (this.cache.size >= this.maxEntries || this.currentBytes + estimatedSize > this.maxBytes) {
            this.evictOldest();
            if (this.cache.size === 0) break;
        }

        this.cache.set(key, {
            type: 'path',
            url,
            lastAccess: Date.now(),
            size: estimatedSize,
        });
        this.currentBytes += estimatedSize;
        return url;
    }

    has(key: string): boolean {
        return this.cache.has(key);
    }

    private evictOldest(): void {
        // Map keys are ordered by insertion/access recency — first key is oldest O(1)
        const oldestKey = this.cache.keys().next().value;
        if (oldestKey) {
            const entry = this.cache.get(oldestKey);
            if (entry) {
                if (entry.type === 'blob' && entry.blob) {
                    URL.revokeObjectURL(entry.url);
                }
                this.currentBytes -= entry.size;
            }
            this.cache.delete(oldestKey);
        }
    }

    clear(): void {
        for (const entry of this.cache.values()) {
            if (entry.type === 'blob' && entry.blob) {
                URL.revokeObjectURL(entry.url);
            }
        }
        this.cache.clear();
        this.currentBytes = 0;
    }

    get size(): number {
        return this.cache.size;
    }

    get bytes(): number {
        return this.currentBytes;
    }
}

// Singleton cache instance
const imageCache = new MangaImageCache();

// Keep track of pending requests to deduplicate concurrent loads for the same page
const pendingRequests = new Map<string, Promise<string>>();

/**
 * Get or load a page image with caching
 */
export async function getMangaPageUrl(
    bookId: number,
    pageIndex: number,
    maxDimension?: number
): Promise<string> {
    const dim = maxDimension ?? getEffectiveMaxDimension();
    const cacheKey = `${bookId}:${pageIndex}:${dim}`;

    const cached = imageCache.get(cacheKey);
    if (cached) return cached;

    const pending = pendingRequests.get(cacheKey);
    if (pending) return pending;

    const request = (async () => {
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            const { convertFileSrc } = await import('@tauri-apps/api/core');
            
            const filePath = await invoke<string>('get_manga_page_path', {
                bookId,
                pageIndex,
                maxDimension: dim,
            });

            const url = convertFileSrc(filePath);
            return imageCache.setPath(cacheKey, url);
        } catch (error) {
            logger.error(`[MangaPreloader] Failed to load page ${pageIndex}:`, error);
            throw error;
        } finally {
            pendingRequests.delete(cacheKey);
        }
    })();

    pendingRequests.set(cacheKey, request);
    return request;
}

/**
 * Preload multiple pages in background.
 * First warms the Rust backend cache via a single batch IPC call,
 * then fetches individual pages to populate the frontend blob cache.
 */
export function preloadPages(
    bookId: number,
    pageIndices: number[],
    maxDimension?: number
): void {
    const dim = maxDimension ?? getEffectiveMaxDimension();

    // Filter out pages already in the frontend cache
    const uncached = pageIndices.filter(idx => {
        const cacheKey = `${bookId}:${idx}:${dim}`;
        return !imageCache.has(cacheKey);
    });

    if (uncached.length === 0) return;

    // Step 1: Warm the backend cache in a single batch IPC call
    import('@tauri-apps/api/core').then(async ({ invoke }) => {
        try {
            await invoke('preload_manga_pages', {
                bookId,
                pageIndices: uncached,
                maxDimension: dim,
            });
        } catch {
            // Backend preload failed — individual fetches will still work (just slower)
        }

        // Step 2: Bounded queue (max 3 concurrent) to populate the frontend cache
        // without flooding the IPC channel or competing with active page renders (K3-013).
        const queue = [...uncached];
        const CONCURRENCY = 3;
        const runWorker = async () => {
            while (queue.length > 0) {
                const idx = queue.shift();
                if (idx === undefined) break;
                try {
                    await getMangaPageUrl(bookId, idx, dim);
                } catch {
                    // Silently ignore background preload failures
                }
            }
        };
        const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => runWorker());
        await Promise.all(workers);
    }).catch(() => {});
}

/**
 * Hook: Preload adjacent pages based on current page and reading mode
 */
export function useMangaPreloader() {
    const bookId = useMangaContentStore(s => s.bookId);
    const totalPages = useMangaContentStore(s => s.totalPages);
    const readingMode = useMangaSettingsStore(s => s.readingMode);
    const preloadIntensity = useMangaSettingsStore(s => s.preloadIntensity);

    const preloadAround = useCallback((page: number) => {
        if (!bookId || totalPages === 0) return;

        const pagesToPreload: number[] = [];

        if (readingMode === 'single' || readingMode === 'comic') {
            const behind = preloadIntensity === 'light' ? 1 : preloadIntensity === 'aggressive' ? 2 : 1;
            const ahead = preloadIntensity === 'light' ? 2 : preloadIntensity === 'aggressive' ? 5 : 3;
            for (let i = -behind; i <= ahead; i++) {
                const target = page + i;
                if (target >= 0 && target < totalPages && target !== page) {
                    pagesToPreload.push(target);
                }
            }
        }
        // Strip, webtoon, and manhwa: handled by virtualizer overscan + view-level preloading

        if (pagesToPreload.length > 0) {
            preloadPages(bookId, pagesToPreload);
        }
    }, [bookId, totalPages, readingMode, preloadIntensity]);

    return { preloadAround, getMangaPageUrl, clearCache: () => imageCache.clear() };
}

export { imageCache };
