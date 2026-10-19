import { useEffect, useRef, useState, useMemo } from 'react';
import { useFullscreen } from '@/hooks/useFullscreen';
import {
    useMangaContentStore,
    useMangaUIStore,
    useMangaSettingsStore
} from '@/store/mangaReaderStore';
import { 
    X, 
    Settings, 
    ChevronLeft, 
    ChevronRight, 
    Maximize, 
    Minimize, 
    Library, 
    CheckCircle2, 
    List, 
    Check, 
    Search, 
    ArrowUpDown, 
    Loader2, 
    BookOpen,
    ArrowLeft,
    MoreVertical,
    BookmarkCheck,
    BookmarkPlus
} from 'lucide-react';
import React from 'react';
import { compareBooksNatural, parseVolumeOrChapterNumber } from '@/lib/seriesSorting';
import { formatChapterTitle } from '@/components/online/mangaDownloadUtils';
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { AppTooltip } from '@/components/ui/tooltip';
import { useOnlineMangaReaderStore } from '@/store/onlineMangaReaderStore';
import { useLibraryStore } from '@/store/libraryStore';
import { isAndroid } from '@/lib/tauri';
import { useIsMobile } from '@/hooks/useIsMobile';
import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';

const TOPBAR_AUTO_HIDE_MS = 3000;

