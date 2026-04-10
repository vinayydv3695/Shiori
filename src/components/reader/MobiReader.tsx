import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { api } from '@/lib/tauri';
import type { BookMetadata, Chapter } from '@/lib/tauri';
import { ChevronLeft, ChevronRight, Loader2, AlertCircle } from '@/components/icons';
import { logger } from '@/lib/logger';
import { useReaderUIStore, useReadingSettings } from '@/store/premiumReaderStore';
import { useDoodleStore } from '@/store/doodleStore';
import { useToastStore } from '@/store/toastStore';
import { usePremiumReaderKeyboard } from '@/hooks/usePremiumReaderKeyboard';
import { useReaderAutoHide } from '@/hooks/useReaderAutoHide';
import { useReaderTheme } from '@/hooks/useReaderTheme';
import { useReadingSession } from '@/hooks/useReadingSession';
import { ReaderTopBar } from './ReaderTopBar';
import { PremiumSidebar } from './PremiumSidebar';
import { TextSelectionToolbar } from './TextSelectionToolbar';
import { TTSControlBar } from './TTSControlBar';
import { DoodleCanvas } from './DoodleCanvas';
import { DoodleToolbar } from './DoodleToolbar';
import { sanitizeBookContent } from '@/lib/sanitize';
import { applyHighlightsToDOM } from '@/lib/highlightAnnotations';
import '@/styles/premium-reader.css';

interface MobiReaderProps {
    bookPath: string;
    bookId: number;
    onClose: () => void;
}

type SidebarNavigateHandler = (chapterIndex: number, searchTerm?: string | null) => void;

