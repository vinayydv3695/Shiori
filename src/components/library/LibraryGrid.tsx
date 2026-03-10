/**
 * LibraryGrid — Shiori v3.0
 *
 * CSS Grid auto-fill + IntersectionObserver lazy entrance.
 * Domain filtering: books vs manga is hard-separated.
 * Staggered card animation based on render index.
 */

import { useMemo, useRef, useEffect, useState } from 'react'
import type { Book } from '@/lib/tauri'
import { api } from '@/lib/tauri'
import { PremiumBookCard } from './ModernBookCard'
import { SeriesCard } from './SeriesCard'
import { useLibraryStore } from '@/store/libraryStore'
import type { DomainView } from '@/store/uiStore'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useGroupedLibrary, type SeriesGroup, type GroupedItem } from '@/hooks/useGroupedLibrary'
import {
  IconBookOpen,
  IconManga,
  IconImportBook,
  IconImportManga,
} from '@/components/icons/ShioriIcons'
import { FeatureHint } from '@/components/ui/FeatureHint'
import { usePreferencesStore } from '@/store/preferencesStore'

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

  if (hasFilters) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20 text-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
          {isMangaComics ? (
            <IconManga size={28} className="text-muted-foreground/40" />
          ) : (
            <IconBookOpen size={28} className="text-muted-foreground/40" />
          )}
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">No results</p>
          <p className="text-xs text-muted-foreground mt-1">Try clearing your filters</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center h-full py-20 text-center gap-4 px-8">
      <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
        {isMangaComics ? (
          <IconManga size={32} className="text-muted-foreground/35" />
        ) : (
          <IconBookOpen size={32} className="text-muted-foreground/35" />
        )}
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">
          {isMangaComics ? 'Your manga & comics library is empty' : 'Your book library is empty'}
        </p>
        <p className="text-xs text-muted-foreground mt-1.5 max-w-[240px]">
          {isMangaComics
            ? 'Import CBZ or CBR archives to start reading manga and comics here.'
            : 'Import ePub, PDF, or other ebook formats to get started.'}
        </p>
      </div>
      {onImport && (
        <button
          onClick={onImport}
          className="flex items-center gap-2 h-8 px-4 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/85 transition-colors"
        >
          {isMangaComics ? <IconImportManga size={14} /> : <IconImportBook size={14} />}
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
  const libraryDensity = usePreferencesStore(state => state.preferences?.libraryDensity)

  const densityColumnSize = libraryDensity === 'compact' ? 140 : libraryDensity === 'spacious' ? 240 : 180

  const [selectedSeries, setSelectedSeries] = useState<SeriesGroup | null>(null)
  const [isFirstSeries, setIsFirstSeries] = useState(true)

  // Hard domain filter — strict separation between books and manga & comics
  const visibleLibrary = useMemo(() => {
    return books.filter((book) => {
      const fmt = book.file_format?.toLowerCase()
      const isMangaComics = fmt === 'cbz' || fmt === 'cbr'
      return currentDomain === 'manga_comics' ? isMangaComics : !isMangaComics
    })
  }, [books, currentDomain])

  // Apply grouping for ALL domains (books can have series too)
  const groupedItems = useGroupedLibrary(visibleLibrary, true)

  const handleOpen = (bookId: number) => {
    const book = books.find((b) => b.id === bookId)
    if (book) setSelectedBook(book)
    onBookClick?.(bookId)
  }

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
    estimateSize: () => 300,
    overscan: 2,
  })

  const virtualItems = rowVirtualizer.getVirtualItems()
  const lastItem = virtualItems[virtualItems.length - 1]

  useEffect(() => {
    if (!lastItem) return

    if (lastItem.index >= rowsCount - 2 && hasMore && !isLoading) {
      loadMoreBooks()
    }
  }, [lastItem, hasMore, isLoading, loadMoreBooks, rowsCount])

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
                  padding: '12px',
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
                          isSelected={selectedBookIds.has(item.data.id!)}
                          onSelect={toggleBookSelection}
                          onOpen={handleOpen}
                          onViewDetails={(id) => onViewDetails?.(id)}
                          onEdit={(id) => onEditBook?.(id)}
                          onDelete={(id) => onDeleteBook?.(id)}
                          onConvert={onConvertBook ? (id) => onConvertBook(id) : undefined}
                          isFavorited={favoriteBookIds.has(item.data.id!)}
                          onFavorite={async (id) => {
                            await api.toggleBookFavorite(id)
                            toggleFavorite(id)
                          }}
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
                                  setSelectedSeries(series)
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
                                setSelectedSeries(series)
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
