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
import { useState, useMemo, useCallback, useEffect, useRef } from 'react'

import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { Plus } from 'lucide-react'
import { IconImportBook, IconImportManga } from '@/components/icons/ShioriIcons'

import { PremiumTopbar } from './ImprovedToolbar'
import { NavigationRail } from './NavigationRail'
import { BottomNav } from './BottomNav'
import { useIsMobile } from '@/hooks/useIsMobile'
import { DuplicateFinderDialog } from '../library/DuplicateFinderDialog'
import { ImportDialog } from '../library/ImportDialog'
import { cn } from '@/lib/utils'
import { api, type Book } from '@/lib/tauri'
import { useLibraryStore } from '@/store/libraryStore'
import { useToast } from '@/store/toastStore'
import { type CurrentView } from '@/store/uiStore'
import { useOfflineSyncStore } from '@/store/offlineSyncStore'
import { anilistAuth } from '@/auth'
import { useQuery } from '@tanstack/react-query'
import { logger } from '@/lib/logger'

type DragLayerProps = {
  isDragActive: boolean
  onDragOver: (e: DragEvent) => void
  onDragLeave: (e: DragEvent) => void
  onDrop: (e: DragEvent) => void
  children: ReactNode
}

type DropFile = File & { path?: string }

function DragLayer({ isDragActive, onDragOver, onDragLeave, onDrop, children }: DragLayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    el.addEventListener('dragover', onDragOver)
    el.addEventListener('dragleave', onDragLeave)
    el.addEventListener('drop', onDrop)

    return () => {
      el.removeEventListener('dragover', onDragOver)
      el.removeEventListener('dragleave', onDragLeave)
      el.removeEventListener('drop', onDrop)
    }
  }, [onDragOver, onDragLeave, onDrop])

  return (
    <div ref={containerRef} className="flex flex-1 overflow-hidden relative">
      {isDragActive && (
        <div className="absolute inset-0 bg-blue-500/10 border-2 border-dashed border-blue-500 rounded-lg pointer-events-none z-40 flex items-center justify-center">
          <div className="text-center">
            <div className="text-lg font-semibold text-blue-600 dark:text-blue-400">
              Drop books here to import
            </div>
            <div className="text-sm text-blue-500 dark:text-blue-300 mt-1">
              Supports EPUB, PDF, MOBI, CBZ, CBR and more
            </div>
          </div>
        </div>
      )}
      {children}
    </div>
  )
}

interface LayoutProps {
  children: ReactNode
  onOpenSettings: () => void
  onOpenShortcuts?: () => void
  onEditMetadata?: (bookId: number) => void
  onFetchMetadata?: () => void
  onDeleteBook?: (bookId: number) => void
  onDeleteBooks?: (bookIds: number[]) => void
  onDownloadBook?: (bookId: number) => void
  onViewDetails?: (bookId: number) => void
  onConvertBook?: (bookId: number) => void
  onOpenRSSFeeds?: () => void
  onOpenRSSArticles?: () => void
  onBackToLibrary?: () => void
  onGoHome?: () => void
  onAutoGroupManga?: () => void
  onOpenAdvancedFilter?: () => void
  activeFilterCount?: number
  searchQuery?: string
  onSearchChange?: (query: string) => void
  currentView?: CurrentView
  onNavigateToView?: (view: CurrentView) => void
  currentDomain?: 'books' | 'manga_comics'
  onDomainChange?: (domain: 'books' | 'manga_comics') => void
}

import { usePreferencesStore } from '@/store/preferencesStore'

