import { Book } from "../../lib/tauri"
import { BookCard } from "./BookCard"
import { useLibraryStore } from "../../store/libraryStore"

interface LibraryGridProps {
  books: Book[]
}

export function LibraryGrid({ books }: LibraryGridProps) {
  const { setSelectedBook } = useLibraryStore()

  if (books.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-lg font-medium text-muted-foreground">
          No books in your library
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Import books to get started
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
      {books.map((book) => (
        <BookCard
          key={book.id}
          book={book}
          onClick={() => setSelectedBook(book)}
        />
      ))}
    </div>
  )
}
