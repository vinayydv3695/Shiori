import { useEffect, useRef } from 'react';
import { useFullscreen } from '@/hooks/useFullscreen';
import {
    useMangaContentStore,
    useMangaUIStore,
    useMangaSettingsStore
} from '@/store/mangaReaderStore';
import { X, Settings, ChevronLeft, ChevronRight, Maximize, Minimize, ZoomIn, ZoomOut, Library, CheckCircle2 } from 'lucide-react';
import React from 'react';
import { useOnlineMangaReaderStore } from '@/store/onlineMangaReaderStore';
import { useLibraryStore } from '@/store/libraryStore';

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
    const zoomIn = useMangaSettingsStore(s => s.zoomIn);
    const zoomOut = useMangaSettingsStore(s => s.zoomOut);
    const isScrollMode = readingMode === 'strip' || readingMode === 'webtoon' || readingMode === 'manhwa';

    const onlineSourceId = useOnlineMangaReaderStore(s => s.sourceId);
    const onlineContentId = useOnlineMangaReaderStore(s => s.contentId);
    const addToLibrary = useOnlineMangaReaderStore(s => s.addToLibrary);
    const libraryBooks = useLibraryStore(s => s.books);

    const isAlreadyInLibrary = React.useMemo(() => {
        if (sourceType !== 'online' || !onlineSourceId || !onlineContentId) return false;
        const expectedPath = `online-manga://${onlineSourceId}/${onlineContentId}`;
        return libraryBooks.some(b => b.file_path === expectedPath);
    }, [sourceType, onlineSourceId, onlineContentId, libraryBooks]);

    const { isFullscreen, toggleFullscreen } = useFullscreen();
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
        if (stickyHeader || isSidebarOpen || isSettingsOpen) {
            return;
        }
        if (isScrollMode) {
            if (isTopBarVisible) {
                hideTimeoutRef.current = setTimeout(() => {
                    const uiState = useMangaUIStore.getState();
                    const settingsState = useMangaSettingsStore.getState();
                    if (!settingsState.stickyHeader && !uiState.isSidebarOpen && !uiState.isSettingsOpen) {
                        setTopBarVisible(false);
                    }
                }, TOPBAR_AUTO_HIDE_MS);
            }
        } else {
            if (isTopBarVisible) {
                hideTimeoutRef.current = setTimeout(() => {
                    const uiState = useMangaUIStore.getState();
                    const settingsState = useMangaSettingsStore.getState();
                    if (!settingsState.stickyHeader && !uiState.isSidebarOpen && !uiState.isSettingsOpen) {
                        setTopBarVisible(false);
                    }
                }, 2000);
            }
        }
        return () => {
            if (hideTimeoutRef.current) {
                clearTimeout(hideTimeoutRef.current);
                hideTimeoutRef.current = null;
            }
        };
    }, [isScrollMode, stickyHeader, isSidebarOpen, isSettingsOpen, lastScrollActivityAt, setTopBarVisible, isTopBarVisible]);


    const handleChapterNav = async (direction: 'prev' | 'next') => {
        if (!onlineSource || !onChapterChange) return;

        const currentIndex = onlineSource.chapters.findIndex(c => c.id === onlineSource.chapterId);
        if (currentIndex === -1) return;

                const isDescending = onlineSource.chapters.length >= 2 && 
            (onlineSource.chapters[0].number ?? 0) > (onlineSource.chapters[onlineSource.chapters.length - 1].number ?? 0);
        
        let nextIndex;
        if (isDescending) {
            nextIndex = direction === 'next' ? currentIndex - 1 : currentIndex + 1;
        } else {
            nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
        }
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

        const currentIndex = onlineSource ? onlineSource.chapters.findIndex(c => c.id === onlineSource.chapterId) : -1;
    const isDescending = onlineSource && onlineSource.chapters.length >= 2 && (onlineSource.chapters[0].number ?? 0) > (onlineSource.chapters[onlineSource.chapters.length - 1].number ?? 0);
    const hasNextChapter = onlineSource && currentIndex !== -1 && (isDescending ? currentIndex > 0 : currentIndex < onlineSource.chapters.length - 1);
    const hasPrevChapter = onlineSource && currentIndex !== -1 && (isDescending ? currentIndex < onlineSource.chapters.length - 1 : currentIndex > 0);

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
                    <button
                        type="button"
                        className="manga-topbar-btn"
                        onClick={zoomOut}
                        title="Zoom Out"
                    >
                        <ZoomOut size={18} />
                    </button>
                    <button
                        type="button"
                        className="manga-topbar-btn"
                        onClick={zoomIn}
                        title="Zoom In"
                    >
                        <ZoomIn size={18} />
                    </button>
                    <div className="manga-topbar-divider" />

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
                            <button
                                type="button"
                                className="manga-topbar-btn"
                                onClick={addToLibrary}
                                disabled={isAlreadyInLibrary}
                                title={isAlreadyInLibrary ? "Already in Library" : "Add to Library"}
                            >
                                {isAlreadyInLibrary ? <CheckCircle2 size={18} className="text-green-500" /> : <Library size={18} />}
                            </button>
                            <div className="manga-topbar-divider" />
                        </>
                    )}

                    <button 
                        type="button"
                        className={`manga-topbar-btn ${isSidebarOpen ? 'manga-topbar-btn--active' : ''}`}
                        onClick={toggleSidebar}
                        title="Toggle Sidebar (S)"
                    >
                        <Settings size={18} />
                    </button>
                    
                    <button 
                        type="button"
                        className="manga-topbar-btn" 
                        onClick={toggleFullscreen}
                        title={isFullscreen ? "Exit Fullscreen (F)" : "Fullscreen (F)"}
                    >
                        {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
                    </button>
                </div>

            </div>
        </header>
    );
}
