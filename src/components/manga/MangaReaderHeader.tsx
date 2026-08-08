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
    BookOpen 
} from 'lucide-react';
import React from 'react';
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { useOnlineMangaReaderStore } from '@/store/onlineMangaReaderStore';
import { useLibraryStore } from '@/store/libraryStore';
const TOPBAR_AUTO_HIDE_MS = 3000;

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
            .sort((a, b) => (a.series_index || 0) - (b.series_index || 0));
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
        if (isSidebarOpen || isSettingsOpen || dropdownOpen) {
            setTopBarVisible(true);
        }
        return () => {
            if (hideTimeoutRef.current) {
                clearTimeout(hideTimeoutRef.current);
                hideTimeoutRef.current = null;
            }
        };
    }, [isSidebarOpen, isSettingsOpen, dropdownOpen, setTopBarVisible]);

    // In scrolling modes, keep top bar visible while user scrolls,
    // then hide it after a longer quiet period for less distraction.
    useEffect(() => {
        if (hideTimeoutRef.current) {
            clearTimeout(hideTimeoutRef.current);
            hideTimeoutRef.current = null;
        }
        if (stickyHeader || isSidebarOpen || isSettingsOpen || dropdownOpen) {
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
    }, [isScrollMode, stickyHeader, isSidebarOpen, isSettingsOpen, dropdownOpen, lastScrollActivityAt, setTopBarVisible, isTopBarVisible]);

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
            list = list.filter(b => 
                b.title.toLowerCase().includes(q) || 
                (b.series_index != null && String(b.series_index).includes(q))
            );
        }

        list.sort((a, b) => {
            const idxA = a.series_index ?? 0;
            const idxB = b.series_index ?? 0;
            return sortDirection === 'asc' ? idxA - idxB : idxB - idxA;
        });

        return list;
    }, [seriesBooks, chapterSearch, sortDirection]);

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
                    {(sourceType === 'online' || seriesBooks.length > 1) && (
                        <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
                            <DropdownMenuTrigger asChild>
                                <button 
                                    type="button" 
                                    className={`manga-topbar-btn cursor-pointer transition-all ${
                                        dropdownOpen 
                                            ? isLight 
                                                ? 'manga-topbar-btn--active bg-[#A0522D]/15 text-[#A0522D] ring-1 ring-[#A0522D]/30' 
                                                : 'manga-topbar-btn--active bg-white/10 text-white ring-1 ring-white/20' 
                                            : ''
                                    }`} 
                                    title={sourceType === 'online' ? "Choose Chapter" : "Choose Volume"}
                                >
                                    <List size={18} />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent 
                                align="center" 
                                side="bottom"
                                sideOffset={14}
                                className={`w-80 sm:w-96 max-h-[460px] flex flex-col p-0 rounded-2xl backdrop-blur-2xl z-[150] overflow-hidden select-none animate-in fade-in-0 zoom-in-95 duration-150 ${
                                    isLight
                                        ? 'bg-[#FAF6EC]/98 text-[#2C1E0F] border border-[#D9C9A3] shadow-2xl shadow-[#5C4430]/25 ring-1 ring-[#8A6A50]/15'
                                        : 'bg-[#0f0f14]/95 text-white border border-white/10 shadow-2xl shadow-black/90 ring-1 ring-white/5'
                                }`}
                            >
                                {/* Dropdown Header: Title, Count, Sort Toggle */}
                                <div className={`p-3 border-b flex flex-col gap-2.5 shrink-0 ${
                                    isLight 
                                        ? 'bg-[#F0E6CE]/80 border-[#D9C9A3]' 
                                        : 'bg-white/[0.04] border-white/10'
                                }`}>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <BookOpen className={`w-4 h-4 ${isLight ? 'text-[#A0522D]' : 'text-amber-400'}`} />
                                            <span className={`font-semibold text-xs tracking-wide ${isLight ? 'text-[#2C1E0F]' : 'text-white'}`}>
                                                {sourceType === 'online' ? 'Chapters' : 'Series Volumes'}
                                            </span>
                                            <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full border ${
                                                isLight 
                                                    ? 'bg-[#E5D7BC] text-[#5C4430] border-[#D9C9A3]' 
                                                    : 'bg-white/10 text-white/70 border-white/5'
                                            }`}>
                                                {sourceType === 'online' ? (onlineSource?.chapters.length || 0) : seriesBooks.length}
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                                            }}
                                            className={`flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-lg transition-colors border ${
                                                isLight 
                                                    ? 'text-[#5C4430] hover:text-[#2C1E0F] hover:bg-[#E5D7BC] border-transparent hover:border-[#D9C9A3]' 
                                                    : 'text-white/70 hover:text-white hover:bg-white/10 border-transparent hover:border-white/10'
                                            }`}
                                            title={`Sort chapters (${sortDirection === 'asc' ? 'Ascending' : 'Descending'})`}
                                        >
                                            <ArrowUpDown className={`w-3 h-3 ${isLight ? 'text-[#A0522D]' : 'text-amber-400'}`} />
                                            <span>{sortDirection === 'asc' ? '1 → End' : 'End → 1'}</span>
                                        </button>
                                    </div>

                                    {/* Search Input Filter */}
                                    {((sourceType === 'online' && (onlineSource?.chapters.length || 0) > 4) || seriesBooks.length > 4) && (
                                        <div className={`relative flex items-center border rounded-xl px-2.5 py-1.5 transition-all ${
                                            isLight 
                                                ? 'bg-[#EFE6D2] hover:bg-[#EAE0CB] focus-within:bg-[#FAF6EC] border-[#D9C9A3] focus-within:border-[#A0522D]' 
                                                : 'bg-white/[0.06] hover:bg-white/[0.08] focus-within:bg-white/[0.09] border-white/10 focus-within:border-amber-400/50'
                                        }`}>
                                            <Search className={`w-3.5 h-3.5 shrink-0 mr-2 ${isLight ? 'text-[#8A6A50]' : 'text-white/40'}`} />
                                            <input
                                                ref={searchInputRef}
                                                type="text"
                                                placeholder={sourceType === 'online' ? "Search chapter number or title..." : "Search volume..."}
                                                value={chapterSearch}
                                                onChange={(e) => setChapterSearch(e.target.value)}
                                                onKeyDown={(e) => e.stopPropagation()}
                                                className={`w-full bg-transparent text-xs focus:outline-none ${
                                                    isLight 
                                                        ? 'text-[#2C1E0F] placeholder:text-[#8A6A50]/70' 
                                                        : 'text-white placeholder:text-white/40'
                                                }`}
                                            />
                                            {chapterSearch && (
                                                <button
                                                    type="button"
                                                    onClick={() => setChapterSearch('')}
                                                    className={`p-0.5 rounded-md transition-colors ${
                                                        isLight ? 'text-[#8A6A50] hover:text-[#2C1E0F]' : 'text-white/40 hover:text-white'
                                                    }`}
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Chapters / Volumes List */}
                                <div className="flex-1 overflow-y-auto custom-scrollbar p-1.5 space-y-1 max-h-[340px]">
                                    {sourceType === 'online' ? (
                                        processedChapters.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                                                <Search className={`w-6 h-6 mb-2 ${isLight ? 'text-[#8A6A50]/40' : 'text-white/20'}`} />
                                                <p className={`text-xs font-medium ${isLight ? 'text-[#2C1E0F]/70' : 'text-white/70'}`}>No chapters found</p>
                                                {chapterSearch && (
                                                    <p className={`text-[11px] mt-0.5 ${isLight ? 'text-[#8A6A50]' : 'text-white/40'}`}>
                                                        Matching &ldquo;{chapterSearch}&rdquo;
                                                    </p>
                                                )}
                                                {chapterSearch && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setChapterSearch('')}
                                                        className={`mt-3 px-3 py-1 text-xs font-medium rounded-lg transition-colors border ${
                                                            isLight 
                                                                ? 'text-[#A0522D] bg-[#A0522D]/10 hover:bg-[#A0522D]/20 border-[#A0522D]/30' 
                                                                : 'text-amber-400 bg-amber-400/10 hover:bg-amber-400/20 border-amber-400/20'
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
                                                    <DropdownMenuItem
                                                        key={c.id}
                                                        asChild
                                                    >
                                                        <div
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
                                                            className={`group relative flex items-center justify-between px-3 py-2 text-xs font-medium rounded-xl cursor-pointer transition-all outline-none ${
                                                                isSelected 
                                                                    ? isLight 
                                                                        ? 'bg-[#A0522D]/15 text-[#733516] border border-[#A0522D]/35 font-semibold shadow-xs' 
                                                                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold shadow-inner'
                                                                    : isLight 
                                                                        ? 'text-[#2C1E0F]/85 hover:text-[#2C1E0F] hover:bg-[#EFE6D2] border border-transparent' 
                                                                        : 'text-white/80 hover:text-white hover:bg-white/[0.08] border border-transparent'
                                                            }`}
                                                        >
                                                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                                                {c.number != null ? (
                                                                    <span className={`px-2 py-0.5 text-[11px] font-mono font-bold rounded-lg shrink-0 transition-colors ${
                                                                        isSelected 
                                                                            ? isLight 
                                                                                ? 'bg-[#A0522D] text-white shadow-xs' 
                                                                                : 'bg-amber-400 text-black shadow-sm' 
                                                                            : isLight 
                                                                                ? 'bg-[#E5D7BC] text-[#5C4430] group-hover:bg-[#D9C9A3] group-hover:text-[#2C1E0F] border border-[#D9C9A3]/60' 
                                                                                : 'bg-white/10 text-white/90 group-hover:bg-white/20 group-hover:text-white border border-white/5'
                                                                    }`}>
                                                                        Ch. {c.number}
                                                                    </span>
                                                                ) : (
                                                                    <span className={`px-2 py-0.5 text-[11px] font-mono font-bold rounded-lg shrink-0 border ${
                                                                        isLight 
                                                                            ? 'bg-[#E5D7BC] text-[#5C4430] border-[#D9C9A3]/60' 
                                                                            : 'bg-white/10 text-white/90 border-white/5'
                                                                    }`}>
                                                                        Ch
                                                                    </span>
                                                                )}
                                                                
                                                                <span className={`truncate text-xs ${
                                                                    isSelected 
                                                                        ? (isLight ? 'text-[#733516] font-semibold' : 'text-amber-300 font-semibold') 
                                                                        : (isLight ? 'text-[#2C1E0F] font-medium' : 'text-white/90 font-medium')
                                                                }`}>
                                                                    {c.title ? (c.title.startsWith('Chapter ') && c.number != null ? c.title.replace(/^Chapter\s+\d+[\s:.-]*/i, '') || c.title : c.title) : `Chapter ${c.number ?? ''}`}
                                                                </span>
                                                            </div>

                                                            <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                                                {isSwitching ? (
                                                                    <Loader2 className={`w-3.5 h-3.5 animate-spin ${isLight ? 'text-[#A0522D]' : 'text-amber-400'}`} />
                                                                ) : isSelected ? (
                                                                    <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
                                                                        isLight 
                                                                            ? 'bg-[#A0522D]/20 border border-[#A0522D]/40 text-[#A0522D]' 
                                                                            : 'bg-amber-400/20 border border-amber-400/40 text-amber-300'
                                                                    }`}>
                                                                        <Check className="w-3 h-3 stroke-[3]" />
                                                                    </div>
                                                                ) : (
                                                                    <ChevronRight className={`w-3.5 h-3.5 transition-all opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 ${
                                                                        isLight ? 'text-[#8A6A50]/40 group-hover:text-[#5C4430]' : 'text-white/20 group-hover:text-white/60'
                                                                    }`} />
                                                                )}
                                                            </div>
                                                        </div>
                                                    </DropdownMenuItem>
                                                );
                                            })
                                        )
                                    ) : (
                                        processedLocalBooks.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                                                <Search className={`w-6 h-6 mb-2 ${isLight ? 'text-[#8A6A50]/40' : 'text-white/20'}`} />
                                                <p className={`text-xs font-medium ${isLight ? 'text-[#2C1E0F]/70' : 'text-white/70'}`}>No volumes found</p>
                                                {chapterSearch && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setChapterSearch('')}
                                                        className={`mt-3 px-3 py-1 text-xs font-medium rounded-lg transition-colors border ${
                                                            isLight 
                                                                ? 'text-[#A0522D] bg-[#A0522D]/10 hover:bg-[#A0522D]/20 border-[#A0522D]/30' 
                                                                : 'text-amber-400 bg-amber-400/10 hover:bg-amber-400/20 border-amber-400/20'
                                                        }`}
                                                    >
                                                        Clear Search
                                                    </button>
                                                )}
                                            </div>
                                        ) : (
                                            processedLocalBooks.map((b, idx) => {
                                                const isSelected = currentLocalBook?.id === b.id;
                                                return (
                                                    <DropdownMenuItem
                                                        key={b.id}
                                                        asChild
                                                    >
                                                        <div
                                                            ref={isSelected ? activeItemRef : undefined}
                                                            onClick={() => {
                                                                if (isSelected) return;
                                                                setDropdownOpen(false);
                                                                window.dispatchEvent(new CustomEvent('open-book', { detail: { bookId: b.id } }));
                                                            }}
                                                            className={`group relative flex items-center justify-between px-3 py-2 text-xs font-medium rounded-xl cursor-pointer transition-all outline-none ${
                                                                isSelected 
                                                                    ? isLight 
                                                                        ? 'bg-[#A0522D]/15 text-[#733516] border border-[#A0522D]/35 font-semibold shadow-xs' 
                                                                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold shadow-inner'
                                                                    : isLight 
                                                                        ? 'text-[#2C1E0F]/85 hover:text-[#2C1E0F] hover:bg-[#EFE6D2] border border-transparent' 
                                                                        : 'text-white/80 hover:text-white hover:bg-white/[0.08] border border-transparent'
                                                            }`}
                                                        >
                                                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                                                <span className={`px-2 py-0.5 text-[11px] font-mono font-bold rounded-lg shrink-0 transition-colors ${
                                                                    isSelected 
                                                                        ? isLight 
                                                                            ? 'bg-[#A0522D] text-white shadow-xs' 
                                                                            : 'bg-amber-400 text-black shadow-sm' 
                                                                        : isLight 
                                                                            ? 'bg-[#E5D7BC] text-[#5C4430] group-hover:bg-[#D9C9A3] group-hover:text-[#2C1E0F] border border-[#D9C9A3]/60' 
                                                                            : 'bg-white/10 text-white/90 group-hover:bg-white/20 group-hover:text-white border border-white/5'
                                                                }`}>
                                                                    Vol. {b.series_index || idx + 1}
                                                                </span>
                                                                <span className={`truncate text-xs ${
                                                                    isSelected 
                                                                        ? (isLight ? 'text-[#733516] font-semibold' : 'text-amber-300 font-semibold') 
                                                                        : (isLight ? 'text-[#2C1E0F] font-medium' : 'text-white/90 font-medium')
                                                                }`}>{b.title}</span>
                                                            </div>
                                                            <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                                                {isSelected ? (
                                                                    <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
                                                                        isLight 
                                                                            ? 'bg-[#A0522D]/20 border border-[#A0522D]/40 text-[#A0522D]' 
                                                                            : 'bg-amber-400/20 border border-amber-400/40 text-amber-300'
                                                                    }`}>
                                                                        <Check className="w-3 h-3 stroke-[3]" />
                                                                    </div>
                                                                ) : (
                                                                    <ChevronRight className={`w-3.5 h-3.5 transition-all opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 ${
                                                                        isLight ? 'text-[#8A6A50]/40 group-hover:text-[#5C4430]' : 'text-white/20 group-hover:text-white/60'
                                                                    }`} />
                                                                )}
                                                            </div>
                                                        </div>
                                                    </DropdownMenuItem>
                                                );
                                            })
                                        )
                                    )}
                                </div>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}

                    {sourceType === 'local' && seriesBooks.length > 1 && (
                        <>
                            <button 
                                type="button"
                                className="manga-topbar-btn"
                                onClick={() => {
                                    const prevBook = seriesBooks[currentLocalIndex - 1];
                                    if (prevBook) {
                                        window.dispatchEvent(new CustomEvent('open-book', { detail: { bookId: prevBook.id } }));
                                    }
                                }}
                                disabled={!hasPrevLocalVolume}
                                style={{ opacity: hasPrevLocalVolume ? 1 : 0.4 }}
                                title="Previous Volume"
                            >
                                <ChevronLeft size={20} />
                            </button>
                            <button 
                                type="button"
                                className="manga-topbar-btn"
                                onClick={() => {
                                    const nextBook = seriesBooks[currentLocalIndex + 1];
                                    if (nextBook) {
                                        window.dispatchEvent(new CustomEvent('open-book', { detail: { bookId: nextBook.id } }));
                                    }
                                }}
                                disabled={!hasNextLocalVolume}
                                style={{ opacity: hasNextLocalVolume ? 1 : 0.4 }}
                                title="Next Volume"
                            >
                                <ChevronRight size={20} />
                            </button>
                            <div className="manga-topbar-divider" />
                        </>
                    )}

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
