import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { api } from '@/lib/tauri';
import type { BookMetadata } from '@/lib/tauri';
import { ChevronLeft, ChevronRight, Loader2, AlertCircle } from '@/components/icons';
import { logger } from '@/lib/logger';
import { useReadingSettings } from '@/store/premiumReaderStore';
import { useToastStore } from '@/store/toastStore';
import { usePremiumReaderKeyboard } from '@/hooks/usePremiumReaderKeyboard';
import { useReaderAutoHide } from '@/hooks/useReaderAutoHide';
import { useReaderTheme } from '@/hooks/useReaderTheme';
import { useReadingSession } from '@/hooks/useReadingSession';
import { ReaderTopBar } from './ReaderTopBar';
import type { ReaderFormat } from './ReaderSettings';
import type { ReaderContent } from './readerContent';
import { PremiumSidebar } from './PremiumSidebar';
import { TextSelectionToolbar } from './TextSelectionToolbar';
import { TTSControlBar } from './TTSControlBar';
import { sanitizeBookContent } from '@/lib/sanitize';
import { applyHighlightsToDOM } from '@/lib/highlightAnnotations';
import { resolveReadingFontCss } from '@/lib/readingFonts';
import '@/styles/premium-reader.css';

interface GenericHtmlReaderProps {
    bookPath: string;
    bookId: number;
    format: ReaderFormat;
    readerContent?: ReaderContent | null;
    onClose: () => void;
}

type SidebarNavigateHandler = (chapterIndex: number, searchTerm?: string | null) => void;

