import { useEffect, useState, useMemo, useCallback, lazy, Suspense } from "react"
import { Layout } from "./components/layout/Layout"
import { LibraryGrid } from "./components/library/LibraryGrid"
import { ToastContainer } from "./components/ui/ToastContainer"
import { DevBanner } from "./components/DevBanner"
import { useLibraryStore } from "./store/libraryStore"
import { useReaderStore } from "./store/readerStore"
import { useUIStore } from "./store/uiStore"
import { useCollectionStore } from "./store/collectionStore"
import { useConversionStore } from "./store/conversionStore"
import { useToastStore } from "./store/toastStore"
import { api, type Book } from "./lib/tauri"

const ReaderLayout = lazy(() => import("./components/reader/ReaderLayout").then(m => ({ default: m.ReaderLayout })))
const EditMetadataDialog = lazy(() => import("./components/library/EditMetadataDialog").then(m => ({ default: m.EditMetadataDialog })))
const DeleteBookDialog = lazy(() => import("./components/library/DeleteBookDialog").then(m => ({ default: m.DeleteBookDialog })))
const SettingsDialog = lazy(() => import("./components/settings/SettingsDialog").then(m => ({ default: m.SettingsDialog })))
const BookDetailsDialog = lazy(() => import("./components/library/BookDetailsDialog").then(m => ({ default: m.BookDetailsDialog })))
const ConversionDialog = lazy(() => import("./components/conversion/ConversionDialog").then(m => ({ default: m.ConversionDialog })))
const ConversionJobTracker = lazy(() => import("./components/conversion/ConversionJobTracker"))
const RSSFeedManager = lazy(() => import("./components/rss/RSSFeedManager"))
const RSSArticleList = lazy(() => import("./components/rss/RSSArticleList"))
const ShareBookDialog = lazy(() => import("./components/share/ShareBookDialog"))
const OnboardingWizard = lazy(() => import("./components/onboarding/OnboardingWizard").then(m => ({ default: m.OnboardingWizard })))
const HomePage = lazy(() => import("./components/home/HomePage").then(m => ({ default: m.HomePage })))
const AnnotationsView = lazy(() => import("./components/annotations/AnnotationsView").then(m => ({ default: m.AnnotationsView })))
const StatisticsView = lazy(() => import("./components/statistics/StatisticsView").then(m => ({ default: m.StatisticsView })))

function App() {
  // Check if user has completed onboarding
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isCheckingOnboarding, setIsCheckingOnboarding] = useState(true);

  useEffect(() => {
    // Check onboarding state from backend
    const checkOnboarding = async () => {
      try {
        const state = await api.getOnboardingState();
        setShowOnboarding(!state.completed);
      } catch (error) {
        console.error("Failed to check onboarding state:", error);
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

  // New feature dialogs
  const [conversionDialogOpen, setConversionDialogOpen] = useState(false)
  const [shareDialogOpen, setShareDialogOpen] = useState(false)

  // Theme is handled entirely by preferencesStore → [data-theme] attribute.
  // The old uiStore.theme / .dark class system has been removed.

  useEffect(() => {
    loadInitialBooks();
    api.getFavoriteBookIds().then(ids => {
      useLibraryStore.getState().setFavoriteBookIds(ids)
    }).catch(console.error)
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
        console.error("Failed to load collection books:", error)
        if (!aborted) setFilteredBooks([])
      }
    }

    filterByCollection()
    return () => { aborted = true }
  }, [selectedCollection, books])

  const handleOpenBook = useCallback(async (bookId: number) => {
    console.log('[App] Opening book:', bookId)
    try {
      const book = await api.getBook(bookId)
      console.log('[App] Got book:', book)
      const filePath = await api.getBookFilePath(bookId)
      console.log('[App] Got file path:', filePath)
      openBook(bookId, filePath, book.file_format)
      setSelectedBookId(bookId)
      console.log('[App] Book opened successfully')
    } catch (error) {
      console.error("[App] Failed to open book:", error)
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

  const handleDeleteBook = (bookId: number) => {
    console.log('[App] Delete book called:', bookId)
    const book = books.find(b => b.id === bookId)
    console.log('[App] Found book:', book)
    setDeleteBookIds([bookId])
    setDialogBookTitle(book?.title || "this book")
    setDeleteDialogOpen(true)
    console.log('[App] Delete dialog should open')
  }

  const handleDeleteBooks = (bookIds: number[]) => {
    console.log('[App] Delete multiple books called:', bookIds.length)
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
    console.log('[App] View details for book:', bookId)
    setDialogBookId(bookId)
    setDetailsDialogOpen(true)
  }

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

  const handleShareBook = (bookId: number) => {
    const book = books.find(b => b.id === bookId)
    if (book) {
      setDialogBookId(bookId)
      setDialogBookTitle(book.title)
      setShareDialogOpen(true)
    }
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

  const handleGoHome = () => {
    resetToHome()
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

    return result;
  }, [books, searchQuery, selectedFilters, selectedCollection, filteredBooks]);

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
  const handleOnboardingComplete = () => {
    console.log('[App] Onboarding completed')
    setShowOnboarding(false)
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
        onEditMetadata={handleEditBook}
        onDeleteBook={handleDeleteBook}
        onDeleteBooks={handleDeleteBooks}
        onDownloadBook={handleDownloadBook}
        onViewDetails={handleViewDetails}
        onConvertBook={handleConvertBook}
        onShareBook={handleShareBook}
        onOpenRSSFeeds={handleOpenRSSFeeds}
        onOpenRSSArticles={handleOpenRSSArticles}
        onGoHome={handleGoHome}
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
            onEditBook={handleEditBook}
            onDeleteBook={handleDeleteBook}
            onConvertBook={handleConvertBook}
            onShareBook={handleShareBook}
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

        {/* Show Statistics view */}
        {currentView === 'statistics' && (
          <StatisticsView onClose={handleBackToLibrary} />
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
      {dialogBookId !== null && (
        <Suspense fallback={null}>
          <ShareBookDialog
            isOpen={shareDialogOpen}
            onClose={() => setShareDialogOpen(false)}
            bookId={dialogBookId}
            bookTitle={dialogBookTitle}
          />
        </Suspense>
      )}
    </>
  )
}

export default App
