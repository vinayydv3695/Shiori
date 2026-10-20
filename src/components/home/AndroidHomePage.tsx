import React, { useState, useRef, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  BookOpen,
  Heart,
  ChevronRight,
  Play,
  MoreVertical,
  Info,
  Pencil,
  FolderPlus,
  Trash2,
  Star,
  Calendar,
  BookmarkCheck,
  CheckCircle2,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { EditMetadataDialog } from '@/components/library/EditMetadataDialog';
import { ShelfSelectDialog } from '@/components/library/ShelfSelectDialog';
import { DeleteBookDialog } from '@/components/library/DeleteBookDialog';
import { useUIStore, type DomainView } from '@/store/uiStore';
import { useLibraryStore, EMPTY_FILTERS } from '@/store/libraryStore';
import { usePreferencesStore } from '@/store/preferencesStore';
import type { Book, ReadingProgress } from '@/lib/tauri';
import { convertFileSrc } from '@tauri-apps/api/core';
import { proxyExternalCover, cn } from '@/lib/utils';
import type { GroupedItem, SeriesGroup } from '@/hooks/useGroupedLibrary';
import { AndroidBookDeepDive } from './AndroidBookDeepDive';

function getCoverUrl(path: string | null | undefined): string {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return proxyExternalCover(path);
  }
  return convertFileSrc(path.replace(/\\/g, '/'));
}

function getItemAuthor(item: GroupedItem): string {
  if (item.type === 'series') {
    return Array.from(item.data.authors).join(', ') || item.data.books[0]?.authors?.map((a) => a.name).join(', ') || '';
  }
  return item.data.authors?.map((a) => a.name).join(', ') || '';
}

function extractBookFromItem(item: GroupedItem): Book {
  if (item.type === 'series') {
    return item.data.books.find((b) => b.reading_status !== 'completed') || item.data.books[0];
  }
  return item.data;
}

function getBookMeta(book: Book, progress?: ReadingProgress): string {
  if (progress && progress.progressPercent > 0) {
    return `${Math.round(progress.progressPercent)}% completed`;
  }
  if (book.pubdate) {
    const match = book.pubdate.match(/\b(18|19|20)\d{2}\b/);
    if (match) return match[0];
  }
  if (book.page_count && book.page_count > 0) {
    return `${book.page_count} pages`;
  }
  return book.file_format?.toUpperCase() || (book.domain === 'manga_comics' ? 'MANGA' : 'EPUB');
}

export interface AndroidHomePageProps {
  domain: DomainView;
  groupedContinueReading: GroupedItem[];
  groupedRecentlyAdded: GroupedItem[];
  groupedRecommended: GroupedItem[];
  groupedFavorites: GroupedItem[];
  groupedCompleted: GroupedItem[];
  libraryStats: { total_books: number; total_manga: number; total_size_bytes: number } | null;
  progressMap: Record<number, ReadingProgress>;
  libraryBooks: Book[];
  onOpenBook: (book: Book) => void;
  onViewSeries?: (series: SeriesGroup) => void;
  onViewRSS: () => void;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  onOpenAdvancedFilter?: () => void;
  onOpenSettings?: () => void;
  onFilterCollection: (type: 'favorites' | 'reading' | 'completed' | 'on_hold') => void;
  onViewLibrary: () => void;
}

