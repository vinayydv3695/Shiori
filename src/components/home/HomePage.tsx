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
import { useMemo, useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BookOpen, Clock, Sparkles, Rss, ArrowRight,
  ListOrdered, Activity, HardDrive, Heart, History, CheckCircle2, PauseCircle
} from 'lucide-react'
import { HomeSection, ScrollStrip } from './HomeSection'
import { ContinueReadingCard, RecentlyAddedCard } from './ContinueReadingCard'
import { FeaturedContinueCard } from './FeaturedContinueCard'
import { useLibraryStore } from '@/store/libraryStore'
import { useUIStore, type DomainView } from '@/store/uiStore'
import type { Book, ReadingProgress } from '@/lib/tauri'
import { api } from '@/lib/tauri'
import { formatFileSize } from '@/lib/utils'

// ── Shared constant ──────────────────────────────
const MANGA_FORMATS = ['cbz', 'cbr']

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
             src={api.convertFileSrc(featuredBook.cover_path)} 
             alt="" 
             className="hero-dynamic-bg opacity-30 blur-[100px] absolute inset-0 w-full h-full object-cover mix-blend-screen pointer-events-none transition-all duration-1000"
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
}

export function HomePage({ onOpenBook, onViewRSS }: HomePageProps) {
  const allBooks = useLibraryStore(s => s.books)
  const favoriteBookIds = useLibraryStore(s => s.favoriteBookIds)
  const currentDomain = useUIStore(state => state.currentDomain);
  const setCurrentView = useUIStore(state => state.setCurrentView);
  const [progressMap, setProgressMap] = useState<Record<number, ReadingProgress>>({})
  const [completedBooks, setCompletedBooks] = useState<Book[]>([])
  const [onHoldBooks, setOnHoldBooks] = useState<Book[]>([])
  const [continueReading, setContinueReading] = useState<Book[]>([])
  const [recentlyAdded, setRecentlyAdded] = useState<Book[]>([])
  const [favoriteBooks, setFavoriteBooks] = useState<Book[]>([])
  const [lastReadBooks, setLastReadBooks] = useState<Book[]>([])
  const [allInProgress, setAllInProgress] = useState<number>(0)


  const domain = currentDomain

  const totalSize = allBooks.reduce((sum, b) => sum + (b.file_size || 0), 0)

  // Load all Home Data from SQLite directly
  const loadHomeData = useCallback(async () => {
    try {
      // 1. Recently Added
      const recent = await api.getBooksByDomain(domain, 12, 0);

      // 2. Continue Reading (Reading Status)
      const readingBooks = await api.getBooksByReadingStatus('reading', 50, 0);
      const domainReading = readingBooks.filter(b => 
        domain === 'manga_comics' ? MANGA_FORMATS.includes(b.file_format?.toLowerCase() || '') 
                                  : !MANGA_FORMATS.includes(b.file_format?.toLowerCase() || '')
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
        domain === 'manga_comics' ? MANGA_FORMATS.includes(b.file_format?.toLowerCase() || '') 
                                  : !MANGA_FORMATS.includes(b.file_format?.toLowerCase() || '')
      );

      // 4. Completed & On Hold
      const [completed, onHold] = await Promise.all([
        api.getBooksByReadingStatus('completed', 12, 0),
        api.getBooksByReadingStatus('on_hold', 12, 0),
      ]);

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
      setCompletedBooks(completed.filter(b => 
        domain === 'manga_comics' ? MANGA_FORMATS.includes(b.file_format?.toLowerCase() || '') 
                                  : !MANGA_FORMATS.includes(b.file_format?.toLowerCase() || '')
      ));
      setOnHoldBooks(onHold.filter(b => 
        domain === 'manga_comics' ? MANGA_FORMATS.includes(b.file_format?.toLowerCase() || '') 
                                  : !MANGA_FORMATS.includes(b.file_format?.toLowerCase() || '')
      ));
      setProgressMap(map);
    } catch (err) {
      logger.error('Failed to load home data', err);
    }
  }, [domain, favoriteBookIds]);

  useEffect(() => {
    loadHomeData();
  }, [loadHomeData]);

  const loadProgress = useCallback(async () => {
    const openedBooks = allBooks.filter((b) => b.last_opened && b.id)
    const bookIds = openedBooks.slice(0, 30).map(b => b.id!);
    
    if (bookIds.length === 0) return;
    
    try {
      const batchResult = await api.getReadingProgressBatch(bookIds);
      const map: Record<number, ReadingProgress> = {}
      for (const [id, progress] of Object.entries(batchResult)) {
        if (progress.progressPercent > 0 && progress.progressPercent < 100) {
          map[Number(id)] = progress;
        }
      }
      setProgressMap(map)
    } catch (err) {
      logger.error('Failed to load reading progress batch:', err)
    }
  }, [allBooks])

  useEffect(() => {
    // Intentional: loading data on mount/dependency change
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadProgress()
  }, [loadProgress])


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
  if (allBooks.length === 0) {
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
      className="home-page"
      variants={containerVariants}
      initial="hidden"
      animate="show"
    >
      {/* ── Bento Grid: Hero & Featured ── */}
      <div className="home-bento-grid">
        <HeroSection
          totalBooks={allBooks.filter(b => !MANGA_FORMATS.includes(b.file_format?.toLowerCase() || "")).length}
          totalManga={allBooks.filter(b => MANGA_FORMATS.includes(b.file_format?.toLowerCase() || "")).length}
          totalSize={totalSize}
          booksInProgress={allInProgress}
          domain={domain}
          onViewLibrary={handleViewLibrary}
          featuredBook={continueReading[0] || recentlyAdded[0] || null}
        />

        {continueReading.length > 0 && (
          <div className="flex flex-col h-full">
            <FeaturedContinueCard 
              book={continueReading[0]} 
              progress={progressMap[continueReading[0].id!] || { progressPercent: 0, book_id: continueReading[0].id!, total_seconds: 0 } as any} 
              onOpenBook={handleOpenBook} 
              isManga={domain === 'manga_comics'}
            />
          </div>
        )}
      </div>

      <motion.div
        variants={itemVariants}
        className="home-quick-access"
      >
        <span className="home-quick-access-label">
          Quick access
        </span>
        <button
          type="button"
          onClick={handleViewOnlineBooks}
          className="home-quick-access-button"
        >
          Online Books
        </button>
        <button
          type="button"
          onClick={handleViewOnlineManga}
          className="home-quick-access-button"
        >
          Online Manga
        </button>
        <button
          type="button"
          onClick={() => setCurrentView('statistics')}
          className="home-quick-access-button"
        >
          View Statistics
        </button>
      </motion.div>

      {/* ── Continue Reading (Remaining) ── */}
      <AnimatePresence mode="wait">
        {continueReading.length > 1 && (
          <motion.div key="continue" variants={itemVariants}>
            <HomeSection
              icon={<Clock size={18} />}
              title="Continue Reading"
              action={{ label: 'View All', onClick: handleViewLibrary }}
              sectionType="continue"
            >
              <ScrollStrip>
                {continueReading.slice(1).map((book) => (
                  <div key={book.id}>
                    <ContinueReadingCard
                      book={book}
                      progress={progressMap[book.id!]?.progressPercent ?? 0}
                      domain={domain}
                      onClick={handleOpenBook}
                    />
                  </div>
                ))}
              </ScrollStrip>
            </HomeSection>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Favorites ── */}
      {favoriteBooks.length > 0 && (
        <motion.div variants={itemVariants}>
          <HomeSection
            icon={<Heart size={18} />}
            title="Favorites"
            action={{ label: 'View All', onClick: handleViewLibrary }}
            sectionType="favorites"
          >
            <ScrollStrip>
              {favoriteBooks.map((book) => (
                <div key={book.id}>
                  <ContinueReadingCard
                    book={book}
                    progress={progressMap[book.id!]?.progressPercent ?? 0}
                    domain={domain}
                    onClick={handleOpenBook}
                  />
                </div>
              ))}
            </ScrollStrip>
          </HomeSection>
        </motion.div>
      )}

      {/* ── Completed ── */}
      {completedBooks.length > 0 && (
        <motion.div variants={itemVariants}>
          <HomeSection
            icon={<CheckCircle2 size={18} />}
            title="Completed"
            action={{ label: 'View All', onClick: handleViewLibrary }}
            sectionType="completed"
          >
            <ScrollStrip>
              {completedBooks.map((book) => (
                <div key={book.id}>
                  <ContinueReadingCard
                    book={book}
                    progress={100}
                    domain={domain}
                    onClick={handleOpenBook}
                  />
                </div>
              ))}
            </ScrollStrip>
          </HomeSection>
        </motion.div>
      )}

      {/* ── On Hold ── */}
      {onHoldBooks.length > 0 && (
        <motion.div variants={itemVariants}>
          <HomeSection
            icon={<PauseCircle size={18} />}
            title="On Hold"
            action={{ label: 'View All', onClick: handleViewLibrary }}
            sectionType="on-hold"
          >
            <ScrollStrip>
              {onHoldBooks.map((book) => (
                <div key={book.id}>
                  <ContinueReadingCard
                    book={book}
                    progress={progressMap[book.id!]?.progressPercent ?? 0}
                    domain={domain}
                    onClick={handleOpenBook}
                  />
                </div>
              ))}
            </ScrollStrip>
          </HomeSection>
        </motion.div>
      )}

      {/* ── Last Read ── */}
      {lastReadBooks.length > 0 && (
        <motion.div variants={itemVariants}>
          <HomeSection
            icon={<History size={18} />}
            title="Last Read"
            action={{ label: 'View All', onClick: handleViewLibrary }}
            sectionType="history"
          >
            <ScrollStrip>
              {lastReadBooks.map((book) => (
                <div key={book.id}>
                  <ContinueReadingCard
                    book={book}
                    progress={progressMap[book.id!]?.progressPercent ?? 0}
                    domain={domain}
                    onClick={handleOpenBook}
                  />
                </div>
              ))}
            </ScrollStrip>
          </HomeSection>
        </motion.div>
      )}

      {/* ── Recently Added ── */}
      <motion.div variants={itemVariants}>
        <HomeSection
          icon={<Sparkles size={18} />}
          title="Recently Added"
          action={{ label: 'View All', onClick: handleViewLibrary }}
          sectionType="recent"
        >
          <ScrollStrip>
            {recentlyAdded.map((book) => (
              <div key={book.id}>
                <RecentlyAddedCard
                  book={book}
                  onClick={handleOpenBook}
                />
              </div>
            ))}
          </ScrollStrip>
        </HomeSection>
      </motion.div>

      {/* ── RSS Preview (books domain only) ── */}
      {domain === 'books' && (
        <motion.div variants={itemVariants}>
          <div className="home-divider" />
          <HomeSection
            icon={<Rss size={18} />}
            title="Latest News"
            action={{ label: 'View All', onClick: onViewRSS }}
          >
            <div className="rss-preview-list">
              <motion.div
                className="rss-preview-item"
                onClick={onViewRSS}
                whileHover={{ x: 4 }}
                transition={{ duration: 0.15 }}
              >
                <div className="rss-preview-title">Check your RSS feeds for the latest book news</div>
                <ArrowRight size={14} className="text-muted-foreground" />
              </motion.div>
            </div>
          </HomeSection>
        </motion.div>
      )}
    </motion.div>
  )
}
