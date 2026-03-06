import { useEffect, useState, useRef, useCallback } from 'react';
import { api } from '@/lib/tauri';
import type { BookMetadata } from '@/lib/tauri';
import { ChevronLeft, ChevronRight, Loader2, AlertCircle, Bookmark } from '@/components/icons';
import { useUIStore, useReadingSettings, applyReaderThemeToElement, removeReaderThemeFromElement } from '@/store/premiumReaderStore';
import { useToastStore } from '@/store/toastStore';
import { usePremiumReaderKeyboard } from '@/hooks/usePremiumReaderKeyboard';
import { useReadingSession } from '@/hooks/useReadingSession';
import { ReaderSettings } from './ReaderSettings';
import type { ReaderFormat } from './ReaderSettings';
import { PremiumSidebar } from './PremiumSidebar';
import { TextSelectionToolbar } from './TextSelectionToolbar';
import { TTSControlBar } from './TTSControlBar';
import { sanitizeBookContent } from '@/lib/sanitize';
import { applyHighlightsToDOM } from '@/lib/highlightAnnotations';
import '@/styles/premium-reader.css';

interface GenericHtmlReaderProps {
    bookPath: string;
    bookId: number;
    format: ReaderFormat;
}

export function GenericHtmlReader({ bookPath, bookId, format }: GenericHtmlReaderProps) {
    const { isTopBarVisible, isFocusMode, setTopBarVisible, toggleSidebar } = useUIStore();
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

    const autoHideTimerRef = useRef<number | null>(null);

    // ────────────────────────────────────────────────────────────
    // READER THEME — scoped to this container, not global <html>
    // ────────────────────────────────────────────────────────────
    useEffect(() => {
        const el = readerContainerRef.current;
        if (el) applyReaderThemeToElement(el, theme);
        return () => { if (el) removeReaderThemeFromElement(el); };
    }, [theme]);

    // ────────────────────────────────────────────────────────────
    // AUTO-HIDE TOP BAR LOGIC
    // ────────────────────────────────────────────────────────────
    const resetAutoHideTimer = () => {
        if (!isFocusMode) {
            setTopBarVisible(true);
            if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
            autoHideTimerRef.current = window.setTimeout(() => setTopBarVisible(false), 3000);
        }
    };

    useEffect(() => {
        let throttleTimeout: number | null = null;
        const handleMouseMove = () => {
            if (!throttleTimeout) {
                resetAutoHideTimer();
                throttleTimeout = window.setTimeout(() => { throttleTimeout = null; }, 100);
            }
        };
        document.addEventListener('mousemove', handleMouseMove, { passive: true });
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            if (throttleTimeout) clearTimeout(throttleTimeout);
            if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isFocusMode, setTopBarVisible]);

    useEffect(() => {
        if (isFocusMode) {
            setTopBarVisible(false);
            if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
        } else {
            setTopBarVisible(true);
            resetAutoHideTimer();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isFocusMode, setTopBarVisible]);

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

    const loadBook = async () => {
        try {
            setIsLoading(true);
            setError(null);

            console.log(`[GenericHtmlReader] Opening book:`, bookId, bookPath, format);

            const bookMetadata = await api.openBookRenderer(bookId, bookPath, format);
            setMetadata(bookMetadata);
            setTotalChapters(bookMetadata.total_chapters);

            let initialChapter = 0;
            try {
                const savedProgress = await api.getReadingProgress(bookId);
                if (savedProgress?.currentLocation?.startsWith('generic-progress-')) {
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
            setTimeout(() => {
                restoreProgress();
            }, 300);

        } catch (err) {
            console.error('[GenericHtmlReader] Error loading book:', err);
            setError(err instanceof Error ? err.message : `Failed to load ${format.toUpperCase()} file`);
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadBook();
        return () => {
            // Cleanup
            api.closeBookRenderer(bookId).catch(console.error);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bookPath, bookId, format]);

    const goToChapter = async (index: number) => {
        if (index < 0 || index >= totalChapters) return;
        try {
            const chapter = await api.getBookChapter(bookId, index);
            setContent(chapter.content);
            setCurrentChapter(index);
            // Scroll to top of new chapter
            if (containerRef.current) {
                containerRef.current.scrollTo({ top: 0, behavior: 'auto' });
            }
        } catch (err) {
            console.error('[GenericHtmlReader] Error loading chapter:', err);
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
            api.saveReadingProgress(
                bookId,
                `generic-progress-${progressPercent.toFixed(4)}-ch${currentChapter}`,
                progressPercent,
                currentChapter + 1,
                totalChapters
            ).catch(e => console.error('[GenericHtmlReader] Error saving progress:', e));
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
    }, [handleScroll, bookId, currentChapter, totalChapters]);

    const restoreProgress = async () => {
        if (!containerRef.current) return;
        try {
            const savedProgress = await api.getReadingProgress(bookId);
            if (!savedProgress?.currentLocation) return;

            const loc = savedProgress.currentLocation;
            let targetTop: number | null = null;

            if (loc.startsWith('generic-progress-')) {
                // New percentage-based format — resize-invariant
                const pctMatch = loc.match(/generic-progress-([\d.]+)-ch/);
                if (pctMatch) {
                    const pct = parseFloat(pctMatch[1]);
                    if (!isNaN(pct) && pct > 0) {
                        const { scrollHeight, clientHeight } = containerRef.current;
                        const maxScroll = scrollHeight - clientHeight;
                        targetTop = Math.round((pct / 100) * maxScroll);
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
    };

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

                const chapterAnnotations = annotations.filter(
                    (a) => a.location === `generic-chapter-${currentChapter}`
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
    }, [content, bookId, isLoading, currentChapter]);

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
                    {metadata && (
                        <p className="premium-loading-subtitle">{metadata.title}</p>
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
            <div className={`premium-top-bar ${!isTopBarVisible ? 'premium-top-bar--hidden' : ''}`}>
                <div className="premium-top-bar-content">
                    <div className="premium-top-bar-left">
                        <span className="premium-book-title">{metadata?.title || 'Loading...'}</span>
                        <span className="premium-chapter-indicator">
                            {totalChapters > 1
                                ? `Chapter ${currentChapter + 1} / ${totalChapters}`
                                : `${format.toUpperCase()} Render`}
                        </span>
                    </div>

                    <div className="premium-top-bar-center">
                        <span className="premium-progress-text">{Math.round(progressPercentage)}%</span>
                    </div>

                    <div className="premium-top-bar-right">
                        <ReaderSettings format={format} />
                        <button
                            onClick={() => toggleSidebar('bookmarks')}
                            className="premium-control-button"
                            title="Bookmarks & Search"
                        >
                            <Bookmark className="premium-control-icon" />
                        </button>
                    </div>
                </div>
            </div>

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
                                fontFamily: getFontFamily(fontFamily),
                                fontSize: `${fontSize}px`,
                                lineHeight: lineHeight,
                            }}
                            dangerouslySetInnerHTML={{ __html: sanitizeBookContent(content) }}
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
                    <button onClick={prevPage} className="premium-nav-arrow premium-nav-arrow--left">
                        <ChevronLeft className="premium-nav-icon" />
                    </button>
                    <button onClick={nextPage} className="premium-nav-arrow premium-nav-arrow--right">
                        <ChevronRight className="premium-nav-icon" />
                    </button>
                </>
            )}

            {/* Sidebar (bookmarks, highlights, notes, search) */}
            <PremiumSidebar
                bookId={bookId}
                currentIndex={currentChapter}
                onNavigate={totalChapters > 1 ? goToChapter : () => { /* no navigation needed */ }}
            />

            {/* Text Selection Toolbar */}
            <TextSelectionToolbar
                bookId={bookId}
                currentLocation={`generic-chapter-${currentChapter}`}
            />

            {/* TTS Control Bar */}
            <TTSControlBar
                contentRef={contentRef}
                onChapterEnd={nextPage}
            />
        </div>
    );
}
