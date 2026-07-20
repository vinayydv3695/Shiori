import { useEffect, useState, lazy, Suspense, useCallback } from "react"
import { GlobalDialogs as OriginalGlobalDialogs } from "./components/GlobalDialogs"
import { ViewRouter } from "./components/ViewRouter"
import { Layout } from "./components/layout/Layout"
import { ToastContainer } from "./components/ui/ToastContainer"
import { DevBanner } from "./components/DevBanner"
import { motion, AnimatePresence } from "framer-motion"

import { SectionErrorBoundary } from "./components/ErrorBoundary"
import { logger } from "./lib/logger"
import { useLibraryStore, countActiveFilterCriteria } from "./store/libraryStore"
import { useReaderStore } from "./store/readerStore"
import { useUIStore } from "./store/uiStore"
import { useConversionStore } from "./store/conversionStore"
import { listen } from '@tauri-apps/api/event'
import { useOnboardingStore } from "./store/onboardingStore"
import { usePreferencesStore } from "./store/preferencesStore"
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts"
import { useDialogManager } from "./hooks/useDialogManager"
import { useBookActions } from "./hooks/useBookActions"
import { useLibraryFilter } from "./hooks/useLibraryFilter"
import { api, isAndroid } from "./lib/tauri"
import { useDiscordRPCUpdater } from "./hooks/useDiscordRPCUpdater"
import { useOnlineSearchStore } from "./store/onlineSearchStore"
import { AndroidSplashScreen } from "./components/ui/AndroidSplashScreen"
import { SwipeGestureHandler } from "./components/layout/SwipeGestureHandler"
import { useBackButton } from "./hooks/useBackButton"
import { useAutoUpdate } from "./hooks/useAutoUpdate"

const ReaderLayout = lazy(() => import("./components/reader/ReaderLayout").then(m => ({ default: m.ReaderLayout })))
const OnboardingWizard = lazy(() => import("./components/onboarding/OnboardingWizard").then(m => ({ default: m.OnboardingWizard })))
const MigrationDialog = lazy(() => import("./components/onboarding/MigrationDialog").then(m => ({ default: m.MigrationDialog })))
const OnlineMangaReader = lazy(() => import("./components/online/OnlineMangaReader").then(m => ({ default: m.OnlineMangaReader })))
const GlobalDialogs = lazy(() => import("./components/GlobalDialogs").then(m => ({ default: m.GlobalDialogs })))

const LoadingSpinner = ({ className = "h-screen" }: { className?: string }) => (
  <div className={`flex items-center justify-center ${className}`}>
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
  </div>
)

