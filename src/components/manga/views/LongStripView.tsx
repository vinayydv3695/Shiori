import React, { useRef, useCallback, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useMangaContentStore, useMangaUIStore, useMangaSettingsStore } from '@/store/mangaReaderStore';
import { MangaPageImage } from '../MangaPageImage';
import { useMangaScroll } from '../hooks/useMangaScroll';

/**
 * Long strip (webtoon-style) virtualized scroll view.
 * Uses @tanstack/react-virtual for efficient rendering.
 * Only pages within viewport + overscan are rendered.
 */
export function LongStripView() {
    const bookId = useMangaContentStore(s => s.bookId);
    const totalPages = useMangaContentStore(s => s.totalPages);
    const pageDimensions = useMangaContentStore(s => s.pageDimensions);
    const setCurrentPage = useMangaContentStore(s => s.setCurrentPage);
    const setScrollProgress = useMangaUIStore(s => s.setScrollProgress);

    const containerRef = useRef<HTMLDivElement>(null);

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
        overscan: 2,
    });

    // Track scroll progress and current page
    const handleProgressChange = useCallback((progress: number) => {
        setScrollProgress(progress);
    }, [setScrollProgress]);

    const handleScrollDirection = useCallback((direction: 'up' | 'down') => {
        // Could be used for auto-hide top bar in strip mode
    }, []);

    useMangaScroll(containerRef, handleProgressChange, handleScrollDirection);

    // Detect which page is most visible and update currentPage
    useEffect(() => {
        const virtualItems = virtualizer.getVirtualItems();
        if (virtualItems.length === 0) return;

        const container = containerRef.current;
        if (!container) return;

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
    }, [virtualizer.getVirtualItems(), setCurrentPage]);

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
                        className="manga-strip-page"
                        style={{
                            top: 0,
                            transform: `translateY(${virtualItem.start}px)`,
                            height: `${virtualItem.size}px`,
                        }}
                    >
                        <MangaPageImage
                            bookId={bookId}
                            pageIndex={virtualItem.index}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}
