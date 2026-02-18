import { useEffect, useState } from "react"
import { Layout } from "./components/layout/Layout"
import { LibraryGrid } from "./components/library/LibraryGrid"
import { ModernListView } from "./components/library/ModernListView"
import { ModernTableView } from "./components/library/ModernTableView"
import { ReaderLayout } from "./components/reader/ReaderLayout"
import { EditMetadataDialog } from "./components/library/EditMetadataDialog"
import { DeleteBookDialog } from "./components/library/DeleteBookDialog"
import { SettingsDialog } from "./components/library/SettingsDialog"
import { BookDetailsDialog } from "./components/library/BookDetailsDialog"
import { ToastContainer } from "./components/ui/ToastContainer"
import { DevBanner } from "./components/DevBanner"
import { useLibraryStore } from "./store/libraryStore"
import { useReaderStore } from "./store/readerStore"
import { useUIStore } from "./store/uiStore"
import { useCollectionStore } from "./store/collectionStore"
import { api, type Book } from "./lib/tauri"

function App() {
  const { 
    books, 
    setBooks, 
    viewMode, 
    selectedBookIds, 
    toggleBookSelection,
    clearSelection 
  } = useLibraryStore()
  const { isReaderOpen, openBook, closeBook } = useReaderStore()
  const { theme } = useUIStore()
  const { selectedCollection } = useCollectionStore()
  const [selectedBookId, setSelectedBookId] = useState<number | null>(null)
  const [filteredBooks, setFilteredBooks] = useState<Book[]>([])
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false)
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false)
  const [dialogBookId, setDialogBookId] = useState<number | null>(null)
  const [dialogBookTitle, setDialogBookTitle] = useState<string>("")
  const [searchQuery, setSearchQuery] = useState<string>("")

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
    setDialogBookId(bookId)
    setDialogBookTitle(book?.title || "this book")
    setDeleteDialogOpen(true)
    console.log('[App] Delete dialog should open')
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

  // Filter books based on search query
  const filterBooks = (books: Book[]) => {
    if (!searchQuery.trim()) return books
    
    const query = searchQuery.toLowerCase()
    return books.filter(book => 
      book.title.toLowerCase().includes(query) ||
      book.authors?.some(a => a.name.toLowerCase().includes(query)) ||
      book.tags?.some(t => t.name.toLowerCase().includes(query)) ||
      book.publisher?.toLowerCase().includes(query) ||
      book.series?.toLowerCase().includes(query)
    )
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

  return (
    <>
      <DevBanner />
      <Layout 
        onOpenSettings={handleOpenSettings}
        onEditMetadata={handleEditBook}
        onDeleteBook={handleDeleteBook}
        onViewBook={handleOpenBook}
        onDownloadBook={handleDownloadBook}
        onViewDetails={handleViewDetails}
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
      >
        {/* Library view based on viewMode */}
        {viewMode === "grid" && (
          <LibraryGrid 
            books={displayBooks} 
            onBookClick={handleOpenBook}
            onEditBook={handleEditBook}
            onDeleteBook={handleDeleteBook}
            onDownloadBook={handleDownloadBook}
          />
        )}
        
        {viewMode === "list" && (
          <ModernListView
            books={displayBooks}
            selectedBooks={selectedBookIds}
            onSelectBook={toggleBookSelection}
            onOpenBook={handleOpenBook}
            onEditBook={handleEditBook}
            onDeleteBook={handleDeleteBook}
            onDownloadBook={handleDownloadBook}
          />
        )}
        
        {viewMode === "table" && (
          <ModernTableView
            books={displayBooks}
            selectedBooks={selectedBookIds}
            onSelectBook={toggleBookSelection}
            onOpenBook={handleOpenBook}
            onEditBook={handleEditBook}
            onDeleteBook={handleDeleteBook}
            onDownloadBook={handleDownloadBook}
          />
        )}
      </Layout>
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
            bookId={dialogBookId}
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
    </>
  )
}

export default App