export function Layout({
  children,
  onOpenSettings,
  onOpenShortcuts,
  onEditMetadata,
  onFetchMetadata,
  onDeleteBook,
  onDeleteBooks,
  onConvertBook,
  onViewDetails,
  onOpenRSSFeeds,
  onGoHome,
  onAutoGroupManga,
  onOpenAdvancedFilter,
  activeFilterCount = 0,
  searchQuery = '',
  onSearchChange,
  currentView = 'home',
  onNavigateToView,
  currentDomain = 'books',
  onDomainChange = () => { },
}: LayoutProps) {
  const isMobile = useIsMobile()
  const [duplicateFinderOpen, setDuplicateFinderOpen] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importDialogFilePaths, setImportDialogFilePaths] = useState<string[]>([])
  const [isDragActive, setIsDragActive] = useState(false)

  const processQueue = useOfflineSyncStore((state) => state.processQueue)
  const [anilistToken, setAnilistToken] = useState<string | null>(null)
  const preferencesToken = usePreferencesStore((state) => state.preferences?.anilistToken)

  useEffect(() => {
    const fetchToken = async () => {
      const token = await anilistAuth.getAccessToken()
      setAnilistToken(token)
    }
    fetchToken()

    const handleAuthChange = () => fetchToken()
    window.addEventListener('anilist-auth-changed', handleAuthChange)
    return () => window.removeEventListener('anilist-auth-changed', handleAuthChange)
  }, [preferencesToken])

  useEffect(() => {
    if (anilistToken) {
      processQueue(anilistToken).catch(console.error)
      
      // Try again every time they regain focus/online
      const handleOnline = () => {
        processQueue(anilistToken).catch(console.error)
      }
      window.addEventListener('online', handleOnline)
      window.addEventListener('focus', handleOnline)
      
      return () => {
        window.removeEventListener('online', handleOnline)
        window.removeEventListener('focus', handleOnline)
      }
    }
  }, [anilistToken, processQueue])

  const toast = useToast()

  const books = useLibraryStore((s) => s.books)
  const setBooks = useLibraryStore((s) => s.setBooks)
  const selectedBookIds = useLibraryStore((s) => s.selectedBookIds)
  const selectedFilters = useLibraryStore((s) => s.selectedFilters)
  const toggleFilter = useLibraryStore((s) => s.toggleFilter)
  const clearFilters = useLibraryStore((s) => s.clearFilters)

  const isOnlineView =
    currentView === 'online-books' ||
    currentView === 'online-manga' ||
    currentView === 'torbox-books' ||
    currentView === 'torbox-manga' ||
    currentView === 'torbox-discover'
  const searchPlaceholder =
    currentView === 'online-books'
      ? 'Search online books...'
      : currentView === 'online-manga'
        ? 'Search online manga...'
        : currentView === 'torbox-discover' || currentView === 'torbox-books' || currentView === 'torbox-manga'
          ? 'Search Torbox content...'
        : `Search ${currentDomain}...`

  // ── Filter data extraction (memoized) ──────────────
  const filterItems = useMemo(() => {
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
      getValues: (b: Book) => string[],
    ) => {
      items.forEach((item) => {
        item.count = books.filter((b) => getValues(b).includes(item.id)).length
      })
      return items
    }

    const authors = withCounts(toItems(authorsSet), (b) => b.authors?.map((a: { name: string }) => a.name) || [])
    const languages = withCounts(toItems(languagesSet), (b) => (b.language ? [b.language] : []))
    const series = withCounts(toItems(seriesSet), (b) => (b.series ? [b.series] : []))
    const formats = withCounts(toItems(formatsSet), (b) => (b.file_format ? [b.file_format.toUpperCase()] : []))
    const publishers = withCounts(toItems(publishersSet), (b) => (b.publisher ? [b.publisher] : []))
    const ratings = withCounts(toItems(ratingsSet), (b) => {
      if (!b.rating) return []
      return [(Math.round(b.rating * 2) / 2).toString()]
    })
    const tags = withCounts(toItems(tagsSet), (b) => b.tags?.map((t: { name: string }) => t.name) || [])
    const identifiers = withCounts(toItems(identifiersSet), (b) => {
      const ids: string[] = []
      if (b.isbn) ids.push(`ISBN: ${b.isbn}`)
      if (b.isbn13) ids.push(`ISBN13: ${b.isbn13}`)
      return ids
    })

    return { authors, languages, series, formats, publishers, ratings, tags, identifiers }
  }, [books])

  // ── Import handlers ────────────────────────────
  const handleOpenImportFilesDialog = () => {
    setImportDialogFilePaths([])
    setImportDialogOpen(true)
  }

  const handleOpenImportFolderDialog = () => {
    setImportDialogFilePaths([])
    setImportDialogOpen(true)
  }

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy'
    }
    setIsDragActive(true)
  }, [])

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragActive(false)
  }, [])

  const handleDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragActive(false)

      const dataTransfer = e.dataTransfer
      if (!dataTransfer) return

      const files = dataTransfer.files
      if (!files || files.length === 0) return

      const filePaths: string[] = []
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i] as DropFile
        if (file && file.path) {
          filePaths.push(file.path)
        } else if (file) {
          logger.warn(`File ${i} (${file.name}) has no path property, skipping`)
        }
      }

      if (filePaths.length === 0) {
        toast.warning('No valid files', 'Could not extract file paths from dropped items')
        return
      }

      // Trigger ImportDialog with the dropped files
      setImportDialogFilePaths(filePaths)
      setImportDialogOpen(true)
    },
    [toast]
  )

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

  const handleFetchMetadataClick = () => {
    if (selectedBookIds.size === 0) return
    onFetchMetadata?.()
  }

  const handleViewDetails = () => {
    if (selectedBookIds.size === 0) return
    const [firstId] = Array.from(selectedBookIds)
    onViewDetails?.(firstId)
  }

  const handleConvert = () => {
    if (selectedBookIds.size === 0) return
    const [firstId] = Array.from(selectedBookIds)
    onConvertBook?.(firstId)
  }

  const handleFilterToggle = (category: string, id: string) => {
    // @ts-expect-error - toggleFilter accepts keyof FilterState but category is string from FilterPanel
    toggleFilter(category, id)
  }

  return (
    <div className={cn("flex flex-col h-screen overflow-hidden bg-background", isMobile && "pt-[2px]")}>
      {/* ── Topbar ── */}
      {currentView !== 'online-manga-reader' && (
        <PremiumTopbar
          currentDomain={currentDomain}
          onDomainChange={onDomainChange}
          onImportFiles={handleOpenImportFilesDialog}
          onImportFolder={handleOpenImportFolderDialog}
          onSearch={onSearchChange}
          searchValue={searchQuery}
          searchPlaceholder={searchPlaceholder}
          onOpenSettings={onOpenSettings}
          onOpenShortcuts={onOpenShortcuts}
          onOpenAdvancedFilter={onOpenAdvancedFilter}
          onToggleSidebar={onOpenAdvancedFilter}
          onGoHome={onGoHome}
          onAutoGroupManga={onAutoGroupManga}
          currentView={currentView}
          onNavigateToView={onNavigateToView}
          activeFilterCount={activeFilterCount}
          sidebarOpen={false}
        />
      )}

      {/* ── Body ── */}
      <DragLayer
        isDragActive={isDragActive}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <NavigationRail
          currentView={currentView}
          onNavigateToView={onNavigateToView}
        />

        {/* ── Mobile Bottom Nav ── */}
        <main 
          className={cn('flex-1 min-w-0 overflow-y-auto bg-background md:pb-0', 'max-md:pb-16')}
          style={isMobile ? {
            paddingLeft: 'env(safe-area-inset-left, 0px)',
            paddingRight: 'env(safe-area-inset-right, 0px)'
          } : undefined}
        >
          {children}
        </main>
      </DragLayer>
      
      {/* ── Mobile Bottom Nav ── */}
      {isMobile && (
        <BottomNav
          currentView={currentView}
          onNavigateToView={(view) => {
            if (onNavigateToView) onNavigateToView(view)
          }}
          onOpenSettings={onOpenSettings}
          onToggleDrawer={onOpenAdvancedFilter || (() => {})}
        />
      )}

      {/* ── Mobile FAB for Import ── */}
      {isMobile && currentView === 'library' && (
        <div className="fixed bottom-20 right-4 z-50">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center justify-center w-14 h-14 bg-primary text-primary-foreground rounded-full shadow-[0_4px_20px_rgba(0,0,0,0.3)] transition-transform hover:scale-105 active:scale-95"
              >
                <Plus size={24} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={12} className="w-56 rounded-xl border-border shadow-xl bg-background/95 backdrop-blur-xl p-2">
              <DropdownMenuItem onClick={handleOpenImportFilesDialog} className="gap-3 p-3 cursor-pointer rounded-lg flex items-center">
                <div className="p-2 bg-primary/10 rounded-md shrink-0">
                  <IconImportBook size={18} className="text-primary" />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium leading-none">Import Files</span>
                  <span className="text-xs text-muted-foreground leading-snug">Individual files</span>
                </div>
              </DropdownMenuItem>
              
              <DropdownMenuSeparator className="my-1 bg-border/50" />
              
              <DropdownMenuItem onClick={handleOpenImportFolderDialog} className="gap-3 p-3 cursor-pointer rounded-lg flex items-center">
                <div className="p-2 bg-primary/10 rounded-md shrink-0">
                  <IconImportManga size={18} className="text-primary" />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium leading-none">Import Folder</span>
                  <span className="text-xs text-muted-foreground leading-snug">Scan directory</span>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* ── Duplicate Finder Dialog ── */}
      <DuplicateFinderDialog
        open={duplicateFinderOpen}
        onOpenChange={setDuplicateFinderOpen}
        onBooksDeleted={async () => {
          const updated = await api.getBooks()
          setBooks(updated)
        }}
      />

      {/* ── Import Dialog ── */}
      <ImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        initialFilePaths={importDialogFilePaths}
      />
    </div>
  )
}
