import { useEffect, useState, useMemo, useCallback, lazy, Suspense } from "react"
import { Layout } from "./components/layout/Layout"
import { LibraryGrid } from "./components/library/LibraryGrid"
import { ToastContainer } from "./components/ui/ToastContainer"
import { DevBanner } from "./components/DevBanner"
import { logger } from "./lib/logger"
import { useLibraryStore, matchesAdvancedFilters, countActiveFilterCriteria } from "./store/libraryStore"
import { useReaderStore } from "./store/readerStore"
import { useUIStore } from "./store/uiStore"
import { useCollectionStore } from "./store/collectionStore"
import { useConversionStore } from "./store/conversionStore"
import { useToastStore } from "./store/toastStore"
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts"
import { api, type Book } from "./lib/tauri"
import type { SeriesGroup } from "./hooks/useGroupedLibrary"
import { ShortcutsDialog } from "./components/dialogs/ShortcutsDialog"

const ReaderLayout = lazy(() => import("./components/reader/ReaderLayout").then(m => ({ default: m.ReaderLayout })))
const EditMetadataDialog = lazy(() => import("./components/library/EditMetadataDialog").then(m => ({ default: m.EditMetadataDialog })))
const DeleteBookDialog = lazy(() => import("./components/library/DeleteBookDialog").then(m => ({ default: m.DeleteBookDialog })))
const SettingsDialog = lazy(() => import("./components/settings/SettingsDialog").then(m => ({ default: m.SettingsDialog })))
const BookDetailsDialog = lazy(() => import("./components/library/BookDetailsDialog").then(m => ({ default: m.BookDetailsDialog })))
const ConversionDialog = lazy(() => import("./components/conversion/ConversionDialog").then(m => ({ default: m.ConversionDialog })))
const ConversionJobTracker = lazy(() => import("./components/conversion/ConversionJobTracker"))
const MetadataSearchDialog = lazy(() => import("./components/library/MetadataSearchDialog").then(m => ({ default: m.MetadataSearchDialog })))
const RSSFeedManager = lazy(() => import("./components/rss/RSSFeedManager"))
const RSSArticleList = lazy(() => import("./components/rss/RSSArticleList"))
const OnboardingWizard = lazy(() => import("./components/onboarding/OnboardingWizard").then(m => ({ default: m.OnboardingWizard })))
const HomePage = lazy(() => import("./components/home/HomePage").then(m => ({ default: m.HomePage })))
const AnnotationsView = lazy(() => import("./components/annotations/AnnotationsView").then(m => ({ default: m.AnnotationsView })))
const StatisticsView = lazy(() => import("./components/statistics/StatisticsView").then(m => ({ default: m.StatisticsView })))
const SeriesView = lazy(() => import("./components/library/SeriesView").then(m => ({ default: m.SeriesView })))
const DuplicateFinderDialog = lazy(() => import("./components/library/DuplicateFinderDialog").then(m => ({ default: m.DuplicateFinderDialog })))
const AdvancedFilterDialog = lazy(() => import("./components/library/AdvancedFilterDialog").then(m => ({ default: m.AdvancedFilterDialog })))
const OnlineBooksView = lazy(() => import("./components/online/OnlineBooksView").then(m => ({ default: m.OnlineBooksView })))
const OnlineMangaView = lazy(() => import("./components/online/OnlineMangaView").then(m => ({ default: m.OnlineMangaView })))

