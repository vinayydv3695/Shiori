import React, { useEffect } from 'react';
import { useMangaContentStore, useMangaSettingsStore } from '@/store/mangaReaderStore';
import { MangaPageImage } from '../MangaPageImage';
import { useMangaPreloader } from '../hooks/useMangaPreloader';

/**
 * Double page (spread) reading mode.
 * Displays two pages side by side, RTL-aware.
 */
export function DoublePageView() {
    const bookId = useMangaContentStore(s => s.bookId);
    const currentPage = useMangaContentStore(s => s.currentPage);
    const totalPages = useMangaContentStore(s => s.totalPages);
    const readingDirection = useMangaSettingsStore(s => s.readingDirection);
    const { preloadAround } = useMangaPreloader();
    const rtl = readingDirection === 'rtl';

    // In double page mode, pages are shown in pairs: [0,1], [2,3], etc.
    // Ensure currentPage is always even (the left page of a spread)
    const spreadStart = currentPage - (currentPage % 2);
    const leftPage = spreadStart;
    const rightPage = spreadStart + 1;

    useEffect(() => {
        preloadAround(spreadStart);
    }, [spreadStart, preloadAround]);

    // Update progress
    useEffect(() => {
        if (totalPages > 1) {
            const progress = (spreadStart / (totalPages - 1)) * 100;
            document.documentElement.style.setProperty(
                '--manga-progress',
                String(Math.min(1, Math.max(0, progress / 100)))
            );
        } else {
            // 0 or 1 pages — full progress (nothing to scroll through)
            document.documentElement.style.setProperty('--manga-progress', '1');
        }
    }, [spreadStart, totalPages]);

    if (!bookId) return null;

    return (
        <div className={`manga-double-view ${rtl ? 'manga-double-view--rtl' : ''}`}>
            <div className="manga-double-page">
                <MangaPageImage
                    bookId={bookId}
                    pageIndex={leftPage}
                />
            </div>
            {rightPage < totalPages && (
                <div className="manga-double-page">
                    <MangaPageImage
                        bookId={bookId}
                        pageIndex={rightPage}
                    />
                </div>
            )}
        </div>
    );
}
