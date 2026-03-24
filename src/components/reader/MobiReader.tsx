import { useEffect, useState, useRef, useCallback } from 'react';
import { api } from '@/lib/tauri';
import type { BookMetadata } from '@/lib/tauri';
import { ChevronLeft, ChevronRight, Loader2, AlertCircle } from '@/components/icons';
import { logger } from '@/lib/logger';
import { useUIStore, useReadingSettings, applyReaderThemeToElement, removeReaderThemeFromElement } from '@/store/premiumReaderStore';
import { useToastStore } from '@/store/toastStore';
import { usePremiumReaderKeyboard } from '@/hooks/usePremiumReaderKeyboard';
import { ReaderTopBar } from './ReaderTopBar';
import { PremiumSidebar } from './PremiumSidebar';
import { TextSelectionToolbar } from './TextSelectionToolbar';
import { sanitizeBookContent } from '@/lib/sanitize';
import { applyHighlightsToDOM } from '@/lib/highlightAnnotations';
import '@/styles/premium-reader.css';

interface MobiReaderProps {
    bookPath: string;
    bookId: number;
    onClose: () => void;
}

export function MobiReader({ bookPath, bookId, onClose }: MobiReaderProps) {
    const isFocusMode = useUIStore(state => state.isFocusMode);
    const isTopBarShortcutOnly = useUIStore(state => state.isTopBarShortcutOnly);
    const setTopBarVisible = useUIStore(state => state.setTopBarVisible);
    const { theme, fontSize, fontFamily, lineHeight, width } = useReadingSettings();

    const [metadata, setMetadata] = useState<BookMetadata | null>(null);
    const [content, setContent] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [progressPercentage, setProgressPercentage] = useState(0);

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
        if (isTopBarShortcutOnly) {
            return;
        }
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
        // resetAutoHideTimer is recreated each render - would cause infinite loop if added
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isFocusMode, setTopBarVisible]);

    useEffect(() => {
        if (isFocusMode) {
            setTopBarVisible(false);
            if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
        } else {
            if (isTopBarShortcutOnly) {
                setTopBarVisible(false);
            } else {
                setTopBarVisible(true);
                resetAutoHideTimer();
            }
        }
        // resetAutoHideTimer is recreated each render - would cause infinite loop if added
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isFocusMode, setTopBarVisible, isTopBarShortcutOnly]);

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

            logger.debug('[MobiReader] Opening book:', bookId, bookPath);

            // We pass 'mobi' for both mobi and azw3 since the backend MobiAdapter handles them both identically via the `mobi` crate
            const formatString = bookPath.endsWith('.azw3') ? 'azw3' : 'mobi';
            const bookMetadata = await api.openBookRenderer(bookId, bookPath, formatString);
            setMetadata(bookMetadata);

            // MOBI/AZW3 always extracts strictly to chapter 0 as a continuous flow
            const chapter = await api.getBookChapter(bookId, 0);
            setContent(chapter.content);

            setIsLoading(false);

            // Restore scroll progress after brief render delay
            setTimeout(() => {
                restoreProgress();
            }, 300);

         } catch (err) {
             logger.error('[MobiReader] Error loading book:', err);
             setError(err instanceof Error ? err.message : 'Failed to load MOBI file');
             setIsLoading(false);
         }
    };

     useEffect(() => {
         loadBook();
         return () => {
             // Cleanup
             api.closeBookRenderer(bookId).catch(logger.error);
         };
         // loadBook is recreated each render - would cause infinite loop if added
         // eslint-disable-next-line react-hooks/exhaustive-deps
     }, [bookPath, bookId]);

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
            const cfi = `epubcfi(/0/0!/scroll/${scrollRatio.toFixed(6)})`;
            api.saveReadingProgress(
                 bookId,
                 `mobi-progress-${progressPercent.toFixed(4)}`,
                 progressPercent,
                 1,
                 1,
                 cfi
             ).catch(e => logger.error('[MobiReader] Error saving progress:', e));
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
    }, [handleScroll, bookId]);

    const restoreProgress = async () => {
        if (!containerRef.current) return;
        try {
            const savedProgress = await api.getReadingProgress(bookId);
            if (!savedProgress) return;

            let targetTop: number | null = null;

            // Try CFI-based restore first
            const cfi = savedProgress.cfiLocation;
            if (cfi) {
                const cfiMatch = cfi.match(/^epubcfi\(\/0\/\d+!\/scroll\/([\d.]+)\)$/);
                if (cfiMatch) {
                    const scrollRatio = parseFloat(cfiMatch[1]);
                    if (!isNaN(scrollRatio) && scrollRatio > 0) {
                        const { scrollHeight, clientHeight } = containerRef.current;
                        const maxScroll = scrollHeight - clientHeight;
                        targetTop = Math.round(scrollRatio * maxScroll);
                    }
                }
            }

            // Fallback to legacy location formats
            if (targetTop === null && savedProgress.currentLocation) {
                const loc = savedProgress.currentLocation;
                if (loc.startsWith('mobi-progress-')) {
                    const pct = parseFloat(loc.replace('mobi-progress-', ''));
                    if (!isNaN(pct) && pct > 0) {
                        const { scrollHeight, clientHeight } = containerRef.current;
                        const maxScroll = scrollHeight - clientHeight;
                        targetTop = Math.round((pct / 100) * maxScroll);
                    }
                } else if (loc.startsWith('mobi-scroll-')) {
                    const top = parseInt(loc.replace('mobi-scroll-', ''), 10);
                    if (!isNaN(top) && top > 0) {
                        targetTop = top;
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

                // MOBI uses "mobi-chapter-0" as the location
                const mobiAnnotations = annotations.filter(
                    (a) => a.location === 'mobi-chapter-0'
                );

                applyHighlightsToDOM(container, mobiAnnotations);
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
    }, [content, bookId, isLoading]);

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
        onPrevChapter: prevPage,
        onNextChapter: nextPage,
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
                    <p className="premium-loading-text">Extracting MOBI format...</p>
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
            <ReaderTopBar
                bookId={bookId}
                title={metadata?.title || 'Loading...'}
                subtitle="MOBI Render"
                progress={progressPercentage}
                format="mobi"
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
                currentIndex={0}
                onNavigate={() => { /* MOBI has single chapter - no navigation needed */ }}
            />

            {/* Text Selection Toolbar */}
            <TextSelectionToolbar
                bookId={bookId}
                currentLocation="mobi-chapter-0"
            />
        </div>
    );
}
