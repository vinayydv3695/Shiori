import { useEffect, useState } from "react"
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
import { Onboarding } from "./components/onboarding/Onboarding"
import { useLibraryStore } from "./store/libraryStore"
import { useReaderStore } from "./store/readerStore"
import { useUIStore } from "./store/uiStore"
import { useCollectionStore } from "./store/collectionStore"
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
    setBooks,
    selectedBookIds,
    toggleBookSelection,
    clearSelection,
    selectedFilters
  } = useLibraryStore()
  const { isReaderOpen, openBook, closeBook } = useReaderStore()
  const { theme, currentView, currentDomain, setCurrentView, setCurrentDomain, resetToHome } = useUIStore()
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

  useEffect(() => {
    // Apply theme to document
    document.documentElement.classList.toggle("dark", theme === "dark")
  }, [theme])

  useEffect(() => {
    // Load books on mount
    const loadBooks = async () => {
      try {
        const loadedBooks = await api.getBooks()
        setBooks(loadedBooks)
      } catch (error) {
        console.error("Failed to load books:", error)
      }
    }

    loadBooks()
  }, [setBooks])

  useEffect(() => {
    // Filter books when collection changes
    const filterByCollection = async () => {
      if (!selectedCollection) {
        setFilteredBooks(books)
        return
      }

      try {
        const collectionBooks = await api.getCollectionBooks(selectedCollection.id!)
        setFilteredBooks(collectionBooks)
      } catch (error) {
        console.error("Failed to load collection books:", error)
        setFilteredBooks([])
      }
    }

    filterByCollection()
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
      alert(`Failed to open book: ${error}`)
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
      // Show file location - user can copy/open from there
      console.log('Book file path:', book.file_path)
      alert(`Book file location:\n${book.file_path}\n\nYou can copy this file from the location shown above.`)
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
    return <Onboarding onComplete={handleOnboardingComplete} />
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
        {currentView === 'rss-feeds' && <RSSFeedManager />}

        {/* Show RSS Articles view */}
        {currentView === 'rss-articles' && <RSSArticleList />}

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

      {/* Conversion Job Tracker - Always visible when there are jobs */}
      <ConversionJobTracker position="bottom-right" autoHide={true} />

      <ToastContainer />

      {/* Dialogs */}
      {dialogBookId && (
        <>
          <EditMetadataDialog
            open={editDialogOpen}
            onOpenChange={setEditDialogOpen}
            bookId={dialogBookId}
          />
          <DeleteBookDialog
            open={deleteDialogOpen}
            onOpenChange={setDeleteDialogOpen}
            bookIds={deleteBookIds}
            bookTitle={dialogBookTitle}
          />
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
        </>
      )}
      <SettingsDialog
        open={settingsDialogOpen}
        onOpenChange={setSettingsDialogOpen}
      />

      {/* Conversion Dialog */}
      {dialogBookId && (
        <ConversionDialog
          isOpen={conversionDialogOpen}
          onClose={() => setConversionDialogOpen(false)}
          bookId={dialogBookId}
        />
      )}

      {/* Share Dialog */}
      {dialogBookId && (
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
