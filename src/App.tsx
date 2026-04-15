import { useEffect, useState, lazy, Suspense } from "react"
import { Layout } from "./components/layout/Layout"
import { LibraryGrid } from "./components/library/LibraryGrid"
import { ToastContainer } from "./components/ui/ToastContainer"
import { DevBanner } from "./components/DevBanner"
import { logger } from "./lib/logger"
import { useLibraryStore, countActiveFilterCriteria } from "./store/libraryStore"
import { useReaderStore } from "./store/readerStore"
import { useUIStore } from "./store/uiStore"
import { useConversionStore } from "./store/conversionStore"
import { useOnboardingStore } from "./store/onboardingStore"
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts"
import { useDialogManager } from "./hooks/useDialogManager"
import { useBookActions } from "./hooks/useBookActions"
import { useLibraryFilter } from "./hooks/useLibraryFilter"
import { api } from "./lib/tauri"
import { ShortcutsDialog } from "./components/dialogs/ShortcutsDialog"
import { useOnlineSearchStore } from "./store/onlineSearchStore"

const ReaderLayout = lazy(() => import("./components/reader/ReaderLayout").then(m => ({ default: m.ReaderLayout })))
const EditMetadataDialog = lazy(() => import("./components/library/EditMetadataDialog").then(m => ({ default: m.EditMetadataDialog })))
const DeleteBookDialog = lazy(() => import("./components/library/DeleteBookDialog").then(m => ({ default: m.DeleteBookDialog })))
const SettingsDialog = lazy(() => import("./components/settings/SettingsDialog").then(m => ({ default: m.SettingsDialog })))
const BookDetailsDialog = lazy(() => import("./components/library/BookDetailsDialog").then(m => ({ default: m.BookDetailsDialog })))
const ConversionDialog = lazy(() => import("./components/conversion/ConversionDialog").then(m => ({ default: m.ConversionDialog })))
const AutoConvertDialog = lazy(() => import("./components/conversion/AutoConvertDialog").then(m => ({ default: m.AutoConvertDialog })))
const ConversionJobTracker = lazy(() => import("./components/conversion/ConversionJobTracker"))
const MetadataSearchDialog = lazy(() => import("./components/library/MetadataSearchDialog").then(m => ({ default: m.MetadataSearchDialog })))
const RSSFeedManager = lazy(() => import("./components/rss/RSSFeedManager"))
const RSSArticleList = lazy(() => import("./components/rss/RSSArticleList"))
const OnboardingWizard = lazy(() => import("./components/onboarding/OnboardingWizard").then(m => ({ default: m.OnboardingWizard })))
const HomePage = lazy(() => import("./components/home/HomePage").then(m => ({ default: m.HomePage })))
const AnnotationsView = lazy(() => import("./components/annotations/AnnotationsView").then(m => ({ default: m.AnnotationsView })))
const StatisticsView = lazy(() => import("./components/statistics/StatisticsView").then(m => ({ default: m.StatisticsView })))
const SeriesView = lazy(() => import("./components/library/SeriesView").then(m => ({ default: m.SeriesView })))
const AdvancedFilterDialog = lazy(() => import("./components/library/AdvancedFilterDialog").then(m => ({ default: m.AdvancedFilterDialog })))
const OnlineBooksView = lazy(() => import("./components/online/OnlineBooksView").then(m => ({ default: m.OnlineBooksView })))
const OnlineMangaView = lazy(() => import("./components/online/OnlineMangaView").then(m => ({ default: m.OnlineMangaView })))
const OnlineMangaReader = lazy(() => import("./components/online/OnlineMangaReader").then(m => ({ default: m.OnlineMangaReader })))
const TorboxHubView = lazy(() => import("./components/online/TorboxHubView").then(m => ({ default: m.TorboxHubView })))

const LoadingSpinner = ({ className = "h-screen" }: { className?: string }) => (
  <div className={`flex items-center justify-center ${className}`}>
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
  </div>
)

