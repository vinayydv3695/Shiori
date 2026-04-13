import { useEffect, useState, useRef } from 'react';
import {
    useMangaContentStore,
    useMangaUIStore,
    useMangaSettingsStore
} from '@/store/mangaReaderStore';
import { X, Settings, ChevronLeft, ChevronRight, Maximize, Minimize } from 'lucide-react';

const TOPBAR_AUTO_HIDE_MS = 10_000;

export function MangaReaderHeader({ 
    onClose, 
    onChapterChange 
}: { 
    onClose: () => void;
    onChapterChange?: (chapterId: string) => Promise<{ pageUrls: string[]; chapterTitle: string }>;
}) {
    const title = useMangaContentStore(s => s.title);
    const currentPage = useMangaContentStore(s => s.currentPage);
    const totalPages = useMangaContentStore(s => s.totalPages);
    const sourceType = useMangaContentStore(s => s.sourceType);
    const onlineSource = useMangaContentStore(s => s.onlineSource);
    const setOnlineChapter = useMangaContentStore(s => s.setOnlineChapter);
    const setLoading = useMangaContentStore(s => s.setLoading);
    const setError = useMangaContentStore(s => s.setError);

    const isTopBarVisible = useMangaUIStore(s => s.isTopBarVisible);
    const setTopBarVisible = useMangaUIStore(s => s.setTopBarVisible);
    const lastScrollActivityAt = useMangaUIStore(s => s.lastScrollActivityAt);
    const toggleSidebar = useMangaUIStore(s => s.toggleSidebar);
    const isSidebarOpen = useMangaUIStore(s => s.isSidebarOpen);
    const isSettingsOpen = useMangaUIStore(s => s.isSettingsOpen);
    
    const stickyHeader = useMangaSettingsStore(s => s.stickyHeader);
    const readingMode = useMangaSettingsStore(s => s.readingMode);
    const isScrollMode = readingMode === 'strip' || readingMode === 'webtoon' || readingMode === 'manhwa';

    const [isFullscreen, setIsFullscreen] = useState(false);
    const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Keep the top bar visible while sidebar/settings panels are open.
    useEffect(() => {
        if (isSidebarOpen || isSettingsOpen) {
            setTopBarVisible(true);
        }

        return () => {
            if (hideTimeoutRef.current) {
                clearTimeout(hideTimeoutRef.current);
                hideTimeoutRef.current = null;
            }
        };
    }, [isSidebarOpen, isSettingsOpen, setTopBarVisible]);

    // In scrolling modes, keep top bar visible while user scrolls,
    // then hide it after a longer quiet period for less distraction.
    useEffect(() => {
        if (hideTimeoutRef.current) {
            clearTimeout(hideTimeoutRef.current);
            hideTimeoutRef.current = null;
        }

        if (!isScrollMode || stickyHeader || isSidebarOpen || isSettingsOpen || lastScrollActivityAt === 0) {
            return;
        }

        if (Date.now() - lastScrollActivityAt > TOPBAR_AUTO_HIDE_MS) {
            return;
        }

        setTopBarVisible(true);
        hideTimeoutRef.current = setTimeout(() => {
            const uiState = useMangaUIStore.getState();
            const settingsState = useMangaSettingsStore.getState();

            if (!settingsState.stickyHeader && !uiState.isSidebarOpen && !uiState.isSettingsOpen) {
                setTopBarVisible(false);
            }
        }, TOPBAR_AUTO_HIDE_MS);

        return () => {
            if (hideTimeoutRef.current) {
                clearTimeout(hideTimeoutRef.current);
                hideTimeoutRef.current = null;
            }
        };
    }, [isScrollMode, stickyHeader, isSidebarOpen, isSettingsOpen, lastScrollActivityAt, setTopBarVisible]);

    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
        } else {
            document.exitFullscreen().catch(() => {});
        }
    };

    const handleChapterNav = async (direction: 'prev' | 'next') => {
        if (!onlineSource || !onChapterChange) return;

        const currentIndex = onlineSource.chapters.findIndex(c => c.id === onlineSource.chapterId);
        if (currentIndex === -1) return;

        const nextIndex = direction === 'next' ? currentIndex - 1 : currentIndex + 1; // Assuming 0 is latest
        const targetChapter = onlineSource.chapters[nextIndex];

        if (targetChapter) {
            setLoading(true);
            try {
                const data = await onChapterChange(targetChapter.id);
                setOnlineChapter(targetChapter.id, data.chapterTitle, data.pageUrls);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load chapter');
            } finally {
                setLoading(false);
            }
        }
    };

    const hasNextChapter = onlineSource && onlineSource.chapters.findIndex(c => c.id === onlineSource.chapterId) > 0;
    const hasPrevChapter = onlineSource && onlineSource.chapters.findIndex(c => c.id === onlineSource.chapterId) < onlineSource.chapters.length - 1;

    // Use existing CSS variables and classes from manga-reader.css
    return (
        <header className={`manga-topbar ${!isTopBarVisible ? 'manga-topbar--hidden' : ''}`}>
            <div className="manga-topbar-content">
                
                {/* Left Side: Close & Title */}
                <div className="manga-topbar-left">
                    <button type="button" className="manga-topbar-btn" onClick={onClose} title="Close Reader (Esc)">
                        <X size={18} />
                    </button>
                    <div className="manga-topbar-divider" />
                    <div className="manga-header-title-group">
                        <span className="manga-header-title" title={title}>
                            {title}
                        </span>
                        {onlineSource?.chapterTitle && (
                            <>
                                <span style={{ color: 'var(--manga-text-tertiary)' }}>•</span>
                                <span className="manga-header-chapter" title={onlineSource.chapterTitle}>
                                    {onlineSource.chapterTitle}
                                </span>
                            </>
                        )}
                    </div>
                </div>

                {/* Center: Page Indicator */}
                <div className="manga-topbar-center">
                    {totalPages > 0 && (
                        <div className="manga-indicator">
                            Page {currentPage + 1} of {totalPages}
                        </div>
                    )}
                </div>

                {/* Right Side: Chapter Nav (Online), Settings, Fullscreen */}
                <div className="manga-topbar-right">
                    {sourceType === 'online' && (
                        <>
                            <button 
                                type="button"
                                className="manga-topbar-btn"
                                onClick={() => handleChapterNav('prev')}
                                disabled={!hasPrevChapter}
                                style={{ opacity: hasPrevChapter ? 1 : 0.4 }}
                                title="Previous Chapter"
                            >
                                <ChevronLeft size={20} />
                            </button>
                            <button 
                                type="button"
                                className="manga-topbar-btn"
                                onClick={() => handleChapterNav('next')}
                                disabled={!hasNextChapter}
                                style={{ opacity: hasNextChapter ? 1 : 0.4 }}
                                title="Next Chapter"
                            >
                                <ChevronRight size={20} />
                            </button>
                            <div className="manga-topbar-divider" />
                        </>
                    )}

                    <button 
                        type="button"
                        className="manga-topbar-btn" 
                        onClick={toggleFullscreen}
                        title={isFullscreen ? "Exit Fullscreen (F)" : "Fullscreen (F)"}
                    >
                        {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
                    </button>
                    
                    <button 
                        type="button"
                        className={`manga-topbar-btn ${isSidebarOpen ? 'manga-topbar-btn--active' : ''}`}
                        onClick={toggleSidebar}
                        title="Toggle Sidebar (S)"
                    >
                        <Settings size={18} />
                    </button>
                </div>

            </div>
        </header>
    );
}
