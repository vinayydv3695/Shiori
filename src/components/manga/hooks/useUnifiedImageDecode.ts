import { useState, useEffect, useRef, useCallback } from 'react';
import { getMangaPageUrl } from './useMangaPreloader';
import { useMangaContentStore } from '@/store/mangaReaderStore';
import { api } from '@/lib/tauri';
import { logger } from '@/lib/logger';

/**
 * Unified hook for image loading that works with both local and online sources.
 * 
 * For local sources: Uses the existing IPC-based getMangaPageUrl
 * For online sources: Uses direct URLs or proxied images (for sources like ToonGod)
 */

/**
 * Bounded LRU for proxied online images (blob URLs). Memory guardrail
 * (performance plan Slice 6): max ~60 entries / 64 MB. Evicted blob URLs are
 * revoked so the page never holds decoded image data forever during long
 * reading sessions. LRU order = display likely, so an on-screen page is
 * essentially never evicted.
 */
class OnlineImageLru {
    private entries = new Map<string, { url: string; bytes: number }>();
    private totalBytes = 0;
    private readonly maxEntries: number;
    private readonly maxBytes: number;

    constructor(maxEntries: number = 60, maxBytes: number = 64 * 1024 * 1024) {
        this.maxEntries = maxEntries;
        this.maxBytes = maxBytes;
    }

    get(key: string): string | undefined {
        const e = this.entries.get(key);
        if (!e) return undefined;
        // LRU touch: move to most-recent end.
        this.entries.delete(key);
        this.entries.set(key, e);
        return e.url;
    }

    set(key: string, url: string, bytes: number): void {
        const prev = this.entries.get(key);
        if (prev) {
            this.totalBytes -= prev.bytes;
            if (prev.url.startsWith('blob:')) URL.revokeObjectURL(prev.url);
        }
        // Evict oldest until within both caps, revoking evicted blobs.
        while (
            this.entries.size > 0 &&
            (this.entries.size >= this.maxEntries || this.totalBytes + bytes > this.maxBytes)
        ) {
            const oldestKey = this.entries.keys().next().value as string;
            const oldest = this.entries.get(oldestKey);
            if (!oldest) break;
            this.totalBytes -= oldest.bytes;
            if (oldest.url.startsWith('blob:')) URL.revokeObjectURL(oldest.url);
            this.entries.delete(oldestKey);
        }
        this.entries.set(key, { url, bytes });
        this.totalBytes += bytes;
    }

    has(key: string): boolean {
        return this.entries.has(key);
    }

    delete(key: string): void {
        const e = this.entries.get(key);
        if (e) {
            this.totalBytes -= e.bytes;
            if (e.url.startsWith('blob:')) URL.revokeObjectURL(e.url);
        }
        this.entries.delete(key);
    }

    clear(): void {
        for (const e of this.entries.values()) {
            if (e.url.startsWith('blob:')) URL.revokeObjectURL(e.url);
        }
        this.entries.clear();
        this.totalBytes = 0;
    }

    get size(): number {
        return this.entries.size;
    }

    get bytes(): number {
        return this.totalBytes;
    }
}

// Cache for proxied online images (blob URLs) — bounded LRU, see above.
const onlineImageCache = new OnlineImageLru();

