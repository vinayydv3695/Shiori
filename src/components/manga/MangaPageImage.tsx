import React, { memo, useCallback, useRef, useState } from 'react';
import { useImageDecode } from './hooks/useImageDecode';
import { useMangaSettingsStore, type FitMode } from '@/store/mangaReaderStore';
import { AlertTriangle } from 'lucide-react';

interface MangaPageImageProps {
    bookId: number;
    pageIndex: number;
    maxDimension?: number;
    className?: string;
    style?: React.CSSProperties;
    onLoad?: () => void;
}

/**
 * Core manga page image component.
 * Handles loading states, error states, and fit-mode rendering.
 * Memoized to prevent re-renders when parent state changes.
 */
export const MangaPageImage = memo(function MangaPageImage({
    bookId,
    pageIndex,
    maxDimension = 1600,
    className = '',
    style,
    onLoad,
}: MangaPageImageProps) {
    const fitMode = useMangaSettingsStore(s => s.fitMode);
    const { url, loading, error } = useImageDecode(bookId, pageIndex, maxDimension);
    const [imgLoaded, setImgLoaded] = useState(false);
    const imgRef = useRef<HTMLImageElement>(null);

    const handleImageLoad = useCallback(() => {
        setImgLoaded(true);
        onLoad?.();

        // Use decode() API for smoother paint
        const img = imgRef.current;
        if (img && 'decode' in img) {
            img.decode?.().catch(() => { });
        }
    }, [onLoad]);

    const fitClass = `manga-page-img--fit-${fitMode}`;
    const loadingClass = imgLoaded ? 'manga-page-img--loaded' : 'manga-page-img--loading';

    if (error) {
        return (
            <div className="manga-page-error" style={style}>
                <AlertTriangle />
                <span>Failed to load page {pageIndex + 1}</span>
                <span style={{ fontSize: '11px', opacity: 0.6 }}>{error}</span>
            </div>
        );
    }

    if (loading || !url) {
        return (
            <div
                className="manga-page-skeleton"
                style={{
                    width: '100%',
                    maxWidth: '800px',
                    aspectRatio: '2/3',
                    ...style,
                }}
            />
        );
    }

    return (
        <img
            ref={imgRef}
            src={url}
            alt={`Page ${pageIndex + 1}`}
            className={`manga-page-img ${fitClass} ${loadingClass} ${className}`}
            style={style}
            onLoad={handleImageLoad}
            draggable={false}
        />
    );
});
