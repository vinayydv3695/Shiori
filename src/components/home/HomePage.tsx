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

import { useMemo, useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BookOpen, Clock, Sparkles, Rss, Library, ArrowRight,
  TrendingUp, BarChart3,
} from 'lucide-react'
import { HomeSection } from './HomeSection'
import { ContinueReadingCard, RecentlyAddedCard } from './ContinueReadingCard'
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
}: {
  totalBooks: number
  totalManga: number
  totalSize: number
  booksInProgress: number
  domain: DomainView
  onViewLibrary: () => void
}) {
  const timeOfDay = useMemo(() => {
    const hour = new Date().getHours()
    if (hour < 12) return 'morning'
    if (hour < 17) return 'afternoon'
    return 'evening'
  }, [])

  const greeting = `Good ${timeOfDay}`

  return (
    <motion.div className="hero-section" variants={itemVariants}>
      {/* Background gradient orbs */}
      <div className="hero-bg">
        <div className="hero-orb hero-orb-1" />
        <div className="hero-orb hero-orb-2" />
        <div className="hero-orb hero-orb-3" />
      </div>

      <div className="hero-content">
        <motion.div
          className="hero-text"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <h1 className="hero-greeting">{greeting}</h1>
          <p className="hero-subtitle">
            {booksInProgress > 0
              ? `You have ${booksInProgress} ${domain === 'manga' ? 'manga' : 'book'}${booksInProgress > 1 ? 's' : ''} in progress`
              : `Your personal ${domain === 'manga' ? 'manga' : 'book'} library`}
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
              <Library size={20} />
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
              <TrendingUp size={20} />
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
              <BarChart3 size={20} />
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
  const allBooks = useLibraryStore((s) => s.books)
  const { currentDomain, setCurrentView } = useUIStore()
  const [progressMap, setProgressMap] = useState<Record<number, ReadingProgress>>({})

  const domain = currentDomain

  // Split books vs manga
  const books = useMemo(
    () => allBooks.filter((b) => !MANGA_FORMATS.includes(b.file_format.toLowerCase())),
    [allBooks]
  )
  const manga = useMemo(
    () => allBooks.filter((b) => MANGA_FORMATS.includes(b.file_format.toLowerCase())),
    [allBooks]
  )

  const domainItems = domain === 'manga' ? manga : books
  const totalSize = allBooks.reduce((sum, b) => sum + (b.file_size || 0), 0)

  // Continue reading — items with progress
  const continueReading = useMemo(() => {
    return domainItems
      .filter((b) => b.last_opened && b.id && progressMap[b.id])
      .sort((a, b) => {
        const dateA = a.last_opened ? new Date(a.last_opened).getTime() : 0
        const dateB = b.last_opened ? new Date(b.last_opened).getTime() : 0
        return dateB - dateA
      })
      .slice(0, 10)
  }, [domainItems, progressMap])

  // Recently added
  const recentlyAdded = useMemo(() => {
    return [...domainItems]
      .sort((a, b) => new Date(b.added_date).getTime() - new Date(a.added_date).getTime())
      .slice(0, 12)
  }, [domainItems])

  // All items in progress (for hero count)
  const allInProgress = useMemo(() => {
    return allBooks.filter((b) => b.last_opened && b.id && progressMap[b.id]).length
  }, [allBooks, progressMap])

  // Load reading progress
  const loadProgress = useCallback(async () => {
    const openedBooks = allBooks.filter((b) => b.last_opened && b.id)
    const map: Record<number, ReadingProgress> = {}

    for (const book of openedBooks.slice(0, 30)) {
      try {
        const progress = await api.getReadingProgress(book.id!)
        if (progress && progress.progressPercent > 0 && progress.progressPercent < 100) {
          map[book.id!] = progress
        }
      } catch {
        // Skip books with no progress
      }
    }
    setProgressMap(map)
  }, [allBooks])

  useEffect(() => {
    loadProgress()
  }, [loadProgress])

  const handleOpenBook = (book: Book) => {
    onOpenBook(book.id!)
  }

  const handleViewLibrary = () => {
    setCurrentView('library')
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
        />
        <div className="home-empty">
          <BookOpen className="home-empty-icon" />
          <div className="home-empty-title">
            {domain === 'manga' ? 'No manga yet' : 'No books yet'}
          </div>
          <div className="home-empty-desc">
            {domain === 'manga'
              ? 'Import your manga archives (CBZ, CBR) using the Import button in the toolbar.'
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
      {/* ── Hero ── */}
      <HeroSection
        totalBooks={books.length}
        totalManga={manga.length}
        totalSize={totalSize}
        booksInProgress={allInProgress}
        domain={domain}
        onViewLibrary={handleViewLibrary}
      />

      {/* ── Continue Reading ── */}
      <AnimatePresence mode="wait">
        {continueReading.length > 0 && (
          <motion.div key="continue" variants={itemVariants}>
            <HomeSection
              icon={<Clock size={18} />}
              title="Continue Reading"
              action={{ label: 'View All', onClick: handleViewLibrary }}
            >
              <div className="scroll-strip">
                {continueReading.map((book, i) => (
                  <motion.div
                    key={book.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05, duration: 0.3 }}
                  >
                    <ContinueReadingCard
                      book={book}
                      progress={progressMap[book.id!]?.progressPercent ?? 0}
                      domain={domain}
                      onClick={handleOpenBook}
                    />
                  </motion.div>
                ))}
              </div>
            </HomeSection>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Recently Added ── */}
      <motion.div variants={itemVariants}>
        <HomeSection
          icon={<Sparkles size={18} />}
          title="Recently Added"
          action={{ label: 'View All', onClick: handleViewLibrary }}
        >
          <div className="scroll-strip">
            {recentlyAdded.map((book, i) => (
              <motion.div
                key={book.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04, duration: 0.3 }}
              >
                <RecentlyAddedCard
                  book={book}
                  onClick={handleOpenBook}
                />
              </motion.div>
            ))}
          </div>
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