export function useUnifiedImageDecode(
    pageIndex: number, 
    maxDimension: number = 1600,
    overrideUrl?: string,
    overrideChapterId?: string,
    overrideSourceId?: string
) {
    const sourceType = useMangaContentStore(s => s.sourceType);
    const bookId = useMangaContentStore(s => s.bookId);
    const onlineSource = useMangaContentStore(s => s.onlineSource);
    
    const [url, setUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [retryCount, setRetryCount] = useState(0);
    const mountedRef = useRef(true);
    const currentBlobUrlRef = useRef<string | null>(null);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            // Clean up blob URL on unmount if we created one
            if (currentBlobUrlRef.current && currentBlobUrlRef.current.startsWith('blob:')) {
                // Don't revoke cached URLs - they may be used elsewhere
            }
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);

        const loadImage = async () => {
            // retryCount is used to trigger re-fetches but doesn't affect the logic
            void retryCount;
            try {
                if (sourceType === 'local' && bookId !== null) {
                    // Local source: use existing IPC mechanism
                    const imageUrl = await getMangaPageUrl(bookId, pageIndex, maxDimension);
                    if (cancelled || !mountedRef.current) return;
                    setUrl(imageUrl);
                    setLoading(false);
                } else if (sourceType === 'online' && onlineSource) {
                    // Online source
                    const pageUrl = overrideUrl || onlineSource.pageUrls[pageIndex];
                    if (!pageUrl) {
                        throw new Error(`No URL for page ${pageIndex + 1}`);
                    }

                    const activeSourceId = overrideSourceId || onlineSource.sourceId;
                    const activeChapterId = overrideChapterId || onlineSource.chapterId;

                    // Check if we need to proxy the image (e.g., ToonGod needs Referer header)
                    const needsProxy = ['toongod', 'weebrook', 'manhwahub', 'mangafire', 'toonily', 'toontop', 'manhwaread'].includes(activeSourceId);
                    
                    if (needsProxy) {
                        // Check cache first
                        const cacheKey = `${activeSourceId}:${activeChapterId}:${pageUrl}`; // Use pageUrl instead of pageIndex for uniqueness across chapters
                        const cached = onlineImageCache.get(cacheKey);
                        
                        if (cached) {
                            if (cancelled || !mountedRef.current) return;
                            setUrl(cached);
                            setLoading(false);
                            return;
                        }

                        // Proxy the image through backend
                        const bytes = await api.proxyMangaImage(activeSourceId, pageUrl);
                        if (cancelled || !mountedRef.current) return;
                        
                        const blob = new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' });
                        const blobUrl = URL.createObjectURL(blob);

                        // Cache the blob URL (bounded LRU; tracks byte size)
                        onlineImageCache.set(cacheKey, blobUrl, bytes.length);
                        currentBlobUrlRef.current = blobUrl;
                        
                        setUrl(blobUrl);
                        setLoading(false);
                    } else {
                        // Direct URL (e.g., MangaDex has CORS-friendly CDN)
                        if (cancelled || !mountedRef.current) return;
                        setUrl(pageUrl);
                        setLoading(false);
                    }
                } else {
                    // No valid source
                    setUrl(null);
                    setLoading(false);
                }
            } catch (err) {
                if (cancelled || !mountedRef.current) return;
                logger.error(`[useUnifiedImageDecode] Failed to load page ${pageIndex}:`, err);
                setError(err instanceof Error ? err.message : String(err));
                setLoading(false);
            }
        };

        loadImage();

        return () => { cancelled = true; };
    }, [sourceType, bookId, onlineSource, pageIndex, maxDimension, retryCount, overrideUrl, overrideChapterId, overrideSourceId]);

    const retry = useCallback(() => {
        // Clear cache entry on retry for online sources (LRU.delete revokes
        // the blob URL; no manual revoke needed).
        if (sourceType === 'online' && (onlineSource || (overrideSourceId && overrideUrl))) {
            const activeSourceId = overrideSourceId || onlineSource?.sourceId;
            const activeChapterId = overrideChapterId || onlineSource?.chapterId;
            const activeUrl = overrideUrl || onlineSource?.pageUrls[pageIndex];
            if (!activeSourceId || !activeUrl) return;

            const cacheKey = `${activeSourceId}:${activeChapterId}:${activeUrl}`;
            onlineImageCache.delete(cacheKey);
        }
        setRetryCount(c => c + 1);
    }, [sourceType, onlineSource, pageIndex, overrideSourceId, overrideChapterId, overrideUrl]);

    return { url, loading, error, retry };
}

/**
 * Clear all cached online images (call when closing manga reader or changing
 * chapters). Revokes every blob URL.
 */
export function clearOnlineImageCache(): void {
    onlineImageCache.clear();
}

/**
 * Preload online images for adjacent pages
 */
export async function preloadOnlinePages(
    sourceId: string,
    chapterId: string,
    pageUrls: string[],
    centerPage: number,
    radius: number = 3
): Promise<void> {
    const needsProxy = ['toongod', 'weebrook', 'manhwahub', 'mangafire', 'toonily', 'toontop', 'manhwaread'].includes(sourceId);
    
    for (let offset = 1; offset <= radius; offset++) {
        const indices = [centerPage + offset, centerPage - offset].filter(
            i => i >= 0 && i < pageUrls.length
        );
        
        for (const idx of indices) {
            const pageUrl = pageUrls[idx];
            if (!pageUrl) continue;
            
            const cacheKey = `${sourceId}:${chapterId}:${pageUrl}`;
            if (onlineImageCache.has(cacheKey)) continue;

            try {
                if (needsProxy) {
                    const bytes = await api.proxyMangaImage(sourceId, pageUrl);
                    const blob = new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' });
                    const blobUrl = URL.createObjectURL(blob);
                    onlineImageCache.set(cacheKey, blobUrl, bytes.length);
                }
                // For non-proxy sources, the browser will cache naturally
            } catch {
                // Silently ignore preload failures
            }
        }
    }
}
