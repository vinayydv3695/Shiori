import React, { useRef, useCallback, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useMangaContentStore, useMangaUIStore, useMangaSettingsStore } from '@/store/mangaReaderStore';
import { MangaPageImage } from '../MangaPageImage';
import { useMangaScroll } from '../hooks/useMangaScroll';
import { preloadPages } from '../hooks/useMangaPreloader';
import { preloadOnlinePages } from '../hooks/useUnifiedImageDecode';

/**
 * Webtoon/Manhwa virtualized scroll view.
 * Key differences from LongStripView: zero gap (seamless stitching),
 * full viewport width, and aggressive preloading (8 ahead, 3 behind).
 * Works with both local and online sources.
 */
export function WebtoonView() {
    const sourceType = useMangaContentStore(s => s.sourceType);
    const bookId = useMangaContentStore(s => s.bookId);
    const onlineSource = useMangaContentStore(s => s.onlineSource);
    const totalPages = useMangaContentStore(s => s.totalPages);
    const currentPage = useMangaContentStore(s => s.currentPage);
    const pageDimensions = useMangaContentStore(s => s.pageDimensions);
    const setCurrentPage = useMangaContentStore(s => s.setCurrentPage);
    const setScrollProgress = useMangaUIStore(s => s.setScrollProgress);
    const setTopBarVisible = useMangaUIStore(s => s.setTopBarVisible);
    const readingMode = useMangaSettingsStore(s => s.readingMode);
    const preloadIntensity = useMangaSettingsStore(s => s.preloadIntensity);

    const containerRef = useRef<HTMLDivElement>(null);
    const hasScrolledToResume = useRef(false);

    const isManhwa = readingMode === 'manhwa';
    const hasSource = sourceType === 'local' ? bookId !== null : onlineSource !== null;

    const estimateSize = useCallback((index: number): number => {
        if (pageDimensions[index]) {
            const [w, h] = pageDimensions[index];
            const containerWidth = containerRef.current?.clientWidth || 800;
            const scale = containerWidth / w;
            return Math.round(h * scale);
        }
        return 1800;
    }, [pageDimensions]);

    // eslint-disable-next-line react-hooks/incompatible-library
    const virtualizer = useVirtualizer({
        count: totalPages,
        getScrollElement: () => containerRef.current,
        estimateSize,
        overscan: 8,
        gap: 0,
    });

    const virtualizerRef = useRef(virtualizer);
    virtualizerRef.current = virtualizer;

    const setCurrentPageRef = useRef(setCurrentPage);
    setCurrentPageRef.current = setCurrentPage;

    const handleProgressChange = useCallback((progress: number) => {
        setScrollProgress(progress);

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

    const handleScrollDirection = useCallback((direction: 'up' | 'down') => {
        setTopBarVisible(direction === 'up');
    }, [setTopBarVisible]);

    useMangaScroll(containerRef, handleProgressChange, handleScrollDirection);

    useEffect(() => {
        if (hasScrolledToResume.current) return;
        if (currentPage > 0 && totalPages > 0) {
            const timer = setTimeout(() => {
                virtualizerRef.current.scrollToIndex(currentPage, { align: 'start' });
                hasScrolledToResume.current = true;
            }, 100);
            return () => clearTimeout(timer);
        } else {
            hasScrolledToResume.current = true;
        }
    }, [currentPage, totalPages]);

    // Preload pages - works for both local and online
    useEffect(() => {
        if (!hasSource || totalPages === 0) return;

        const behind = preloadIntensity === 'light' ? 2 : preloadIntensity === 'aggressive' ? 4 : 3;
        const ahead = preloadIntensity === 'light' ? 5 : preloadIntensity === 'aggressive' ? 12 : 8;

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
            className="manga-webtoon-container"
        >
            <div
                className="manga-strip-inner"
                style={{
                    height: `${virtualizer.getTotalSize()}px`,
                    maxWidth: isManhwa ? '1200px' : '100%',
                    margin: '0 auto',
                }}
            >
                {virtualizer.getVirtualItems().map((virtualItem) => (
                    <div
                        key={virtualItem.key}
                        ref={virtualizer.measureElement}
                        className="manga-webtoon-page"
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