function App() {
  // ── Onboarding ──
  const onboardingComplete = useOnboardingStore(s => s.onboardingComplete)
  const isOnboardingHydrated = useOnboardingStore(s => s.isHydrated)
  const isOnboardingInitializing = useOnboardingStore(s => s.isInitializing)
  const initializeOnboarding = useOnboardingStore(s => s.initialize)

  // ── Navigation ──
  const currentView = useUIStore(s => s.currentView)
  const currentDomain = useUIStore(s => s.currentDomain)
  const setCurrentView = useUIStore(s => s.setCurrentView)
  const setCurrentDomain = useUIStore(s => s.setCurrentDomain)
  const resetToHome = useUIStore(s => s.resetToHome)

  // ── Library ──
  const loadInitialBooks = useLibraryStore(s => s.loadInitialBooks)
  const clearSelection = useLibraryStore(s => s.clearSelection)
  const activeFilters = useLibraryStore(s => s.activeFilters)
  const isReaderOpen = useReaderStore(s => s.isReaderOpen)

  // ── Search ──
  const [searchQuery, setSearchQuery] = useState("")
  const onlineBooksQuery = useOnlineSearchStore(s => s.queries['online-books'])
  const onlineMangaQuery = useOnlineSearchStore(s => s.queries['online-manga'])
  const torboxQuery = useOnlineSearchStore(s => s.queries.torbox)
  const setOnlineQuery = useOnlineSearchStore(s => s.setQuery)

  // ── Extracted hooks ──
  const { displayBooks, books } = useLibraryFilter(searchQuery)
  const { selectedBookId, handleOpenBook, handleCloseReader, handleDownloadBook, handleAutoGroupManga, autoConvert } = useBookActions(books)
  const dialogs = useDialogManager()

  // ── Initialization ──
  useEffect(() => { void initializeOnboarding() }, [initializeOnboarding])

  useEffect(() => {
    loadInitialBooks()
    api.getFavoriteBookIds().then(ids => {
      useLibraryStore.getState().setFavoriteBookIds(ids)
    }).catch(logger.error)
  }, [loadInitialBooks])

  useEffect(() => {
    let unlisten: (() => void) | undefined
    useConversionStore.getState().initEventListeners().then(fn => { unlisten = fn })
    return () => { unlisten?.() }
  }, [])

  // ── Search routing ──
  const handleSearchChange = (query: string) => {
    if (currentView === 'online-books') { setOnlineQuery('online-books', query); return }
    if (currentView === 'online-manga') { setOnlineQuery('online-manga', query); return }
    if (currentView === 'torbox-discover' || currentView === 'torbox-books' || currentView === 'torbox-manga') {
      setOnlineQuery('torbox', query)
      return
    }
    setSearchQuery(query)
  }

  const activeTopbarSearchQuery =
    currentView === 'online-books' ? onlineBooksQuery
    : currentView === 'online-manga' ? onlineMangaQuery
    : currentView === 'torbox-discover' || currentView === 'torbox-books' || currentView === 'torbox-manga' ? torboxQuery
    : searchQuery

  // ── Keyboard shortcuts ──
  useKeyboardShortcuts({
    'cmd+i': () => {
      const lib = useLibraryStore.getState()
      const selected = lib.selectedBook ?? (
        lib.selectedBookIds.size ? lib.books.find(b => lib.selectedBookIds.has(b.id!)) : null
      )
      if (selected?.id) dialogs.openDetailsDialog(selected.id)
    },
    'cmd+shift+m': () => dialogs.openBatchMetadataDialog(),
    'cmd+shift+f': () => dialogs.setAdvancedFilterOpen(true),
    '?': () => dialogs.setShortcutsDialogOpen(true),
    'ctrl+/': () => dialogs.setShortcutsDialogOpen(true),
  })

  // ── Book action handlers (thin wrappers that connect dialogs to actions) ──
  const handleEditBook = (bookId: number) => dialogs.openEditDialog(bookId)

  const handleDeleteBook = (bookId: number) => {
    const book = books.find(b => b.id === bookId)
    dialogs.openDeleteDialog(bookId, book?.title || "this book")
  }

  const handleDeleteBooks = (bookIds: number[]) => dialogs.openDeleteMultipleDialog(bookIds)
  const handleViewDetails = (bookId: number) => dialogs.openDetailsDialog(bookId)
  const handleConvertBook = (bookId: number) => dialogs.openConversionDialog(bookId)

  // ── Render ──
  if (isReaderOpen && selectedBookId) {
    return (
      <>
        <Suspense fallback={<LoadingSpinner />}>
          <ReaderLayout bookId={selectedBookId} onClose={handleCloseReader} />
        </Suspense>
        <ToastContainer />
      </>
    )
  }

  if (!isOnboardingHydrated || isOnboardingInitializing) {
    return <LoadingSpinner />
  }

  if (!onboardingComplete) {
    return (
      <Suspense fallback={<LoadingSpinner />}>
        <OnboardingWizard />
      </Suspense>
    )
  }

  return (
    <>
      <DevBanner />
      <Layout
        onOpenSettings={() => dialogs.setSettingsDialogOpen(true)}
        onOpenShortcuts={() => dialogs.setShortcutsDialogOpen(true)}
        onEditMetadata={handleEditBook}
        onFetchMetadata={dialogs.openBatchMetadataDialog}
        onDeleteBook={handleDeleteBook}
        onDeleteBooks={handleDeleteBooks}
        onDownloadBook={handleDownloadBook}
        onViewDetails={handleViewDetails}
        onConvertBook={handleConvertBook}
        onOpenRSSFeeds={() => setCurrentView('rss-feeds')}
        onOpenRSSArticles={() => setCurrentView('rss-articles')}
        onGoHome={resetToHome}
        onAutoGroupManga={handleAutoGroupManga}
        onOpenAdvancedFilter={() => dialogs.setAdvancedFilterOpen(true)}
        activeFilterCount={countActiveFilterCriteria(activeFilters)}
        searchQuery={activeTopbarSearchQuery}
        onSearchChange={handleSearchChange}
        currentView={currentView}
        onNavigateToView={setCurrentView}
        onBackToLibrary={() => setCurrentView('library')}
        currentDomain={currentDomain}
        onDomainChange={setCurrentDomain}
      >
        {currentView === 'home' && (
          <Suspense fallback={<LoadingSpinner className="py-24" />}>
            <HomePage onOpenBook={handleOpenBook} onViewRSS={() => setCurrentView('rss-articles')} />
          </Suspense>
        )}

        {currentView === 'rss-feeds' && (
          <Suspense fallback={<LoadingSpinner className="py-24" />}>
            <RSSFeedManager onClose={() => setCurrentView('library')} />
          </Suspense>
        )}

        {currentView === 'rss-articles' && (
          <Suspense fallback={<LoadingSpinner className="py-24" />}>
            <RSSArticleList onClose={() => setCurrentView('library')} />
          </Suspense>
        )}

        {currentView === 'library' && (
          <LibraryGrid
            books={displayBooks}
            currentDomain={currentDomain}
            onBookClick={handleOpenBook}
            onViewDetails={handleViewDetails}
            onEditBook={handleEditBook}
            onDeleteBook={handleDeleteBook}
            onConvertBook={handleConvertBook}
            onViewSeries={dialogs.openSeriesView}
          />
        )}

        {currentView === 'annotations' && (
          <Suspense fallback={<LoadingSpinner className="py-24" />}>
            <AnnotationsView onClose={() => setCurrentView('library')} />
          </Suspense>
        )}

        {currentView === 'statistics' && (
          <Suspense fallback={<LoadingSpinner className="py-24" />}>
            <StatisticsView onClose={() => setCurrentView('library')} />
          </Suspense>
        )}

        {currentView === 'online-books' && (
          <Suspense fallback={<LoadingSpinner className="py-24" />}><OnlineBooksView /></Suspense>
        )}

        {currentView === 'online-manga' && (
          <Suspense fallback={<LoadingSpinner className="py-24" />}><OnlineMangaView /></Suspense>
        )}

        {currentView === 'online-manga-reader' && (
          <Suspense fallback={<LoadingSpinner className="py-24" />}><OnlineMangaReader /></Suspense>
        )}

        {currentView === 'torbox-discover' && (
          <Suspense fallback={<LoadingSpinner className="py-24" />}><TorboxHubView initialTab="discover" /></Suspense>
        )}

        {currentView === 'torbox-books' && (
          <Suspense fallback={<LoadingSpinner className="py-24" />}><TorboxHubView initialTab="books" /></Suspense>
        )}

        {currentView === 'torbox-manga' && (
          <Suspense fallback={<LoadingSpinner className="py-24" />}><TorboxHubView initialTab="manga" /></Suspense>
        )}
      </Layout>

      {/* Global Overlays */}
      <Suspense fallback={null}><ConversionJobTracker /></Suspense>
      <ToastContainer />

      {/* Dialogs */}
      {dialogs.dialogBookId !== null && (
        <Suspense fallback={null}>
          <EditMetadataDialog open={dialogs.editDialogOpen} onOpenChange={dialogs.setEditDialogOpen} bookId={dialogs.dialogBookId} />
        </Suspense>
      )}

      <Suspense fallback={null}>
        <DeleteBookDialog
          open={dialogs.deleteDialogOpen}
          onOpenChange={(open) => { dialogs.setDeleteDialogOpen(open); if (!open) clearSelection() }}
          bookIds={dialogs.deleteBookIds}
          bookTitle={dialogs.dialogBookTitle}
        />
      </Suspense>

      <Suspense fallback={null}>
        <MetadataSearchDialog
          open={dialogs.batchMetadataDialogOpen}
          onOpenChange={(open) => {
            dialogs.setBatchMetadataDialogOpen(open)
            if (!open) { dialogs.setBatchMetadataBookIds([]); loadInitialBooks() }
          }}
          bookIds={dialogs.batchMetadataBookIds}
          onMetadataSelected={() => loadInitialBooks()}
        />
      </Suspense>

      {dialogs.dialogBookId !== null && (
        <Suspense fallback={null}>
          <BookDetailsDialog
            open={dialogs.detailsDialogOpen}
            onOpenChange={dialogs.setDetailsDialogOpen}
            bookId={dialogs.dialogBookId}
            onEdit={() => { dialogs.setDetailsDialogOpen(false); dialogs.setEditDialogOpen(true) }}
            onDelete={() => {
              const book = books.find(b => b.id === dialogs.dialogBookId)
              dialogs.openDeleteDialog(dialogs.dialogBookId!, book?.title || "this book")
              dialogs.setDetailsDialogOpen(false)
            }}
            onRead={() => { dialogs.setDetailsDialogOpen(false); handleOpenBook(dialogs.dialogBookId!) }}
          />
        </Suspense>
      )}

      <Suspense fallback={null}>
        <SettingsDialog open={dialogs.settingsDialogOpen} onOpenChange={dialogs.setSettingsDialogOpen} />
      </Suspense>

      {/* Auto-Convert on Open dialog */}
      {autoConvert.pendingBook && (
        <Suspense fallback={null}>
          <AutoConvertDialog
            isOpen={autoConvert.showDialog}
            onOpenChange={autoConvert.onDialogOpenChange}
            bookTitle={autoConvert.pendingBook.title}
            currentFormat={autoConvert.pendingBook.file_format}
            onConfirm={autoConvert.onConfirm}
            onCancel={autoConvert.onCancel}
            isConverting={autoConvert.isConverting}
          />
        </Suspense>
      )}

      {dialogs.dialogBookId !== null && (
        <Suspense fallback={null}>
          <ConversionDialog open={dialogs.conversionDialogOpen} onOpenChange={dialogs.setConversionDialogOpen} bookId={dialogs.dialogBookId} />
        </Suspense>
      )}

      {dialogs.selectedSeries && (
        <Suspense fallback={null}>
          <SeriesView
            series={dialogs.selectedSeries}
            isOpen={dialogs.seriesViewOpen}
            onClose={() => dialogs.setSeriesViewOpen(false)}
            onSelectBook={() => {}}
            onOpenBook={handleOpenBook}
            onViewDetailsBook={handleViewDetails}
            onEditBook={handleEditBook}
            onDeleteBook={handleDeleteBook}
            onConvertBook={handleConvertBook}
            onFavoriteBook={async (id) => {
              await api.toggleBookFavorite(id)
              useLibraryStore.getState().toggleFavorite(id)
            }}
            selectedBookIds={new Set()}
            favoritedBookIds={useLibraryStore.getState().favoriteBookIds}
          />
        </Suspense>
      )}

      <Suspense fallback={null}>
        <AdvancedFilterDialog open={dialogs.advancedFilterOpen} onOpenChange={dialogs.setAdvancedFilterOpen} />
      </Suspense>

      <ShortcutsDialog open={dialogs.shortcutsDialogOpen} onOpenChange={dialogs.setShortcutsDialogOpen} />
    </>
  )
}

export default App
