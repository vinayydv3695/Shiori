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

// Cache for proxied online images (blob URLs)
const onlineImageCache = new Map<string, string>();

export function useUnifiedImageDecode(pageIndex: number, maxDimension: number = 1600) {
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
                    const pageUrl = onlineSource.pageUrls[pageIndex];
                    if (!pageUrl) {
                        throw new Error(`No URL for page ${pageIndex + 1}`);
                    }

                    // Check if we need to proxy the image (e.g., ToonGod needs Referer header)
                    const needsProxy = onlineSource.sourceId === 'toongod';
                    
                    if (needsProxy) {
                        // Check cache first
                        const cacheKey = `${onlineSource.sourceId}:${onlineSource.chapterId}:${pageIndex}`;
                        const cached = onlineImageCache.get(cacheKey);
                        
                        if (cached) {
                            if (cancelled || !mountedRef.current) return;
                            setUrl(cached);
                            setLoading(false);
                            return;
                        }

                        // Proxy the image through backend
                        const bytes = await api.proxyMangaImage(onlineSource.sourceId, pageUrl);
                        if (cancelled || !mountedRef.current) return;
                        
                        const blob = new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' });
                        const blobUrl = URL.createObjectURL(blob);
                        
                        // Cache the blob URL
                        onlineImageCache.set(cacheKey, blobUrl);
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
    }, [sourceType, bookId, onlineSource, pageIndex, maxDimension, retryCount]);

    const retry = useCallback(() => {
        // Clear cache entry on retry for online sources
        if (sourceType === 'online' && onlineSource) {
            const cacheKey = `${onlineSource.sourceId}:${onlineSource.chapterId}:${pageIndex}`;
            const cached = onlineImageCache.get(cacheKey);
            if (cached && cached.startsWith('blob:')) {
                URL.revokeObjectURL(cached);
            }
            onlineImageCache.delete(cacheKey);
        }
        setRetryCount(c => c + 1);
    }, [sourceType, onlineSource, pageIndex]);

    return { url, loading, error, retry };
}

/**
 * Clear all cached online images (call when closing manga reader or changing chapters)
 */
export function clearOnlineImageCache(): void {
    for (const blobUrl of onlineImageCache.values()) {
        if (blobUrl.startsWith('blob:')) {
            URL.revokeObjectURL(blobUrl);
        }
    }
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
    const needsProxy = sourceId === 'toongod';
    
    for (let offset = 1; offset <= radius; offset++) {
        const indices = [centerPage + offset, centerPage - offset].filter(
            i => i >= 0 && i < pageUrls.length
        );
        
        for (const idx of indices) {
            const cacheKey = `${sourceId}:${chapterId}:${idx}`;
            if (onlineImageCache.has(cacheKey)) continue;
            
            const pageUrl = pageUrls[idx];
            if (!pageUrl) continue;

            try {
                if (needsProxy) {
                    const bytes = await api.proxyMangaImage(sourceId, pageUrl);
                    const blob = new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' });
                    const blobUrl = URL.createObjectURL(blob);
                    onlineImageCache.set(cacheKey, blobUrl);
                }
                // For non-proxy sources, the browser will cache naturally
            } catch {
                // Silently ignore preload failures
            }
        }
    }
}
