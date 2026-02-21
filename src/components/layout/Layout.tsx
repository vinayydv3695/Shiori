import type { ReactNode } from "react"
import { useState } from "react"
import { open } from "@tauri-apps/plugin-dialog"
import { ModernSidebar } from "../sidebar/ModernSidebar"
import { ImprovedToolbar } from "./ImprovedToolbar"
import { StatusBar } from "./ModernToolbar"
import { useUIStore } from "../../store/uiStore"
import { useLibraryStore } from "../../store/libraryStore"
import { useToast } from "../../store/toastStore"
import { cn, formatFileSize } from "../../lib/utils"
import { api } from "../../lib/tauri"

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
  onDownloadBook,
  onViewDetails,
  onConvertBook,
  onShareBook,
  onOpenRSSFeeds,
  onOpenRSSArticles,
  onBackToLibrary,
  searchQuery: externalSearchQuery,
  onSearchChange,
  currentView = 'library',
  currentDomain = 'books',
  onDomainChange = () => { },
}: LayoutProps) {
  const { sidebarCollapsed } = useUIStore()
  const {
    books,
    selectedBookIds,
    setBooks,
    selectedFilters,
    toggleFilter,
    clearFilters
  } = useLibraryStore()
  const toast = useToast()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  // Calculate library stats
  const totalBooks = books.length
  const totalSize = books.reduce((sum, book) => sum + (book.file_size || 0), 0)
  const librarySize = totalSize > 0 ? formatFileSize(totalSize) : "0 B"

  // Extract filter data from books
  const getFilterItems = () => {
    // Extract unique values from books
    const authorsSet = new Set<string>()
    const languagesSet = new Set<string>()
    const seriesSet = new Set<string>()
    const formatsSet = new Set<string>()
    const publishersSet = new Set<string>()
    const ratingsSet = new Set<string>()
    const tagsSet = new Set<string>()
    const identifiersSet = new Set<string>()

    books.forEach(book => {
      // Authors
      book.authors?.forEach(author => {
        if (author.name) authorsSet.add(author.name)
      })

      // Languages
      if (book.language) languagesSet.add(book.language)

      // Series
      if (book.series) seriesSet.add(book.series)

      // Formats
      if (book.file_format) formatsSet.add(book.file_format.toUpperCase())

      // Publishers
      if (book.publisher) publishersSet.add(book.publisher)

      // Ratings (round to nearest 0.5)
      if (book.rating) {
        const roundedRating = Math.round(book.rating * 2) / 2
        ratingsSet.add(roundedRating.toString())
      }

      // Tags
      book.tags?.forEach(tag => {
        if (tag.name) tagsSet.add(tag.name)
      })

      // Identifiers (ISBN)
      if (book.isbn) identifiersSet.add(`ISBN: ${book.isbn}`)
      if (book.isbn13) identifiersSet.add(`ISBN13: ${book.isbn13}`)
    })

    // Convert sets to sorted arrays of filter items
    const toFilterItems = (set: Set<string>) =>
      Array.from(set).sort().map(item => ({ id: item, label: item, count: 0 }))

    // Count occurrences for each filter
    const countOccurrences = (items: { id: string; label: string; count: number }[], getValue: (book: any) => string[]) => {
      items.forEach(item => {
        item.count = books.filter(book => getValue(book).includes(item.id)).length
      })
      return items
    }

    const authors = toFilterItems(authorsSet)
    countOccurrences(authors, book => book.authors?.map((a: any) => a.name) || [])

    const languages = toFilterItems(languagesSet)
    countOccurrences(languages, book => book.language ? [book.language] : [])

    const series = toFilterItems(seriesSet)
    countOccurrences(series, book => book.series ? [book.series] : [])

    const formats = toFilterItems(formatsSet)
    countOccurrences(formats, book => book.file_format ? [book.file_format.toUpperCase()] : [])

    const publishers = toFilterItems(publishersSet)
    countOccurrences(publishers, book => book.publisher ? [book.publisher] : [])

    const ratings = toFilterItems(ratingsSet)
    countOccurrences(ratings, book => {
      if (!book.rating) return []
      const roundedRating = Math.round(book.rating * 2) / 2
      return [roundedRating.toString()]
    })

    const tags = toFilterItems(tagsSet)
    countOccurrences(tags, book => book.tags?.map((t: any) => t.name) || [])

    const identifiers = toFilterItems(identifiersSet)
    countOccurrences(identifiers, book => {
      const ids = []
      if (book.isbn) ids.push(`ISBN: ${book.isbn}`)
      if (book.isbn13) ids.push(`ISBN13: ${book.isbn13}`)
      return ids
    })

    return {
      authors,
      languages,
      series,
      formats,
      publishers,
      ratings,
      tags,
      identifiers,
    }
  }

  const filterItems = getFilterItems()

  // Toolbar action handlers
  const handleAddBook = async () => {
    const isManga = currentDomain === 'manga'
    const domainLabel = isManga ? 'manga' : 'book'

    try {
      console.log(`[Layout] Opening ${domainLabel} file dialog...`)
      const result = await open({
        multiple: true,
        directory: false,
        filters: [isManga
          ? { name: 'Manga Archives', extensions: ['cbz', 'cbr'] }
          : { name: 'eBooks', extensions: ['epub', 'pdf', 'mobi', 'azw3', 'fb2', 'txt', 'docx', 'html'] }
        ]
      })

      console.log('[Layout] File dialog result:', result)

      if (result) {
        const paths = Array.isArray(result) ? result : [result]
        console.log(`[Layout] Importing ${domainLabel} paths:`, paths)

        // Use domain-specific API
        const importResult = isManga
          ? await api.importManga(paths)
          : await api.importBooks(paths)
        console.log('[Layout] Import result:', importResult)

        // Show result toast
        const totalImported = importResult.success.length
        const totalDuplicates = importResult.duplicates.length
        const totalFailed = importResult.failed.length

        if (totalImported > 0) {
          toast.success(
            `Imported ${totalImported} ${domainLabel}${totalImported > 1 ? 's' : ''}`,
            totalDuplicates > 0 || totalFailed > 0
              ? `${totalDuplicates} duplicates, ${totalFailed} failed`
              : undefined
          )

          // Reload library
          const updatedBooks = await api.getBooks()
          setBooks(updatedBooks)
        } else if (totalFailed > 0) {
          const errorMsg = importResult.failed[0]?.[1] || 'Unknown error'
          toast.error('Import failed', errorMsg)
        } else {
          toast.warning(`No ${domainLabel}s imported`, `All ${domainLabel}s were either duplicates or failed to import`)
        }
      }
    } catch (error) {
      console.error(`[Layout] Failed to import ${domainLabel}s:`, error)
      toast.error('Import failed', String(error))
    }
  }

  const handleAddFolder = async () => {
    const isManga = currentDomain === 'manga'
    const domainLabel = isManga ? 'manga' : 'book'

    try {
      console.log(`[Layout] Opening folder dialog for ${domainLabel}s...`)
      const result = await open({
        multiple: false,
        directory: true,
      })

      console.log('[Layout] Folder dialog result:', result)

      if (result && typeof result === 'string') {
        console.log(`[Layout] Scanning folder for ${domainLabel}s:`, result)
        
        // TODO: Backend needs a scan_folder command that recursively finds all valid files
        // For now, we'll show a message that this is coming soon
        toast.info('Folder import', 'This feature will recursively scan folders for books. Coming soon!')
        
        // When backend is ready, use something like:
        // const scanResult = await api.scanFolderForBooks(result, currentDomain)
        // Then import the found files using existing import logic
      }
    } catch (error) {
      console.error(`[Layout] Failed to scan folder:`, error)
      toast.error('Folder scan failed', String(error))
    }
  }

  const handleSettings = () => {
    onOpenSettings()
  }

  const handleRemove = () => {
    if (selectedBookIds.size === 0) {
      toast.warning('No book selected', 'Please select a book to remove')
      return
    }

    // Support multiple deletion
    const ids = Array.from(selectedBookIds)
    if (ids.length === 1) {
      onDeleteBook?.(ids[0])
    } else {
      if (onDeleteBooks) {
        onDeleteBooks(ids)
      } else {
        toast.warning('Feature not connected', 'Multiple deletion handler missing')
      }
    }
  }

  const handleSearch = (query: string) => {
    setSearchQuery(query)
    if (onSearchChange) {
      onSearchChange(query)
    }
  }

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen)
  }

  const handleFilterToggle = (category: string, id: string) => {
    // @ts-ignore
    toggleFilter(category, id)
  }

  const handleClearAllFilters = () => {
    clearFilters()
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      {sidebarOpen && (
        <ModernSidebar
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
          onClearAll={handleClearAllFilters}
        />
      )}

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Toolbar */}
        <ImprovedToolbar
          onAddBook={handleAddBook}
          onAddFolder={handleAddFolder}
          onSettings={handleSettings}
          onRemove={handleRemove}
          onSearch={handleSearch}
          currentDomain={currentDomain}
          onDomainChange={onDomainChange}
          selectedCount={selectedBookIds.size}
        />

        {/* Content Area */}
        <main className="flex-1 overflow-auto bg-background p-6">
          {children}
        </main>

        {/* Status Bar */}
        <StatusBar
          totalBooks={totalBooks}
          filteredBooks={books.length}
          selectedBooks={selectedBookIds.size}
          librarySize={librarySize}
          syncStatus="synced"
        />
      </div>
    </div>
  )
}
