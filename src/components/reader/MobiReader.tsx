import { useEffect, useState, useRef, useCallback } from 'react';
import { useReaderStore } from '@/store/readerStore';
import { api } from '@/lib/tauri';
import type { BookMetadata } from '@/lib/tauri';
import { ChevronLeft, ChevronRight, Loader2, AlertCircle, Search, BookOpen, Bookmark } from '@/components/icons';
import { useUIStore, useReadingSettings } from '@/store/premiumReaderStore';
import { usePremiumReaderKeyboard } from '@/hooks/usePremiumReaderKeyboard';
import { ReaderSettings } from './ReaderSettings';
import { sanitizeBookContent } from '@/lib/sanitize';
import '@/styles/premium-reader.css';

interface MobiReaderProps {
    bookPath: string;
    bookId: number;
}

export function MobiReader({ bookPath, bookId }: MobiReaderProps) {
    const { progress, setProgress } = useReaderStore();
    const { isTopBarVisible, isFocusMode, setTopBarVisible, toggleSidebar } = useUIStore();
    const { theme, fontSize, fontFamily, lineHeight, width } = useReadingSettings();

    const [metadata, setMetadata] = useState<BookMetadata | null>(null);
    const [content, setContent] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const containerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    const autoHideTimerRef = useRef<number | null>(null);

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
    }, [isFocusMode, setTopBarVisible]);

    useEffect(() => {
        if (isFocusMode) {
            setTopBarVisible(false);
            if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
        } else {
            setTopBarVisible(true);
            resetAutoHideTimer();
        }
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

    useEffect(() => {
        loadBook();
        return () => {
            // Cleanup
            api.closeBookRenderer(bookId).catch(console.error);
        };
    }, [bookPath, bookId]);

    const loadBook = async () => {
        try {
            setIsLoading(true);
            setError(null);

            console.log('[MobiReader] Opening book:', bookId, bookPath);

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
            console.error('[MobiReader] Error loading book:', err);
            setError(err instanceof Error ? err.message : 'Failed to load MOBI file');
            setIsLoading(false);
        }
    };

    // Setup scroll event listener for continuous progress tracking
    const handleScroll = useCallback(() => {
        if (!containerRef.current || !contentRef.current) return;

        const { scrollTop, scrollHeight, clientHeight } = containerRef.current;

        // Calculate continuous progress percentage against the total height of the DOM
        const maxScroll = scrollHeight - clientHeight;
        const progressPercent = maxScroll > 0 ? (scrollTop / maxScroll) * 100 : 100;

        // Only save progress updates occasionally to avoid spamming the DB
        // Note: Math.floor isn't used here because we want precise floats
        setProgress({
            bookId,
            currentLocation: `mobi-scroll-${Math.round(scrollTop)}`,
            progressPercent,
            currentPage: 1,
            totalPages: 1,
            lastRead: new Date().toISOString()
        });

    }, [bookId, setProgress]);

    // Debounced scroll listener to save backend state every 2 seconds after user stops scrolling
    useEffect(() => {
        let timeoutId: number;

        const debouncedSave = () => {
            if (!containerRef.current || !contentRef.current) return;
            const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
            const maxScroll = scrollHeight - clientHeight;
            const progressPercent = maxScroll > 0 ? (scrollTop / maxScroll) * 100 : 100;

            api.saveReadingProgress(
                bookId,
                `mobi-scroll-${Math.round(scrollTop)}`,
                progressPercent,
                1,
                1
            ).catch(e => console.error('[MobiReader] Error saving progress:', e));
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

    const restoreProgress = () => {
        if (!containerRef.current || !progress?.currentLocation) return;
        const locationString = progress.currentLocation;
        if (locationString.startsWith('mobi-scroll-')) {
            const topStr = locationString.replace('mobi-scroll-', '');
            const top = parseInt(topStr, 10);
            if (!isNaN(top)) {
                containerRef.current.scrollTo({ top, behavior: 'auto' });
            }
        }
    };

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

    const progressPercentage = progress?.progressPercent || 0;

    return (
        <div className={`premium-reader ${isFocusMode ? 'premium-reader--focus-mode' : ''}`}
            style={{
                backgroundColor: theme === 'dark' ? '#121212' : '#ffffff',
            }}
        >
            {/* Auto-hide Top Bar */}
            <div className={`premium-top-bar ${!isTopBarVisible ? 'premium-top-bar--hidden' : ''}`}>
                <div className="premium-top-bar-content">
                    <div className="premium-top-bar-left">
                        <span className="premium-book-title">{metadata?.title || 'Loading...'}</span>
                        <span className="premium-chapter-indicator">MOBI Render</span>
                    </div>

                    <div className="premium-top-bar-center">
                        <span className="premium-progress-text">{Math.round(progressPercentage)}%</span>
                    </div>

                    <div className="premium-top-bar-right">
                        <ReaderSettings />
                        <button onClick={() => toggleSidebar('search')} className="premium-control-button" title="Search">
                            <Search className="premium-control-icon" />
                        </button>
                        <button onClick={() => toggleSidebar('toc')} className="premium-control-button" title="Table of Contents">
                            <BookOpen className="premium-control-icon" />
                        </button>
                        <button onClick={() => toggleSidebar('bookmarks')} className="premium-control-button" title="Bookmarks">
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
        </div>
    );
}
