import { create } from "zustand"
import type { Book } from "../lib/tauri"

interface LibraryStore {
  books: Book[]
  selectedBook: Book | null
  viewMode: "grid" | "list" | "table"
  setBooks: (books: Book[]) => void
  setSelectedBook: (book: Book | null) => void
  setViewMode: (mode: "grid" | "list" | "table") => void
  addBook: (book: Book) => void
  updateBook: (book: Book) => void
  removeBook: (id: number) => void
}

export const useLibraryStore = create<LibraryStore>((set) => ({
  books: [],
  selectedBook: null,
  viewMode: "grid",
  setBooks: (books) => set({ books }),
  setSelectedBook: (selectedBook) => set({ selectedBook }),
  setViewMode: (viewMode) => set({ viewMode }),
  addBook: (book) => set((state) => ({ books: [book, ...state.books] })),
  updateBook: (book) =>
    set((state) => ({
      books: state.books.map((b) => (b.id === book.id ? book : b)),
    })),
  removeBook: (id) =>
    set((state) => ({
      books: state.books.filter((b) => b.id !== id),
    })),
}))
