import { useCallback } from 'react';
import { useMangaContentStore, useMangaSettingsStore, type ReadingMode } from '@/store/mangaReaderStore';

/**
 * Image preloader with LRU blob cache.
 * Manages background preloading and memory-bounded caching.
 */

/** Derive the maxDimension used for IPC from the store's imageQuality setting (0.5–1.0 → 800–1600). */
export function getEffectiveMaxDimension(mode?: ReadingMode): number {
    const { imageQuality, readingMode } = useMangaSettingsStore.getState();
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
        return entry.url;
    }

    set(key: string, blob: Blob): string {
        const existing = this.cache.get(key);
        if (existing) {
            if (existing.type === 'blob' && existing.blob) {
                URL.revokeObjectURL(existing.url);
            }
            this.currentBytes -= existing.size;
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
        let oldestKey: string | null = null;
        let oldestTime = Infinity;

        for (const [key, entry] of this.cache) {
            if (entry.lastAccess < oldestTime) {
                oldestTime = entry.lastAccess;
                oldestKey = key;
            }
        }

        if (oldestKey) {
            const entry = this.cache.get(oldestKey)!;
            if (entry.type === 'blob' && entry.blob) {
                URL.revokeObjectURL(entry.url);
            }
            this.currentBytes -= entry.size;
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
            console.error(`[MangaPreloader] Failed to load page ${pageIndex}:`, error);
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
    import('@tauri-apps/api/core').then(({ invoke }) => {
        invoke('preload_manga_pages', {
            bookId,
            pageIndices: uncached,
            maxDimension: dim,
        }).catch(() => {
            // Backend preload failed — individual fetches will still work (just slower)
        });
    });

    // Step 2: Also fire individual fetches to populate the frontend blob cache.
    // These will be fast once the backend cache is warm.
    for (const idx of uncached) {
        getMangaPageUrl(bookId, idx, dim).catch(() => {
            // Silently ignore preload failures
        });
    }
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
        } else if (readingMode === 'double') {
            const behind = 2;
            const ahead = preloadIntensity === 'light' ? 3 : preloadIntensity === 'aggressive' ? 7 : 5;
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
