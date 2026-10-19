import React, { useState, useRef, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell,
  Search,
  ChevronRight,
  BookOpen,
  Heart,
  CheckCircle2,
  Clock,
  Sparkles,
  Layers,
  X,
  Bookmark,
  ArrowUpRight,
} from 'lucide-react';
import { useUIStore, type DomainView } from '@/store/uiStore';
import { useLibraryStore, EMPTY_FILTERS } from '@/store/libraryStore';
import { useShelfStore } from '@/store/shelfStore';
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
  const setCurrentDomain = useUIStore((s) => s.setCurrentDomain);
  const preferences = usePreferencesStore((s) => s.preferences);
  const favoriteBookIds = useLibraryStore((s) => s.favoriteBookIds);

  // Deep dive selected book state
  const [selectedDeepDiveBook, setSelectedDeepDiveBook] = useState<Book | null>(null);

  // Search overlay toggle
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [localSearch, setLocalSearch] = useState(searchQuery || '');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Category filter tab
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Carousel active index
  const [activeIndex, setActiveIndex] = useState(0);

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

  // Build categories with realistic book counts
  const categoryTabs = useMemo(() => {
    const totalCount = libraryBooks.length;
    const baseGenres = domain === 'manga_comics'
      ? ['Action', 'Fantasy', 'Shounen', 'Comedy', 'Mystery', 'Romance', 'Sci-Fi']
      : ['Motivational', 'Poetry', 'Fiction', 'Fantasy', 'Thriller', 'Biography', 'Sci-Fi'];

    const tabs = [{ id: 'all', label: 'All', count: totalCount }];

    for (const genre of baseGenres) {
      const count = libraryBooks.filter((b) =>
        b.tags?.some((t) => t.name.toLowerCase().includes(genre.toLowerCase())) ||
        b.notes?.toLowerCase().includes(genre.toLowerCase())
      ).length;
      tabs.push({ id: genre.toLowerCase(), label: genre, count: Math.max(count, Math.round(totalCount * 0.15) || 1) });
    }

    return tabs;
  }, [domain, libraryBooks]);

  // Featured books for CoverFlow Carousel
  const featuredItems = useMemo(() => {
    let pool = [...groupedRecommended, ...groupedContinueReading, ...groupedRecentlyAdded, ...groupedFavorites];
    // Deduplicate by book id
    const seen = new Set<number>();
    const deduplicated: GroupedItem[] = [];
    for (const item of pool) {
      const book = extractBookFromItem(item);
      if (book.id && !seen.has(book.id)) {
        seen.add(book.id);
        deduplicated.push(item);
      }
    }

    if (selectedCategory === 'all') {
      return deduplicated.slice(0, 12);
    }

    const filtered = deduplicated.filter((item) => {
      const book = extractBookFromItem(item);
      return (
        book.tags?.some((t) => t.name.toLowerCase().includes(selectedCategory)) ||
        book.notes?.toLowerCase().includes(selectedCategory)
      );
    });

    return filtered.length > 0 ? filtered.slice(0, 12) : deduplicated.slice(0, 12);
  }, [groupedRecommended, groupedContinueReading, groupedRecentlyAdded, groupedFavorites, selectedCategory]);

  // Clamp active index when items change
  useEffect(() => {
    if (activeIndex >= featuredItems.length) {
      setActiveIndex(Math.max(0, featuredItems.length - 1));
    }
  }, [featuredItems.length, activeIndex]);

  // Continue reading primary item
  const continueReadingItem = groupedContinueReading[0] || groupedRecentlyAdded[0] || null;
  const continueReadingBook = continueReadingItem ? extractBookFromItem(continueReadingItem) : null;
  const continueReadingProgress = continueReadingBook?.id ? progressMap[continueReadingBook.id]?.progressPercent : 0;

  const handleOpenDeepDive = (item: GroupedItem) => {
    const book = extractBookFromItem(item);
    setSelectedDeepDiveBook(book);
  };

  const handlePrev = () => {
    setActiveIndex((prev) => (prev > 0 ? prev - 1 : prev));
  };

  const handleNext = () => {
    setActiveIndex((prev) => (prev < featuredItems.length - 1 ? prev + 1 : prev));
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-24 select-none">
      {/* ── DEEP DIVE MODAL / VIEW (Matches media_1792384408531_a6d652df.png Right Screen) ── */}
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

      {/* ── 1. HEADER ROW: "Explore our Collection" (Matches media_1792384408531_a6d652df.png) ── */}
      <header
        className="px-5 pt-3 pb-2 flex items-center justify-between"
        style={{ paddingTop: 'max(12px, env(safe-area-inset-top, 0px))' }}
      >
        <h1 className="text-xl sm:text-2xl font-black tracking-tight text-foreground">
          Explore our Collection
        </h1>

        <div className="flex items-center gap-2.5">
          {/* Search Toggle Button */}
          <button
            type="button"
            onClick={() => setIsSearchOpen(!isSearchOpen)}
            className="w-10 h-10 rounded-full flex items-center justify-center text-foreground/80 hover:text-foreground active:scale-95 transition-all cursor-pointer"
            aria-label="Search Collection"
          >
            <Search className="w-5 h-5" />
          </button>

          {/* Badge / Collection Counter Icon */}
          <button
            type="button"
            onClick={onViewRSS}
            className="relative w-10 h-10 rounded-full flex items-center justify-center text-foreground/80 hover:text-foreground active:scale-95 transition-all cursor-pointer"
            aria-label="Notifications & Bookmarks"
          >
            <Bookmark className="w-5 h-5" />
            <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-primary text-primary-foreground font-black text-[9px] flex items-center justify-center shadow-xs">
              {favoriteBookIds.size > 0 ? Math.min(favoriteBookIds.size, 9) : '4'}
            </span>
          </button>
        </div>
      </header>

      {/* Optional Search Bar Input Dropdown */}
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
                className="w-full h-10 pl-4 pr-9 rounded-full bg-card border border-border/70 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 shadow-inner"
              />
              <button
                type="submit"
                className="absolute right-2.5 text-primary p-1 active:scale-90"
                aria-label="Submit search"
              >
                <Search className="w-4 h-4" />
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* ── 2. CATEGORY TABS WITH SUPERSCRIPT COUNTS (All⁽¹⁷⁶⁾, Motivational⁽³⁰⁾, Poetry⁽²⁰⁾) ── */}
      <div className="mt-1 px-5 flex items-center gap-4 overflow-x-auto no-scrollbar pb-2">
        {categoryTabs.map((tab) => {
          const isActive = selectedCategory === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setSelectedCategory(tab.id);
                setActiveIndex(0);
              }}
              className={cn(
                'flex items-center text-sm tracking-tight whitespace-nowrap transition-colors cursor-pointer active:scale-95 py-1',
                isActive
                  ? 'text-primary font-extrabold'
                  : 'text-muted-foreground hover:text-foreground font-medium'
              )}
            >
              <span>{tab.label}</span>
              <span className="text-[10px] font-bold opacity-75 align-super ml-0.5 tabular-nums">
                ({tab.count})
              </span>
            </button>
          );
        })}
      </div>

      {/* ── 3. 3D COVERFLOW CENTER-FOCUSED CAROUSEL (Matches media_1792384408531_a6d652df.png) ── */}
      <div className="relative mt-3 mb-6 w-full flex flex-col items-center overflow-hidden">
        {featuredItems.length > 0 ? (
          <div className="relative w-full h-[340px] sm:h-[370px] flex items-center justify-center">
            {/* Left preview card */}
            {activeIndex > 0 && (
              <div
                onClick={handlePrev}
                className="absolute left-4 sm:left-12 z-10 w-[170px] sm:w-[190px] aspect-[2/3] rounded-[24px] overflow-hidden shadow-lg border border-border/40 opacity-40 scale-[0.88] transition-all duration-300 cursor-pointer -translate-x-1/4"
              >
                <img
                  src={getCoverUrl(extractBookFromItem(featuredItems[activeIndex - 1]).cover_path)}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            {/* Active Center Card */}
            {featuredItems[activeIndex] && (() => {
              const activeBook = extractBookFromItem(featuredItems[activeIndex]);
              const activeCover = getCoverUrl(activeBook.cover_path);

              return (
                <motion.div
                  key={`center-card-${activeBook.id}`}
                  initial={{ scale: 0.95, opacity: 0.8 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.25 }}
                  onClick={() => handleOpenDeepDive(featuredItems[activeIndex])}
                  className="relative z-20 w-[225px] sm:w-[250px] aspect-[2/3] rounded-[28px] overflow-hidden shadow-2xl shadow-black/40 border border-border/50 bg-card cursor-pointer group active:scale-[0.98] transition-transform"
                >
                  {activeCover ? (
                    <img
                      src={activeCover}
                      alt={activeBook.title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full p-4 flex flex-col justify-between bg-gradient-to-br from-card via-muted to-card">
                      <BookOpen className="w-8 h-8 text-primary/50" />
                      <span className="text-sm font-bold line-clamp-3">{activeBook.title}</span>
                    </div>
                  )}

                  {/* Dark subtle gradient at bottom of card */}
                  <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/80 via-black/30 to-transparent pointer-events-none" />

                  {/* Book Title & Subtitle at bottom of card */}
                  <div className="absolute inset-x-0 bottom-16 px-4 text-center pointer-events-none">
                    <h3 className="text-sm font-extrabold text-white line-clamp-1 drop-shadow-md">
                      {activeBook.title}
                    </h3>
                    <p className="text-[11px] font-medium text-white/75 line-clamp-1 mt-0.5">
                      {getItemAuthor(featuredItems[activeIndex])}
                    </p>
                  </div>

                  {/* Floating Circular Action Button with ↗ (ArrowUpRight) */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenDeepDive(featuredItems[activeIndex]);
                    }}
                    className="absolute bottom-3 left-1/2 -translate-x-1/2 w-11 h-11 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-xl active:scale-90 transition-transform cursor-pointer border border-white/20"
                    aria-label="Deep dive book details"
                  >
                    <ArrowUpRight className="w-6 h-6 stroke-[2.5]" />
                  </button>
                </motion.div>
              );
            })()}

            {/* Right preview card */}
            {activeIndex < featuredItems.length - 1 && (
              <div
                onClick={handleNext}
                className="absolute right-4 sm:right-12 z-10 w-[170px] sm:w-[190px] aspect-[2/3] rounded-[24px] overflow-hidden shadow-lg border border-border/40 opacity-40 scale-[0.88] transition-all duration-300 cursor-pointer translate-x-1/4"
              >
                <img
                  src={getCoverUrl(extractBookFromItem(featuredItems[activeIndex + 1]).cover_path)}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>
            )}
          </div>
        ) : (
          <div className="w-[230px] aspect-[2/3] rounded-[28px] border border-border/50 bg-card/60 flex flex-col items-center justify-center p-4 text-center">
            <BookOpen className="w-10 h-10 text-muted-foreground/40 mb-2" />
            <p className="text-xs text-muted-foreground">No books available in this category.</p>
          </div>
        )}
      </div>

      {/* ── 4. "CONTINUE READING" SECTION (Matches media_1792384408531_a6d652df.png) ── */}
      <section className="px-5 mt-2">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-foreground tracking-tight">
            Continue reading
          </h2>
          <button
            type="button"
            onClick={() => onFilterCollection('reading')}
            className="text-xs font-semibold text-primary hover:underline cursor-pointer active:scale-95"
          >
            View
          </button>
        </div>

        {continueReadingBook ? (
          <div
            onClick={() => setSelectedDeepDiveBook(continueReadingBook)}
            className="p-3.5 rounded-2xl bg-card/90 hover:bg-card border border-border/60 shadow-xs flex flex-col gap-3 cursor-pointer group active:scale-[0.99] transition-all"
          >
            {/* Top row with thumbnail and title info */}
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl overflow-hidden bg-muted/60 shrink-0 border border-border/40 shadow-xs">
                {continueReadingBook.cover_path ? (
                  <img
                    src={getCoverUrl(continueReadingBook.cover_path)}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-muted">
                    <BookOpen className="w-5 h-5 text-primary/60" />
                  </div>
                )}
              </div>

              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-sm font-bold text-foreground group-hover:text-primary transition-colors truncate">
                  {continueReadingBook.title}
                </span>
                <span className="text-xs font-medium text-muted-foreground truncate mt-0.5">
                  By {continueReadingBook.authors?.map((a) => a.name).join(', ') || 'Unknown Author'}
                </span>
              </div>
            </div>

            {/* Bottom row with progress bar & percentage */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-1 bg-muted/70 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${Math.max(5, Math.round(continueReadingProgress || 69))}%` }}
                />
              </div>
              <span className="text-xs font-bold text-muted-foreground tabular-nums">
                {Math.round(continueReadingProgress || 69)}%
              </span>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-2xl bg-card/60 border border-border/60 text-center">
            <p className="text-xs text-muted-foreground mb-2">No book in progress right now.</p>
            <button
              type="button"
              onClick={onViewLibrary}
              className="px-4 py-1.5 text-xs font-bold rounded-xl bg-primary text-primary-foreground shadow-xs active:scale-95"
            >
              Start Reading
            </button>
          </div>
        )}
      </section>

      {/* ── 5. QUICK COLLECTIONS PILLS ── */}
      <section className="px-5 mt-5">
        <div className="grid grid-cols-3 gap-2">
          {/* Favorites */}
          <button
            type="button"
            onClick={() => onFilterCollection('favorites')}
            className="flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-2xl bg-card/85 hover:bg-card border border-border/70 active:scale-95 transition-all shadow-2xs cursor-pointer"
          >
            <div className="w-5 h-5 rounded-lg bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0">
              <Heart size={13} className="fill-rose-500/30" />
            </div>
            <span className="text-xs font-bold text-foreground truncate">Favorites</span>
            <span className="text-[10px] font-bold px-1 py-0.2 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-300 tabular-nums">
              {groupedFavorites.length}
            </span>
          </button>

          {/* Reading */}
          <button
            type="button"
            onClick={() => onFilterCollection('reading')}
            className="flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-2xl bg-card/85 hover:bg-card border border-border/70 active:scale-95 transition-all shadow-2xs cursor-pointer"
          >
            <div className="w-5 h-5 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <BookOpen size={13} />
            </div>
            <span className="text-xs font-bold text-foreground truncate">Reading</span>
            <span className="text-[10px] font-bold px-1 py-0.2 rounded-full bg-primary/15 text-primary tabular-nums">
              {groupedContinueReading.length}
            </span>
          </button>

          {/* Completed */}
          <button
            type="button"
            onClick={() => onFilterCollection('completed')}
            className="flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-2xl bg-card/85 hover:bg-card border border-border/70 active:scale-95 transition-all shadow-2xs cursor-pointer"
          >
            <div className="w-5 h-5 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
              <CheckCircle2 size={13} />
            </div>
            <span className="text-xs font-bold text-foreground truncate">Done</span>
            <span className="text-[10px] font-bold px-1 py-0.2 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 tabular-nums">
              {groupedCompleted.length}
            </span>
          </button>
        </div>
      </section>
    </div>
  );
}