function App() {
  // Check if user has completed onboarding
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isCheckingOnboarding, setIsCheckingOnboarding] = useState(true);
  const [shortcutsDialogOpen, setShortcutsDialogOpen] = useState(false);

  useEffect(() => {
    // Check onboarding state from backend
    const checkOnboarding = async () => {
      try {
        const state = await api.getOnboardingState();
        setShowOnboarding(!state.completed);
      } catch (error) {
         logger.error("Failed to check onboarding state:", error);
         // Default to showing onboarding if check fails
        setShowOnboarding(true);
      } finally {
        setIsCheckingOnboarding(false);
      }
    };

    checkOnboarding();
  }, []);
  const books = useLibraryStore(state => state.books)
  const loadInitialBooks = useLibraryStore(state => state.loadInitialBooks)
  const clearSelection = useLibraryStore(state => state.clearSelection)
  const selectedFilters = useLibraryStore(state => state.selectedFilters)
  const activeFilters = useLibraryStore(state => state.activeFilters)
  const isReaderOpen = useReaderStore(state => state.isReaderOpen)
  const openBook = useReaderStore(state => state.openBook)
  const closeBook = useReaderStore(state => state.closeBook)
  const currentView = useUIStore(state => state.currentView)
  const currentDomain = useUIStore(state => state.currentDomain)
  const setCurrentView = useUIStore(state => state.setCurrentView)
  const setCurrentDomain = useUIStore(state => state.setCurrentDomain)
  const resetToHome = useUIStore(state => state.resetToHome)
  const selectedCollection = useCollectionStore(state => state.selectedCollection)
  const [selectedBookId, setSelectedBookId] = useState<number | null>(null)
  const [filteredBooks, setFilteredBooks] = useState<Book[]>([])
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false)
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false)
  const [dialogBookId, setDialogBookId] = useState<number | null>(null)
  const [dialogBookTitle, setDialogBookTitle] = useState<string>("")
  const [deleteBookIds, setDeleteBookIds] = useState<number[]>([])
  const [searchQuery, setSearchQuery] = useState<string>("")
  const [selectedSeries, setSelectedSeries] = useState<SeriesGroup | null>(null)
  const [seriesViewOpen, setSeriesViewOpen] = useState(false)
  
  const [batchMetadataDialogOpen, setBatchMetadataDialogOpen] = useState(false)
  const [batchMetadataBookIds, setBatchMetadataBookIds] = useState<number[]>([])

  // New feature dialogs
  const [conversionDialogOpen, setConversionDialogOpen] = useState(false)
  const [duplicateFinderOpen, setDuplicateFinderOpen] = useState(false)
  const [advancedFilterOpen, setAdvancedFilterOpen] = useState(false)

  // Theme is handled entirely by preferencesStore → [data-theme] attribute.
  // The old uiStore.theme / .dark class system has been removed.

  useEffect(() => {
    loadInitialBooks();
    api.getFavoriteBookIds().then(ids => {
      useLibraryStore.getState().setFavoriteBookIds(ids)
    }).catch(logger.error)
  }, [loadInitialBooks])

  // Initialize conversion event listeners once at app startup
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    useConversionStore.getState().initEventListeners().then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, [])

  useEffect(() => {
    const handleOpenBookEvent = (e: Event) => {
      const bookId = (e as CustomEvent<{ bookId: number }>).detail?.bookId;
      if (bookId) {
        handleOpenBook(bookId);
      }
    };
    window.addEventListener('open-book', handleOpenBookEvent);
    return () => window.removeEventListener('open-book', handleOpenBookEvent);
  }, []);

  useEffect(() => {
    // Filter books when collection changes
    let aborted = false;

    const filterByCollection = async () => {
      if (!selectedCollection) {
        if (!aborted) setFilteredBooks(books)
        return
      }

       try {
         const collectionBooks = await api.getCollectionBooks(selectedCollection.id!)
         if (!aborted) setFilteredBooks(collectionBooks)
       } catch (error) {
         logger.error("Failed to load collection books:", error)
         if (!aborted) setFilteredBooks([])
       }
    }

    filterByCollection()
    return () => { aborted = true }
  }, [selectedCollection, books])

   const handleOpenBook = useCallback(async (bookId: number) => {
     logger.debug('[App] Opening book:', bookId)
     try {
       const book = await api.getBook(bookId)
       logger.debug('[App] Got book:', book)
       const filePath = await api.getBookFilePath(bookId)
       logger.debug('[App] Got file path:', filePath)
       openBook(bookId, filePath, book.file_format)
       setSelectedBookId(bookId)
       logger.debug('[App] Book opened successfully')
     } catch (error) {
       logger.error("[App] Failed to open book:", error)
      useToastStore.getState().addToast({
        title: "Failed to open book",
        description: String(error),
        variant: "error",
      })
    }
  }, [openBook])

  const handleEditBook = (bookId: number) => {
    setDialogBookId(bookId)
    setEditDialogOpen(true)
  }

  const handleFetchMetadata = () => {
    const lib = useLibraryStore.getState()
    if (lib.selectedBookIds.size > 0) {
      setBatchMetadataBookIds(Array.from(lib.selectedBookIds))
      setBatchMetadataDialogOpen(true)
    }
  }

   const handleDeleteBook = (bookId: number) => {
     logger.debug('[App] Delete book called:', bookId)
     const book = books.find(b => b.id === bookId)
     logger.debug('[App] Found book:', book)
     setDeleteBookIds([bookId])
     setDialogBookTitle(book?.title || "this book")
     setDeleteDialogOpen(true)
     logger.debug('[App] Delete dialog should open')
   }

   const handleDeleteBooks = (bookIds: number[]) => {
     logger.debug('[App] Delete multiple books called:', bookIds.length)
    setDeleteBookIds(bookIds)
    setDialogBookTitle("") // Not used for multiple
    setDeleteDialogOpen(true)
  }

  const handleDownloadBook = (bookId: number) => {
    const book = books.find(b => b.id === bookId)
    if (book) {
      // Copy file path to clipboard and notify via toast
      navigator.clipboard.writeText(book.file_path).then(
        () => {
          useToastStore.getState().addToast({
            title: "File path copied",
            description: book.file_path,
            variant: "info",
          })
        },
        () => {
          useToastStore.getState().addToast({
            title: "Book file location",
            description: book.file_path,
            variant: "info",
          })
        }
      )
    }
  }

  const handleOpenSettings = () => {
    setSettingsDialogOpen(true)
  }

   const handleViewDetails = (bookId: number) => {
     logger.debug('[App] View details for book:', bookId)
    setDialogBookId(bookId)
    setDetailsDialogOpen(true)
  }

  // Global keyboard shortcut: Cmd/Ctrl+I to view details of selected book
  useKeyboardShortcuts({
    'cmd+i': () => {
      const lib = useLibraryStore.getState()
      const selected = lib.selectedBook ?? (
        lib.selectedBookIds.size ? lib.books.find(b => lib.selectedBookIds.has(b.id!)) : null
      )
      if (!selected?.id) return
      handleViewDetails(selected.id)
    },
    'cmd+shift+m': () => {
      handleFetchMetadata()
    },
    'cmd+shift+f': () => {
      setAdvancedFilterOpen(true)
    },
    '?': () => {
      setShortcutsDialogOpen(true)
    },
    'ctrl+/': () => {
      setShortcutsDialogOpen(true)
    }
  })

  const handleCloseReader = () => {
    closeBook()
    setSelectedBookId(null)
  }

  const handleSearchChange = (query: string) => {
    setSearchQuery(query)
  }

  const handleConvertBook = (bookId: number) => {
    setDialogBookId(bookId)
    setConversionDialogOpen(true)
  }

  const handleOpenRSSFeeds = () => {
    setCurrentView('rss-feeds')
  }

  const handleOpenRSSArticles = () => {
    setCurrentView('rss-articles')
  }

  const handleBackToLibrary = () => {
    setCurrentView('library')
  }

  const handleViewSeries = (series: SeriesGroup) => {
    setSelectedSeries(series)
    setSeriesViewOpen(true)
  }

  const handleGoHome = () => {
    resetToHome()
  }

  const handleAutoGroupManga = async () => {
    try {
      const count = await api.autoGroupMangaVolumes()
      if (count > 0) {
        useToastStore.getState().addToast({
          title: "Auto-grouping complete",
          description: `Grouped ${count} manga volume${count > 1 ? 's' : ''} into series`,
          variant: "success",
        })
        // Refresh library to show grouped series
        await loadInitialBooks()
      } else {
        useToastStore.getState().addToast({
          title: "No volumes grouped",
          description: "No manga volumes matched the auto-grouping pattern",
          variant: "info",
        })
      }
     } catch (error) {
       logger.error("Auto-grouping failed:", error)
      useToastStore.getState().addToast({
        title: "Auto-grouping failed",
        description: String(error),
        variant: "error",
      })
    }
  }

  // Filter books based on search query and selected filters
  const displayBooks = useMemo(() => {
    const sourceBooks = filteredBooks.length > 0 || selectedCollection ? filteredBooks : books;
    let result = sourceBooks;

    // 1. Search Query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter(book =>
        book.title.toLowerCase().includes(query) ||
        book.authors?.some(a => a.name.toLowerCase().includes(query)) ||
        book.tags?.some(t => t.name.toLowerCase().includes(query)) ||
        book.publisher?.toLowerCase().includes(query) ||
        book.series?.toLowerCase().includes(query)
      )
    }

    // 2. Filters
    const {
      authors, languages, series, formats,
      publishers, ratings, tags, identifiers
    } = selectedFilters;

    if (authors.length > 0) {
      result = result.filter(book =>
        book.authors?.some(a => a.name && authors.includes(a.name))
      )
    }

    if (languages.length > 0) {
      result = result.filter(book =>
        book.language && languages.includes(book.language)
      )
    }

    if (series.length > 0) {
      result = result.filter(book =>
        book.series && series.includes(book.series)
      )
    }

    if (formats.length > 0) {
      result = result.filter(book =>
        book.file_format && formats.includes(book.file_format.toUpperCase())
      )
    }

    if (publishers.length > 0) {
      result = result.filter(book =>
        book.publisher && publishers.includes(book.publisher)
      )
    }

    if (ratings.length > 0) {
      result = result.filter(book => {
        if (!book.rating) return false;
        const roundedRating = (Math.round(book.rating * 2) / 2).toString();
        return ratings.includes(roundedRating);
      })
    }

    if (tags.length > 0) {
      result = result.filter(book =>
        book.tags?.some(t => t.name && tags.includes(t.name))
      )
    }

    if (identifiers.length > 0) {
      result = result.filter(book => {
        const ids = [];
        if (book.isbn) ids.push(`ISBN: ${book.isbn}`);
        if (book.isbn13) ids.push(`ISBN13: ${book.isbn13}`);
        return ids.some(id => identifiers.includes(id));
      })
    }

    if (activeFilters) {
      result = result.filter(book => matchesAdvancedFilters(book, activeFilters))
    }

    return result;
  }, [books, searchQuery, selectedFilters, selectedCollection, filteredBooks, activeFilters]);

  // Show reader if open
  if (isReaderOpen && selectedBookId) {
    return (
      <>
        <Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div></div>}>
          <ReaderLayout bookId={selectedBookId} onClose={handleCloseReader} />
        </Suspense>
        <ToastContainer />
      </>
    )
  }

   // Handle onboarding completion
   const handleOnboardingComplete = async () => {
     console.log('[App] handleOnboardingComplete called');
     logger.debug('[App] Onboarding completed');
     
     try {
       // Verify the backend onboarding state was actually updated
       console.log('[App] Checking backend onboarding state...');
       const state = await api.getOnboardingState();
       console.log('[App] Backend onboarding state:', state);
       
       if (!state.completed) {
         console.error('[App] WARNING: Backend reports onboarding NOT completed!');
         logger.error('[App] Onboarding completion mismatch - backend state not updated');
       } else {
         console.log('[App] ✓ Backend confirmed onboarding complete');
       }
     } catch (error) {
       console.error('[App] Failed to verify onboarding state:', error);
       logger.error('[App] Onboarding verification failed:', error);
     }
     
     console.log('[App] Setting showOnboarding to false');
     setShowOnboarding(false);
     console.log('[App] Onboarding flow complete');
   }

  // Show loading while checking onboarding state
  if (isCheckingOnboarding) {
    return null;
  }

  // Show onboarding if not completed
  if (showOnboarding) {
    return (
      <Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div></div>}>
        <OnboardingWizard onComplete={handleOnboardingComplete} />
      </Suspense>
    )
  }

  return (
    <>
      <DevBanner />
       <Layout
        onOpenSettings={handleOpenSettings}
        onOpenShortcuts={() => setShortcutsDialogOpen(true)}
        onEditMetadata={handleEditBook}
        onFetchMetadata={handleFetchMetadata}
        onDeleteBook={handleDeleteBook}
        onDeleteBooks={handleDeleteBooks}
        onDownloadBook={handleDownloadBook}
        onViewDetails={handleViewDetails}
        onConvertBook={handleConvertBook}
        onOpenRSSFeeds={handleOpenRSSFeeds}
        onOpenRSSArticles={handleOpenRSSArticles}
        onGoHome={handleGoHome}
        onAutoGroupManga={handleAutoGroupManga}
        onOpenAdvancedFilter={() => setAdvancedFilterOpen(true)}
        activeFilterCount={countActiveFilterCriteria(activeFilters)}
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        currentView={currentView}
        onBackToLibrary={handleBackToLibrary}
        currentDomain={currentDomain}
        onDomainChange={setCurrentDomain}
      >
        {/* Show Home dashboard view */}
        {currentView === 'home' && (
          <Suspense fallback={<div className="flex items-center justify-center py-24"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>}>
            <HomePage
              onOpenBook={handleOpenBook}
              onViewRSS={handleOpenRSSArticles}
            />
          </Suspense>
        )}

        {/* Show RSS Feeds view */}
        {currentView === 'rss-feeds' && (
          <Suspense fallback={<div className="flex items-center justify-center py-24"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>}>
            <RSSFeedManager onClose={handleBackToLibrary} />
          </Suspense>
        )}

        {/* Show RSS Articles view */}
        {currentView === 'rss-articles' && (
          <Suspense fallback={<div className="flex items-center justify-center py-24"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>}>
            <RSSArticleList onClose={handleBackToLibrary} />
          </Suspense>
        )}

        {/* Show Library view */}
        {currentView === 'library' && (
          <LibraryGrid
            books={displayBooks}
            currentDomain={currentDomain}
            onBookClick={handleOpenBook}
            onViewDetails={handleViewDetails}
            onEditBook={handleEditBook}
            onDeleteBook={handleDeleteBook}
            onConvertBook={handleConvertBook}
            onViewSeries={handleViewSeries}
          />
        )}

        {/* Show Annotations view */}
        {currentView === 'annotations' && (
          <Suspense fallback={<div className="flex items-center justify-center py-24"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>}>
            <AnnotationsView onClose={handleBackToLibrary} />
          </Suspense>
        )}

        {/* Show Statistics view */}
        {currentView === 'statistics' && (
          <Suspense fallback={<div className="flex items-center justify-center py-24"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>}>
            <StatisticsView onClose={handleBackToLibrary} />
          </Suspense>
        )}

        {/* Show Online Books view */}
        {currentView === 'online-books' && (
          <Suspense fallback={<div className="flex items-center justify-center py-24"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>}>
            <OnlineBooksView />
          </Suspense>
        )}

        {/* Show Online Manga view */}
        {currentView === 'online-manga' && (
          <Suspense fallback={<div className="flex items-center justify-center py-24"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>}>
            <OnlineMangaView />
          </Suspense>
        )}
      </Layout>

      {/* Global Overlays */}
      <Suspense fallback={null}>
        <ConversionJobTracker />
      </Suspense>

      <ToastContainer />

      {/* Dialogs — only render when we have a valid bookId */}
      {dialogBookId !== null && (
        <Suspense fallback={null}>
          <EditMetadataDialog
            open={editDialogOpen}
            onOpenChange={setEditDialogOpen}
            bookId={dialogBookId}
          />
        </Suspense>
      )}
      <Suspense fallback={null}>
        <DeleteBookDialog
          open={deleteDialogOpen}
          onOpenChange={(open) => {
            setDeleteDialogOpen(open)
            if (!open) clearSelection()
          }}
          bookIds={deleteBookIds}
          bookTitle={dialogBookTitle}
        />
      </Suspense>
      <Suspense fallback={null}>
        <MetadataSearchDialog
          open={batchMetadataDialogOpen}
          onOpenChange={(open) => {
            setBatchMetadataDialogOpen(open)
            if (!open) {
              setBatchMetadataBookIds([])
              loadInitialBooks()
            }
          }}
          bookIds={batchMetadataBookIds}
          onMetadataSelected={() => {
            loadInitialBooks()
          }}
        />
      </Suspense>
      {dialogBookId !== null && (
        <Suspense fallback={null}>
          <BookDetailsDialog
            open={detailsDialogOpen}
            onOpenChange={setDetailsDialogOpen}
            bookId={dialogBookId}
            onEdit={() => {
              setDetailsDialogOpen(false)
              setEditDialogOpen(true)
            }}
            onDelete={() => {
              const book = books.find(b => b.id === dialogBookId)
              setDialogBookTitle(book?.title || "this book")
              setDetailsDialogOpen(false)
              setDeleteDialogOpen(true)
            }}
            onRead={() => {
              setDetailsDialogOpen(false)
              handleOpenBook(dialogBookId)
            }}
          />
        </Suspense>
      )}
      <Suspense fallback={null}>
        <SettingsDialog
          open={settingsDialogOpen}
          onOpenChange={setSettingsDialogOpen}
        />
      </Suspense>
      {/* Conversion Dialog */}
      {dialogBookId !== null && (
        <Suspense fallback={null}>
          <ConversionDialog
            open={conversionDialogOpen}
            onOpenChange={(open) => setConversionDialogOpen(open)}
            bookId={dialogBookId}
          />
        </Suspense>
      )}
      
      {/* Series View Dialog */}
      {selectedSeries && (
        <Suspense fallback={null}>
          <SeriesView
            series={selectedSeries}
            isOpen={seriesViewOpen}
            onClose={() => setSeriesViewOpen(false)}
            onSelectBook={(id) => {}}
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
        <AdvancedFilterDialog
          open={advancedFilterOpen}
          onOpenChange={setAdvancedFilterOpen}
        />
      </Suspense>
      
      <ShortcutsDialog
        open={shortcutsDialogOpen}
        onOpenChange={setShortcutsDialogOpen}
      />
    </>
  )
}

export default App
