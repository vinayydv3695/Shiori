import { useCallback } from 'react';
import { useMangaContentStore, useMangaUIStore, useMangaSettingsStore } from '@/store/mangaReaderStore';

/**
 * Image preloader with LRU blob cache.
 * Manages background preloading and memory-bounded caching.
 */

interface CacheEntry {
    blob: Blob;
    url: string;
    lastAccess: number;
    size: number;
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
        // If already cached, revoke old and replace
        const existing = this.cache.get(key);
        if (existing) {
            URL.revokeObjectURL(existing.url);
            this.currentBytes -= existing.size;
        }

        // Evict if over limits
        while (this.cache.size >= this.maxEntries || this.currentBytes + blob.size > this.maxBytes) {
            this.evictOldest();
            if (this.cache.size === 0) break;
        }

        const url = URL.createObjectURL(blob);
        this.cache.set(key, {
            blob,
            url,
            lastAccess: Date.now(),
            size: blob.size,
        });
        this.currentBytes += blob.size;
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
            URL.revokeObjectURL(entry.url);
            this.currentBytes -= entry.size;
            this.cache.delete(oldestKey);
        }
    }

    clear(): void {
        for (const entry of this.cache.values()) {
            URL.revokeObjectURL(entry.url);
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
    maxDimension: number = 1600
): Promise<string> {
    const cacheKey = `${bookId}:${pageIndex}:${maxDimension}`;

    // Check cache first
    const cached = imageCache.get(cacheKey);
    if (cached) return cached;

    // Check if there's already a pending request for this page
    const pending = pendingRequests.get(cacheKey);
    if (pending) return pending;

    const request = (async () => {
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            // invoke will return a Uint8Array when backend returns tauri::ipc::Response natively
            const responseData = await invoke<Uint8Array>('get_manga_page', {
                bookId,
                pageIndex,
                maxDimension,
            });

            // Convert to blob and save in URL
            const blob = new Blob([new Uint8Array(responseData)], { type: 'image/jpeg' });
            return imageCache.set(cacheKey, blob);
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
 * Preload multiple pages in background
 */
export function preloadPages(
    bookId: number,
    pageIndices: number[],
    maxDimension: number = 1600
): void {
    for (const idx of pageIndices) {
        const cacheKey = `${bookId}:${idx}:${maxDimension}`;
        if (!imageCache.has(cacheKey)) {
            // Fire and forget — don't await
            getMangaPageUrl(bookId, idx, maxDimension).catch(() => {
                // Silently ignore preload failures
            });
        }
    }
}

/**
 * Hook: Preload adjacent pages based on current page and reading mode
 */
export function useMangaPreloader() {
    const bookId = useMangaContentStore(s => s.bookId);
    const currentPage = useMangaContentStore(s => s.currentPage);
    const totalPages = useMangaContentStore(s => s.totalPages);
    const readingMode = useMangaSettingsStore(s => s.readingMode);

    const preloadAround = useCallback((page: number) => {
        if (!bookId || totalPages === 0) return;

        let pagesToPreload: number[] = [];

        if (readingMode === 'single') {
            // Preload 3 ahead, 1 behind
            for (let i = -1; i <= 3; i++) {
                const target = page + i;
                if (target >= 0 && target < totalPages && target !== page) {
                    pagesToPreload.push(target);
                }
            }
        } else if (readingMode === 'double') {
            // Preload 4 ahead (2 spreads), 2 behind
            for (let i = -2; i <= 5; i++) {
                const target = page + i;
                if (target >= 0 && target < totalPages && target !== page) {
                    pagesToPreload.push(target);
                }
            }
        }
        // Strip mode: handled by virtualizer overscan

        if (pagesToPreload.length > 0) {
            preloadPages(bookId, pagesToPreload);
        }
    }, [bookId, totalPages, readingMode]);

    return { preloadAround, getMangaPageUrl, clearCache: () => imageCache.clear() };
}

export { imageCache };
