/**
 * HomePage — Shiori v3.0
 *
 * The main landing/dashboard view.
 * Features:
 * - Hero section with glass-morphism cards
 * - Domain-aware content (Books or Manga)
 * - Framer Motion staggered animations
 * - Quick action buttons
 */

import { logger } from '@/lib/logger';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useMemo, useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  BookOpen, Clock, Sparkles, ArrowRight,
  ListOrdered, Activity, HardDrive, Heart, History, CheckCircle2, PauseCircle, BarChart2, ThumbsUp, Layers
} from 'lucide-react'
import { MobileStickyHeader } from '../layout/MobileStickyHeader'
import { useThumbnail } from '@/hooks/useThumbnail'
import { FeaturedContinueCard } from './FeaturedContinueCard'
import { useLibraryStore } from '@/store/libraryStore'
import { useUIStore, type DomainView } from '@/store/uiStore'
import type { Book, ReadingProgress } from '@/lib/tauri'
import { api } from '@/lib/tauri'
import { formatFileSize, isMangaDomain, proxyExternalCover } from '@/lib/utils'
import { useTorboxStore } from '@/store/useTorboxStore'
import { groupBooksBySeries, extractSeriesTitle, type GroupedItem, type SeriesGroup } from '@/hooks/useGroupedLibrary'
import { parseVolumeOrChapterNumber } from '@/lib/seriesSorting'

function getCoverUrl(path: string | null | undefined): string {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return proxyExternalCover(path);
  }
  return convertFileSrc(path.replace(/\\/g, '/'));
}

// ── Animation variants ───────────────────────────
const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] },
  },
}

const cardHover = {
  y: -4,
  transition: { duration: 0.2, ease: 'easeOut' as const },
}

// ── Hero Section ─────────────────────────────────
function HeroSection({
  totalBooks,
  totalManga,
  totalSize,
  booksInProgress,
  domain,
  onViewLibrary,
  featuredBook,
}: {
  totalBooks: number
  totalManga: number
  totalSize: number
  booksInProgress: number
  domain: DomainView
  onViewLibrary: () => void
  featuredBook: Book | null
}) {
  const thumbUrl = useThumbnail(featuredBook?.id, featuredBook?.cover_path);
  const setCurrentView = useUIStore(s => s.setCurrentView);

  const handleViewOnlineBooks = useCallback(() => {
    setCurrentView('online-books');
  }, [setCurrentView]);

  const handleViewOnlineManga = useCallback(() => {
    setCurrentView('online-manga');
  }, [setCurrentView]);

  const timeOfDay = useMemo(() => {
    const hour = new Date().getHours()
    if (hour < 12) return 'morning'
    if (hour < 17) return 'afternoon'
    return 'evening'
  }, [])

  const greeting = `Good ${timeOfDay}`
  const heroContextLabel = domain === 'manga_comics' ? 'Manga & Comics Dashboard' : 'Books Dashboard'

  return (
    <motion.div className="hero-section" variants={itemVariants}>
      {/* Background dynamic cover or static orbs */}
      <div className="hero-bg">
        {featuredBook?.cover_path ? (
           <img 
             src={thumbUrl || undefined} 
             alt="" 
             className="hero-dynamic-bg opacity-30 absolute inset-0 w-full h-full object-cover pointer-events-none transition-all duration-1000 scale-100"
           />
        ) : (
          <>
            <div className="hero-orb hero-orb-1" />
            <div className="hero-orb hero-orb-2" />
            <div className="hero-orb hero-orb-3" />
          </>
        )}
      </div>

      <div className="hero-content">
        <motion.div
          className="hero-text"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <span className="hero-eyebrow">{heroContextLabel}</span>
          <h1 className="hero-greeting">{greeting}</h1>
          <p className="hero-subtitle">
            {booksInProgress > 0
              ? `You have ${booksInProgress} ${domain === 'manga_comics' ? 'manga & comics' : 'book'}${booksInProgress > 1 ? 's' : ''} in progress`
              : `Your personal ${domain === 'manga_comics' ? 'manga & comics' : 'book'} library`}
          </p>
        </motion.div>

        {/* Glass stat cards */}
        <div className="hero-stats">
          <motion.div
            className="glass-card"
            whileHover={cardHover}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.3 }}
          >
            <div className="glass-card-icon" data-domain={domain}>
              <ListOrdered size={20} />
            </div>
            <div className="glass-card-content">
              <span className="glass-card-value">{totalBooks + totalManga}</span>
              <span className="glass-card-label">Total Items</span>
            </div>
          </motion.div>

          <motion.div
            className="glass-card"
            whileHover={cardHover}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.4 }}
          >
            <div className="glass-card-icon" data-accent="progress">
              <Activity size={20} />
            </div>
            <div className="glass-card-content">
              <span className="glass-card-value">{booksInProgress}</span>
              <span className="glass-card-label">In Progress</span>
            </div>
          </motion.div>

          <motion.div
            className="glass-card"
            whileHover={cardHover}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.5 }}
          >
            <div className="glass-card-icon" data-accent="size">
              <HardDrive size={20} />
            </div>
            <div className="glass-card-content">
              <span className="glass-card-value">{formatFileSize(totalSize)}</span>
              <span className="glass-card-label">Library Size</span>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Quick action */}
      <motion.button
        className="hero-action"
        onClick={onViewLibrary}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
      >
        <span>Browse Library</span>
        <ArrowRight size={16} />
      </motion.button>
    </motion.div>
  )
}

