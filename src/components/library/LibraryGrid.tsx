import type { Book } from "../../lib/tauri"
import { BookOpen } from "lucide-react"
import { ModernBookCard } from "./ModernBookCard"
import { useLibraryStore } from "../../store/libraryStore"

interface LibraryGridProps {
  books: Book[]
  onBookClick?: (bookId: number) => void
  onEditBook?: (bookId: number) => void
  onDeleteBook?: (bookId: number) => void
  onDownloadBook?: (bookId: number) => void
}

export function LibraryGrid({ books, onBookClick, onEditBook, onDeleteBook, onDownloadBook }: LibraryGridProps) {
  const { 
    setSelectedBook, 
    selectedBookIds, 
    toggleBookSelection,
    bulkSelectMode 
  } = useLibraryStore()

  const handleOpenBook = (bookId: number) => {
    const book = books.find(b => b.id === bookId)
    if (book) {
      setSelectedBook(book)
    }
    if (onBookClick) {
      onBookClick(bookId)
    }
  }

  const handleSelectBook = (bookId: number) => {
    toggleBookSelection(bookId)
  }

  const handleEditBook = (bookId: number) => {
    if (onEditBook) {
      onEditBook(bookId)
    }
  }

  const handleDeleteBook = (bookId: number) => {
    if (onDeleteBook) {
      onDeleteBook(bookId)
    }
  }

  const handleDownloadBook = (bookId: number) => {
    if (onDownloadBook) {
      onDownloadBook(bookId)
    }
  }

  if (books.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <BookOpen className="w-16 h-16 text-muted-foreground/30 mb-4" />
        <h3 className="text-lg font-semibold mb-2">No books found</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Try adjusting your filters or import some books to get started.
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
      {books.map((book) => (
        <ModernBookCard
          key={book.id}
          book={book}
          isSelected={selectedBookIds.has(book.id!)}
          onSelect={handleSelectBook}
          onOpen={handleOpenBook}
          onEdit={handleEditBook}
          onDelete={handleDeleteBook}
          onDownload={handleDownloadBook}
        />
      ))}
    </div>
  )
}
