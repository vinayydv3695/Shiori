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
  BookOpen, Clock, Sparkles, Rss, ArrowRight,
  ListOrdered, Activity, HardDrive, Heart, History, CheckCircle2, PauseCircle, Globe, BarChart2,
  Trash2, Settings, Highlighter, List
} from 'lucide-react'
import { MobileStickyHeader } from '../layout/MobileStickyHeader'
import { useThumbnail } from '@/hooks/useThumbnail'
import { FeaturedContinueCard } from './FeaturedContinueCard'
import { useLibraryStore } from '@/store/libraryStore'
import { useUIStore, type DomainView } from '@/store/uiStore'
import { usePreferencesStore } from '@/store/preferencesStore'
import type { Book, ReadingProgress } from '@/lib/tauri'
import { api } from '@/lib/tauri'
import { formatFileSize, isMangaDomain } from '@/lib/utils'

// ── Shared constant ──────────────────────────────
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
      {/* Background dynamic blur or static orbs */}
      <div className="hero-bg">
        {featuredBook?.cover_path ? (
           <img 
             src={thumbUrl || ''} 
             alt="" 
             className="hero-dynamic-bg opacity-40 blur-[80px] absolute inset-0 w-full h-full object-cover pointer-events-none transition-all duration-1000 scale-110"
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
  onViewRSS: () => void
  searchQuery?: string
  onSearchChange?: (query: string) => void
  onOpenAdvancedFilter?: () => void
  onOpenSettings?: () => void
}

function MobileQuickLinks({ onOpenSettings }: { onOpenSettings: () => void }) {
  const setCurrentView = useUIStore(s => s.setCurrentView)
  const enableRecycleBin = usePreferencesStore(s => s.preferences?.enableRecycleBin ?? false)

  return (
    <div className="md:hidden mb-6 px-4">
      <div className="flex gap-2 overflow-x-auto hide-scrollbar snap-x pb-2">
        <button onClick={() => setCurrentView('anilist')} className="flex items-center flex-none snap-start gap-2 px-4 py-2 rounded-full bg-secondary/20 border border-border/40 hover:bg-secondary/40 active:scale-95 transition-all">
          <List className="w-4 h-4 text-primary" />
          <span className="text-[11px] font-medium tracking-tight">AniList</span>
        </button>
        <button onClick={() => setCurrentView('annotations')} className="flex items-center flex-none snap-start gap-2 px-4 py-2 rounded-full bg-secondary/20 border border-border/40 hover:bg-secondary/40 active:scale-95 transition-all">
          <Highlighter className="w-4 h-4 text-primary" />
          <span className="text-[11px] font-medium tracking-tight">Annotations</span>
        </button>
        <button onClick={() => setCurrentView('statistics')} className="flex items-center flex-none snap-start gap-2 px-4 py-2 rounded-full bg-secondary/20 border border-border/40 hover:bg-secondary/40 active:scale-95 transition-all">
          <BarChart2 className="w-4 h-4 text-primary" />
          <span className="text-[11px] font-medium tracking-tight">Statistics</span>
        </button>
        <button onClick={() => setCurrentView('rss-feeds')} className="flex items-center flex-none snap-start gap-2 px-4 py-2 rounded-full bg-secondary/20 border border-border/40 hover:bg-secondary/40 active:scale-95 transition-all">
          <Rss className="w-4 h-4 text-primary" />
          <span className="text-[11px] font-medium tracking-tight">RSS</span>
        </button>
        {enableRecycleBin && (
          <button onClick={() => setCurrentView('recycle-bin' as any)} className="flex items-center flex-none snap-start gap-2 px-4 py-2 rounded-full bg-secondary/20 border border-border/40 hover:bg-secondary/40 active:scale-95 transition-all">
            <Trash2 className="w-4 h-4 text-destructive" />
            <span className="text-[11px] font-medium tracking-tight text-destructive">Trash</span>
          </button>
        )}
        <button onClick={onOpenSettings} className="flex items-center flex-none snap-start gap-2 px-4 py-2 rounded-full bg-secondary/20 border border-border/40 hover:bg-secondary/40 active:scale-95 transition-all">
          <Settings className="w-4 h-4 text-muted-foreground" />
          <span className="text-[11px] font-medium tracking-tight text-muted-foreground">Settings</span>
        </button>
      </div>
    </div>
  )
}

export function HomePage({ onOpenBook, onViewRSS, searchQuery = "", onSearchChange = () => {}, onOpenAdvancedFilter = () => {}, onOpenSettings = () => {} }: HomePageProps) {
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


  const domain = currentDomain


  // Load all Home Data from SQLite directly
  const loadHomeData = useCallback(async () => {
    try {
      const stats = await api.getLibraryStats();
      setLibraryStats(stats);

      // 1. Recently Added
      const recent = await api.getBooksByDomain(domain, 12, 0);

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
        api.getBooksByReadingStatus('completed', 12, 0),
        api.getBooksByReadingStatus('on_hold', 12, 0),
        api.getRecommendedBooks(15)
      ]);
      const domainRecommended = (recommended as unknown as Book[]).filter(b =>
        domain === 'manga_comics' ? isMangaDomain(b) : !isMangaDomain(b)
      );;

      // 5. Reading Progress Map
      const bookIdsToFetch = [...domainReading, ...recent, ...domainFavs].slice(0, 30).map(b => b.id!);
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
      setContinueReading(domainReading.slice(0, 12));
      setAllInProgress(readingBooks.length);
      setLastReadBooks(domainReading.slice(0, 12));
      setFavoriteBooks(domainFavs.slice(0, 12));
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



  const handleOpenBook = (book: Book) => {
    onOpenBook(book.id!)
  }

  const handleViewLibrary = () => {
    setCurrentView('library')
  }

  const handleViewOnlineBooks = () => {
    setCurrentView('online-books')
  }

  const handleViewOnlineManga = () => {
    setCurrentView('online-manga')
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
      className="home-bento-layout p-6 max-w-[1400px] mx-auto"
      variants={containerVariants}
      initial="hidden"
      animate="show"
    >
      <MobileStickyHeader 
        searchQuery={searchQuery} 
        onSearchChange={onSearchChange} 
        onOpenAdvancedFilter={onOpenAdvancedFilter}
      />
      <MobileQuickLinks onOpenSettings={onOpenSettings} />
      {/* ── ROW 1: THE "NOW" ROW ── */}
      <div className="bento-row now-row">
        {continueReading.length > 0 ? (
          <div className="bento-widget p-0 overflow-hidden flex flex-col h-full border-none bg-transparent">
            <FeaturedContinueCard 
              book={continueReading[0]} 
              progress={progressMap[continueReading[0].id!] || { progressPercent: 0, book_id: continueReading[0].id!, total_seconds: 0 } as any} 
              onOpenBook={handleOpenBook} 
              isManga={domain === 'manga_comics'}
            />
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
            {continueReading.slice(1, 4).map(book => (
              <div key={book.id} onClick={() => handleOpenBook(book)} className="bento-list-item">
                <div className="bento-list-cover-wrapper">
                  <img src={convertFileSrc(book.cover_path || '')} className="bento-list-cover" alt="" onError={(e) => e.currentTarget.src = ''} />
                </div>
                <div className="bento-list-info">
                  <span className="bento-list-title">{book.title}</span>
                  <span className="bento-list-meta">{progressMap[book.id!]?.progressPercent ?? 0}% completed</span>
                  <div className="bento-progress-track">
                    <div className="bento-progress-bar" style={{ width: `${progressMap[book.id!]?.progressPercent ?? 0}%` }} />
                  </div>
                </div>
              </div>
            ))}
            {continueReading.length <= 1 && (
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
            {recentlyAdded.slice(0, 5).map(book => (
              <div key={`recent-${book.id}`} onClick={() => handleOpenBook(book)} className="bento-list-item">
                <div className="bento-list-cover-wrapper">
                  <img src={convertFileSrc(book.cover_path || '')} className="bento-list-cover" alt="" onError={(e) => e.currentTarget.src = ''} />
                </div>
                <div className="bento-list-info">
                  <span className="bento-list-title">{book.title}</span>
                  <span className="bento-list-meta">Added to library</span>
                </div>
              </div>
            ))}
            {recentlyAdded.length === 0 && (
              <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                No recent activity.
              </div>
            )}
          </div>
        </div>

        {/* Recommended */}
        <div className="bento-widget hidden md:flex flex-col">
          <div className="bento-widget-header">
            <h2 className="bento-widget-title"><Sparkles size={18} /> Recommended</h2>
          </div>
          <div className="bento-widget-content overflow-y-auto pr-2" style={{ maxHeight: '300px' }}>
            {recommendedBooks.slice(0, 5).map(book => (
              <div key={`rec-${book.id}`} onClick={() => handleOpenBook(book)} className="bento-list-item">
                <div className="bento-list-cover-wrapper">
                  <img src={convertFileSrc(book.cover_path || '')} className="bento-list-cover" alt="" onError={(e) => e.currentTarget.src = ''} />
                </div>
                <div className="bento-list-info">
                  <span className="bento-list-title">{book.title}</span>
                  <span className="bento-list-meta">Suggested for you</span>
                </div>
              </div>
            ))}
            {recommendedBooks.length === 0 && (
              <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                Read more books to get recommendations.
              </div>
            )}
          </div>
        </div>

      </div>

      {/* ── ROW 3: COLLECTIONS ── */}
      <div className="bento-row collections-row hidden md:grid">
        
        {/* Online Discovery */}
        <div className="bento-widget compact cursor-pointer hover:border-primary/50" onClick={domain === 'manga_comics' ? handleViewOnlineManga : handleViewOnlineBooks}>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Globe size={24} />
            </div>
            <div>
              <h3 className="font-bold text-foreground text-lg">Discovery</h3>
              <p className="text-sm text-muted-foreground">Search and download</p>
            </div>
          </div>
        </div>
        {/* Favorites */}
        <div className="bento-widget compact cursor-pointer hover:border-primary/50" onClick={handleViewLibrary}>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-pink-500/10 flex items-center justify-center text-pink-500">
              <Heart size={24} />
            </div>
            <div>
              <h3 className="font-bold text-foreground text-lg tabular-nums tracking-tight">{favoriteBooks.length} Favorites</h3>
              <p className="text-sm text-muted-foreground">View your top picks</p>
            </div>
          </div>
        </div>

        {/* Completed */}
        <div className="bento-widget compact cursor-pointer hover:border-green-500/50" onClick={handleViewLibrary}>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center text-green-500">
              <CheckCircle2 size={24} />
            </div>
            <div>
              <h3 className="font-bold text-foreground text-lg tabular-nums tracking-tight">{completedBooks.length} Completed</h3>
              <p className="text-sm text-muted-foreground">Revisit finished works</p>
            </div>
          </div>
        </div>

        {/* On Hold */}
        <div className="bento-widget compact cursor-pointer hover:border-orange-500/50" onClick={handleViewLibrary}>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-orange-500/10 flex items-center justify-center text-orange-500">
              <PauseCircle size={24} />
            </div>
            <div>
              <h3 className="font-bold text-foreground text-lg tabular-nums tracking-tight">{onHoldBooks.length} On Hold</h3>
              <p className="text-sm text-muted-foreground">Pick up where you left off</p>
            </div>
          </div>
        </div>

      </div>
    </motion.div>
  )
}
