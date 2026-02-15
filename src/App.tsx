import { useEffect, useState } from "react"
import { Layout } from "./components/layout/Layout"
import { LibraryGrid } from "./components/library/LibraryGrid"
import { ModernListView } from "./components/library/ModernListView"
import { ModernTableView } from "./components/library/ModernTableView"
import { ReaderLayout } from "./components/reader/ReaderLayout"
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
    try {
      const book = await api.getBook(bookId)
      const filePath = await api.getBookFilePath(bookId)
      openBook(bookId, filePath, book.file_format)
      setSelectedBookId(bookId)
    } catch (error) {
      console.error("Failed to open book:", error)
    }
  }

  const handleEditBook = (bookId: number) => {
    console.log("Edit book:", bookId)
    // TODO: Open edit metadata dialog
  }

  const handleDeleteBook = (bookId: number) => {
    console.log("Delete book:", bookId)
    // TODO: Show delete confirmation dialog
  }

  const handleDownloadBook = (bookId: number) => {
    console.log("Download book:", bookId)
    // TODO: Trigger download
  }

  const handleCloseReader = () => {
    closeBook()
    setSelectedBookId(null)
  }

  const displayBooks = filteredBooks.length > 0 || selectedCollection ? filteredBooks : books

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
      <Layout>
        {/* Library view based on viewMode */}
        {viewMode === "grid" && (
          <LibraryGrid books={displayBooks} onBookClick={handleOpenBook} />
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
    </>
  )
}

export default App