// ── Main HomePage Component ──────────────────────
interface HomePageProps {
  onOpenBook: (bookId: number) => void
  onViewSeries?: (series: SeriesGroup) => void
  onViewRSS: () => void
  searchQuery?: string
  onSearchChange?: (query: string) => void
  onOpenAdvancedFilter?: () => void
  onOpenSettings?: () => void
}

export function HomePage({ 
  onOpenBook, 
  onViewSeries,
  onViewRSS, 
  searchQuery = "", 
  onSearchChange = () => {}, 
  onOpenAdvancedFilter = () => {}, 
  onOpenSettings = () => {} 
}: HomePageProps) {
  const [libraryStats, setLibraryStats] = useState<{total_books: number, total_manga: number, total_size_bytes: number} | null>(null);
  const favoriteBookIds = useLibraryStore(s => s.favoriteBookIds)
  const libraryBooks = useLibraryStore(s => s.books)
  const currentDomain = useUIStore(state => state.currentDomain);
  const setCurrentView = useUIStore(state => state.setCurrentView);
  const [progressMap, setProgressMap] = useState<Record<number, ReadingProgress>>({})
  const [completedBooks, setCompletedBooks] = useState<Book[]>([])
  const [onHoldBooks, setOnHoldBooks] = useState<Book[]>([])
  const [continueReading, setContinueReading] = useState<Book[]>([])
  const [recentlyAdded, setRecentlyAdded] = useState<Book[]>([])
  const [recommendedBooks, setRecommendedBooks] = useState<Book[]>([])
  const [favoriteBooks, setFavoriteBooks] = useState<Book[]>([])
  const [lastReadBooks, setLastReadBooks] = useState<Book[]>([])
  const [allInProgress, setAllInProgress] = useState<number>(0)
  const torboxJobs = useTorboxStore(s => s.jobs)
  const hasTorboxKey = useTorboxStore(s => s.hasApiKey)

  const domain = currentDomain

  // Load all Home Data from SQLite directly
  const loadHomeData = useCallback(async () => {
    try {
      const stats = await api.getLibraryStats();
      setLibraryStats(stats);

      // 1. Recently Added
      const recent = await api.getBooksByDomain(domain, 24, 0);

      // 2. Continue Reading (Reading Status)
      const readingBooks = await api.getBooksByReadingStatus('reading', 50, 0);
      const domainReading = readingBooks.filter(b => 
        domain === 'manga_comics' ? isMangaDomain(b) : !isMangaDomain(b)
      ).sort((a, b) => {
        const dateA = a.last_opened ? new Date(a.last_opened).getTime() : 0
        const dateB = b.last_opened ? new Date(b.last_opened).getTime() : 0
        return dateB - dateA
      });

      // 3. Favorites
      const favIds = Array.from(favoriteBookIds);
      const favBooksPromises = favIds.slice(0, 30).map(id => api.getBook(id).catch(() => null));
      const favsResolved = (await Promise.all(favBooksPromises)).filter(Boolean) as Book[];
      const domainFavs = favsResolved.filter(b => 
        domain === 'manga_comics' ? isMangaDomain(b) : !isMangaDomain(b)
      );

      // 4. Completed, On Hold & Recommended
      const [completed, onHold, recommended] = await Promise.all([
        api.getBooksByReadingStatus('completed', 20, 0),
        api.getBooksByReadingStatus('on_hold', 20, 0),
        api.getRecommendedBooks(25)
      ]);
      const domainRecommended = (recommended as unknown as Book[]).filter(b =>
        domain === 'manga_comics' ? isMangaDomain(b) : !isMangaDomain(b)
      );

      // 5. Reading Progress Map
      const bookIdsToFetch = [...domainReading, ...recent, ...domainFavs].slice(0, 50).map(b => b.id!);
      const map: Record<number, ReadingProgress> = {};
      if (bookIdsToFetch.length > 0) {
        const batchResult = await api.getReadingProgressBatch(bookIdsToFetch);
        for (const [id, progress] of Object.entries(batchResult)) {
          if (progress.progressPercent > 0) {
            map[Number(id)] = progress;
          }
        }
      }

      // 6. Batch State Updates
      setRecentlyAdded(recent as unknown as Book[]);
      setContinueReading(domainReading);
      setAllInProgress(readingBooks.length);
      setLastReadBooks(domainReading);
      setFavoriteBooks(domainFavs);
      setRecommendedBooks(domainRecommended);
      setCompletedBooks(completed.filter(b => domain === 'manga_comics' ? isMangaDomain(b) : !isMangaDomain(b)));
      setOnHoldBooks(onHold.filter(b => domain === 'manga_comics' ? isMangaDomain(b) : !isMangaDomain(b)));
      setProgressMap(map);
    } catch (err) {
      logger.error('Failed to load home data', err);
    }
  }, [domain, favoriteBookIds, libraryBooks, isMangaDomain]);

  useEffect(() => {
    loadHomeData();
  }, [loadHomeData]);

  // Series Groups extracted from the full library when in manga_comics domain
  const librarySeriesGroups = useMemo(() => {
    if (domain !== 'manga_comics') return [];
    return groupBooksBySeries(libraryBooks, true)
      .filter((item): item is { type: 'series'; data: SeriesGroup } => item.type === 'series')
      .map(item => item.data);
  }, [libraryBooks, domain]);

  // Helper to resolve any book to its SeriesGroup (if it belongs to a series with >1 volume in library), or null
  const findSeriesForBook = useCallback((book: Book): SeriesGroup | null => {
    if (domain !== 'manga_comics') return null;
    const seriesTitle = extractSeriesTitle(book);
    if (!seriesTitle) return null;
    return librarySeriesGroups.find(
      s => s.title.toLowerCase() === seriesTitle.toLowerCase()
    ) || null;
  }, [domain, librarySeriesGroups]);

  // Transform a list of books into deduplicated GroupedItems (Series or Standalone Books)
  const groupItemsList = useCallback((books: Book[]): GroupedItem[] => {
    if (domain !== 'manga_comics') {
      return books.map(b => ({ type: 'book' as const, data: b }));
    }

    const seenSeriesIds = new Set<string>();
    const result: GroupedItem[] = [];

    for (const book of books) {
      const series = findSeriesForBook(book);
      if (series) {
        if (!seenSeriesIds.has(series.id)) {
          seenSeriesIds.add(series.id);
          result.push({ type: 'series', data: series });
        }
      } else {
        result.push({ type: 'book', data: book });
      }
    }

    return result;
  }, [domain, findSeriesForBook]);

  const groupedContinueReading = useMemo(() => groupItemsList(continueReading), [continueReading, groupItemsList]);
  const groupedRecentlyAdded = useMemo(() => groupItemsList(recentlyAdded), [recentlyAdded, groupItemsList]);
  const groupedRecommended = useMemo(() => groupItemsList(recommendedBooks), [recommendedBooks, groupItemsList]);
  const groupedFavorites = useMemo(() => groupItemsList(favoriteBooks), [favoriteBooks, groupItemsList]);
  const groupedCompleted = useMemo(() => groupItemsList(completedBooks), [completedBooks, groupItemsList]);
  const groupedOnHold = useMemo(() => groupItemsList(onHoldBooks), [onHoldBooks, groupItemsList]);

  const handleOpenBook = (book: Book) => {
    onOpenBook(book.id!)
  }

  const handleViewLibrary = () => {
    setCurrentView('library')
  }

  // ── Empty state ──────────────────────────────
  if (libraryStats && libraryStats.total_books === 0 && libraryStats.total_manga === 0) {
    return (
      <motion.div
        className="home-page"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
      >
        <HeroSection
          totalBooks={0}
          totalManga={0}
          totalSize={0}
          booksInProgress={0}
          domain={domain}
          onViewLibrary={handleViewLibrary}
          featuredBook={null}
        />
        <div className="home-empty">
          <BookOpen className="home-empty-icon" />
          <div className="home-empty-title">
            {domain === 'manga_comics' ? 'No manga & comics yet' : 'No books yet'}
          </div>
          <div className="home-empty-desc">
            {domain === 'manga_comics'
              ? 'Import your manga and comics archives (CBZ, CBR) using the Import button in the toolbar.'
              : 'Import your eBooks (EPUB, PDF, MOBI) using the Import button in the toolbar.'}
          </div>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      className="home-bento-layout p-4 pt-0 md:p-6 max-w-[1400px] mx-auto"
      variants={containerVariants}
      initial="hidden"
      animate="show"
    >
      <MobileStickyHeader 
        searchQuery={searchQuery} 
        onSearchChange={onSearchChange} 
        onOpenAdvancedFilter={onOpenAdvancedFilter}
        hideThemeToggle={true}
      />
      
      {/* ── COMPACT COLLECTIONS BAR ── */}
      <div className="flex gap-3 mb-6 overflow-x-auto p-1 pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden hidden md:flex">
        {/* Favorites */}
        <div 
          onClick={handleViewLibrary}
          className="group flex items-center gap-2.5 px-4 py-2 rounded-full bg-card/80 hover:bg-card border border-border/60 hover:border-primary/50 text-muted-foreground hover:text-foreground shadow-xs transition-all duration-200 hover:scale-102 active:scale-98 select-none cursor-pointer shrink-0"
        >
          <Heart size={16} className="text-primary opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all" />
          <span className="font-extrabold text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20 tabular-nums">{groupedFavorites.length}</span>
          <span className="text-xs font-bold tracking-wide text-foreground">Favorites</span>
        </div>

        {/* Reading */}
        <div 
          onClick={handleViewLibrary}
          className="group flex items-center gap-2.5 px-4 py-2 rounded-full bg-card/80 hover:bg-card border border-border/60 hover:border-primary/50 text-muted-foreground hover:text-foreground shadow-xs transition-all duration-200 hover:scale-102 active:scale-98 select-none cursor-pointer shrink-0"
        >
          <BookOpen size={16} className="text-primary opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all" />
          <span className="font-extrabold text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20 tabular-nums">{groupedContinueReading.length}</span>
          <span className="text-xs font-bold tracking-wide text-foreground">Reading</span>
        </div>

        {/* Completed */}
        <div 
          onClick={handleViewLibrary}
          className="group flex items-center gap-2.5 px-4 py-2 rounded-full bg-card/80 hover:bg-card border border-border/60 hover:border-primary/50 text-muted-foreground hover:text-foreground shadow-xs transition-all duration-200 hover:scale-102 active:scale-98 select-none cursor-pointer shrink-0"
        >
          <CheckCircle2 size={16} className="text-primary opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all" />
          <span className="font-extrabold text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20 tabular-nums">{groupedCompleted.length}</span>
          <span className="text-xs font-bold tracking-wide text-foreground">Completed</span>
        </div>

        {/* On Hold */}
        <div 
          onClick={handleViewLibrary}
          className="group flex items-center gap-2.5 px-4 py-2 rounded-full bg-card/80 hover:bg-card border border-border/60 hover:border-primary/50 text-muted-foreground hover:text-foreground shadow-xs transition-all duration-200 hover:scale-102 active:scale-98 select-none cursor-pointer shrink-0"
        >
          <PauseCircle size={16} className="text-primary opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all" />
          <span className="font-extrabold text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20 tabular-nums">{groupedOnHold.length}</span>
          <span className="text-xs font-bold tracking-wide text-foreground">On Hold</span>
        </div>
      </div>

      {/* ── ROW 1: THE "NOW" ROW ── */}
      <div className="bento-row now-row">
        {groupedContinueReading.length > 0 ? (
          <div className="bento-widget p-0 overflow-hidden flex flex-col h-full border-none bg-transparent">
            {groupedContinueReading[0].type === 'series' ? (
              <FeaturedContinueCard 
                series={groupedContinueReading[0].data} 
                progress={(() => {
                  const s = groupedContinueReading[0].data;
                  const nextBook = s.books.find(b => b.reading_status !== 'completed') || s.books[0];
                  return progressMap[nextBook?.id!] || { progressPercent: 0, book_id: nextBook?.id!, total_seconds: 0 } as any;
                })()} 
                onOpenBook={handleOpenBook} 
                onViewSeries={onViewSeries}
                isManga={domain === 'manga_comics'}
              />
            ) : (
              <FeaturedContinueCard 
                book={groupedContinueReading[0].data} 
                progress={progressMap[groupedContinueReading[0].data.id!] || { progressPercent: 0, book_id: groupedContinueReading[0].data.id!, total_seconds: 0 } as any} 
                onOpenBook={handleOpenBook} 
                onViewSeries={onViewSeries}
                isManga={domain === 'manga_comics'}
              />
            )}
          </div>
        ) : (
          <div className="bento-widget flex items-center justify-center text-center p-8">
            <div className="flex flex-col items-center max-w-md gap-4">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-2">
                <Sparkles size={32} />
              </div>
              <h2 className="text-2xl font-bold">Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}</h2>
              <p className="text-muted-foreground">
                Your personal {domain === 'manga_comics' ? 'manga & comics' : 'books'} library. 
                You don't have any items in progress right now. Why not start something new?
              </p>
              <button onClick={handleViewLibrary} className="mt-4 px-6 py-3 bg-primary text-primary-foreground font-bold rounded-xl hover:bg-primary/90 transition-colors flex items-center gap-2">
                Browse Library <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        <div className="bento-widget hidden md:flex flex-col">
          <div className="bento-widget-header">
            <h2 className="bento-widget-title"><Activity size={18} /> Quick Stats</h2>
          </div>
          <div className="flex flex-col gap-4 mt-2">
            <div className="flex justify-between items-center p-3 rounded-xl bg-muted/30">
              <span className="text-muted-foreground font-medium text-sm">Total {domain === 'manga_comics' ? 'Manga' : 'Books'}</span>
              <span className="font-bold text-lg tabular-nums tracking-tight">{domain === 'manga_comics' ? (libraryStats?.total_manga || 0) : (libraryStats?.total_books || 0)}</span>
            </div>
            <div className="flex justify-between items-center p-3 rounded-xl bg-muted/30">
              <span className="text-muted-foreground font-medium text-sm">In Progress</span>
              <span className="font-bold text-lg text-primary tabular-nums tracking-tight">{allInProgress}</span>
            </div>
            <div className="flex justify-between items-center p-3 rounded-xl bg-muted/30">
              <span className="text-muted-foreground font-medium text-sm">Library Size</span>
              <span className="font-bold text-lg tabular-nums tracking-tight">{formatFileSize(libraryStats?.total_size_bytes || 0)}</span>
            </div>
            <div className="flex gap-2 mt-2">
              <button onClick={handleViewLibrary} className="flex-1 py-3 bg-primary/10 hover:bg-primary/20 text-primary font-bold rounded-xl transition-colors flex items-center justify-center gap-2">
                Browse Library <ArrowRight size={16} />
              </button>
              <button onClick={() => setCurrentView('statistics')} className="px-4 py-3 bg-muted/50 hover:bg-muted text-foreground font-bold rounded-xl transition-colors flex items-center justify-center" title="View Detailed Statistics">
                <BarChart2 size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── ROW 2: ACTIVITY & DISCOVERY ── */}
      <div className="bento-row activity-row">
        
        {/* Jump Back In */}
        <div className="bento-widget hidden md:flex flex-col">
          <div className="bento-widget-header">
            <h2 className="bento-widget-title"><Clock size={18} /> Jump Back In</h2>
          </div>
          <div className="bento-widget-content">
            {groupedContinueReading.slice(1, 4).map((item) => {
              if (item.type === 'series') {
                const series = item.data;
                const nextBook = series.books.find(b => b.reading_status !== 'completed') || series.books[0];
                const prog = Math.round(progressMap[nextBook?.id!]?.progressPercent ?? 0);
                const volNum = nextBook ? (nextBook.series_index ?? parseVolumeOrChapterNumber(nextBook)) : null;
                const coverPath = series.firstCover || nextBook?.cover_path;

                return (
                  <div key={`series-${series.id}`} onClick={() => nextBook && handleOpenBook(nextBook)} className="bento-list-item">
                    <div className="bento-list-cover-wrapper">
                      <img src={getCoverUrl(coverPath) || undefined} className="bento-list-cover" alt="" onError={(e) => e.currentTarget.src = ''} />
                    </div>
                    <div className="bento-list-info">
                      <span className="bento-list-title">{series.title}</span>
                      <span className="bento-list-meta">
                        {volNum !== null && volNum !== undefined ? `Vol. ${volNum} · ` : ''}{prog}% completed
                      </span>
                      <div className="bento-progress-track">
                        <div className="bento-progress-bar" style={{ width: `${prog}%` }} />
                      </div>
                    </div>
                  </div>
                );
              }

              const book = item.data;
              return (
                <div key={`book-${book.id}`} onClick={() => handleOpenBook(book)} className="bento-list-item">
                  <div className="bento-list-cover-wrapper">
                    <img src={getCoverUrl(book.cover_path) || undefined} className="bento-list-cover" alt="" onError={(e) => e.currentTarget.src = ''} />
                  </div>
                  <div className="bento-list-info">
                    <span className="bento-list-title">{book.title}</span>
                    <span className="bento-list-meta">{Math.round(progressMap[book.id!]?.progressPercent ?? 0)}% completed</span>
                    <div className="bento-progress-track">
                      <div className="bento-progress-bar" style={{ width: `${progressMap[book.id!]?.progressPercent ?? 0}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
            {groupedContinueReading.length <= 1 && (
              <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground text-center px-4">
                You're all caught up! No other books in progress.
              </div>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bento-widget">
          <div className="bento-widget-header">
            <h2 className="bento-widget-title"><History size={18} /> Recent Activity</h2>
          </div>
          <div className="bento-widget-content overflow-y-auto pr-2" style={{ maxHeight: '300px' }}>
            {groupedRecentlyAdded.slice(0, 5).map((item) => {
              if (item.type === 'series') {
                const series = item.data;
                const firstBook = series.books[0];
                const coverPath = series.firstCover || firstBook?.cover_path;

                return (
                  <div 
                    key={`recent-series-${series.id}`} 
                    onClick={() => {
                      if (onViewSeries) onViewSeries(series);
                      else if (firstBook) handleOpenBook(firstBook);
                    }} 
                    className="bento-list-item cursor-pointer"
                  >
                    <div className="bento-list-cover-wrapper">
                      <img src={getCoverUrl(coverPath) || undefined} className="bento-list-cover" alt="" onError={(e) => e.currentTarget.src = ''} />
                    </div>
                    <div className="bento-list-info">
                      <span className="bento-list-title">{series.title}</span>
                      <span className="bento-list-meta flex items-center gap-1">
                        <Layers className="w-3 h-3 text-primary inline" />
                        {series.bookCount} {series.bookCount === 1 ? 'Volume' : 'Volumes'} added
                      </span>
                    </div>
                  </div>
                );
              }

              const book = item.data;
              return (
                <div key={`recent-${book.id}`} onClick={() => handleOpenBook(book)} className="bento-list-item">
                  <div className="bento-list-cover-wrapper">
                    <img src={getCoverUrl(book.cover_path) || undefined} className="bento-list-cover" alt="" onError={(e) => e.currentTarget.src = ''} />
                  </div>
                  <div className="bento-list-info">
                    <span className="bento-list-title">{book.title}</span>
                    <span className="bento-list-meta">Added to library</span>
                  </div>
                </div>
              );
            })}
            {groupedRecentlyAdded.length === 0 && (
              <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                No recent activity.
              </div>
            )}
          </div>
        </div>

        {/* Recommended */}
        <div className="bento-widget hidden md:flex flex-col">
          <div className="bento-widget-header">
            <h2 className="bento-widget-title"><ThumbsUp size={18} /> Recommended</h2>
          </div>
          <div className="bento-widget-content overflow-y-auto pr-2" style={{ maxHeight: '300px' }}>
            {groupedRecommended.slice(0, 5).map((item) => {
              if (item.type === 'series') {
                const series = item.data;
                const firstBook = series.books[0];
                const coverPath = series.firstCover || firstBook?.cover_path;

                return (
                  <div 
                    key={`rec-series-${series.id}`} 
                    onClick={() => {
                      if (onViewSeries) onViewSeries(series);
                      else if (firstBook) handleOpenBook(firstBook);
                    }} 
                    className="bento-list-item cursor-pointer"
                  >
                    <div className="bento-list-cover-wrapper">
                      <img src={getCoverUrl(coverPath) || undefined} className="bento-list-cover" alt="" onError={(e) => e.currentTarget.src = ''} />
                    </div>
                    <div className="bento-list-info">
                      <span className="bento-list-title">{series.title}</span>
                      <span className="bento-list-meta">{series.bookCount} Vols · Suggested for you</span>
                    </div>
                  </div>
                );
              }

              const book = item.data;
              return (
                <div key={`rec-${book.id}`} onClick={() => handleOpenBook(book)} className="bento-list-item">
                  <div className="bento-list-cover-wrapper">
                    <img src={getCoverUrl(book.cover_path) || undefined} className="bento-list-cover" alt="" onError={(e) => e.currentTarget.src = ''} />
                  </div>
                  <div className="bento-list-info">
                    <span className="bento-list-title">{book.title}</span>
                    <span className="bento-list-meta">Suggested for you</span>
                  </div>
                </div>
              );
            })}
            {groupedRecommended.length === 0 && (
              <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                Read more books to get recommendations.
              </div>
            )}
          </div>
        </div>

      </div>

    </motion.div>
  )
}
