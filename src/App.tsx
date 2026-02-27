import { useEffect, useState, useRef } from "react"
import { Layout } from "./components/layout/Layout"
import { LibraryGrid } from "./components/library/LibraryGrid"
import { ReaderLayout } from "./components/reader/ReaderLayout"
import { EditMetadataDialog } from "./components/library/EditMetadataDialog"
import { DeleteBookDialog } from "./components/library/DeleteBookDialog"
import { SettingsDialog as OldSettingsDialog } from "./components/library/SettingsDialog"
import { SettingsDialog } from "./components/settings/SettingsDialog"
import { BookDetailsDialog } from "./components/library/BookDetailsDialog"
import { ToastContainer } from "./components/ui/ToastContainer"
import { DevBanner } from "./components/DevBanner"
import { ConversionDialog } from "./components/conversion/ConversionDialog"
import ConversionJobTracker from "./components/conversion/ConversionJobTracker"
import RSSFeedManager from "./components/rss/RSSFeedManager"
import RSSArticleList from "./components/rss/RSSArticleList"
import ShareBookDialog from "./components/share/ShareBookDialog"
import { OnboardingWizard } from "./components/onboarding/OnboardingWizard"
import { useLibraryStore } from "./store/libraryStore"
import { useReaderStore } from "./store/readerStore"
import { useUIStore } from "./store/uiStore"
import { useCollectionStore } from "./store/collectionStore"
import { useConversionStore } from "./store/conversionStore"
import { useToastStore } from "./store/toastStore"
import { api, type Book } from "./lib/tauri"

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
  const {
    books,
    loadInitialBooks,
    selectedBookIds,
    toggleBookSelection,
    clearSelection,
    selectedFilters
  } = useLibraryStore()
  const { isReaderOpen, openBook, closeBook } = useReaderStore()
  const { currentView, currentDomain, setCurrentView, setCurrentDomain, resetToHome } = useUIStore()
  const { selectedCollection } = useCollectionStore()
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
  const [rssManagerOpen, setRssManagerOpen] = useState(false)
  const [rssArticlesOpen, setRssArticlesOpen] = useState(false)

  // Theme is handled entirely by preferencesStore → [data-theme] attribute.
  // The old uiStore.theme / .dark class system has been removed.

  useEffect(() => {
    loadInitialBooks();
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

  const handleOpenBook = async (bookId: number) => {
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
  }

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

  // Filter books based on search query and selected filters
  const filterBooks = (books: Book[]) => {
    let result = books;

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
  }

  const displayBooks = filterBooks(filteredBooks.length > 0 || selectedCollection ? filteredBooks : books)

  // Show reader if open
  if (isReaderOpen && selectedBookId) {
    return (
      <>
        <ReaderLayout bookId={selectedBookId} onClose={handleCloseReader} />
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
    return null; // ThemeProvider already shows loading screen
  }

  // Show onboarding if not completed
  if (showOnboarding) {
    return <OnboardingWizard onComplete={handleOnboardingComplete} />
  }

  return (
    <>
      <DevBanner />
      <Layout
        onOpenSettings={handleOpenSettings}
        onEditMetadata={handleEditBook}
        onDeleteBook={handleDeleteBook}
        onDeleteBooks={handleDeleteBooks}
        onViewBook={handleOpenBook}
        onDownloadBook={handleDownloadBook}
        onViewDetails={handleViewDetails}
        onConvertBook={handleConvertBook}
        onShareBook={handleShareBook}
        onOpenRSSFeeds={handleOpenRSSFeeds}
        onOpenRSSArticles={handleOpenRSSArticles}
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        currentView={currentView}
        onBackToLibrary={handleBackToLibrary}
        currentDomain={currentDomain}
        onDomainChange={setCurrentDomain}
      >
        {/* Show RSS Feeds view */}
        {currentView === 'rss-feeds' && <RSSFeedManager onClose={handleBackToLibrary} />}

        {/* Show RSS Articles view */}
        {currentView === 'rss-articles' && <RSSArticleList onClose={handleBackToLibrary} />}

        {/* Show Library view */}
        {currentView === 'library' && (
          <LibraryGrid
            books={displayBooks}
            currentDomain={currentDomain}
            onBookClick={handleOpenBook}
            onEditBook={handleEditBook}
            onDeleteBook={handleDeleteBook}
            onDownloadBook={handleDownloadBook}
            onConvertBook={handleConvertBook}
            onShareBook={handleShareBook}
          />
        )}
      </Layout>

      {/* Global Overlays */}
      <ConversionJobTracker />

      <ToastContainer />

      {/* Dialogs — only render when we have a valid bookId */}
      {dialogBookId !== null && (
        <EditMetadataDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          bookId={dialogBookId}
        />
      )}
      <DeleteBookDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open)
          if (!open) clearSelection()
        }}
        bookIds={deleteBookIds}
        bookTitle={dialogBookTitle}
      />
      {dialogBookId !== null && (
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
      )}
      <SettingsDialog
        open={settingsDialogOpen}
        onOpenChange={setSettingsDialogOpen}
      />
      {/* Conversion Dialog */}
      {dialogBookId !== null && (
        <ConversionDialog
          open={conversionDialogOpen}
          onOpenChange={(open) => setConversionDialogOpen(open)}
          bookId={dialogBookId}
        />
      )}
      {dialogBookId !== null && (
        <ShareBookDialog
          isOpen={shareDialogOpen}
          onClose={() => setShareDialogOpen(false)}
          bookId={dialogBookId}
          bookTitle={dialogBookTitle}
        />
      )}
    </>
  )
}

export default App