export function AndroidHomePage({
  domain,
  groupedContinueReading,
  groupedRecentlyAdded,
  groupedRecommended,
  groupedFavorites,
  groupedCompleted,
  libraryStats,
  progressMap,
  libraryBooks,
  onOpenBook,
  onViewSeries,
  onViewRSS,
  searchQuery = '',
  onSearchChange = () => {},
  onOpenAdvancedFilter,
  onOpenSettings,
  onFilterCollection,
  onViewLibrary,
}: AndroidHomePageProps) {
  const setCurrentView = useUIStore((s) => s.setCurrentView);
  const currentDomain = useUIStore((s) => s.currentDomain);
  const setCurrentDomain = useUIStore((s) => s.setCurrentDomain);
  const preferences = usePreferencesStore((s) => s.preferences);
  const preferredContentType = preferences?.preferredContentType || 'both';
  const favoriteBookIds = useLibraryStore((s) => s.favoriteBookIds);

  // Deep dive selected book state
  const [selectedDeepDiveBook, setSelectedDeepDiveBook] = useState<Book | null>(null);

  // Action dialog states
  const [editingBookId, setEditingBookId] = useState<number | null>(null);
  const [shelfBookId, setShelfBookId] = useState<number | null>(null);
  const [deleteBookInfo, setDeleteBookInfo] = useState<{ id: number; title: string } | null>(null);

  // Search overlay toggle
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [localSearch, setLocalSearch] = useState(searchQuery || '');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchQuery !== undefined && searchQuery !== localSearch) {
      setLocalSearch(searchQuery);
    }
  }, [searchQuery]);

  useEffect(() => {
    if (isSearchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isSearchOpen]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = localSearch.trim();
    if (query) {
      onSearchChange?.(query);
      useLibraryStore.getState().setActiveFilters({
        ...EMPTY_FILTERS,
        textSearch: query,
      });
      void useLibraryStore.getState().loadInitialBooks();
      setCurrentView('library');
    }
  };

  // Trending Books for horizontal card row (Top Section)
  const trendingItems = useMemo(() => {
    const pool = [...groupedRecommended, ...groupedFavorites, ...groupedRecentlyAdded];
    if (pool.length === 0 && libraryBooks.length > 0) {
      return libraryBooks.slice(0, 10).map((b) => ({ type: 'book' as const, data: b }));
    }
    const seen = new Set<number>();
    const deduplicated: GroupedItem[] = [];
    for (const item of pool) {
      const book = extractBookFromItem(item);
      if (book.id && !seen.has(book.id)) {
        seen.add(book.id);
        deduplicated.push(item);
      }
    }
    return deduplicated.slice(0, 10);
  }, [groupedRecommended, groupedFavorites, groupedRecentlyAdded, libraryBooks]);

  // Recently Played for vertical list (Middle Section)
  const recentlyPlayedItems = useMemo(() => {
    const pool = [...groupedContinueReading, ...groupedRecentlyAdded, ...groupedFavorites];
    if (pool.length === 0 && libraryBooks.length > 0) {
      return libraryBooks.slice(0, 8).map((b) => ({ type: 'book' as const, data: b }));
    }
    const seen = new Set<number>();
    const deduplicated: GroupedItem[] = [];
    for (const item of pool) {
      const book = extractBookFromItem(item);
      if (book.id && !seen.has(book.id)) {
        seen.add(book.id);
        deduplicated.push(item);
      }
    }
    return deduplicated.slice(0, 6);
  }, [groupedContinueReading, groupedRecentlyAdded, groupedFavorites, libraryBooks]);

  // Active book for the floating quick-resume player bar
  const activeBookItem = groupedContinueReading[0] || recentlyPlayedItems[0] || null;
  const activeBook = activeBookItem ? extractBookFromItem(activeBookItem) : (libraryBooks[0] || null);

  const handleOpenDeepDive = (item: GroupedItem) => {
    const book = extractBookFromItem(item);
    setSelectedDeepDiveBook(book);
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-28 select-none">
      {/* ── DEEP DIVE MODAL / VIEW ── */}
      <AnimatePresence>
        {selectedDeepDiveBook && (
          <AndroidBookDeepDive
            book={selectedDeepDiveBook}
            progress={selectedDeepDiveBook.id ? progressMap[selectedDeepDiveBook.id] : undefined}
            onClose={() => setSelectedDeepDiveBook(null)}
            onRead={(b) => {
              setSelectedDeepDiveBook(null);
              onOpenBook(b);
            }}
            onListen={(b) => {
              setSelectedDeepDiveBook(null);
              onOpenBook(b);
            }}
          />
        )}
      </AnimatePresence>

      {/* ── 1. HEADER ROW: "Explore our Collection" with Domain Toggle & Search ── */}
      <header
        className="px-5 pt-3 pb-2 flex items-center justify-between"
        style={{ paddingTop: 'max(12px, env(safe-area-inset-top, 0px))' }}
      >
        <div className="flex flex-col">
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-foreground">
            Explore our Collection
          </h1>
          {/* Subtle Domain indicator / switcher if user reads both books and manga */}
          {preferredContentType === 'both' && (
            <div className="flex items-center gap-1.5 mt-1">
              <button
                type="button"
                onClick={() => setCurrentDomain('books')}
                className={cn(
                  'px-2.5 py-0.5 rounded-full text-[11px] font-bold transition-all cursor-pointer',
                  currentDomain === 'books'
                    ? 'bg-primary text-primary-foreground shadow-2xs'
                    : 'text-muted-foreground hover:text-foreground bg-secondary/50'
                )}
              >
                Books
              </button>
              <button
                type="button"
                onClick={() => setCurrentDomain('manga_comics')}
                className={cn(
                  'px-2.5 py-0.5 rounded-full text-[11px] font-bold transition-all cursor-pointer',
                  currentDomain === 'manga_comics'
                    ? 'bg-primary text-primary-foreground shadow-2xs'
                    : 'text-muted-foreground hover:text-foreground bg-secondary/50'
                )}
              >
                Manga
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* Search Toggle Button */}
          <button
            type="button"
            onClick={() => setIsSearchOpen(!isSearchOpen)}
            className="w-10 h-10 rounded-full flex items-center justify-center text-foreground/80 hover:text-foreground active:scale-95 transition-all cursor-pointer"
            aria-label="Search Collection"
          >
            <Search className="w-5 h-5 stroke-[2]" />
          </button>

          {/* Favorites Quick Shortcut with badge */}
          <button
            type="button"
            onClick={() => onFilterCollection('favorites')}
            className="relative w-10 h-10 rounded-full flex items-center justify-center text-foreground/80 hover:text-foreground active:scale-95 transition-all cursor-pointer"
            aria-label="Favorites"
          >
            <Heart className={cn('w-5 h-5 stroke-[2] transition-colors', favoriteBookIds.size > 0 && 'text-rose-500 fill-rose-500/20')} />
            <span className="absolute top-1.5 right-1.5 min-w-4 h-4 px-1 rounded-full bg-primary text-primary-foreground font-black text-[9px] flex items-center justify-center shadow-xs">
              {favoriteBookIds.size > 0 ? Math.min(favoriteBookIds.size, 99) : '0'}
            </span>
          </button>
        </div>
      </header>

      {/* Expandable Search Input */}
      <AnimatePresence>
        {isSearchOpen && (
          <motion.form
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            onSubmit={handleSearchSubmit}
            className="px-5 overflow-hidden mb-3"
          >
            <div className="relative flex items-center">
              <input
                ref={searchInputRef}
                type="text"
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                placeholder="Search titles, authors, genres..."
                className="w-full h-10 pl-4 pr-10 rounded-full bg-card border border-border/70 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 shadow-inner"
              />
              <button
                type="submit"
                className="absolute right-2.5 text-primary p-1 active:scale-90 cursor-pointer"
                aria-label="Submit search"
              >
                <Search className="w-4 h-4" />
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* ── 2. TRENDING BOOKS (HORIZONTAL CARD CAROUSEL ROW) ── */}
      <section className="mt-2">
        <div className="px-5 mb-2.5 flex items-center justify-between">
          <h2 className="text-xs sm:text-sm font-black tracking-wider uppercase text-foreground/80">
            Trending Books
          </h2>
          <button
            type="button"
            onClick={onViewLibrary}
            className="text-xs font-semibold text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
          >
            See All
          </button>
        </div>

        {trendingItems.length > 0 ? (
          <div className="flex items-center gap-3.5 px-5 overflow-x-auto no-scrollbar scrollbar-none [&::-webkit-scrollbar]:hidden pb-2 pt-1">
            {trendingItems.map((item) => {
              const book = extractBookFromItem(item);
              const coverUrl = getCoverUrl(book.cover_path);
              const progress = book.id ? progressMap[book.id] : undefined;
              return (
                <div
                  key={book.id || book.uuid}
                  onClick={() => handleOpenDeepDive(item)}
                  className="w-[142px] sm:w-[158px] aspect-[2/3] shrink-0 rounded-[20px] overflow-hidden relative shadow-lg shadow-black/15 border border-border/40 bg-card cursor-pointer group active:scale-[0.98] transition-transform"
                >
                  {coverUrl ? (
                    <img
                      src={coverUrl}
                      alt={book.title}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full p-4 flex flex-col justify-between bg-gradient-to-br from-card via-muted to-card">
                      <BookOpen className="w-8 h-8 text-primary/50" />
                      <span className="text-xs font-bold line-clamp-3">{book.title}</span>
                    </div>
                  )}

                  {/* Realistic book spine shadow on left edge */}
                  <div className="absolute inset-y-0 left-0 w-3 bg-gradient-to-r from-black/40 via-black/10 to-transparent pointer-events-none rounded-l-[20px]" />

                  {/* Top-left format badge */}
                  <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-[9px] font-black text-white uppercase tracking-wider border border-white/15 pointer-events-none shadow-xs">
                    {book.file_format?.toUpperCase() || (book.domain === 'manga_comics' ? 'MANGA' : 'EPUB')}
                  </span>

                  {/* Top-right rating badge (only if real rating exists) */}
                  {book.rating && book.rating > 0 ? (
                    <span className="absolute top-2.5 right-2.5 px-1.5 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-[9px] font-bold text-amber-400 flex items-center gap-0.5 border border-white/15 pointer-events-none shadow-xs">
                      <Star className="w-2.5 h-2.5 fill-amber-400" />
                      <span>{book.rating > 5 ? (book.rating / 2).toFixed(1) : book.rating.toFixed(1)}</span>
                    </span>
                  ) : null}

                  {/* Bottom progress bar if user has started reading */}
                  {progress && progress.progressPercent > 0 && (
                    <div className="absolute bottom-0 inset-x-0 h-1 bg-black/60 pointer-events-none z-10">
                      <div
                        className="h-full bg-primary"
                        style={{ width: `${Math.min(100, Math.round(progress.progressPercent))}%` }}
                      />
                    </div>
                  )}

                  {/* Bottom-right circular white play button (Matches Reference Image) */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenBook(book);
                    }}
                    className="absolute bottom-2.5 right-2.5 w-8 h-8 rounded-full bg-white dark:bg-white text-black flex items-center justify-center shadow-lg active:scale-90 hover:scale-105 transition-all cursor-pointer z-10"
                    aria-label={`Read ${book.title}`}
                  >
                    <Play className="w-3.5 h-3.5 fill-black stroke-black ml-0.5" />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-5 py-6 mx-5 rounded-2xl bg-card/60 border border-border/60 text-center">
            <BookOpen className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No books available yet.</p>
          </div>
        )}
      </section>

      {/* ── 3. RECENTLY PLAYED (VERTICAL EDITORIAL LIST) ── */}
      <section className="mt-5">
        <div className="px-5 mb-1.5 flex items-center justify-between">
          <h2 className="text-xs sm:text-sm font-black tracking-wider uppercase text-foreground/80">
            Recently Played
          </h2>
          <button
            type="button"
            onClick={() => onFilterCollection('reading')}
            className="text-xs font-semibold text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
          >
            See All
          </button>
        </div>

        {recentlyPlayedItems.length > 0 ? (
          <div className="px-4 flex flex-col gap-1">
            {recentlyPlayedItems.map((item) => {
              const book = extractBookFromItem(item);
              const coverUrl = getCoverUrl(book.cover_path);
              const author = getItemAuthor(item);
              const progress = book.id ? progressMap[book.id] : undefined;
              const meta = getBookMeta(book, progress);

              return (
                <div
                  key={book.id || book.uuid}
                  onClick={() => handleOpenDeepDive(item)}
                  className="flex items-center justify-between p-2 rounded-2xl hover:bg-card/70 active:scale-[0.99] transition-all cursor-pointer group"
                >
                  {/* Left Cover Thumbnail */}
                  <div className="relative w-12 h-16 min-w-[48px] max-w-[48px] rounded-xl overflow-hidden bg-muted/80 shrink-0 border border-border/50 shadow-xs">
                    {coverUrl ? (
                      <img
                        src={coverUrl}
                        alt=""
                        className="w-full h-full object-cover select-none pointer-events-none"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-muted">
                        <BookOpen className="w-5 h-5 text-primary/60" />
                      </div>
                    )}
                    <div className="absolute inset-y-0 left-0 w-2 bg-gradient-to-r from-black/35 to-transparent pointer-events-none" />
                    {progress && progress.progressPercent > 0 && (
                      <div className="absolute bottom-0 inset-x-0 h-1 bg-black/60 pointer-events-none">
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${Math.min(100, Math.round(progress.progressPercent))}%` }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Center Info */}
                  <div className="flex-1 min-w-0 ml-3.5 mr-2">
                    <h3 className="text-sm font-black text-foreground tracking-tight truncate group-hover:text-primary transition-colors">
                      {book.title}
                    </h3>
                    <p className="text-xs font-medium text-muted-foreground truncate mt-0.5">
                      {author || 'Unknown Author'}
                    </p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {/* Format Pill */}
                      <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-secondary/80 text-foreground/80 border border-border/50">
                        {book.file_format?.toUpperCase() || (book.domain === 'manga_comics' ? 'MANGA' : 'EPUB')}
                      </span>

                      {/* Reading Progress */}
                      {progress && progress.progressPercent > 0 ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-primary">
                          <CheckCircle2 className="w-3 h-3 text-primary" />
                          <span>{Math.round(progress.progressPercent)}%</span>
                        </span>
                      ) : null}

                      {/* Real Page Count */}
                      {book.page_count && book.page_count > 0 ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground/85">
                          <BookOpen className="w-3 h-3 text-muted-foreground/70" />
                          <span>{book.page_count}p</span>
                        </span>
                      ) : null}

                      {/* Published Year */}
                      {book.pubdate ? (() => {
                        const match = book.pubdate.match(/\b(18|19|20)\d{2}\b/);
                        return match ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground/75">
                            <Calendar className="w-3 h-3 text-muted-foreground/60" />
                            <span>{match[0]}</span>
                          </span>
                        ) : null;
                      })() : null}

                      {/* Real Rating */}
                      {book.rating && book.rating > 0 ? (
                        <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-amber-500">
                          <Star className="w-3 h-3 fill-amber-500" />
                          <span>{book.rating > 5 ? (book.rating / 2).toFixed(1) : book.rating.toFixed(1)}</span>
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* Right 3-dots Menu Button & Dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        onClick={(e) => e.stopPropagation()}
                        className="p-2 rounded-full text-muted-foreground/80 hover:text-foreground active:scale-90 transition-transform cursor-pointer"
                        aria-label="Book actions"
                      >
                        <MoreVertical className="w-4 h-4 stroke-[2]" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      sideOffset={4}
                      className="min-w-[195px] rounded-2xl bg-popover/95 dark:bg-[#18181b]/95 border border-border/80 shadow-2xl backdrop-blur-md p-1.5 z-[9999] text-sm animate-in fade-in zoom-in-95 duration-150"
                    >
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenBook(book);
                        }}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer hover:bg-secondary/70 focus:bg-secondary/70 text-foreground font-medium transition-colors select-none"
                      >
                        <BookOpen className="w-4 h-4 text-foreground/85 shrink-0" />
                        <span>Open</span>
                      </DropdownMenuItem>

                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenDeepDive(item);
                        }}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer hover:bg-secondary/70 focus:bg-secondary/70 text-foreground font-medium transition-colors select-none"
                      >
                        <Info className="w-4 h-4 text-foreground/85 shrink-0" />
                        <span>View Details</span>
                      </DropdownMenuItem>

                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          if (book.id) setEditingBookId(book.id);
                        }}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer hover:bg-secondary/70 focus:bg-secondary/70 text-foreground font-medium transition-colors select-none"
                      >
                        <Pencil className="w-4 h-4 text-foreground/85 shrink-0" />
                        <span>Edit Metadata</span>
                      </DropdownMenuItem>

                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          if (book.id) setShelfBookId(book.id);
                        }}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer hover:bg-secondary/70 focus:bg-secondary/70 text-foreground font-medium transition-colors select-none"
                      >
                        <FolderPlus className="w-4 h-4 text-foreground/85 shrink-0" />
                        <span>Add to Shelf...</span>
                      </DropdownMenuItem>

                      <DropdownMenuSeparator className="h-px bg-border/50 my-1 mx-1" />

                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          if (book.id) setDeleteBookInfo({ id: book.id, title: book.title });
                        }}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer hover:bg-destructive/15 focus:bg-destructive/15 text-destructive font-medium transition-colors select-none"
                      >
                        <Trash2 className="w-4 h-4 text-destructive shrink-0" />
                        <span>Delete</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-5 py-4 mx-5 rounded-2xl bg-card/60 border border-border/60 text-center">
            <p className="text-xs text-muted-foreground">No recent books yet.</p>
          </div>
        )}
      </section>

      {/* ── 4. FLOATING QUICK-RESUME PLAYER BAR (Matches Reference Image) ── */}
      {activeBook && (
        <div className="px-5 mt-5 mb-2">
          <div
            onClick={() => onOpenBook(activeBook)}
            className="w-full bg-[#18181b] dark:bg-[#18181b] text-white border border-white/10 shadow-2xl rounded-[22px] p-2.5 sm:p-3 flex items-center justify-between active:scale-[0.99] transition-transform cursor-pointer group"
          >
            {/* Left Cover Art Thumbnail */}
            <div className="w-11 h-11 min-w-[44px] max-w-[44px] rounded-xl overflow-hidden bg-white/10 shrink-0 border border-white/15 shadow-xs relative">
              {activeBook.cover_path ? (
                <img
                  src={getCoverUrl(activeBook.cover_path)}
                  alt=""
                  className="w-full h-full object-cover select-none pointer-events-none"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-white/10 text-white/60">
                  <BookOpen className="w-5 h-5" />
                </div>
              )}
            </div>

            {/* Center Book Title & Author */}
            <div className="flex-1 min-w-0 ml-3 mr-3 text-left">
              <div className="font-bold text-xs sm:text-sm text-white truncate tracking-tight group-hover:text-amber-200 transition-colors">
                {activeBook.title}
              </div>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="text-[11px] text-white/70 font-medium truncate max-w-[130px] sm:max-w-[180px]">
                  {activeBook.authors?.map((a) => a.name).join(', ') || 'Unknown Author'}
                </span>
                {activeBook.id && progressMap[activeBook.id]?.progressPercent > 0 && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full bg-white/10 text-[10px] font-bold text-amber-300 border border-white/10 shrink-0">
                    <BookmarkCheck className="w-2.5 h-2.5" />
                    <span>{Math.round(progressMap[activeBook.id].progressPercent)}%</span>
                  </span>
                )}
              </div>
            </div>

            {/* Right Play / Resume Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenBook(activeBook);
              }}
              className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-white text-black flex items-center justify-center shrink-0 shadow-md active:scale-90 hover:scale-105 transition-all cursor-pointer"
              aria-label="Resume reading"
            >
              <Play className="w-4 h-4 fill-black stroke-black ml-0.5" />
            </button>
          </div>
        </div>
      )}

      {/* ── ACTION DIALOGS ── */}
      {editingBookId !== null && (
        <EditMetadataDialog
          open={editingBookId !== null}
          onOpenChange={(open) => !open && setEditingBookId(null)}
          bookId={editingBookId}
        />
      )}

      {shelfBookId !== null && (
        <ShelfSelectDialog
          open={shelfBookId !== null}
          onOpenChange={(open) => !open && setShelfBookId(null)}
          bookId={shelfBookId}
        />
      )}

      {deleteBookInfo !== null && (
        <DeleteBookDialog
          open={deleteBookInfo !== null}
          onOpenChange={(open) => !open && setDeleteBookInfo(null)}
          bookIds={[deleteBookInfo.id]}
          bookTitle={deleteBookInfo.title}
        />
      )}
    </div>
  );
}
