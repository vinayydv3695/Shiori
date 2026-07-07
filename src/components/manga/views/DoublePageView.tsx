import React, { useEffect } from 'react';
import { useMangaContentStore, useMangaSettingsStore } from '@/store/mangaReaderStore';
import { MangaPageImage } from '../MangaPageImage';
import { useMangaPreloader } from '../hooks/useMangaPreloader';
import { ChevronRight } from 'lucide-react';
import { useMangaUIStore } from '@/store/mangaReaderStore';

/**
 * Double page (spread) reading mode.
 * Displays two pages side by side, RTL-aware.
 * Works with both local and online sources.
 */
export function DoublePageView() {
    const sourceType = useMangaContentStore(s => s.sourceType);
    const bookId = useMangaContentStore(s => s.bookId);
    const onlineSource = useMangaContentStore(s => s.onlineSource);
    const currentPage = useMangaContentStore(s => s.currentPage);
    const totalPages = useMangaContentStore(s => s.totalPages);
    const readingDirection = useMangaSettingsStore(s => s.readingDirection);
    const { preloadAround } = useMangaPreloader();
    const rtl = readingDirection === 'rtl';
    const onNextChapter = useMangaUIStore(s => s.onNextChapter);

    const hasSource = sourceType === 'local' ? bookId !== null : onlineSource !== null;

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

    if (!hasSource) return null;

    return (
        <div className={`manga-double-view ${rtl ? 'manga-double-view--rtl' : ''}`}>
            <div className="manga-double-page">
                <MangaPageImage
                    pageIndex={leftPage}
                />
            </div>
            {rightPage < totalPages && (
                <div className="manga-double-page">
                    <MangaPageImage
                        pageIndex={rightPage}
                    />
                </div>
            )}
            
            {(leftPage === totalPages - 1 || rightPage === totalPages - 1) && onNextChapter && (
                <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-4">
                    <button
                        onClick={onNextChapter}
                        className="bg-primary/90 hover:bg-primary text-primary-foreground backdrop-blur-md px-8 py-3 rounded-full font-bold flex items-center gap-2 shadow-xl shadow-black/50 transition-all hover:scale-105 active:scale-95"
                    >
                        <span>Next Chapter / Volume</span>
                        <ChevronRight size={20} />
                    </button>
                </div>
            )}
        </div>
    );
}
