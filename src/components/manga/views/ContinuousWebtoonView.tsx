import React, { useRef, useCallback, useEffect, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { motion } from 'framer-motion';
import { useMangaContentStore, useMangaUIStore, useMangaSettingsStore } from '@/store/mangaReaderStore';
import { MangaPageImage } from '../MangaPageImage';
import { useMangaScroll } from '../hooks/useMangaScroll';
import { EndOfChapterOverlay } from '../EndOfChapterOverlay';
import { ChapterSeparatorCard } from '../ChapterSeparatorCard';
import { pluginApi } from '@/lib/pluginSources';
import { preloadImages } from '../utils/imagePreloader';

type ContinuousItem = 
    | { type: 'page'; chapterId: string; sourceId: string; pageUrl: string; localPageIndex: number; globalIndex: number }
    | { type: 'separator'; currentChapterTitle: string; nextChapterTitle?: string; nextChapterId?: string; isLoadingNext: boolean; globalIndex: number };

interface LoadedChapter {
    id: string;
    title: string;
    pages: string[];
}

export function ContinuousWebtoonView() {
    const onlineSource = useMangaContentStore(s => s.onlineSource);
    const readingMode = useMangaSettingsStore(s => s.readingMode);
    const stripMargin = useMangaSettingsStore(s => s.stripMargin);
    const setScrollProgress = useMangaUIStore(s => s.setScrollProgress);
    const markScrollActivity = useMangaUIStore(s => s.markScrollActivity);

    const containerRef = useRef<HTMLDivElement>(null);
    const isManhwa = readingMode === 'manhwa';
    const isStrip = readingMode === 'strip';

    // State for continuous reading
    const [loadedChapters, setLoadedChapters] = useState<LoadedChapter[]>([]);
    const [fetchingNext, setFetchingNext] = useState(false);
    
    // Track the initial load to reset when the user explicitly clicks a chapter in the sidebar
    const [initialChapterId, setInitialChapterId] = useState<string | null>(null);

    useEffect(() => {
        if (!onlineSource || onlineSource.pageUrls.length === 0) return;
        
        // If the store's chapter changed externally (e.g. from sidebar), reset our continuous state
        if (onlineSource.chapterId !== initialChapterId && !loadedChapters.find(c => c.id === onlineSource.chapterId)) {
            setLoadedChapters([{
                id: onlineSource.chapterId,
                title: onlineSource.chapterTitle,
                pages: onlineSource.pageUrls
            }]);
            setInitialChapterId(onlineSource.chapterId);
        }
    }, [onlineSource, initialChapterId, loadedChapters]);

    // Build the virtual items array
    const items = React.useMemo(() => {
        const result: ContinuousItem[] = [];
        if (!onlineSource) return result;

        let globalIndex = 0;
        
        for (let i = 0; i < loadedChapters.length; i++) {
            const chapter = loadedChapters[i];
            
            // Add pages
            chapter.pages.forEach((pageUrl, localIdx) => {
                result.push({
                    type: 'page',
                    chapterId: chapter.id,
                    sourceId: onlineSource.sourceId,
                    pageUrl,
                    localPageIndex: localIdx,
                    globalIndex: globalIndex++
                });
            });

            // Add separator after chapter (unless we reached the very last chapter of the manga)
            const currentIndexInSource = onlineSource.chapters.findIndex(c => c.id === chapter.id);
            if (currentIndexInSource !== -1) {
                const isDescending = onlineSource.chapters.length >= 2 && 
                    (onlineSource.chapters[0].number ?? 0) > (onlineSource.chapters[onlineSource.chapters.length - 1].number ?? 0);
                
                const nextIndex = isDescending ? currentIndexInSource - 1 : currentIndexInSource + 1;
                const nextChapter = (nextIndex >= 0 && nextIndex < onlineSource.chapters.length) 
                    ? onlineSource.chapters[nextIndex] 
                    : undefined;

                if (nextChapter || i === loadedChapters.length - 1) {
                    result.push({
                        type: 'separator',
                        currentChapterTitle: chapter.title,
                        nextChapterTitle: nextChapter?.title || (nextChapter?.number ? `Chapter ${nextChapter.number}` : undefined),
                        nextChapterId: nextChapter?.id,
                        isLoadingNext: fetchingNext && i === loadedChapters.length - 1,
                        globalIndex: globalIndex++
                    });
                }
            }
        }
        
        return result;
    }, [loadedChapters, onlineSource, fetchingNext]);

    const estimateSize = useCallback((index: number): number => {
        const item = items[index];
        if (!item) return 1800;
        if (item.type === 'separator') return 120; // Fixed height for separator
        
        // We use a fixed aspect ratio estimate for pages unless we want to track dimensions per page
        // WebtoonView relied on pageDimensions, but here we'll just use a safe fallback.
        // MangaPageImage will auto-size anyway, and react-virtual will measure it.
        return isStrip ? 1400 : 1200;
    }, [items, isStrip]);

    const virtualizer = useVirtualizer({
        count: items.length,
        getScrollElement: () => containerRef.current,
        estimateSize,
        overscan: 25,
        gap: isStrip ? stripMargin : 0,
    });
    
    const virtualizerRef = useRef(virtualizer);
    virtualizerRef.current = virtualizer;

    const fetchNextChapter = useCallback(async (nextChapterId: string) => {
        if (!onlineSource || fetchingNext) return;
        setFetchingNext(true);
        
        try {
            const pages = await pluginApi.getPages(onlineSource.sourceId, nextChapterId);
            const sortedPages = pages.slice().sort((a, b) => a.index - b.index);
            const pageUrls = sortedPages.map(p => p.url);
            
            const nextChapterMeta = onlineSource.chapters.find(c => c.id === nextChapterId);
            const title = nextChapterMeta?.title || `Chapter ${nextChapterMeta?.number ?? ''}`;
            
            setLoadedChapters(prev => [...prev, {
                id: nextChapterId,
                title,
                pages: pageUrls
            }]);

            // Fire off background image preload
            preloadImages(pageUrls);
        } catch (err) {
            console.error('Failed to load next chapter', err);
        } finally {
            setFetchingNext(false);
        }
    }, [onlineSource, fetchingNext]);

    // Handle scroll progress and sync active chapter to global store
    const handleProgressChange = useCallback((progress: number) => {
        setScrollProgress(progress);

        const container = containerRef.current;
        if (!container || items.length === 0 || !onlineSource) return;

        const virtualItems = virtualizerRef.current.getVirtualItems();
        if (virtualItems.length === 0) return;

        const scrollTop = container.scrollTop;
        const viewportCenter = scrollTop + container.clientHeight / 2;

        let closestItemIdx = 0;
        let closestDistance = Infinity;

        for (const vItem of virtualItems) {
            const itemCenter = vItem.start + vItem.size / 2;
            const distance = Math.abs(itemCenter - viewportCenter);
            if (distance < closestDistance) {
                closestDistance = distance;
                closestItemIdx = vItem.index;
            }
        }

        const activeItem = items[closestItemIdx];
        if (!activeItem) return;

        // Preload next chapter if we are nearing the end
        if (closestItemIdx >= items.length - 10 && !fetchingNext) {
            const lastLoaded = loadedChapters[loadedChapters.length - 1];
            if (lastLoaded) {
                const currentIndexInSource = onlineSource.chapters.findIndex(c => c.id === lastLoaded.id);
                if (currentIndexInSource !== -1) {
                    const isDescending = onlineSource.chapters.length >= 2 && 
                        (onlineSource.chapters[0].number ?? 0) > (onlineSource.chapters[onlineSource.chapters.length - 1].number ?? 0);
                    const nextIndex = isDescending ? currentIndexInSource - 1 : currentIndexInSource + 1;
                    const nextChapter = onlineSource.chapters[nextIndex];
                    if (nextChapter) {
                        fetchNextChapter(nextChapter.id);
                    }
                }
            }
        }

        // Sync active chapter to store so top bar displays correct title and progress
        let activeChapterId = onlineSource.chapterId;
        let activeTitle = onlineSource.chapterTitle;
        let activePageIdx = 0;
        let activeTotalPages = 1;

        if (activeItem.type === 'page') {
            activeChapterId = activeItem.chapterId;
            activePageIdx = activeItem.localPageIndex;
            const chap = loadedChapters.find(c => c.id === activeChapterId);
            activeTitle = chap?.title || activeTitle;
            activeTotalPages = chap?.pages.length || 1;
        } else if (activeItem.type === 'separator') {
            // Keep previous chapter active while on separator
            activeTitle = activeItem.currentChapterTitle;
            const chap = loadedChapters.find(c => c.title === activeTitle);
            activeTotalPages = chap?.pages.length || 1;
            activePageIdx = activeTotalPages - 1; // display 100%
            activeChapterId = chap?.id || activeChapterId;
        }

        if (onlineSource.chapterId !== activeChapterId || useMangaContentStore.getState().currentPage !== activePageIdx) {
            useMangaContentStore.setState({
                onlineSource: {
                    ...onlineSource,
                    chapterId: activeChapterId,
                    chapterTitle: activeTitle,
                },
                currentPage: activePageIdx,
                totalPages: activeTotalPages
            });
        }
    }, [items, setScrollProgress, onlineSource, loadedChapters, fetchingNext, fetchNextChapter]);

    const handleScrollActivity = useCallback(() => {
        markScrollActivity();
    }, [markScrollActivity]);

    useMangaScroll(containerRef, handleProgressChange, handleScrollActivity, true);



    if (!onlineSource) return null;

    return (
        <div ref={containerRef} className={isStrip ? "manga-strip-container" : "manga-webtoon-container"} style={{ touchAction: 'pan-y' }}>
            <motion.div
                className="manga-strip-inner"
                style={{
                    height: `${virtualizer.getTotalSize()}px`,
                    maxWidth: isStrip ? '900px' : (isManhwa ? '1200px' : '100%'),
                    margin: '0 auto',
                }}
            >
                {virtualizer.getVirtualItems().map((virtualItem) => {
                    const item = items[virtualItem.index];
                    if (!item) return null;

                    return (
                        <div
                            key={virtualItem.key}
                            ref={virtualizer.measureElement}
                            data-index={virtualItem.index}
                            className={isStrip ? "manga-strip-page" : "manga-webtoon-page"}
                            style={{
                                top: 0,
                                transform: `translateY(${virtualItem.start}px)`,
                                paddingBottom: isStrip && item.type === 'page' ? `${stripMargin}px` : '0px',
                            }}
                        >
                            {item.type === 'page' ? (
                                <MangaPageImage
                                    pageIndex={item.localPageIndex}
                                    overrideUrl={item.pageUrl}
                                    overrideChapterId={item.chapterId}
                                    overrideSourceId={item.sourceId}
                                />
                            ) : (
                                <ChapterSeparatorCard
                                    currentChapterTitle={item.currentChapterTitle}
                                    nextChapterTitle={item.nextChapterTitle}
                                    isLoadingNext={item.isLoadingNext}
                                />
                            )}
                        </div>
                    );
                })}
            </motion.div>
            
            {/* If we reached the end of the entire manga (no more chapters to load), show the overlay */}
            {(() => {
                const lastItem = items.length > 0 ? items[items.length - 1] : null;
                return lastItem && lastItem.type === 'separator' && !lastItem.nextChapterId ? (
                    <EndOfChapterOverlay />
                ) : null;
            })()}
        </div>
    );
}
