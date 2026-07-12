import React, { memo, useCallback, useRef, useState } from 'react';
import { useUnifiedImageDecode } from './hooks/useUnifiedImageDecode';
import { useMangaSettingsStore } from '@/store/mangaReaderStore';
import { getEffectiveMaxDimension } from './hooks/useMangaPreloader';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface MangaPageImageProps {
    pageIndex: number;
    maxDimension?: number;
    className?: string;
    style?: React.CSSProperties;
    onLoad?: () => void;
    imageRef?: React.Ref<HTMLImageElement>;
    overrideUrl?: string;
    overrideChapterId?: string;
    overrideSourceId?: string;
}

/**
 * Core manga page image component.
 * Works with both local (IPC) and online (URL) sources via unified hook.
 * Handles loading states, error states, and fit-mode rendering.
 * Memoized to prevent re-renders when parent state changes.
 */
export const MangaPageImage = memo(function MangaPageImage({
    pageIndex,
    maxDimension,
    className = '',
    style,
    onLoad,
    imageRef,
    overrideUrl,
    overrideChapterId,
    overrideSourceId,
}: MangaPageImageProps) {
    const fitMode = useMangaSettingsStore(s => s.fitMode);
    const zoomLevel = useMangaSettingsStore(s => s.zoomLevel);

    // Use the centralized maxDimension calculation so cache keys match preloading
    const effectiveMaxDimension = maxDimension ?? getEffectiveMaxDimension();

    // Unified hook handles both local and online sources
    const { url, loading, error, retry } = useUnifiedImageDecode(pageIndex, effectiveMaxDimension, overrideUrl, overrideChapterId, overrideSourceId);
    const [imgLoaded, setImgLoaded] = useState(false);
    const imgRef = useRef<HTMLImageElement>(null);

    // Combine internal ref (for decode) and external ref (for virtualization)
    const setRefs = useCallback(
        (node: HTMLImageElement | null) => {
            imgRef.current = node;
            if (typeof imageRef === 'function') {
                imageRef(node);
            } else if (imageRef && typeof imageRef === 'object') {
                // Use Object.assign to avoid direct mutation warning
                Object.assign(imageRef, { current: node });
            }
        },
        [imageRef]
    );

    const handleImageLoad = useCallback(() => {
        setImgLoaded(true);
        onLoad?.();

        // Use decode() API for smoother paint
        const img = imgRef.current;
        if (img && 'decode' in img) {
            img.decode?.().catch(() => { });
        }
    }, [onLoad]);

    if (error) {
        return (
            <div className="manga-page-error" style={style}>
                <AlertTriangle />
                <span>Failed to load page {pageIndex + 1}</span>
                <span style={{ fontSize: '11px', opacity: 0.6 }}>{error}</span>
                <button
                    type="button"
                    onClick={retry}
                    className="manga-page-retry-btn"
                    title="Retry loading this page"
                >
                    <RefreshCw size={14} />
                    <span>Retry</span>
                </button>
            </div>
        );
    }

    const fitClass = `manga-page-img--fit-${fitMode}`;
    const loadingClass = imgLoaded ? 'manga-page-img--loaded' : 'manga-page-img--loading';

    return (
        <>
            {(!url || !imgLoaded) && (
                <div
                    className="manga-page-skeleton"
                    style={{
                        width: '100%',
                        maxWidth: '800px',
                        aspectRatio: '2/3',
                        transform: `scale(${zoomLevel})`,
                        transformOrigin: 'top center',
                        transition: 'transform 0.2s ease-in-out',
                        ...style,
                    }}
                />
            )}
            {url && (
                <img
                    ref={setRefs}
                    src={url}
                    alt={`Page ${pageIndex + 1}`}
                    className={`manga-page-img ${fitClass} ${loadingClass} ${className}`}
                    style={{
                        ...style,
                        position: imgLoaded ? 'relative' : 'absolute',
                        top: 0,
                        left: 0,
                        visibility: imgLoaded ? 'visible' : 'hidden',
                        transform: `scale(${zoomLevel})`,
                        transformOrigin: 'top center',
                        transition: 'transform 0.2s ease-in-out',
                    }}
                    onLoad={handleImageLoad}
                    draggable={false}
                    decoding="async"
                />
            )}
        </>
    );
});
