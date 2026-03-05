import React, { useRef, useCallback, useEffect, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useMangaContentStore, useMangaUIStore, useMangaSettingsStore } from '@/store/mangaReaderStore';
import { MangaPageImage } from '../MangaPageImage';
import { useMangaScroll } from '../hooks/useMangaScroll';
import { preloadPages } from '../hooks/useMangaPreloader';

/**
 * Long strip (webtoon-style) virtualized scroll view.
 * Uses @tanstack/react-virtual for efficient rendering.
 * Only pages within viewport + overscan are rendered.
 */
export function LongStripView() {
    const bookId = useMangaContentStore(s => s.bookId);
    const totalPages = useMangaContentStore(s => s.totalPages);
    const currentPage = useMangaContentStore(s => s.currentPage);
    const pageDimensions = useMangaContentStore(s => s.pageDimensions);
    const setCurrentPage = useMangaContentStore(s => s.setCurrentPage);
    const setScrollProgress = useMangaUIStore(s => s.setScrollProgress);
    const setTopBarVisible = useMangaUIStore(s => s.setTopBarVisible);
    const stripMargin = useMangaSettingsStore(s => s.stripMargin);

    const containerRef = useRef<HTMLDivElement>(null);
    // Track scroll changes to trigger page detection re-evaluation
    const [scrollTick, setScrollTick] = useState(0);

    // Estimate page height based on dimensions or fallback
    const estimateSize = useCallback((index: number): number => {
        if (pageDimensions[index]) {
            const [w, h] = pageDimensions[index];
            // Scale to container width (assume ~800px effective)
            const containerWidth = containerRef.current?.clientWidth || 800;
            const scale = containerWidth / w;
            return Math.round(h * scale);
        }
        return 1400; // Fallback for manga pages
    }, [pageDimensions]);

    const virtualizer = useVirtualizer({
        count: totalPages,
        getScrollElement: () => containerRef.current,
        estimateSize,
        overscan: 5,
        gap: stripMargin,
    });

    // Track scroll progress and current page
    const handleProgressChange = useCallback((progress: number) => {
        setScrollProgress(progress);
    }, [setScrollProgress]);

    // Auto-hide top bar on scroll down, show on scroll up
    const handleScrollDirection = useCallback((direction: 'up' | 'down') => {
        setTopBarVisible(direction === 'up');
    }, [setTopBarVisible]);

    useMangaScroll(containerRef, handleProgressChange, handleScrollDirection);

    // Listen for scroll events to trigger page detection updates
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        let ticking = false;
        const onScroll = () => {
            if (!ticking) {
                requestAnimationFrame(() => {
                    setScrollTick(t => t + 1);
                    ticking = false;
                });
                ticking = true;
            }
        };

        container.addEventListener('scroll', onScroll, { passive: true });
        return () => container.removeEventListener('scroll', onScroll);
    }, []);

    // Preload pages ahead of the current visible range
    useEffect(() => {
        if (!bookId || totalPages === 0) return;

        // Preload 5 pages ahead and 2 behind the current page
        const pagesToPreload: number[] = [];
        for (let i = -2; i <= 5; i++) {
            const target = currentPage + i;
            if (target >= 0 && target < totalPages && target !== currentPage) {
                pagesToPreload.push(target);
            }
        }

        if (pagesToPreload.length > 0) {
            preloadPages(bookId, pagesToPreload);
        }
    }, [bookId, currentPage, totalPages]);

    // Detect which page is most visible and update currentPage
    const virtualItems = virtualizer.getVirtualItems();

    useEffect(() => {
        if (virtualItems.length === 0) return;

        const container = containerRef.current;
        if (!container) return;

        // Read scroll position fresh inside the effect (not stale from render)
        const scrollTop = container.scrollTop;
        const viewportCenter = scrollTop + container.clientHeight / 2;

        // Find the page whose center is closest to viewport center
        let closestPage = 0;
        let closestDistance = Infinity;

        for (const item of virtualItems) {
            const itemCenter = item.start + item.size / 2;
            const distance = Math.abs(itemCenter - viewportCenter);
            if (distance < closestDistance) {
                closestDistance = distance;
                closestPage = item.index;
            }
        }

        setCurrentPage(closestPage);
    }, [virtualItems, scrollTick, setCurrentPage]);

    if (!bookId) return null;

    return (
        <div
            ref={containerRef}
            className="manga-strip-container"
        >
            <div
                className="manga-strip-inner"
                style={{
                    height: `${virtualizer.getTotalSize()}px`,
                    maxWidth: '900px',
                    margin: '0 auto',
                }}
            >
                {virtualizer.getVirtualItems().map((virtualItem) => (
                    <div
                        key={virtualItem.key}
                        ref={virtualizer.measureElement}
                        className="manga-strip-page"
                        style={{
                            top: 0,
                            transform: `translateY(${virtualItem.start}px)`,
                        }}
                    >
                        <MangaPageImage
                            bookId={bookId}
                            pageIndex={virtualItem.index}
                            onLoad={() => virtualizer.measure()}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}