export function MangaReaderHeader({ 
    onClose, 
    onChapterChange 
}: { 
    onClose: () => void;
    onChapterChange?: (chapterId: string) => Promise<{ pageUrls: string[]; chapterTitle: string }>;
}) {
    const isMobile = useIsMobile();
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
    
    const theme = useMangaSettingsStore(s => s.theme);
    const isLight = theme === 'light';
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

    const localSource = useMangaContentStore(s => s.localSource);
    const currentLocalBook = React.useMemo(() => 
        localSource ? libraryBooks.find(b => b.id === localSource.bookId) : null
    , [localSource, libraryBooks]);
    
    const seriesBooks = React.useMemo(() => {
        if (!currentLocalBook?.series) return [];
        return libraryBooks
            .filter(b => b.series === currentLocalBook.series)
            .sort((a, b) => compareBooksNatural(a, b, 'chapter_asc'));
    }, [currentLocalBook, libraryBooks]);
    
    const currentLocalIndex = React.useMemo(() => 
        seriesBooks.findIndex(b => b.id === currentLocalBook?.id)
    , [seriesBooks, currentLocalBook]);
    
    const hasNextLocalVolume = currentLocalIndex !== -1 && currentLocalIndex < seriesBooks.length - 1;
    const hasPrevLocalVolume = currentLocalIndex > 0;

    const { isFullscreen, toggleFullscreen } = useFullscreen();
    const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Chapter Dropdown state: Search, Sort & Auto-scroll
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [chapterSearch, setChapterSearch] = useState('');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
    const [switchingChapterId, setSwitchingChapterId] = useState<string | null>(null);
    const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
    const activeItemRef = useRef<HTMLDivElement | null>(null);
    const searchInputRef = useRef<HTMLInputElement | null>(null);

    // Auto-scroll to selected chapter when dropdown opens
    useEffect(() => {
        if (dropdownOpen) {
            const timer = setTimeout(() => {
                activeItemRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
            }, 60);
            return () => clearTimeout(timer);
        } else {
            setChapterSearch('');
        }
    }, [dropdownOpen]);

    // Keep the top bar visible while sidebar/settings/dropdown panels are open.
    useEffect(() => {
        if (isSidebarOpen || isSettingsOpen || dropdownOpen || isMoreMenuOpen) {
            setTopBarVisible(true);
        }
        return () => {
            if (hideTimeoutRef.current) {
                clearTimeout(hideTimeoutRef.current);
                hideTimeoutRef.current = null;
            }
        };
    }, [isSidebarOpen, isSettingsOpen, dropdownOpen, isMoreMenuOpen, setTopBarVisible]);

    useEffect(() => {
        if (!isTopBarVisible || isSidebarOpen || isSettingsOpen) {
            setIsMoreMenuOpen(false);
        }
    }, [isTopBarVisible, isSidebarOpen, isSettingsOpen]);

    // In scrolling modes, keep top bar visible while user scrolls,
    // then hide it after a longer quiet period for less distraction.
    useEffect(() => {
        if (hideTimeoutRef.current) {
            clearTimeout(hideTimeoutRef.current);
            hideTimeoutRef.current = null;
        }
        if (stickyHeader || isSidebarOpen || isSettingsOpen || dropdownOpen || isMoreMenuOpen) {
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
    }, [isScrollMode, stickyHeader, isSidebarOpen, isSettingsOpen, dropdownOpen, isMoreMenuOpen, lastScrollActivityAt, setTopBarVisible, isTopBarVisible]);

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

    // Filtered & Sorted Online Chapters
    const processedChapters = useMemo(() => {
        if (!onlineSource?.chapters) return [];
        let list = [...onlineSource.chapters];

        // Search Filter
        if (chapterSearch.trim()) {
            const q = chapterSearch.toLowerCase().trim();
            list = list.filter(c => {
                const titleMatch = c.title?.toLowerCase().includes(q);
                const numMatch = c.number != null && String(c.number).toLowerCase().includes(q);
                const chapterPrefixMatch = c.number != null && `chapter ${c.number}`.includes(q);
                const chPrefixMatch = c.number != null && `ch ${c.number}`.includes(q);
                const volMatch = c.volume && `vol ${c.volume}`.toLowerCase().includes(q);
                return titleMatch || numMatch || chapterPrefixMatch || chPrefixMatch || volMatch;
            });
        }

        // Sort
        list.sort((a, b) => {
            const numA = a.number ?? 0;
            const numB = b.number ?? 0;
            return sortDirection === 'asc' ? numA - numB : numB - numA;
        });

        return list;
    }, [onlineSource?.chapters, chapterSearch, sortDirection]);

    // Filtered & Sorted Local Volumes
    const processedLocalBooks = useMemo(() => {
        if (!seriesBooks.length) return [];
        let list = [...seriesBooks];

        if (chapterSearch.trim()) {
            const q = chapterSearch.toLowerCase().trim();
            list = list.filter(b => {
                const volNum = parseVolumeOrChapterNumber(b);
                return (
                    b.title.toLowerCase().includes(q) || 
                    (volNum !== null && (String(volNum).includes(q) || `vol ${volNum}`.includes(q)))
                );
            });
        }

        list.sort((a, b) => compareBooksNatural(a, b, sortDirection));

        return list;
    }, [seriesBooks, chapterSearch, sortDirection]);

    const displayTitle = (title?.trim()) || (onlineSource?.contentTitle?.trim()) || (currentLocalBook?.title?.trim()) || 'Manga Reader';

    const displaySubtitle = useMemo(() => {
        if (sourceType === 'online') {
            const chTitle = onlineSource?.chapterTitle?.trim();
            const pageInfo = totalPages > 0 ? `Page ${currentPage + 1} of ${totalPages}` : '';
            if (chTitle && pageInfo) return `${chTitle} • ${pageInfo}`;
            return chTitle || pageInfo || '';
        }
        if (currentLocalBook?.series) {
            const volNum = parseVolumeOrChapterNumber(currentLocalBook);
            const volStr = volNum !== null ? `Vol. ${volNum}` : (currentLocalBook.title || '');
            const pageInfo = totalPages > 0 ? `Page ${currentPage + 1} of ${totalPages}` : '';
            if (volStr && pageInfo) return `${volStr} • ${pageInfo}`;
            return volStr || pageInfo || '';
        }
        return totalPages > 0 ? `Page ${currentPage + 1} of ${totalPages}` : '';
    }, [sourceType, onlineSource?.chapterTitle, currentLocalBook, totalPages, currentPage]);

    const nextChapter = onlineSource && currentIndex !== -1 ? (
        isDescending ? onlineSource.chapters[currentIndex - 1] : onlineSource.chapters[currentIndex + 1]
    ) : null;
    const prevChapter = onlineSource && currentIndex !== -1 ? (
        isDescending ? onlineSource.chapters[currentIndex + 1] : onlineSource.chapters[currentIndex - 1]
    ) : null;

    const nextLocalBook = hasNextLocalVolume ? seriesBooks[currentLocalIndex + 1] : null;
    const prevLocalBook = hasPrevLocalVolume ? seriesBooks[currentLocalIndex - 1] : null;

    return (
        <header className={`manga-topbar ${isAndroid ? 'manga-topbar--android' : ''} ${!isTopBarVisible ? 'manga-topbar--hidden' : ''}`}>
            <div className="manga-topbar-content">
                
                {/* Left Side: Back & Title */}
                <div className="manga-topbar-left">
                    <AppTooltip content="Back to library" side="bottom">
                        <button
                            type="button"
                            className="manga-topbar-btn cursor-pointer shrink-0"
                            onClick={onClose}
                            aria-label="Back to library"
                        >
                            <ArrowLeft size={isAndroid ? 20 : 18} />
                        </button>
                    </AppTooltip>

                    <div className="flex flex-col min-w-0 overflow-hidden text-left justify-center flex-1 pr-2 py-0.5">
                        <AppTooltip content={displayTitle} side="bottom">
                            <span className="manga-header-title text-xs sm:text-sm font-extrabold text-[var(--manga-text-primary)] truncate block leading-tight">
                                {displayTitle}
                            </span>
                        </AppTooltip>
                        {displaySubtitle && (
                            <AppTooltip content={displaySubtitle} side="bottom">
                                <span className="manga-header-chapter text-[10px] sm:text-xs text-[var(--manga-text-secondary)] opacity-85 font-medium truncate block leading-tight mt-0.5">
                                    {displaySubtitle}
                                </span>
                            </AppTooltip>
                        )}
                    </div>
                </div>

                {/* Center: Desktop Page Stepper Pill */}
                <div className="manga-topbar-center !hidden md:!flex">
                    {totalPages > 0 && (
                        <div className="manga-page-stepper">
                            <button
                                type="button"
                                className="manga-page-step-btn"
                                onClick={() => useMangaContentStore.getState().prevPage(1)}
                                disabled={currentPage === 0}
                                aria-label="Previous Page"
                            >
                                <ChevronLeft size={14} />
                            </button>
                            <span className="manga-page-step-text">
                                Page {currentPage + 1} of {totalPages}
                            </span>
                            <button
                                type="button"
                                className="manga-page-step-btn"
                                onClick={() => useMangaContentStore.getState().nextPage(1)}
                                disabled={currentPage >= totalPages - 1}
                                aria-label="Next Page"
                            >
                                <ChevronRight size={14} />
                            </button>
                        </div>
                    )}
                </div>

                {/* Right Side: Actions */}
                <div className="manga-topbar-right">
                    {/* Chapter / Volume Modal - Portaled to document.body */}
                    {typeof document !== 'undefined' && createPortal(
                                <AnimatePresence>
                                    {dropdownOpen && (
                                        <>
                                            {/* Backdrop */}
                                            <motion.div
                                                className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-xs"
                                                onClick={() => setDropdownOpen(false)}
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                exit={{ opacity: 0 }}
                                                transition={{ duration: 0.2 }}
                                            />

                                            {/* Modal container: Bottom sheet on mobile/Android, Centered card on desktop */}
                                            <motion.div
                                                data-manga-theme={theme}
                                                className={`fixed z-[205] flex flex-col overflow-hidden select-none border backdrop-blur-2xl ${
                                                    isAndroid || isMobile
                                                        ? 'bottom-0 inset-x-0 rounded-t-[32px] max-h-[84vh]'
                                                        : 'top-[calc(max(12px,calc(env(safe-area-inset-top,0px)+8px))+52px)] left-1/2 -translate-x-1/2 w-88 sm:w-96 max-h-[min(560px,78vh)] rounded-3xl'
                                                } ${
                                                    isLight
                                                        ? 'text-[#2C1E0F] border-[#D9C9A3] shadow-2xl shadow-[#5C4430]/30 ring-1 ring-[#8A6A50]/20'
                                                        : 'text-white border-white/10 shadow-2xl shadow-black/95 ring-1 ring-white/10'
                                                }`}
                                                style={{
                                                    backgroundColor: isLight ? '#FAF6EC' : '#121217',
                                                    ...(isAndroid || isMobile ? {
                                                        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)',
                                                    } : {})
                                                }}
                                                initial={isAndroid || isMobile ? { y: '100%' } : { opacity: 0, scale: 0.96, y: -6, x: '-50%' }}
                                                animate={isAndroid || isMobile ? { y: 0 } : { opacity: 1, scale: 1, y: 0, x: '-50%' }}
                                                exit={isAndroid || isMobile ? { y: '100%' } : { opacity: 0, scale: 0.96, y: -6, x: '-50%' }}
                                                transition={isAndroid || isMobile ? { type: 'spring', bounce: 0, duration: 0.3 } : { type: 'spring', bounce: 0, duration: 0.25 }}
                                            >
                                                {/* Mobile Drag handle pill */}
                                                {(isAndroid || isMobile) && (
                                                    <div className="w-12 h-1 rounded-full bg-white/20 mx-auto mt-3 mb-1 shrink-0" />
                                                )}

                                                {/* Header: Title, Count, Sort, Close */}
                                                <div className={`p-4 border-b flex flex-col gap-3 shrink-0 ${
                                                    isLight ? 'bg-[#F4ECD8] border-[#D9C9A3]' : 'bg-white/[0.02] border-white/10'
                                                }`}>
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2.5 min-w-0">
                                                            <div className={`p-1.5 rounded-xl shrink-0 ${isLight ? 'bg-[#A0522D]/15 text-[#A0522D]' : 'bg-white/10 text-white'}`}>
                                                                <BookOpen className="w-4 h-4" />
                                                            </div>
                                                            <span className={`font-semibold text-sm tracking-tight truncate ${isLight ? 'text-[#2C1E0F]' : 'text-white'}`}>
                                                                {sourceType === 'online' ? 'Chapters' : 'Series Volumes'}
                                                            </span>
                                                            <span className={`px-2 py-0.5 text-[11px] font-mono font-medium rounded-full border shrink-0 ${
                                                                isLight 
                                                                    ? 'bg-[#E5D7BC] text-[#5C4430] border-[#D9C9A3]' 
                                                                    : 'bg-white/10 text-white/80 border-white/10'
                                                            }`}>
                                                                {sourceType === 'online' ? (onlineSource?.chapters.length || 0) : seriesBooks.length}
                                                            </span>
                                                        </div>

                                                        <div className="flex items-center gap-2 shrink-0">
                                                            <AppTooltip content={`Sort chapters (${sortDirection === 'asc' ? 'Ascending' : 'Descending'})`} side="bottom">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
                                                                    aria-label={`Sort chapters (${sortDirection === 'asc' ? 'Ascending' : 'Descending'})`}
                                                                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl transition-all border cursor-pointer active:scale-95 ${
                                                                        isLight 
                                                                            ? 'text-[#5C4430] hover:text-[#2C1E0F] bg-[#EAE0CB] hover:bg-[#E5D7BC] border-[#D9C9A3]' 
                                                                            : 'text-white/80 hover:text-white bg-white/10 hover:bg-white/15 border-white/10'
                                                                    }`}
                                                                >
                                                                    <ArrowUpDown className={`w-3.5 h-3.5 ${isLight ? 'text-[#A0522D]' : 'text-white/80'}`} />
                                                                    <span>{sortDirection === 'asc' ? '1 → End' : 'End → 1'}</span>
                                                                </button>
                                                            </AppTooltip>
                                                            <button
                                                                type="button"
                                                                onClick={() => setDropdownOpen(false)}
                                                                className={`p-1.5 rounded-xl transition-colors cursor-pointer ${
                                                                    isLight ? 'text-[#5C4430] hover:bg-[#EAE0CB]' : 'text-white/70 hover:text-white hover:bg-white/10'
                                                                }`}
                                                            >
                                                                <X className="w-5 h-5" />
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Search Input Filter */}
                                                    {((sourceType === 'online' && (onlineSource?.chapters.length || 0) > 4) || seriesBooks.length > 4) && (
                                                        <div className={`relative flex items-center border rounded-2xl px-3 py-2 transition-all ${
                                                            isLight 
                                                                ? 'bg-[#EAE0CB] focus-within:bg-[#FAF6EC] border-[#D9C9A3] focus-within:border-[#A0522D]' 
                                                                : 'bg-white/[0.05] focus-within:bg-white/[0.09] border-white/10 focus-within:border-white/25'
                                                        }`}>
                                                            <Search className={`w-4 h-4 shrink-0 mr-2.5 ${isLight ? 'text-[#8A6A50]' : 'text-white/40'}`} />
                                                            <input
                                                                ref={searchInputRef}
                                                                type="text"
                                                                placeholder={sourceType === 'online' ? "Search chapter number or title..." : "Search volume..."}
                                                                value={chapterSearch}
                                                                onChange={(e) => setChapterSearch(e.target.value)}
                                                                className={`w-full bg-transparent text-sm focus:outline-none ${
                                                                    isLight 
                                                                        ? 'text-[#2C1E0F] placeholder:text-[#8A6A50]/70' 
                                                                        : 'text-white placeholder:text-white/40'
                                                                }`}
                                                            />
                                                            {chapterSearch && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setChapterSearch('')}
                                                                    className={`p-1 rounded-md transition-colors ${
                                                                        isLight ? 'text-[#8A6A50] hover:text-[#2C1E0F]' : 'text-white/40 hover:text-white'
                                                                    }`}
                                                                >
                                                                    <X className="w-4 h-4" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Chapters / Volumes List */}
                                                <div className={`flex-1 overflow-y-auto overscroll-contain custom-scrollbar p-2.5 space-y-1.5 ${
                                                    isAndroid || isMobile ? 'max-h-[60vh]' : 'max-h-[380px]'
                                                } ${
                                                    isLight ? '!bg-[#FAF6EC]' : '!bg-transparent'
                                                }`}>
                                                    {sourceType === 'online' ? (
                                                        processedChapters.length === 0 ? (
                                                            <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                                                                <Search className={`w-8 h-8 mb-2 ${isLight ? 'text-[#8A6A50]/40' : 'text-white/20'}`} />
                                                                <p className={`text-sm font-medium ${isLight ? 'text-[#2C1E0F]/70' : 'text-white/70'}`}>No chapters found</p>
                                                                {chapterSearch && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setChapterSearch('')}
                                                                        className={`mt-3 px-3.5 py-1.5 text-xs font-semibold rounded-xl transition-colors border cursor-pointer ${
                                                                            isLight 
                                                                                ? 'text-[#A0522D] bg-[#A0522D]/10 hover:bg-[#A0522D]/20 border-[#A0522D]/30' 
                                                                                : 'text-white bg-white/10 hover:bg-white/15 border-white/10'
                                                                        }`}
                                                                    >
                                                                        Clear Search
                                                                    </button>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            processedChapters.map(c => {
                                                                const isSelected = onlineSource?.chapterId === c.id;
                                                                const isSwitching = switchingChapterId === c.id;

                                                                return (
                                                                    <div
                                                                        key={c.id}
                                                                        ref={isSelected ? activeItemRef : undefined}
                                                                        onClick={() => {
                                                                            if (isSelected || isSwitching) return;
                                                                            setSwitchingChapterId(c.id);
                                                                            setLoading(true);
                                                                            if (onChapterChange) {
                                                                                onChapterChange(c.id).then(data => {
                                                                                    setOnlineChapter(c.id, data.chapterTitle, data.pageUrls);
                                                                                    setLoading(false);
                                                                                    setSwitchingChapterId(null);
                                                                                    setDropdownOpen(false);
                                                                                }).catch(err => {
                                                                                    setError(err instanceof Error ? String(err) : 'Failed');
                                                                                    setLoading(false);
                                                                                    setSwitchingChapterId(null);
                                                                                });
                                                                            }
                                                                        }}
                                                                        className={`group relative flex items-center justify-between p-2.5 rounded-2xl cursor-pointer transition-all active:scale-[0.99] ${
                                                                            isSelected 
                                                                                ? isLight 
                                                                                    ? 'bg-[#E5D7BC] text-[#733516] border border-[#A0522D]/40 font-semibold shadow-xs' 
                                                                                    : 'bg-white/[0.12] text-white border border-white/25 font-semibold shadow-sm ring-1 ring-white/15'
                                                                                : isLight 
                                                                                    ? 'text-[#2C1E0F] hover:bg-[#F4ECD8] active:bg-[#EAE0CB] border border-transparent' 
                                                                                    : 'text-white/85 hover:bg-white/[0.06] active:bg-white/[0.1] border border-transparent hover:border-white/5'
                                                                        }`}
                                                                    >
                                                                        <div className="flex items-center gap-3 min-w-0 flex-1">
                                                                            {c.volume != null && c.number != null ? (
                                                                                <span className={`px-2.5 py-1 text-xs font-mono font-bold rounded-xl shrink-0 transition-colors ${
                                                                                    isSelected 
                                                                                        ? isLight 
                                                                                            ? '!bg-[#A0522D] !text-white shadow-xs' 
                                                                                            : '!bg-white !text-black shadow-sm' 
                                                                                        : isLight 
                                                                                            ? '!bg-[#E5D7BC] !text-[#5C4430] border border-[#D9C9A3]/60' 
                                                                                            : '!bg-white/10 !text-white/80 border border-white/5'
                                                                                }`}>
                                                                                    Vol. {c.volume} Ch. {c.number}
                                                                                </span>
                                                                            ) : c.number != null ? (
                                                                                <span className={`px-2.5 py-1 text-xs font-mono font-bold rounded-xl shrink-0 transition-colors ${
                                                                                    isSelected 
                                                                                        ? isLight 
                                                                                            ? '!bg-[#A0522D] !text-white shadow-xs' 
                                                                                            : '!bg-white !text-black shadow-sm' 
                                                                                        : isLight 
                                                                                            ? '!bg-[#E5D7BC] !text-[#5C4430] border border-[#D9C9A3]/60' 
                                                                                            : '!bg-white/10 !text-white/80 border border-white/5'
                                                                                }`}>
                                                                                    Ch. {c.number}
                                                                                </span>
                                                                            ) : (
                                                                                <span className={`px-2.5 py-1 text-xs font-mono font-bold rounded-xl shrink-0 border ${
                                                                                    isLight 
                                                                                        ? '!bg-[#E5D7BC] !text-[#5C4430] border border-[#D9C9A3]/60' 
                                                                                        : '!bg-white/10 !text-white/80 border border-white/5'
                                                                                }`}>
                                                                                    Ch
                                                                                </span>
                                                                            )}
                                                                            
                                                                            <span className={`truncate text-sm ${
                                                                                isSelected 
                                                                                    ? (isLight ? 'text-[#733516] font-semibold' : 'text-white font-semibold') 
                                                                                    : (isLight ? 'text-[#2C1E0F] font-medium' : 'text-white/90 font-medium')
                                                                            }`}>
                                                                                {formatChapterTitle({
                                                                                    volume: c.volume != null ? String(c.volume) : undefined,
                                                                                    chapter: c.number != null ? String(c.number) : undefined,
                                                                                    title: c.title,
                                                                                })}
                                                                            </span>
                                                                        </div>

                                                                        <div className="flex items-center gap-1.5 shrink-0 ml-3">
                                                                            {isSwitching ? (
                                                                                <Loader2 className={`w-4 h-4 animate-spin ${isLight ? 'text-[#A0522D]' : 'text-white'}`} />
                                                                            ) : isSelected ? (
                                                                                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                                                                                    isLight 
                                                                                        ? 'bg-[#A0522D] text-white' 
                                                                                        : 'bg-white text-black'
                                                                                }`}>
                                                                                    <Check className="w-3 h-3 stroke-[3]" />
                                                                                </div>
                                                                            ) : (
                                                                                <ChevronRight className={`w-4 h-4 transition-all group-hover:translate-x-0.5 ${
                                                                                    isLight ? 'text-[#8A6A50]/60 group-hover:text-[#2C1E0F]' : 'text-white/30 group-hover:text-white/70'
                                                                                }`} />
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })
                                                        )
                                                    ) : (
                                                        processedLocalBooks.length === 0 ? (
                                                            <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                                                                <Search className={`w-8 h-8 mb-2 ${isLight ? 'text-[#8A6A50]/40' : 'text-white/20'}`} />
                                                                <p className={`text-sm font-medium ${isLight ? 'text-[#2C1E0F]/70' : 'text-white/70'}`}>No volumes found</p>
                                                            </div>
                                                        ) : (
                                                            processedLocalBooks.map((b, idx) => {
                                                                const isSelected = currentLocalBook?.id === b.id;
                                                                return (
                                                                    <div
                                                                        key={b.id}
                                                                        ref={isSelected ? activeItemRef : undefined}
                                                                        onClick={() => {
                                                                            if (isSelected) return;
                                                                            setDropdownOpen(false);
                                                                            window.dispatchEvent(new CustomEvent('open-book', { detail: { bookId: b.id } }));
                                                                        }}
                                                                        className={`group relative flex items-center justify-between p-2.5 rounded-2xl cursor-pointer transition-all active:scale-[0.99] ${
                                                                            isSelected 
                                                                                ? isLight 
                                                                                    ? 'bg-[#E5D7BC] text-[#733516] border border-[#A0522D]/40 font-semibold shadow-xs' 
                                                                                    : 'bg-white/[0.12] text-white border border-white/25 font-semibold shadow-sm ring-1 ring-white/15'
                                                                                : isLight 
                                                                                    ? 'text-[#2C1E0F] hover:bg-[#F4ECD8] active:bg-[#EAE0CB] border border-transparent' 
                                                                                    : 'text-white/85 hover:bg-white/[0.06] active:bg-white/[0.1] border border-transparent hover:border-white/5'
                                                                        }`}
                                                                    >
                                                                        <div className="flex items-center gap-3 min-w-0 flex-1">
                                                                            <span className={`px-2.5 py-1 text-xs font-mono font-bold rounded-xl shrink-0 transition-colors ${
                                                                                isSelected 
                                                                                    ? isLight 
                                                                                        ? '!bg-[#A0522D] !text-white shadow-xs' 
                                                                                        : '!bg-white !text-black shadow-sm' 
                                                                                    : isLight 
                                                                                        ? '!bg-[#E5D7BC] !text-[#5C4430] border border-[#D9C9A3]/60' 
                                                                                        : '!bg-white/10 !text-white/80 border border-white/5'
                                                                            }`}>
                                                                                Vol. {b.series_index ?? parseVolumeOrChapterNumber(b) ?? (idx + 1)}
                                                                            </span>
                                                                            <span className={`truncate text-sm ${
                                                                                isSelected 
                                                                                    ? (isLight ? 'text-[#733516] font-semibold' : 'text-white font-semibold') 
                                                                                    : (isLight ? 'text-[#2C1E0F] font-medium' : 'text-white/90 font-medium')
                                                                            }`}>{b.title}</span>
                                                                        </div>

                                                                        <div className="flex items-center gap-1.5 shrink-0 ml-3">
                                                                            {isSelected ? (
                                                                                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                                                                                    isLight 
                                                                                        ? 'bg-[#A0522D] text-white' 
                                                                                        : 'bg-white text-black'
                                                                                }`}>
                                                                                    <Check className="w-3 h-3 stroke-[3]" />
                                                                                </div>
                                                                            ) : (
                                                                                <ChevronRight className={`w-4 h-4 transition-all group-hover:translate-x-0.5 ${
                                                                                    isLight ? 'text-[#8A6A50]/60 group-hover:text-[#2C1E0F]' : 'text-white/30 group-hover:text-white/70'
                                                                                }`} />
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })
                                                        )
                                                    )}
                                                </div>
                                            </motion.div>
                                            </>
                                        )}
                                    </AnimatePresence>,
                                    document.body
                                )}
                    {/* ── DESKTOP TOOLBAR (md:flex) ── */}
                    <div className="hidden md:flex items-center gap-1">
                        {(sourceType === 'online' || seriesBooks.length > 1) && (
                            <AppTooltip content={sourceType === 'online' ? "Chapters List" : "Volumes List"} side="bottom">
                                <button
                                    type="button"
                                    onClick={() => setDropdownOpen(true)}
                                    aria-label={sourceType === 'online' ? "Chapters List" : "Volumes List"}
                                    className={`manga-topbar-btn cursor-pointer transition-all ${
                                        dropdownOpen
                                            ? isLight
                                                ? 'manga-topbar-btn--active !bg-[#A0522D]/15 !text-[#A0522D] ring-1 ring-[#A0522D]/30'
                                                : 'manga-topbar-btn--active !bg-white/15 !text-white ring-1 ring-white/20'
                                            : ''
                                    }`}
                                >
                                    <BookOpen size={17} />
                                </button>
                            </AppTooltip>
                        )}

                        {sourceType === 'local' && seriesBooks.length > 1 && (
                            <>
                                <AppTooltip content="Previous Volume" side="bottom">
                                    <button
                                        type="button"
                                        className="manga-topbar-btn"
                                        onClick={() => {
                                            if (prevLocalBook) {
                                                window.dispatchEvent(new CustomEvent('open-book', { detail: { bookId: prevLocalBook.id } }));
                                            }
                                        }}
                                        disabled={!hasPrevLocalVolume}
                                        aria-label="Previous Volume"
                                    >
                                        <ChevronLeft size={17} />
                                    </button>
                                </AppTooltip>
                                <AppTooltip content="Next Volume" side="bottom">
                                    <button
                                        type="button"
                                        className="manga-topbar-btn"
                                        onClick={() => {
                                            if (nextLocalBook) {
                                                window.dispatchEvent(new CustomEvent('open-book', { detail: { bookId: nextLocalBook.id } }));
                                            }
                                        }}
                                        disabled={!hasNextLocalVolume}
                                        aria-label="Next Volume"
                                    >
                                        <ChevronRight size={17} />
                                    </button>
                                </AppTooltip>
                            </>
                        )}

                        {sourceType === 'online' && (
                            <>
                                <AppTooltip content="Previous Chapter" side="bottom">
                                    <button
                                        type="button"
                                        className="manga-topbar-btn"
                                        onClick={() => handleChapterNav('prev')}
                                        disabled={!hasPrevChapter}
                                        aria-label="Previous Chapter"
                                    >
                                        <ChevronLeft size={17} />
                                    </button>
                                </AppTooltip>
                                <AppTooltip content="Next Chapter" side="bottom">
                                    <button
                                        type="button"
                                        className="manga-topbar-btn"
                                        onClick={() => handleChapterNav('next')}
                                        disabled={!hasNextChapter}
                                        aria-label="Next Chapter"
                                    >
                                        <ChevronRight size={17} />
                                    </button>
                                </AppTooltip>
                                <AppTooltip content={isAlreadyInLibrary ? "In Library" : "Add to Library"} side="bottom">
                                    <button
                                        type="button"
                                        className={`manga-topbar-btn ${isAlreadyInLibrary ? '!text-amber-500 hover:!text-amber-400' : ''}`}
                                        onClick={addToLibrary}
                                        disabled={isAlreadyInLibrary}
                                        aria-label={isAlreadyInLibrary ? "In Library" : "Add to Library"}
                                    >
                                        {isAlreadyInLibrary ? <BookmarkCheck size={17} /> : <BookmarkPlus size={17} />}
                                    </button>
                                </AppTooltip>
                            </>
                        )}

                        <AppTooltip content="Reader Settings (S)" side="bottom">
                            <button
                                type="button"
                                className={`manga-topbar-btn ${isSidebarOpen ? 'manga-topbar-btn--active' : ''}`}
                                onClick={toggleSidebar}
                                aria-label="Reader Settings (S)"
                            >
                                <Settings size={17} />
                            </button>
                        </AppTooltip>

                        {!isAndroid && (
                            <AppTooltip content={isFullscreen ? "Exit Fullscreen (F)" : "Fullscreen (F)"} side="bottom">
                                <button
                                    type="button"
                                    className="manga-topbar-btn"
                                    onClick={toggleFullscreen}
                                    aria-label={isFullscreen ? "Exit Fullscreen (F)" : "Fullscreen (F)"}
                                >
                                    {isFullscreen ? <Minimize size={17} /> : <Maximize size={17} />}
                                </button>
                            </AppTooltip>
                        )}
                    </div>

                    {/* ── ANDROID / MOBILE TOOLBAR: Exactly 3 Primary Options + 3-dots Menu ── */}
                    <div className="flex md:hidden items-center gap-1.5 sm:gap-2">
                        {/* Option 1: Chapters drawer */}
                        {(sourceType === 'online' || seriesBooks.length > 1) && (
                            <button
                                type="button"
                                onClick={() => setDropdownOpen(true)}
                                aria-label={sourceType === 'online' ? "Chapters List" : "Volumes List"}
                                className={`manga-topbar-btn cursor-pointer ${
                                    dropdownOpen ? 'manga-topbar-btn--active' : ''
                                }`}
                            >
                                <BookOpen size={isAndroid ? 19 : 17} />
                            </button>
                        )}

                        {/* Option 2: Add to Library (online) OR Next Volume (local) */}
                        {sourceType === 'online' ? (
                            <button
                                type="button"
                                className={`manga-topbar-btn ${isAlreadyInLibrary ? '!text-amber-500' : ''}`}
                                onClick={addToLibrary}
                                disabled={isAlreadyInLibrary}
                                aria-label={isAlreadyInLibrary ? "In Library" : "Add to Library"}
                            >
                                {isAlreadyInLibrary ? <BookmarkCheck size={isAndroid ? 19 : 17} /> : <BookmarkPlus size={isAndroid ? 19 : 17} />}
                            </button>
                        ) : hasNextLocalVolume ? (
                            <button
                                type="button"
                                className="manga-topbar-btn"
                                onClick={() => {
                                    if (nextLocalBook) {
                                        window.dispatchEvent(new CustomEvent('open-book', { detail: { bookId: nextLocalBook.id } }));
                                    }
                                }}
                                aria-label="Next Volume"
                            >
                                <ChevronRight size={isAndroid ? 19 : 17} />
                            </button>
                        ) : null}

                        {/* Option 3: Reader Settings */}
                        <button
                            type="button"
                            className={`manga-topbar-btn ${isSidebarOpen ? 'manga-topbar-btn--active' : ''}`}
                            onClick={toggleSidebar}
                            aria-label="Reader Settings"
                        >
                            <Settings size={isAndroid ? 19 : 17} />
                        </button>

                        {/* 4th button: More Options (3 dots) */}
                        <div className="relative flex items-center">
                            <button
                                type="button"
                                className={`manga-topbar-btn ${isMoreMenuOpen ? 'manga-topbar-btn--active' : ''}`}
                                onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)}
                                aria-label="More options"
                            >
                                <MoreVertical size={isAndroid ? 19 : 17} />
                            </button>

                            <AnimatePresence>
                                {isMoreMenuOpen && (
                                    <>
                                        <motion.div
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            transition={{ duration: 0.15 }}
                                            className="fixed inset-0 z-[95]"
                                            onClick={() => setIsMoreMenuOpen(false)}
                                        />
                                        <motion.div
                                            initial={{ opacity: 0, y: 8, scale: 0.96 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: 8, scale: 0.96 }}
                                            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                                            className="manga-dropdown-menu"
                                        >
                                            <div className="flex flex-col gap-0.5">
                                                {/* Next Chapter */}
                                                {sourceType === 'online' && (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setIsMoreMenuOpen(false);
                                                            handleChapterNav('next');
                                                        }}
                                                        disabled={!hasNextChapter}
                                                        className="manga-menu-item"
                                                    >
                                                        <ChevronRight />
                                                        <span className="truncate">
                                                            {nextChapter ? `Next: ${nextChapter.title || `Ch. ${nextChapter.number}`}` : 'Next Chapter'}
                                                        </span>
                                                    </button>
                                                )}

                                                {/* Previous Chapter */}
                                                {sourceType === 'online' && (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setIsMoreMenuOpen(false);
                                                            handleChapterNav('prev');
                                                        }}
                                                        disabled={!hasPrevChapter}
                                                        className="manga-menu-item"
                                                    >
                                                        <ChevronLeft />
                                                        <span className="truncate">
                                                            {prevChapter ? `Prev: ${prevChapter.title || `Ch. ${prevChapter.number}`}` : 'Previous Chapter'}
                                                        </span>
                                                    </button>
                                                )}

                                                {/* Local prev volume */}
                                                {sourceType === 'local' && hasPrevLocalVolume && (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setIsMoreMenuOpen(false);
                                                            if (prevLocalBook) {
                                                                window.dispatchEvent(new CustomEvent('open-book', { detail: { bookId: prevLocalBook.id } }));
                                                            }
                                                        }}
                                                        className="manga-menu-item"
                                                    >
                                                        <ChevronLeft />
                                                        <span className="truncate">Previous Volume</span>
                                                    </button>
                                                )}

                                                {/* Add / in library */}
                                                {sourceType === 'online' && (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            if (!isAlreadyInLibrary) {
                                                                addToLibrary();
                                                            }
                                                            setIsMoreMenuOpen(false);
                                                        }}
                                                        className="manga-menu-item"
                                                        disabled={isAlreadyInLibrary}
                                                    >
                                                        {isAlreadyInLibrary ? (
                                                            <>
                                                                <BookmarkCheck className="text-amber-500" />
                                                                <span>Already in Library</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <BookmarkPlus />
                                                                <span>Add to Library</span>
                                                            </>
                                                        )}
                                                    </button>
                                                )}

                                                {/* Reading mode / Settings shortcut */}
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setIsMoreMenuOpen(false);
                                                        toggleSidebar();
                                                    }}
                                                    className="manga-menu-item"
                                                >
                                                    <Settings />
                                                    <span>Reader Settings</span>
                                                </button>
                                            </div>
                                        </motion.div>
                                    </>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </div>

            </div>
        </header>
    );
}
