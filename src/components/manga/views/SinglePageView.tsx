import React, { useEffect } from 'react';
import { useMangaContentStore, useMangaUIStore } from '@/store/mangaReaderStore';
import { MangaPageImage } from '../MangaPageImage';
import { useMangaPreloader } from '../hooks/useMangaPreloader';
import { ChevronRight } from 'lucide-react';

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
    
    // Auto-hide top bar state
    const isTopBarVisible = useMangaUIStore(s => s.isTopBarVisible);
    const setTopBarVisible = useMangaUIStore(s => s.setTopBarVisible);
    const onNextChapter = useMangaUIStore(s => s.onNextChapter);

    // Auto-hide top bar after 2 seconds on single page manga
    useEffect(() => {
        if (!isTopBarVisible) return;
        const timer = setTimeout(() => {
            setTopBarVisible(false);
        }, 2000);
        return () => clearTimeout(timer);
    }, [isTopBarVisible, setTopBarVisible]);

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
        <div className="manga-single-view relative">
            <div className="manga-page-container origin-center">
                <MangaPageImage
                    pageIndex={currentPage}
                />
            </div>
            
            {currentPage === totalPages - 1 && onNextChapter && (
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