export function GenericHtmlReader({ bookPath, bookId, format, readerContent, onClose }: GenericHtmlReaderProps) {
    const { isFocusMode } = useReaderAutoHide();
    const { theme, fontSize, fontFamily, lineHeight, width } = useReadingSettings();

    useReadingSession(bookId);

    const [metadata, setMetadata] = useState<BookMetadata | null>(null);
    const [content, setContent] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [progressPercentage, setProgressPercentage] = useState(0);

    const [currentChapter, setCurrentChapter] = useState(0);
    const [totalChapters, setTotalChapters] = useState(1);

    const containerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const readerContainerRef = useRef<HTMLDivElement>(null);

    const isMobiFamilyFormat = format === 'mobi' || format === 'azw' || format === 'azw3';
    const locationPrefix = isMobiFamilyFormat ? 'mobi' : 'generic';
    const progressPrefix = `${locationPrefix}-progress-`;
    const supportedProgressPrefixes = useMemo(
        () => [progressPrefix, `${format}-progress-`, 'mobi-progress-', 'generic-progress-'],
        [progressPrefix, format]
    );
    const sanitizedContent = useMemo(() => sanitizeBookContent(content), [content]);

    useEffect(() => {
        if (contentRef.current) {
            contentRef.current.innerHTML = sanitizedContent;
        }
    }, [sanitizedContent]);

    // ── Reader Theme ──
    useReaderTheme(readerContainerRef, theme);

    const restoreProgress = useCallback(async () => {
        if (!containerRef.current) return;
        try {
            const savedProgress = await api.getReadingProgress(bookId);
            if (!savedProgress) return;

            let targetTop: number | null = null;

            // Try CFI-based restore first (precise scroll position)
            const cfi = savedProgress.cfiLocation;
            if (cfi) {
                const cfiMatch = cfi.match(/^epubcfi\(\/0\/(\d+)!\/scroll\/([\d.]+)\)$/);
                if (cfiMatch) {
                    const scrollRatio = parseFloat(cfiMatch[2]);
                    if (!isNaN(scrollRatio) && scrollRatio > 0) {
                        const { scrollHeight, clientHeight } = containerRef.current;
                        const maxScroll = scrollHeight - clientHeight;
                        targetTop = Math.round(scrollRatio * maxScroll);
                    }
                }
            }

            // Fallback to legacy percentage-based location
            if (targetTop === null && savedProgress.currentLocation) {
                const loc = savedProgress.currentLocation;
                if (supportedProgressPrefixes.some(prefix => loc.startsWith(prefix))) {
                    const pctMatch = loc.match(/(?:[a-z0-9]+)-progress-([\d.]+)-ch/i);
                    if (pctMatch) {
                        const pct = parseFloat(pctMatch[1]);
                        if (!isNaN(pct) && pct > 0) {
                            const { scrollHeight, clientHeight } = containerRef.current;
                            const maxScroll = scrollHeight - clientHeight;
                            targetTop = Math.round((pct / 100) * maxScroll);
                        }
                    }
                }
            }

            if (targetTop !== null && targetTop > 0) {
                containerRef.current.scrollTo({ top: targetTop, behavior: 'auto' });
                useToastStore.getState().addToast({
                    title: 'Resuming reading',
                    description: `Restored to previous position`,
                    variant: 'info',
                    duration: 3000,
                });
            }
        } catch {
            // Silently ignore - start from top
        }
    }, [bookId, supportedProgressPrefixes]);

    const loadBook = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);

            logger.debug(`[GenericHtmlReader] Opening book:`, bookId, bookPath, format);

            const bookMetadata = await api.openBookRenderer(bookId, bookPath, format);
            setMetadata(bookMetadata);
            setTotalChapters(bookMetadata.total_chapters);

            let initialChapter = 0;
            try {
                const savedProgress = await api.getReadingProgress(bookId);
                if (savedProgress?.currentLocation && supportedProgressPrefixes.some(prefix => savedProgress.currentLocation.startsWith(prefix))) {
                    const match = savedProgress.currentLocation.match(/-ch(\d+)$/);
                    if (match) {
                        const parsed = parseInt(match[1], 10);
                        if (!isNaN(parsed) && parsed >= 0 && parsed < bookMetadata.total_chapters) {
                            initialChapter = parsed;
                        }
                    }
                }
            } catch {
                // Ignore — progress restoration is best-effort
            }

            setCurrentChapter(initialChapter);

            const chapter = await api.getBookChapter(bookId, initialChapter);
            setContent(chapter.content);

            setIsLoading(false);

            // Restore scroll progress after brief render delay
            window.setTimeout(() => {
                void restoreProgress();
            }, 300);

         } catch (err) {
             logger.error('[GenericHtmlReader] Error loading book:', err);
             setError(err instanceof Error ? err.message : `Failed to load ${format.toUpperCase()} file`);
             setIsLoading(false);
         }
    }, [bookId, bookPath, format, supportedProgressPrefixes, restoreProgress]);

     useEffect(() => {
         // eslint-disable-next-line react-hooks/set-state-in-effect
         loadBook();
         return () => {
             // Cleanup
             api.closeBookRenderer(bookId).catch(logger.error);
         };
     }, [loadBook, bookId]);

    const goToChapter = async (index: number, searchTerm?: string | null) => {
        if (index < 0 || index >= totalChapters) return;
        try {
            const chapter = await api.getBookChapter(bookId, index);
            setContent(chapter.content);
            setCurrentChapter(index);
            // Scroll to top of new chapter
            if (containerRef.current) {
                containerRef.current.scrollTo({ top: 0, behavior: 'auto' });
            }
            if (searchTerm && searchTerm.trim()) {
                setTimeout(() => {
                    const firstHighlight = contentRef.current?.querySelector('mark.premium-search-highlight') as HTMLElement | null;
                    firstHighlight?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 120);
            }
          } catch (err) {
              logger.error('[GenericHtmlReader] Error loading chapter:', err);
          }
     };

    const nextChapter = () => goToChapter(currentChapter + 1);
    const prevChapter = () => goToChapter(currentChapter - 1);

    // Setup scroll event listener for continuous progress tracking
    const handleScroll = useCallback(() => {
        if (!containerRef.current || !contentRef.current) return;

        const { scrollTop, scrollHeight, clientHeight } = containerRef.current;

        // Calculate continuous progress percentage against the total height of the DOM
        const maxScroll = scrollHeight - clientHeight;
        const percent = maxScroll > 0 ? (scrollTop / maxScroll) * 100 : 100;

        setProgressPercentage(percent);
    }, []);

    // Debounced scroll listener to save backend state every 2 seconds after user stops scrolling
    useEffect(() => {
        let timeoutId: number;

        const debouncedSave = () => {
            if (!containerRef.current || !contentRef.current) return;
            const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
            const maxScroll = scrollHeight - clientHeight;
            const progressPercent = maxScroll > 0 ? (scrollTop / maxScroll) * 100 : 100;

            // Save as a percentage (0-100) so progress survives font/window resizes
            const scrollRatio = maxScroll > 0 ? scrollTop / maxScroll : 0;
            const cfi = `epubcfi(/0/${currentChapter}!/scroll/${scrollRatio.toFixed(6)})`;
            api.saveReadingProgress(
                 bookId,
                  `${progressPrefix}${progressPercent.toFixed(4)}-ch${currentChapter}`,
                  progressPercent,
                  currentChapter + 1,
                  totalChapters,
                 cfi
             ).catch(e => logger.error('[GenericHtmlReader] Error saving progress:', e));
        };

        const scrollElement = containerRef.current;
        if (scrollElement) {
            const listener = () => {
                handleScroll();
                clearTimeout(timeoutId);
                timeoutId = window.setTimeout(debouncedSave, 2000);
            };
            scrollElement.addEventListener('scroll', listener);
            return () => scrollElement.removeEventListener('scroll', listener);
        }
    }, [handleScroll, bookId, currentChapter, totalChapters, progressPrefix]);

    // ────────────────────────────────────────────────────────────
    // ANNOTATION HIGHLIGHTS — render saved highlights into DOM
    // ────────────────────────────────────────────────────────────
    useEffect(() => {
        if (!content || isLoading) return;

        let cancelled = false;

        const applyAnnotations = async () => {
            const container = contentRef.current;
            if (!container || cancelled) return;

            try {
                const annotations = await api.getAnnotations(bookId);
                if (cancelled) return;

                const chapterLocations = new Set([
                    `generic-chapter-${currentChapter}`,
                    `mobi-chapter-${currentChapter}`,
                    `${locationPrefix}-chapter-${currentChapter}`,
                    `${format}-chapter-${currentChapter}`,
                ]);
                const chapterAnnotations = annotations.filter(
                    (a) => chapterLocations.has(a.location)
                );

                applyHighlightsToDOM(container, chapterAnnotations);
            } catch {
                // Silently ignore — highlights are non-critical
            }
        };

        const timerId = window.setTimeout(applyAnnotations, 80);

        const handleAnnotationChanged = () => {
            window.setTimeout(applyAnnotations, 50);
        };
        window.addEventListener('annotation-changed', handleAnnotationChanged);

        return () => {
            cancelled = true;
            window.clearTimeout(timerId);
            window.removeEventListener('annotation-changed', handleAnnotationChanged);
        };
    }, [content, bookId, isLoading, currentChapter, locationPrefix, format]);

    // Keyboard navigation matching Premium UI
    const nextPage = useCallback(() => {
        if (containerRef.current) {
            const { clientHeight } = containerRef.current;
            containerRef.current.scrollBy({ top: clientHeight * 0.85, behavior: 'smooth' });
        }
    }, []);

    const prevPage = useCallback(() => {
        if (containerRef.current) {
            const { clientHeight } = containerRef.current;
            containerRef.current.scrollBy({ top: -clientHeight * 0.85, behavior: 'smooth' });
        }
    }, []);

    usePremiumReaderKeyboard({
        onPrevChapter: prevChapter,
        onNextChapter: nextChapter,
        onPrevPage: prevPage,
        onNextPage: nextPage,
    });

    if (error) {
        return (
            <div className="premium-reader premium-reader--error">
                <div className="premium-error-container">
                    <AlertCircle className="premium-error-icon" />
                    <p className="premium-error-title">{error}</p>
                    <p className="premium-error-subtitle">Try opening a different book or check the file format.</p>
                </div>
            </div>
        );
    }

    if (isLoading || !content) {
        return (
            <div className="premium-reader premium-reader--loading">
                <div className="premium-loading-container">
                    <Loader2 className="premium-loading-spinner" />
                    <p className="premium-loading-text">Loading {format.toUpperCase()} format...</p>
                     {(metadata || readerContent) && (
                        <p className="premium-loading-subtitle">{metadata?.title ?? readerContent?.title}</p>
                     )}
                </div>
            </div>
        );
    }

    return (
        <div ref={readerContainerRef} className={`premium-reader ${isFocusMode ? 'premium-reader--focus-mode' : ''}`}
            style={{
                backgroundColor: 'var(--bg-primary)',
            }}
        >
            {/* Auto-hide Top Bar */}
            <ReaderTopBar
                bookId={bookId}
                title={metadata?.title || readerContent?.title || 'Loading...'}
                subtitle={totalChapters > 1 ? `Chapter ${currentChapter + 1} / ${totalChapters}` : `${format.toUpperCase()} Render`}
                progress={progressPercentage}
                format={format}
                onClose={onClose}
            />

            {/* Reading Canvas */}
            <div
                ref={containerRef}
                className={`premium-reading-canvas ${isFocusMode ? 'premium-reading-canvas--focus-mode' : ''} h-full overflow-y-auto`}
                style={{ scrollBehavior: 'smooth' }}
            >
                <div className={`premium-content-container premium-content-container--${width}`}>
                    <div className="premium-chapter-page" style={{ height: 'auto', minHeight: '100%' }}>
                        <div
                            ref={contentRef}
                             className="premium-chapter-content"
                             style={{
                                fontFamily: resolveReadingFontCss(fontFamily),
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
                    style={{ width: `${progressPercentage}%` }}
                />
            </div>

            {/* Floating Navigation Arrows */}
            {!isFocusMode && (
                <>
                    <button type="button" onClick={prevPage} className="premium-nav-arrow premium-nav-arrow--left">
                        <ChevronLeft className="premium-nav-icon" />
                    </button>
                    <button type="button" onClick={nextPage} className="premium-nav-arrow premium-nav-arrow--right">
                        <ChevronRight className="premium-nav-icon" />
                    </button>
                </>
            )}

            {/* Sidebar (bookmarks, highlights, notes, search) */}
            <PremiumSidebar
                bookId={bookId}
                currentIndex={currentChapter}
                onNavigate={(totalChapters > 1
                    ? goToChapter
                    : (() => { /* no navigation needed */ })) as SidebarNavigateHandler}
            />

            {/* Text Selection Toolbar */}
            <TextSelectionToolbar
                bookId={bookId}
                currentLocation={`${locationPrefix}-chapter-${currentChapter}`}
            />

            {/* TTS Control Bar */}
            <TTSControlBar
                contentRef={contentRef}
                onChapterEnd={nextPage}
            />
        </div>
    );
}