function App() {
  const [splashFinished, setSplashFinished] = useState(false)

  // ── Onboarding ──
  const onboardingComplete = useOnboardingStore(s => s.onboardingComplete)
  const isOnboardingHydrated = useOnboardingStore(s => s.isHydrated)
  const isOnboardingInitializing = useOnboardingStore(s => s.isInitializing)
  const initializeOnboarding = useOnboardingStore(s => s.initialize)
  const isPreferencesLoaded = usePreferencesStore(s => s.isLoaded)

  // ── Android Performance Enhancements ──
  useEffect(() => {
    if (isAndroid) {
      document.documentElement.classList.add('is-android')
    }
  }, [])

  // ── Discord RPC ──
  useDiscordRPCUpdater()

  // ── Auto Updates ──
  useAutoUpdate()

  // ── Navigation ──
  const currentView = useUIStore(s => s.currentView)
  const currentDomain = useUIStore(s => s.currentDomain)
  const setCurrentView = useUIStore(s => s.setCurrentView)
  const setCurrentDomain = useUIStore(s => s.setCurrentDomain)
  const resetToHome = useUIStore(s => s.resetToHome)
  
  const preferredContentType = usePreferencesStore(s => s.preferences?.preferredContentType)
  
  // Enforce preferredContentType restriction
  useEffect(() => {
    if (preferredContentType === 'books') {
      if (currentDomain !== 'books') setCurrentDomain('books')
      if (currentView === 'online-manga') setCurrentView('home')
    } else if (preferredContentType === 'manga') {
      if (currentDomain !== 'manga_comics') setCurrentDomain('manga_comics')
      if (currentView === 'online-books' || currentView === 'annotations') setCurrentView('home')
    }
  }, [preferredContentType, currentDomain, currentView, setCurrentDomain, setCurrentView])

  const legacyLibraryMigrationStatus = usePreferencesStore(s => s.preferences?.legacyLibraryMigrationStatus)
  const [showMigrationDialog, setShowMigrationDialog] = useState(false)

  useEffect(() => {
    if (onboardingComplete && legacyLibraryMigrationStatus === 'unmigrated') {
      setShowMigrationDialog(true)
    }
  }, [onboardingComplete, legacyLibraryMigrationStatus])

  const handleNavigate = (view: typeof currentView) => {
    setCurrentView(view)
  }

  const handleDomainChange = (domain: typeof currentDomain) => {
    setCurrentDomain(domain)
  }

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
  const { selectedBookId, handleOpenBook, handleCloseReader, handleDownloadBook, handleAutoGroupManga, autoConvert, resumeReading } = useBookActions(books)
  const dialogs = useDialogManager()

  useBackButton(isReaderOpen, handleCloseReader)
  useBackButton(currentView === 'online-manga-reader', () => setCurrentView('home'))

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

  useEffect(() => {
    let unlisten: (() => void) | undefined
    listen('library-updated', () => {
      api.getBooks().then(books => {
        useLibraryStore.getState().setBooks(books)
      }).catch(logger.error)
    }).then(fn => { unlisten = fn })
    return () => { unlisten?.() }
  }, [])

  // ── Auto-Sync (Android to Desktop) ──
  useEffect(() => {
    if (isAndroid) {
      const ip = localStorage.getItem('sync_host_ip');
      const port = localStorage.getItem('sync_host_port');
      const token = localStorage.getItem('sync_host_token');
      
      if (ip && port && token) {
        import('@/lib/sync').then(({ SyncClient }) => {
          SyncClient.syncWithDesktop(ip, parseInt(port, 10), token)
            .then(() => {
              logger.info('Auto-sync with desktop completed');
              loadInitialBooks(); // Refresh UI after sync
            })
            .catch(e => logger.error('Auto-sync failed: ' + e));
        });
      }
    }
  }, [loadInitialBooks]);

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
  const handleEditBook = useCallback((bookId: number) => dialogs.openEditDialog(bookId), [dialogs])

  const handleDeleteBook = useCallback((bookId: number) => {
    const book = books.find(b => b.id === bookId)
    dialogs.openDeleteDialog(bookId, book?.title || "this book")
  }, [books, dialogs])

  const handleDeleteBooks = useCallback((bookIds: number[]) => dialogs.openDeleteMultipleDialog(bookIds), [dialogs])
  const handleViewDetails = useCallback((bookId: number) => dialogs.openDetailsDialog(bookId), [dialogs])

  // ── Render ──
  const isAppReady = isOnboardingHydrated && !isOnboardingInitializing;

  const renderContent = () => {
    if (isReaderOpen && selectedBookId) {
      return (
        <>
          <SectionErrorBoundary label="Reader">
            <Suspense fallback={<LoadingSpinner />}>
              <ReaderLayout bookId={selectedBookId} onClose={handleCloseReader} />
            </Suspense>
          </SectionErrorBoundary>
          <ToastContainer />
        </>
      )
    }

    if (currentView === 'online-manga-reader') {
      return (
        <>
          <SectionErrorBoundary label="Online Manga Reader">
            <Suspense fallback={<LoadingSpinner />}>
              <OnlineMangaReader />
            </Suspense>
          </SectionErrorBoundary>
          <ToastContainer />
        </>
      )
    }

    if (!isOnboardingHydrated || isOnboardingInitializing || !isPreferencesLoaded) {
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
        onOpenRSSFeeds={() => handleNavigate('rss-feeds')}
        onOpenRSSArticles={() => handleNavigate('rss-articles')}
        onGoHome={() => resetToHome()}
        onAutoGroupManga={handleAutoGroupManga}
        onOpenAdvancedFilter={() => dialogs.setAdvancedFilterOpen(true)}
        activeFilterCount={countActiveFilterCriteria(activeFilters)}
        searchQuery={activeTopbarSearchQuery}
        onSearchChange={handleSearchChange}
        currentView={currentView}
        onNavigateToView={handleNavigate}
        onBackToLibrary={() => handleNavigate('library')}
        currentDomain={currentDomain}
        onDomainChange={handleDomainChange}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={currentView}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="w-full h-full"
          >
            <ViewRouter
              currentView={currentView}
              currentDomain={currentDomain}
              displayBooks={displayBooks}
              handleNavigate={handleNavigate}
              handleOpenBook={handleOpenBook}
              handleViewDetails={handleViewDetails}
              handleEditBook={handleEditBook}
              handleDeleteBook={handleDeleteBook}
              searchQuery={activeTopbarSearchQuery}
              onSearchChange={handleSearchChange}
              onOpenAdvancedFilter={() => dialogs.setAdvancedFilterOpen(true)}
              dialogs={dialogs}
            />
          </motion.div>
        </AnimatePresence>
      </Layout>

      <ToastContainer />
      {/* Global Dialogs */}
      <Suspense fallback={null}>
        <GlobalDialogs
          books={books}
          dialogs={dialogs}
          autoConvert={autoConvert}
          resumeReading={resumeReading}
          handleOpenBook={handleOpenBook}
          handleViewDetails={handleViewDetails}
          handleEditBook={handleEditBook}
          handleDeleteBook={handleDeleteBook}
          clearSelection={clearSelection}
          loadInitialBooks={loadInitialBooks}
        />
      </Suspense>
        <Suspense fallback={null}>
          <MigrationDialog 
            open={showMigrationDialog} 
            onOpenChange={setShowMigrationDialog} 
          />
        </Suspense>
      </>
    )
  }

  return (
    <>
      {!splashFinished && (
        <AndroidSplashScreen
          isReady={isAppReady}
          onAnimationEnd={() => setSplashFinished(true)}
        />
      )}
      <SwipeGestureHandler>
        {renderContent()}
      </SwipeGestureHandler>

    </>
  )
}

export default App