export function MobiReader({ bookPath, bookId, onClose }: MobiReaderProps) {
    const { isFocusMode } = useReaderAutoHide();
    const setScrollProgress = useReaderUIStore(state => state.setScrollProgress);
    const { theme, fontSize, fontFamily, lineHeight, width } = useReadingSettings();

    const isDoodleMode = useDoodleStore(state => state.isDoodleMode);
    const toggleDoodleMode = useDoodleStore(state => state.toggleDoodleMode);
    const resetDoodlePage = useDoodleStore(state => state.resetPage);

    useReadingSession(bookId);

    const [metadata, setMetadata] = useState<BookMetadata | null>(null);
    const [currentChapter, setCurrentChapter] = useState<Chapter | null>(null);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [progressPercentage, setProgressPercentage] = useState(0);

    const containerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const readerContainerRef = useRef<HTMLDivElement>(null);
    const scrollPositionsRef = useRef<Map<number, number>>(new Map());
    const saveProgressTimerRef = useRef<number | null>(null);
    const currentIndexRef = useRef(0);
    const currentChapterRef = useRef<Chapter | null>(null);

    // ── Reader Theme ──
    useReaderTheme(readerContainerRef, theme);

    // Map font family IDs to CSS font-family strings
    const getFontFamily = (fontId: string): string => {
        const fontMap: Record<string, string> = {
            serif: 'Georgia, serif',
            sans: 'Arial, sans-serif',
            system: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            literata: 'Literata, Georgia, serif',
            merriweather: 'Merriweather, Georgia, serif',
            opensans: 'Open Sans, Arial, sans-serif',
            lora: 'Lora, Georgia, serif',
            mono: 'Courier, "Courier New", monospace',
        };
        return fontMap[fontId] || fontMap.serif;
    };

    const sanitizedContent = useMemo(
        () => (currentChapter ? sanitizeBookContent(currentChapter.content) : ''),
        [currentChapter]
    );

    useEffect(() => {
        if (contentRef.current && sanitizedContent) {
            contentRef.current.innerHTML = sanitizedContent;
        }
    }, [sanitizedContent]);

    // ── Chapter Loading ──
    const loadChapter = useCallback(async (index: number, initialScrollRatio?: number) => {
        try {
            setIsLoading(true);

            // Save current scroll position before navigating away
            if (containerRef.current && currentChapterRef.current) {
                const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
                const scrollRatio = scrollHeight > clientHeight
                    ? scrollTop / (scrollHeight - clientHeight)
                    : 0;
                scrollPositionsRef.current.set(currentIndexRef.current, scrollRatio);
            }

            const chapter = await api.getBookChapter(bookId, index);
            currentChapterRef.current = chapter;
            currentIndexRef.current = index;
            setCurrentChapter(chapter);
            setCurrentIndex(index);
            setIsLoading(false);

            // Restore scroll position after render
            requestAnimationFrame(() => {
                setTimeout(() => {
                    if (containerRef.current) {
                        if (initialScrollRatio !== undefined && initialScrollRatio > 0) {
                            const { scrollHeight, clientHeight } = containerRef.current;
                            containerRef.current.scrollTop = initialScrollRatio * (scrollHeight - clientHeight);
                        } else {
                            const savedPos = scrollPositionsRef.current.get(index);
                            if (savedPos && savedPos > 0) {
                                const { scrollHeight, clientHeight } = containerRef.current;
                                containerRef.current.scrollTop = savedPos * (scrollHeight - clientHeight);
                            } else {
                                containerRef.current.scrollTop = 0;
                            }
                        }
                    }
                }, 50);
            });

            // Save progress
            const totalChapters = metadata?.total_chapters ?? 1;
            const progressPercent = ((index + 1) / totalChapters) * 100;
            const scrollRatio = scrollPositionsRef.current.get(index) || 0;
            const location = scrollRatio > 0
                ? `mobi-chapter-${index}:scroll_${scrollRatio.toFixed(6)}`
                : `mobi-chapter-${index}`;
            const cfi = `epubcfi(/0/${index}!/scroll/${scrollRatio.toFixed(6)})`;

            api.saveReadingProgress(bookId, location, Math.min(100, progressPercent), undefined, undefined, cfi)
                .catch(() => { /* silently ignore */ });

            resetDoodlePage();
        } catch (err) {
            logger.error('[MobiReader] Error loading chapter:', err);
            setError(err instanceof Error ? err.message : 'Failed to load chapter');
            setIsLoading(false);
        }
    }, [bookId, metadata, resetDoodlePage]);

    // ── Book Loading ──
    const loadBook = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);

            logger.debug('[MobiReader] Opening book:', bookId, bookPath);

            const formatString = bookPath.endsWith('.azw3') ? 'azw3' : 'mobi';
            const bookMetadata = await api.openBookRenderer(bookId, bookPath, formatString);
            setMetadata(bookMetadata);

            // Restore saved progress
            let startIndex = 0;
            let savedScrollRatio = 0;
            try {
                const progress = await api.getReadingProgress(bookId);
                if (progress) {
                    // CFI-based restore
                    if (progress.cfiLocation?.startsWith('epubcfi(') && progress.cfiLocation.endsWith(')')) {
                        const cfiInner = progress.cfiLocation.slice(8, -1);
                        const cfiParts = cfiInner.split('!/');
                        if (cfiParts.length === 2) {
                            const pathParts = cfiParts[0].split('/').filter(Boolean);
                            if (pathParts.length >= 2) {
                                const idx = parseInt(pathParts[1], 10);
                                if (!isNaN(idx) && idx >= 0 && idx < bookMetadata.total_chapters) {
                                    startIndex = idx;
                                }
                            }
                            const scrollMatch = cfiParts[1].match(/^scroll\/([0-9.]+)/);
                            if (scrollMatch) {
                                const ratio = parseFloat(scrollMatch[1]);
                                if (!isNaN(ratio) && ratio >= 0 && ratio <= 1) {
                                    savedScrollRatio = ratio;
                                }
                            }
                        }
                    } else if (progress.currentLocation) {
                        // Legacy location formats
                        const loc = progress.currentLocation;
                        const chapterMatch = loc.match(/mobi-chapter-(\d+)/);
                        if (chapterMatch) {
                            const idx = parseInt(chapterMatch[1], 10);
                            if (!isNaN(idx) && idx >= 0 && idx < bookMetadata.total_chapters) {
                                startIndex = idx;
                            }
                        }
                        const scrollMatch = loc.match(/scroll_([0-9.]+)/);
                        if (scrollMatch) {
                            const ratio = parseFloat(scrollMatch[1]);
                            if (!isNaN(ratio) && ratio >= 0 && ratio <= 1) {
                                savedScrollRatio = ratio;
                            }
                        }
                        // Legacy mobi-progress-XX format
                        if (loc.startsWith('mobi-progress-')) {
                            const pct = parseFloat(loc.replace('mobi-progress-', ''));
                            if (!isNaN(pct) && pct > 0) {
                                savedScrollRatio = pct / 100;
                            }
                        }
                    }
                }
            } catch {
                // Silently ignore
            }

            await loadChapter(startIndex, savedScrollRatio);

            if (startIndex > 0 || savedScrollRatio > 0) {
                useToastStore.getState().addToast({
                    title: 'Resuming reading',
                    description: `Chapter ${startIndex + 1} of ${bookMetadata.total_chapters}`,
                    variant: 'info',
                    duration: 3000,
                });
            }
        } catch (err) {
            logger.error('[MobiReader] Error loading book:', err);
            setError(err instanceof Error ? err.message : 'Failed to load MOBI file');
            setIsLoading(false);
        }
    }, [bookId, bookPath, loadChapter]);

    useEffect(() => {
        void loadBook();
        return () => {
            api.closeBookRenderer(bookId).catch(logger.error);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bookPath, bookId]);

    // ── Scroll Progress Tracking ──
    const handleScroll = useCallback(() => {
        if (!containerRef.current) return;

        const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
        const maxScroll = scrollHeight - clientHeight;
        const percent = maxScroll > 0 ? (scrollTop / maxScroll) * 100 : 100;

        setProgressPercentage(percent);

        // Update global scroll progress for UI
        const totalChapters = metadata?.total_chapters ?? 1;
        const chapterFraction = (percent / 100) / totalChapters;
        const globalProgress = ((currentIndex + chapterFraction) / totalChapters) * 100;
        setScrollProgress(Math.min(100, Math.max(0, globalProgress)));

        // Debounced save to backend
        if (saveProgressTimerRef.current) clearTimeout(saveProgressTimerRef.current);
        saveProgressTimerRef.current = window.setTimeout(() => {
            const scrollRatio = maxScroll > 0 ? scrollTop / maxScroll : 0;
            const progressPercent = ((currentIndex + scrollRatio / totalChapters) / totalChapters) * 100;
            const location = scrollRatio > 0
                ? `mobi-chapter-${currentIndex}:scroll_${scrollRatio.toFixed(6)}`
                : `mobi-chapter-${currentIndex}`;
            const cfi = `epubcfi(/0/${currentIndex}!/scroll/${scrollRatio.toFixed(6)})`;
            api.saveReadingProgress(bookId, location, Math.min(100, progressPercent), undefined, undefined, cfi)
                .catch(e => logger.error('[MobiReader] Error saving progress:', e));
        }, 2000);
    }, [bookId, currentIndex, metadata, setScrollProgress]);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        el.addEventListener('scroll', handleScroll, { passive: true });
        return () => el.removeEventListener('scroll', handleScroll);
    }, [handleScroll]);

    // ── Annotation Highlights ──
    useEffect(() => {
        if (!currentChapter || isLoading) return;

        let cancelled = false;

        const applyAnnotations = async () => {
            const container = contentRef.current;
            if (!container || cancelled) return;

            try {
                const annotations = await api.getAnnotations(bookId);
                if (cancelled) return;

                const chapterLocation = `mobi-chapter-${currentIndex}`;
                const chapterAnnotations = annotations.filter(
                    (a) => a.location === chapterLocation || a.location.startsWith(`${chapterLocation}:`)
                );
                applyHighlightsToDOM(container, chapterAnnotations);

                // Scroll to pending annotation if set
                const pendingId = useReaderUIStore.getState().pendingAnnotationId;
                if (pendingId) {
                    const mark = container.querySelector(`mark.epub-highlight[data-annotation-id="${pendingId}"]`);
                    if (mark) mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    useReaderUIStore.getState().setPendingAnnotationId(null);
                }
            } catch {
                // Silently ignore
            }
        };

        const timerId = window.setTimeout(applyAnnotations, 80);
        const handleAnnotationChanged = () => window.setTimeout(applyAnnotations, 50);
        window.addEventListener('annotation-changed', handleAnnotationChanged);

        return () => {
            cancelled = true;
            window.clearTimeout(timerId);
            window.removeEventListener('annotation-changed', handleAnnotationChanged);
        };
    }, [currentChapter, currentIndex, bookId, isLoading]);

    // ── Navigation ──
    const nextChapter = useCallback(() => {
        if (!metadata) return;
        if (currentIndex < metadata.total_chapters - 1) {
            void loadChapter(currentIndex + 1);
        }
    }, [metadata, currentIndex, loadChapter]);

    const prevChapter = useCallback(() => {
        if (currentIndex > 0) {
            void loadChapter(currentIndex - 1);
        }
    }, [currentIndex, loadChapter]);

    const nextPage = useCallback(() => {
        if (containerRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
            const isAtBottom = scrollTop + clientHeight >= scrollHeight - 50;
            if (isAtBottom) {
                nextChapter();
            } else {
                containerRef.current.scrollBy({ top: clientHeight * 0.85, behavior: 'smooth' });
            }
        }
    }, [nextChapter]);

    const prevPage = useCallback(() => {
        if (containerRef.current) {
            const { scrollTop, clientHeight } = containerRef.current;
            const isAtTop = scrollTop <= 50;
            if (isAtTop) {
                prevChapter();
            } else {
                containerRef.current.scrollBy({ top: -clientHeight * 0.85, behavior: 'smooth' });
            }
        }
    }, [prevChapter]);

    usePremiumReaderKeyboard({
        onPrevChapter: prevPage,
        onNextChapter: nextPage,
        onPrevPage: prevPage,
        onNextPage: nextPage,
    });

    const handleSidebarNavigate = useCallback<SidebarNavigateHandler>((chapterIndex) => {
        if (metadata && chapterIndex >= 0 && chapterIndex < metadata.total_chapters) {
            void loadChapter(chapterIndex);
        }
    }, [metadata, loadChapter]);

    const currentPageId = useMemo(() => `mobi-chapter-${currentIndex}`, [currentIndex]);

    const topBarProgress = useMemo(() => {
        if (!metadata || metadata.total_chapters <= 1) return progressPercentage;
        const chapterProgress = progressPercentage / 100;
        return ((currentIndex + chapterProgress) / metadata.total_chapters) * 100;
    }, [currentIndex, metadata, progressPercentage]);

    // ── Error State ──
    if (error) {
        return (
            <div className="premium-reader premium-reader--error">
                <div className="premium-error-container">
                    <AlertCircle className="premium-error-icon" />
                    <p className="premium-error-title">{error}</p>
                    <p className="premium-error-subtitle">Try opening a different book or check the file format.</p>
                    <button
                        onClick={() => {
                            setError(null);
                            void loadBook();
                        }}
                        className="premium-error-button"
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    // ── Loading State ──
    if (isLoading && !currentChapter) {
        return (
            <div className="premium-reader premium-reader--loading">
                <div className="premium-loading-container">
                    <Loader2 className="premium-loading-spinner" />
                    <p className="premium-loading-text">Extracting MOBI format...</p>
                    {metadata && (
                        <p className="premium-loading-subtitle">{metadata.title}</p>
                    )}
                </div>
            </div>
        );
    }

    // ── Main Reader ──
    return (
        <div ref={readerContainerRef} className={`premium-reader ${isFocusMode ? 'premium-reader--focus-mode' : ''}`}
            style={{ backgroundColor: 'var(--bg-primary)' }}
        >
            <ReaderTopBar
                bookId={bookId}
                title={metadata?.title || 'Loading...'}
                subtitle={metadata && metadata.total_chapters > 1
                    ? `Chapter ${currentIndex + 1} of ${metadata.total_chapters}`
                    : metadata?.author || 'MOBI'
                }
                progress={topBarProgress}
                format="mobi"
                onClose={onClose}
                centerExtra={
                    <button
                        type="button"
                        onClick={toggleDoodleMode}
                        className={`premium-control-button ${isDoodleMode ? 'premium-control-button--active' : ''}`}
                        title="Toggle drawing mode"
                    >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                        </svg>
                    </button>
                }
            />

            {/* Reading Canvas */}
            <div
                ref={containerRef}
                className={`premium-reading-canvas ${isFocusMode ? 'premium-reading-canvas--focus-mode' : ''} h-full overflow-y-auto`}
                style={{ scrollBehavior: 'smooth' }}
            >
                {isLoading && (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center backdrop-blur-sm" style={{ backgroundColor: 'var(--overlay-bg)' }}>
                        <Loader2 className="w-12 h-12 animate-spin mb-4" style={{ color: 'var(--loading-spinner)' }} />
                        <p className="font-medium" style={{ color: 'var(--text-secondary)' }}>Loading chapter...</p>
                    </div>
                )}

                <div className={`premium-content-container premium-content-container--${width}`}>
                    <div className="premium-chapter-page" style={{ height: 'auto', minHeight: '100%' }}>
                        <div
                            ref={contentRef}
                            className="premium-chapter-content"
                            style={{
                                fontFamily: getFontFamily(fontFamily),
                                fontSize: `${fontSize}px`,
                                lineHeight: lineHeight,
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* Bottom Progress Bar */}
            <div className="premium-progress-bar">
                <div
                    className="premium-progress-bar-fill"
                    style={{ width: `${topBarProgress}%` }}
                />
            </div>

            {/* Floating Navigation Arrows */}
            {!isFocusMode && (
                <>
                    <button
                        type="button"
                        onClick={prevPage}
                        className="premium-nav-arrow premium-nav-arrow--left"
                        aria-label="Previous page"
                    >
                        <ChevronLeft className="premium-nav-icon" />
                    </button>
                    <button
                        type="button"
                        onClick={nextPage}
                        className="premium-nav-arrow premium-nav-arrow--right"
                        aria-label="Next page"
                    >
                        <ChevronRight className="premium-nav-icon" />
                    </button>
                </>
            )}

            {/* Sidebar */}
            <PremiumSidebar
                bookId={bookId}
                currentIndex={currentIndex}
                onNavigate={handleSidebarNavigate}
            />

            {/* Text Selection Toolbar */}
            <TextSelectionToolbar
                bookId={bookId}
                currentLocation={currentPageId}
            />

            {/* TTS */}
            <TTSControlBar
                contentRef={containerRef}
                onChapterEnd={nextChapter}
            />

            {/* Doodle */}
            {isDoodleMode && (
                <DoodleCanvas
                    bookId={bookId}
                    pageId={currentPageId}
                    containerRef={containerRef}
                />
            )}
            {isDoodleMode && <DoodleToolbar />}
        </div>
    );
}
