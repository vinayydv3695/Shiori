/**
 * LibraryGrid — Shiori v3.1 (performance)
 *
 * CSS Grid auto-fill + IntersectionObserver lazy entrance.
 * Domain filtering: books vs manga is hard-separated.
 * Staggered card animation based on render index.
 *
 * Performance improvements vs v3.0:
 * - coverSize read once at grid level, passed as prop (removes N Zustand subscriptions)
 * - onFavorite memoized with useCallback (stable reference across renders)
 * - handleOpen uses a Map lookup instead of O(n) Array.find()
 * - cover prefetch is windowed to virtual rows (not full dataset)
 */

import { useMemo, useRef, useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import type { Book } from '@/lib/tauri'
import { api } from '@/lib/tauri'
import { PremiumBookCard } from './ModernBookCard'
import { SeriesCard } from './SeriesCard'
import { useLibraryStore } from '@/store/libraryStore'
import type { DomainView } from '@/store/uiStore'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useGroupedLibrary, type SeriesGroup } from '@/hooks/useGroupedLibrary'
import {
  IconBookOpen,
  IconManga,
  IconImportBook,
  IconImportManga,
} from '@/components/icons/ShioriIcons'
import { FeatureHint } from '@/components/ui/FeatureHint'
import { usePreferencesStore } from '@/store/preferencesStore'
import { prefetchCovers } from '@/lib/coverCache'

const COVER_PREFETCH_BATCH_LIMIT = 120

interface LibraryGridProps {
  books: Book[]
  currentDomain?: DomainView
  onBookClick?: (bookId: number) => void
  onViewDetails?: (bookId: number) => void
  onEditBook?: (bookId: number) => void
  onDeleteBook?: (bookId: number) => void
  onConvertBook?: (bookId: number) => void
  onImport?: () => void
  onViewSeries?: (series: SeriesGroup) => void
}

// ─── Domain Empty State ──────────────────────
interface EmptyStateProps {
  domain: DomainView
  hasFilters: boolean
  onImport?: () => void
}

const EmptyState = ({ domain, hasFilters, onImport }: EmptyStateProps) => {
  const isMangaComics = domain === 'manga_comics'

  const iconVariants = {
    initial: { y: 0 },
    animate: {
      y: [-8, 8, -8],
      transition: { duration: 6, repeat: Infinity, ease: "easeInOut" }
    }
  }

  if (hasFilters) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20 text-center gap-3">
        <motion.div 
          variants={iconVariants as any}
          initial="initial"
          animate="animate"
          className="w-14 h-14 rounded-2xl bg-muted/80 backdrop-blur-sm border border-border/50 shadow-sm flex items-center justify-center"
        >
          {isMangaComics ? (
            <IconManga size={28} className="text-muted-foreground/60" />
          ) : (
            <IconBookOpen size={28} className="text-muted-foreground/60" />
          )}
        </motion.div>
        <div className="mt-2">
          <p className="text-sm font-semibold text-foreground">No results</p>
          <p className="text-xs text-muted-foreground mt-1">Try clearing your filters</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center h-full py-20 text-center gap-4 px-8">
      <motion.div 
        variants={iconVariants as any}
        initial="initial"
        animate="animate"
        className="w-16 h-16 rounded-2xl bg-primary/5 border border-primary/20 shadow-inner flex items-center justify-center relative"
      >
        <div className="absolute inset-0 bg-primary/10 rounded-2xl blur-xl" />
        {isMangaComics ? (
          <IconManga size={32} className="text-primary/70 relative z-10" />
        ) : (
          <IconBookOpen size={32} className="text-primary/70 relative z-10" />
        )}
      </motion.div>
      <div className="mt-2">
        <p className="text-base font-semibold text-foreground">
          {isMangaComics ? 'Your manga & comics library is empty' : 'Your book library is empty'}
        </p>
        <p className="text-sm text-muted-foreground mt-1.5 max-w-[280px] mx-auto leading-relaxed">
          {isMangaComics
            ? 'Import CBZ or CBR archives to start reading manga and comics here.'
            : 'Import ePub, PDF, or other ebook formats to get started.'}
        </p>
      </div>
      {onImport && (
        <button
          onClick={onImport}
          className="mt-2 flex items-center gap-2 h-9 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 transition-all"
        >
          {isMangaComics ? <IconImportManga size={16} /> : <IconImportBook size={16} />}
          Import Books/Manga/Comics
        </button>
      )}
    </div>
  )
}

