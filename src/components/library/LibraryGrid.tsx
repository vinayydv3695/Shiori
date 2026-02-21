/**
 * LibraryGrid — Shiori v3.0
 *
 * CSS Grid auto-fill + IntersectionObserver lazy entrance.
 * Domain filtering: books vs manga is hard-separated.
 * Staggered card animation based on render index.
 */

import { useMemo } from 'react'
import type { Book } from '@/lib/tauri'
import { PremiumBookCard } from './ModernBookCard'
import { useLibraryStore } from '@/store/libraryStore'
import type { DomainView } from '@/store/uiStore'
import {
  IconBookOpen,
  IconManga,
  IconImportBook,
  IconImportManga,
} from '@/components/icons/ShioriIcons'

interface LibraryGridProps {
  books: Book[]
  currentDomain?: DomainView
  onBookClick?: (bookId: number) => void
  onEditBook?: (bookId: number) => void
  onDeleteBook?: (bookId: number) => void
  onDownloadBook?: (bookId: number) => void
  onConvertBook?: (bookId: number) => void
  onShareBook?: (bookId: number) => void
  onImportBooks?: () => void
  onImportManga?: () => void
}

// ─── Domain Empty State ──────────────────────
interface EmptyStateProps {
  domain: DomainView
  hasFilters: boolean
  onImport?: () => void
}

const EmptyState = ({ domain, hasFilters, onImport }: EmptyStateProps) => {
  const isManga = domain === 'manga'

  if (hasFilters) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20 text-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
          {isManga ? (
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
        {isManga ? (
          <IconManga size={32} className="text-muted-foreground/35" />
        ) : (
          <IconBookOpen size={32} className="text-muted-foreground/35" />
        )}
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">
          {isManga ? 'Your manga library is empty' : 'Your book library is empty'}
        </p>
        <p className="text-xs text-muted-foreground mt-1.5 max-w-[240px]">
          {isManga
            ? 'Import CBZ or CBR archives to start reading manga here.'
            : 'Import ePub, PDF, or other ebook formats to get started.'}
        </p>
      </div>
      {onImport && (
        <button
          onClick={onImport}
          className="flex items-center gap-2 h-8 px-4 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/85 transition-colors"
        >
          {isManga ? <IconImportManga size={14} /> : <IconImportBook size={14} />}
          {isManga ? 'Import Manga' : 'Import Books'}
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
  onEditBook,
  onDeleteBook,
  onDownloadBook,
  onConvertBook,
  onShareBook,
  onImportBooks,
  onImportManga,
}: LibraryGridProps) {
  const { setSelectedBook, selectedBookIds, toggleBookSelection } = useLibraryStore()

  // Hard domain filter — strict separation between books and manga
  const visibleLibrary = useMemo(() => {
    return books.filter((book) => {
      const fmt = book.file_format?.toLowerCase()
      const isManga = fmt === 'cbz' || fmt === 'cbr'
      return currentDomain === 'manga' ? isManga : !isManga
    })
  }, [books, currentDomain])

  const handleOpen = (bookId: number) => {
    const book = books.find((b) => b.id === bookId)
    if (book) setSelectedBook(book)
    onBookClick?.(bookId)
  }

  const isEmpty = visibleLibrary.length === 0

  return (
    <div className="flex flex-col h-full">
      {isEmpty ? (
        <EmptyState
          domain={currentDomain}
          hasFilters={books.length > 0} // books exist globally but filtered away
          onImport={currentDomain === 'manga' ? onImportManga : onImportBooks}
        />
      ) : (
        <div
          className="library-grid"
          role="list"
          aria-label={`${currentDomain === 'manga' ? 'Manga' : 'Books'} library`}
        >
          {visibleLibrary.map((book, index) => (
            <div key={book.id} role="listitem">
              <PremiumBookCard
                book={book}
                isSelected={selectedBookIds.has(book.id!)}
                onSelect={toggleBookSelection}
                onOpen={handleOpen}
                onEdit={(id) => onEditBook?.(id)}
                onDelete={(id) => onDeleteBook?.(id)}
                onDownload={(id) => onDownloadBook?.(id)}
                onConvert={onConvertBook ? (id) => onConvertBook(id) : undefined}
                onShare={onShareBook ? (id) => onShareBook(id) : undefined}
                animationDelay={Math.min(index * 20, 300)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
