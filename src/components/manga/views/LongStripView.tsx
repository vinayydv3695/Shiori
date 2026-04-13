import React, { useRef, useCallback, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useMangaContentStore, useMangaUIStore, useMangaSettingsStore } from '@/store/mangaReaderStore';
import { MangaPageImage } from '../MangaPageImage';
import { useMangaScroll } from '../hooks/useMangaScroll';
import { preloadPages } from '../hooks/useMangaPreloader';
import { preloadOnlinePages } from '../hooks/useUnifiedImageDecode';

/**
 * Long strip (webtoon-style) virtualized scroll view.
 * Uses @tanstack/react-virtual for efficient rendering.
 * Only pages within viewport + overscan are rendered.
 * Works with both local and online sources.
 */
export function LongStripView() {
    const sourceType = useMangaContentStore(s => s.sourceType);
    const bookId = useMangaContentStore(s => s.bookId);
    const onlineSource = useMangaContentStore(s => s.onlineSource);
    const totalPages = useMangaContentStore(s => s.totalPages);
    const currentPage = useMangaContentStore(s => s.currentPage);
    const pageDimensions = useMangaContentStore(s => s.pageDimensions);
    const setCurrentPage = useMangaContentStore(s => s.setCurrentPage);
    const setScrollProgress = useMangaUIStore(s => s.setScrollProgress);
    const markScrollActivity = useMangaUIStore(s => s.markScrollActivity);
    const stripMargin = useMangaSettingsStore(s => s.stripMargin);
    const preloadIntensity = useMangaSettingsStore(s => s.preloadIntensity);

    const containerRef = useRef<HTMLDivElement>(null);
    // Track whether we've done the initial scroll-to-resume
    const hasScrolledToResume = useRef(false);

    const hasSource = sourceType === 'local' ? bookId !== null : onlineSource !== null;

    // Estimate page height based on dimensions or fallback
    const estimateSize = useCallback((index: number): number => {
        if (pageDimensions[index]) {
            const [w, h] = pageDimensions[index];
            // Scale to actual rendered width (max 900px)
            const containerWidth = containerRef.current?.clientWidth || 900;
            const actualWidth = Math.min(containerWidth, 900);
            const scale = actualWidth / w;
            return Math.round(h * scale);
        }
        return 1400; // Fallback for manga pages
    }, [pageDimensions]);

    // TanStack Virtual v3 is compatible with React 19
    // eslint-disable-next-line react-hooks/incompatible-library
    const virtualizer = useVirtualizer({
        count: totalPages,
        getScrollElement: () => containerRef.current,
        estimateSize,
        overscan: 5,
        gap: stripMargin,
    });

    // Ref to hold the latest virtualizer so the scroll callback can access it
    // without causing re-subscriptions.
    const virtualizerRef = useRef(virtualizer);
    virtualizerRef.current = virtualizer;

    // Ref to hold the latest setCurrentPage to avoid stale closures
    const setCurrentPageRef = useRef(setCurrentPage);
    setCurrentPageRef.current = setCurrentPage;

    // Track scroll progress, current page, and auto-hide top bar
    // All in a single scroll listener via useMangaScroll — no React state updates per frame.
    const handleProgressChange = useCallback((progress: number) => {
        setScrollProgress(progress);

        // Detect which page is most visible and update currentPage
        const container = containerRef.current;
        if (!container) return;

        const virtualItems = virtualizerRef.current.getVirtualItems();
        if (virtualItems.length === 0) return;

        const scrollTop = container.scrollTop;
        const viewportCenter = scrollTop + container.clientHeight / 2;

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

        setCurrentPageRef.current(closestPage);
    }, [setScrollProgress]);

    const handleScrollActivity = useCallback(() => {
        markScrollActivity();
    }, [markScrollActivity]);

    useMangaScroll(containerRef, handleProgressChange, handleScrollActivity);

    // On mount, scroll to the resumed page (if any). Run once after virtualizer is ready.
    useEffect(() => {
        if (hasScrolledToResume.current) return;
        if (currentPage > 0 && totalPages > 0) {
            // Small delay to allow virtualizer to measure initial items
            const timer = setTimeout(() => {
                virtualizerRef.current.scrollToIndex(currentPage, { align: 'start' });
                hasScrolledToResume.current = true;
            }, 100);
            return () => clearTimeout(timer);
        } else {
            hasScrolledToResume.current = true;
        }
    }, [currentPage, totalPages]);

    // Preload pages ahead of the current visible range
    useEffect(() => {
        if (!hasSource || totalPages === 0) return;

        const behind = preloadIntensity === 'light' ? 1 : preloadIntensity === 'aggressive' ? 3 : 2;
        const ahead = preloadIntensity === 'light' ? 3 : preloadIntensity === 'aggressive' ? 8 : 5;

        if (sourceType === 'local' && bookId) {
            const pagesToPreload: number[] = [];
            for (let i = -behind; i <= ahead; i++) {
                const target = currentPage + i;
                if (target >= 0 && target < totalPages && target !== currentPage) {
                    pagesToPreload.push(target);
                }
            }
            if (pagesToPreload.length > 0) {
                preloadPages(bookId, pagesToPreload);
            }
        } else if (sourceType === 'online' && onlineSource) {
            preloadOnlinePages(
                onlineSource.sourceId,
                onlineSource.chapterId,
                onlineSource.pageUrls,
                currentPage,
                Math.max(behind, ahead)
            );
        }
    }, [sourceType, bookId, onlineSource, currentPage, totalPages, preloadIntensity, hasSource]);

    if (!hasSource) return null;

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
                            pageIndex={virtualItem.index}
                            onLoad={() => virtualizer.measure()}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}
