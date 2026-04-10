import React, { useEffect } from 'react';
import { useMangaContentStore } from '@/store/mangaReaderStore';
import { MangaPageImage } from '../MangaPageImage';
import { useMangaPreloader } from '../hooks/useMangaPreloader';

/**
 * Single page reading mode.
 * Displays one manga page centered in the canvas.
 * Works with both local and online sources.
 */
export function SinglePageView() {
    const sourceType = useMangaContentStore(s => s.sourceType);
    const bookId = useMangaContentStore(s => s.bookId);
    const onlineSource = useMangaContentStore(s => s.onlineSource);
    const currentPage = useMangaContentStore(s => s.currentPage);
    const totalPages = useMangaContentStore(s => s.totalPages);
    const { preloadAround } = useMangaPreloader();

    // Check if we have a valid source
    const hasSource = sourceType === 'local' ? bookId !== null : onlineSource !== null;

    // Preload adjacent pages when current page changes
    useEffect(() => {
        preloadAround(currentPage);
    }, [currentPage, preloadAround]);

    // Update progress bar
    useEffect(() => {
        if (totalPages > 1) {
            const progress = (currentPage / (totalPages - 1)) * 100;
            document.documentElement.style.setProperty(
                '--manga-progress',
                String(Math.min(1, Math.max(0, progress / 100)))
            );
        } else {
            // 0 or 1 pages — full progress (nothing to scroll through)
            document.documentElement.style.setProperty('--manga-progress', '1');
        }
    }, [currentPage, totalPages]);

    if (!hasSource) return null;

    return (
        <div className="manga-single-view">
            <div className="manga-page-container">
                <MangaPageImage
                    pageIndex={currentPage}
                />
            </div>
        </div>
    );
}
