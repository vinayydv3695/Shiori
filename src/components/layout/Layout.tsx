/**
 * Layout — Shiori v3.0
 *
 * Shell structure:
 *   [PremiumTopbar]
 *   [FilterPanel | MainContent]
 *   [StatusBar]
 *
 * Sidebar toggle persisted in local state (could move to uiStore).
 * Import logic handles both Books (epub/pdf/…) and Manga (cbz/cbr).
 */

import type { ReactNode } from 'react'
import { useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'

import { PremiumTopbar } from './ImprovedToolbar'
import { FilterPanel } from '../sidebar/ModernSidebar'
import { StatusBar } from './ModernToolbar'
import { cn, formatFileSize } from '@/lib/utils'
import { api } from '@/lib/tauri'
import { useUIStore } from '@/store/uiStore'
import { useLibraryStore } from '@/store/libraryStore'
import { useToast } from '@/store/toastStore'

interface LayoutProps {
  children: ReactNode
  onOpenSettings: () => void
  onEditMetadata?: (bookId: number) => void
  onDeleteBook?: (bookId: number) => void
  onDeleteBooks?: (bookIds: number[]) => void
  onViewBook?: (bookId: number) => void
  onDownloadBook?: (bookId: number) => void
  onViewDetails?: (bookId: number) => void
  onConvertBook?: (bookId: number) => void
  onShareBook?: (bookId: number) => void
  onOpenRSSFeeds?: () => void
  onOpenRSSArticles?: () => void
  onBackToLibrary?: () => void
  searchQuery?: string
  onSearchChange?: (query: string) => void
  currentView?: 'library' | 'rss-feeds' | 'rss-articles'
  currentDomain?: 'books' | 'manga'
  onDomainChange?: (domain: 'books' | 'manga') => void
}

export function Layout({
  children,
  onOpenSettings,
  onEditMetadata,
  onDeleteBook,
  onDeleteBooks,
  onViewBook,
  onConvertBook,
  onOpenRSSFeeds,
  onSearchChange,
  currentDomain = 'books',
  onDomainChange = () => { },
}: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const toast = useToast()

  const {
    books,
    setBooks,
    selectedBookIds,
    selectedFilters,
    toggleFilter,
    clearFilters,
  } = useLibraryStore()

  // ── Library stats ──────────────────────────────
  const totalBooks = books.length
  const totalSize = books.reduce((sum, b) => sum + (b.file_size || 0), 0)
  const librarySize = totalSize > 0 ? formatFileSize(totalSize) : '0 B'

  // ── Filter data extraction ─────────────────────
  const getFilterItems = () => {
    const authorsSet = new Set<string>()
    const languagesSet = new Set<string>()
    const seriesSet = new Set<string>()
    const formatsSet = new Set<string>()
    const publishersSet = new Set<string>()
    const ratingsSet = new Set<string>()
    const tagsSet = new Set<string>()
    const identifiersSet = new Set<string>()

    books.forEach((book) => {
      book.authors?.forEach((a) => { if (a.name) authorsSet.add(a.name) })
      if (book.language) languagesSet.add(book.language)
      if (book.series) seriesSet.add(book.series)
      if (book.file_format) formatsSet.add(book.file_format.toUpperCase())
      if (book.publisher) publishersSet.add(book.publisher)
      if (book.rating) ratingsSet.add((Math.round(book.rating * 2) / 2).toString())
      book.tags?.forEach((t) => { if (t.name) tagsSet.add(t.name) })
      if (book.isbn) identifiersSet.add(`ISBN: ${book.isbn}`)
      if (book.isbn13) identifiersSet.add(`ISBN13: ${book.isbn13}`)
    })

    const toItems = (set: Set<string>) =>
      Array.from(set).sort().map((id) => ({ id, label: id, count: 0 }))

    const withCounts = (
      items: { id: string; label: string; count: number }[],
      getValues: (b: any) => string[],
    ) => {
      items.forEach((item) => {
        item.count = books.filter((b) => getValues(b).includes(item.id)).length
      })
      return items
    }

    const authors = withCounts(toItems(authorsSet), (b) => b.authors?.map((a: any) => a.name) || [])
    const languages = withCounts(toItems(languagesSet), (b) => (b.language ? [b.language] : []))
    const series = withCounts(toItems(seriesSet), (b) => (b.series ? [b.series] : []))
    const formats = withCounts(toItems(formatsSet), (b) => (b.file_format ? [b.file_format.toUpperCase()] : []))
    const publishers = withCounts(toItems(publishersSet), (b) => (b.publisher ? [b.publisher] : []))
    const ratings = withCounts(toItems(ratingsSet), (b) => {
      if (!b.rating) return []
      return [(Math.round(b.rating * 2) / 2).toString()]
    })
    const tags = withCounts(toItems(tagsSet), (b) => b.tags?.map((t: any) => t.name) || [])
    const identifiers = withCounts(toItems(identifiersSet), (b) => {
      const ids: string[] = []
      if (b.isbn) ids.push(`ISBN: ${b.isbn}`)
      if (b.isbn13) ids.push(`ISBN13: ${b.isbn13}`)
      return ids
    })

    return { authors, languages, series, formats, publishers, ratings, tags, identifiers }
  }

  const filterItems = getFilterItems()

  // ── Import handlers ────────────────────────────
  const handleImportBooks = async () => {
    try {
      const result = await open({
        multiple: true,
        directory: false,
        filters: [{ name: 'eBooks', extensions: ['epub', 'pdf', 'mobi', 'azw3', 'fb2', 'txt', 'docx', 'html'] }],
      })
      if (!result) return
      const paths = Array.isArray(result) ? result : [result]
      const importResult = await api.importBooks(paths)
      const imported = importResult.success.length
      const dupes = importResult.duplicates.length
      const failed = importResult.failed.length

      if (imported > 0) {
        toast.success(
          `Imported ${imported} book${imported > 1 ? 's' : ''}`,
          dupes > 0 || failed > 0 ? `${dupes} duplicates, ${failed} failed` : undefined,
        )
        const updated = await api.getBooks()
        setBooks(updated)
      } else if (failed > 0) {
        toast.error('Import failed', importResult.failed[0]?.[1] || 'Unknown error')
      } else {
        toast.warning('No books imported', 'All files were duplicates or failed.')
      }
    } catch (err) {
      toast.error('Import failed', String(err))
    }
  }

  const handleImportManga = async () => {
    try {
      const result = await open({
        multiple: true,
        directory: false,
        filters: [{ name: 'Manga Archives', extensions: ['cbz', 'cbr'] }],
      })
      if (!result) return
      const paths = Array.isArray(result) ? result : [result]
      const importResult = await api.importManga(paths)
      const imported = importResult.success.length
      const dupes = importResult.duplicates.length
      const failed = importResult.failed.length

      if (imported > 0) {
        toast.success(
          `Imported ${imported} manga${imported > 1 ? '' : ''}`,
          dupes > 0 || failed > 0 ? `${dupes} duplicates, ${failed} failed` : undefined,
        )
        const updated = await api.getBooks()
        setBooks(updated)
      } else if (failed > 0) {
        toast.error('Import failed', importResult.failed[0]?.[1] || 'Unknown error')
      } else {
        toast.warning('No manga imported', 'All files were duplicates or failed.')
      }
    } catch (err) {
      toast.error('Import failed', String(err))
    }
  }

  const handleScanBooksFolder = async () => {
    try {
      const folderPath = await api.openFolderDialog()
      if (!folderPath) return

      // Let the user know the scan has started
      toast.info('Scanning folder...', `Looking for eBooks in ${folderPath}`)

      const importResult = await api.scanFolderForBooks(folderPath)
      const imported = importResult.success.length
      const dupes = importResult.duplicates.length
      const failed = importResult.failed.length

      if (imported > 0) {
        toast.success(
          `Imported ${imported} book${imported > 1 ? 's' : ''}`,
          dupes > 0 || failed > 0 ? `${dupes} duplicates, ${failed} failed` : undefined,
        )
        const updated = await api.getBooks()
        setBooks(updated)
      } else if (failed > 0) {
        toast.error('Import failed', importResult.failed[0]?.[1] || 'Unknown error')
      } else {
        toast.warning('No books imported', 'All files were duplicates or failed.')
      }
    } catch (err) {
      toast.error('Scan failed', String(err))
    }
  }

  const handleScanMangaFolder = async () => {
    try {
      const folderPath = await api.openFolderDialog()
      if (!folderPath) return

      // Let the user know the scan has started
      toast.info('Scanning folder...', `Looking for Manga in ${folderPath}`)

      const importResult = await api.scanFolderForManga(folderPath)
      const imported = importResult.success.length
      const dupes = importResult.duplicates.length
      const failed = importResult.failed.length

      if (imported > 0) {
        toast.success(
          `Imported ${imported} manga${imported > 1 ? '' : ''}`,
          dupes > 0 || failed > 0 ? `${dupes} duplicates, ${failed} failed` : undefined,
        )
        const updated = await api.getBooks()
        setBooks(updated)
      } else if (failed > 0) {
        toast.error('Import failed', importResult.failed[0]?.[1] || 'Unknown error')
      } else {
        toast.warning('No manga imported', 'All files were duplicates or failed.')
      }
    } catch (err) {
      toast.error('Scan failed', String(err))
    }
  }

  // ── Action handlers ────────────────────────────
  const handleDelete = () => {
    if (selectedBookIds.size === 0) {
      toast.warning('No selection', 'Please select books to delete.')
      return
    }
    const ids = Array.from(selectedBookIds)
    if (ids.length === 1) {
      onDeleteBook?.(ids[0])
    } else {
      onDeleteBooks?.(ids)
    }
  }

  const handleEditMetadata = () => {
    if (selectedBookIds.size === 0) return
    const [firstId] = Array.from(selectedBookIds)
    onEditMetadata?.(firstId)
  }

  const handleConvert = () => {
    if (selectedBookIds.size === 0) return
    const [firstId] = Array.from(selectedBookIds)
    onConvertBook?.(firstId)
  }

  const handleFilterToggle = (category: string, id: string) => {
    // @ts-ignore
    toggleFilter(category, id)
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      {/* ── Topbar ── */}
      <PremiumTopbar
        currentDomain={currentDomain}
        onDomainChange={onDomainChange}
        onImportBooks={handleImportBooks}
        onImportManga={handleImportManga}
        onScanBooksFolder={handleScanBooksFolder}
        onScanMangaFolder={handleScanMangaFolder}
        onOpenRSS={onOpenRSSFeeds}
        onConvert={handleConvert}
        onEditMetadata={handleEditMetadata}
        onDelete={handleDelete}
        onSearch={onSearchChange}
        onOpenSettings={onOpenSettings}
        onToggleSidebar={() => setSidebarOpen((o) => !o)}
        selectedCount={selectedBookIds.size}
        sidebarOpen={sidebarOpen}
      />

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        {sidebarOpen && (
          <FilterPanel
            authors={filterItems.authors}
            languages={filterItems.languages}
            series={filterItems.series}
            formats={filterItems.formats}
            publishers={filterItems.publishers}
            ratings={filterItems.ratings}
            tags={filterItems.tags}
            identifiers={filterItems.identifiers}
            selectedFilters={selectedFilters}
            onFilterToggle={handleFilterToggle}
            onClearAll={clearFilters}
            domain={currentDomain}
          />
        )}

        {/* Main content */}
        <main className={cn('flex-1 overflow-y-auto bg-background')}>
          {children}
        </main>
      </div>

      {/* ── Status Bar ── */}
      <StatusBar
        totalBooks={totalBooks}
        filteredBooks={books.length}
        selectedBooks={selectedBookIds.size}
        librarySize={librarySize}
        syncStatus="synced"
      />
    </div>
  )
}