// ─── Grid ─────────────────────────────────────
export function LibraryGrid({
  books,
  currentDomain = 'books',
  onBookClick,
  onViewDetails,
  onEditBook,
  onDeleteBook,
  onConvertBook,
  onImport,
  onViewSeries,
}: LibraryGridProps) {
  const setSelectedBook = useLibraryStore(state => state.setSelectedBook)
  const selectedBookIds = useLibraryStore(state => state.selectedBookIds)
  const toggleBookSelection = useLibraryStore(state => state.toggleBookSelection)
  const hasMore = useLibraryStore(state => state.hasMore)
  const isLoading = useLibraryStore(state => state.isLoading)
  const loadMoreBooks = useLibraryStore(state => state.loadMoreBooks)
  const favoriteBookIds = useLibraryStore(state => state.favoriteBookIds)
  const toggleFavorite = useLibraryStore(state => state.toggleFavorite)
  // Read preferences once at grid level — avoids N subscriptions inside each card
  const libraryDensity = usePreferencesStore(state => state.preferences?.libraryDensity)
  const coverSize = usePreferencesStore(state => state.preferences?.coverSize ?? 'medium')

  const densityColumnSize = libraryDensity === 'compact' ? 140 : libraryDensity === 'spacious' ? 240 : 180
  const estimatedRowHeight = useMemo(() => {
    const coverHeight = densityColumnSize * 1.5 // 2:3 aspect ratio
    const metadataHeight = coverSize === 'small' ? 42 : coverSize === 'large' ? 72 : 56
    const rowPadding = 6 // 3px top + 3px bottom
    const rowVerticalGap = 3
    return Math.ceil(coverHeight + metadataHeight + rowPadding + rowVerticalGap)
  }, [densityColumnSize, coverSize])

  const [isFirstSeries, setIsFirstSeries] = useState(true)
  const prefetchedCoverIdsRef = useRef<Set<number>>(new Set())

  // Hard domain filter — strict separation between books and manga & comics
  const visibleLibrary = useMemo(() => {
    return books.filter((book) => {
      const fmt = book.file_format?.toLowerCase()
      const isMangaComics = fmt === 'cbz' || fmt === 'cbr'
      return currentDomain === 'manga_comics' ? isMangaComics : !isMangaComics
    })
  }, [books, currentDomain])

  // Group only for manga/comics domain. Grouping huge books domain is expensive and unnecessary.
  const groupedItems = useGroupedLibrary(visibleLibrary, currentDomain === 'manga_comics')

  // O(1) book lookup by ID (replaces O(n) Array.find on every click)
  const bookById = useMemo(() => {
    const map = new Map<number, Book>()
    for (const book of books) {
      if (book.id != null) map.set(book.id, book)
    }
    return map
  }, [books])

  const handleOpen = useCallback((bookId: number) => {
    const book = bookById.get(bookId)
    if (book) setSelectedBook(book)
    onBookClick?.(bookId)
  }, [bookById, setSelectedBook, onBookClick])

  // Stable favorite handler — not recreated on every render
  const handleFavorite = useCallback(async (id: number) => {
    await api.toggleBookFavorite(id)
    toggleFavorite(id)
  }, [toggleFavorite])

  const isEmpty = visibleLibrary.length === 0

  const parentRef = useRef<HTMLDivElement>(null)
  const [columns, setColumns] = useState(6)

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width) {
        setColumns(Math.max(2, Math.floor(width / densityColumnSize)))
      }
    })

    if (parentRef.current) {
      observer.observe(parentRef.current)
    }

    return () => observer.disconnect()
  }, [densityColumnSize])

  const rowsCount = Math.ceil(groupedItems.length / columns)

  // TanStack Virtual v3 is compatible with React 19
  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: rowsCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimatedRowHeight,
    overscan: 3,
  })

  const virtualItems = rowVirtualizer.getVirtualItems()
  const lastItem = virtualItems[virtualItems.length - 1]

  useEffect(() => {
    if (!lastItem) return

    if (lastItem.index >= rowsCount - 2 && hasMore && !isLoading) {
      loadMoreBooks()
    }
  }, [lastItem, hasMore, isLoading, loadMoreBooks, rowsCount])

  // Windowed cover prefetch: only prefetch books in/near current virtual rows.
  useEffect(() => {
    if (virtualItems.length === 0) return

    const idsToPrefetch: number[] = []

    for (const virtualRow of virtualItems) {
      const startIndex = virtualRow.index * columns
      const rowItems = groupedItems.slice(startIndex, startIndex + columns)

      for (const item of rowItems) {
        if (item.type === 'book') {
          if (item.data.id != null) idsToPrefetch.push(item.data.id)
          continue
        }

        const firstVolumeId = item.data.books[0]?.id
        if (firstVolumeId != null) idsToPrefetch.push(firstVolumeId)
      }
    }

    if (idsToPrefetch.length === 0) return

    const uniqueNewIds = Array.from(new Set(idsToPrefetch)).filter(id => !prefetchedCoverIdsRef.current.has(id))
    if (uniqueNewIds.length === 0) return

    const batch = uniqueNewIds.slice(0, COVER_PREFETCH_BATCH_LIMIT)
    for (const id of batch) prefetchedCoverIdsRef.current.add(id)

    void prefetchCovers(batch)
  }, [virtualItems, groupedItems, columns])

  return (
    <div className="flex flex-col h-full w-full relative overflow-y-auto" ref={parentRef}>
      {isEmpty ? (
        <EmptyState
          domain={currentDomain}
          hasFilters={books.length > 0}
          onImport={onImport}
        />
      ) : (
        <div
          style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}
          role="grid"
          aria-label={`${currentDomain === 'manga_comics' ? 'Manga & Comics' : 'Books'} library`}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const startIndex = virtualRow.index * columns
            const rowItems = groupedItems.slice(startIndex, startIndex + columns)

            return (
              <div
                key={virtualRow.index}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                  display: 'flex',
                  gap: '12px',
                  padding: '3px 12px',
                }}
                role="row"
              >
                {rowItems.map((item, idx) => {
                  const absoluteIndex = startIndex + idx
                  return (
                    <div
                      key={item.type === 'book' ? `book-${item.data.id}` : `series-${item.data.id}`}
                      role="gridcell"
                      style={{ flex: '1 1 0', minWidth: 0 }}
                    >
                      {item.type === 'book' ? (
                        <PremiumBookCard
                          book={item.data}
                          coverSize={coverSize}
                          isSelected={selectedBookIds.has(item.data.id!)}
                          onSelect={toggleBookSelection}
                          onOpen={handleOpen}
                          onViewDetails={(id) => onViewDetails?.(id)}
                          onEdit={(id) => onEditBook?.(id)}
                          onDelete={(id) => onDeleteBook?.(id)}
                          onConvert={onConvertBook ? (id) => onConvertBook(id) : undefined}
                          isFavorited={favoriteBookIds.has(item.data.id!)}
                          onFavorite={handleFavorite}
                          animationDelay={Math.min(absoluteIndex * 10, 150)}
                          scrollRoot={parentRef.current}
                        />
                      ) : (
                        <>
                          {isFirstSeries && item.type === 'series' ? (
                            <FeatureHint
                              featureId="manga-series-card"
                              title="Series Grouping Active"
                              description="Manga volumes are now grouped by series! Click to view all volumes, or right-click to manage the series."
                              position="top"
                            >
                              <SeriesCard
                                series={item.data}
                                isSelected={false}
                                onSelect={() => {}}
                               onOpen={(series) => {
                                  setIsFirstSeries(false)
                                  onViewSeries?.(series)
                                }}
                                animationDelay={Math.min(absoluteIndex * 10, 150)}
                                scrollRoot={parentRef.current}
                              />
                            </FeatureHint>
                          ) : (
                            <SeriesCard
                              series={item.data}
                              isSelected={false}
                              onSelect={() => {}}
                               onOpen={(series) => {
                                 onViewSeries?.(series)
                               }}
                              animationDelay={Math.min(absoluteIndex * 10, 150)}
                              scrollRoot={parentRef.current}
                            />
                          )}
                        </>
                      )}
                    </div>
                  )
                })}
                {Array.from({ length: columns - rowItems.length }).map((_, i) => (
                  <div key={`empty-${i}`} style={{ flex: '1 1 0' }} />
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
