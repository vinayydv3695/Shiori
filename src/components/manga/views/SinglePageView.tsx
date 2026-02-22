import React, { useCallback, useEffect } from 'react';
import { useMangaContentStore, useMangaSettingsStore } from '@/store/mangaReaderStore';
import { MangaPageImage } from '../MangaPageImage';
import { useMangaPreloader } from '../hooks/useMangaPreloader';

/**
 * Single page reading mode.
 * Displays one manga page centered in the canvas.
 */
export function SinglePageView() {
    const bookId = useMangaContentStore(s => s.bookId);
    const currentPage = useMangaContentStore(s => s.currentPage);
    const totalPages = useMangaContentStore(s => s.totalPages);
    const { preloadAround } = useMangaPreloader();

    // Preload adjacent pages when current page changes
    useEffect(() => {
        preloadAround(currentPage);
    }, [currentPage, preloadAround]);

    // Update progress bar
    useEffect(() => {
        if (totalPages > 0) {
            const progress = (currentPage / (totalPages - 1)) * 100;
            document.documentElement.style.setProperty(
                '--manga-progress',
                String(Math.min(1, Math.max(0, progress / 100)))
            );
        }
    }, [currentPage, totalPages]);

    if (!bookId) return null;

    return (
        <div className="manga-single-view">
            <div className="manga-page-container">
                <MangaPageImage
                    bookId={bookId}
                    pageIndex={currentPage}
                />
            </div>
        </div>
    );
}
