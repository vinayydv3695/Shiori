import { create } from "zustand"
import type { Book } from "../lib/tauri"

interface LibraryStore {
  books: Book[]
  selectedBook: Book | null
  selectedBookIds: Set<number>
  bulkSelectMode: boolean
  viewMode: "grid" | "list" | "table"
  setBooks: (books: Book[]) => void
  setSelectedBook: (book: Book | null) => void
  setViewMode: (mode: "grid" | "list" | "table") => void
  addBook: (book: Book) => void
  updateBook: (book: Book) => void
  removeBook: (id: number) => void
  toggleBookSelection: (id: number) => void
  selectAllBooks: (bookIds: number[]) => void
  clearSelection: () => void
  setBulkSelectMode: (enabled: boolean) => void
}

export const useLibraryStore = create<LibraryStore>((set) => ({
  books: [],
  selectedBook: null,
  selectedBookIds: new Set(),
  bulkSelectMode: false,
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
  toggleBookSelection: (id) =>
    set((state) => {
      const newSelection = new Set(state.selectedBookIds);
      if (newSelection.has(id)) {
        newSelection.delete(id);
      } else {
        newSelection.add(id);
      }
      return { selectedBookIds: newSelection };
    }),
  selectAllBooks: (bookIds) =>
    set({ selectedBookIds: new Set(bookIds) }),
  clearSelection: () =>
    set({ selectedBookIds: new Set(), bulkSelectMode: false }),
  setBulkSelectMode: (enabled) =>
    set({ bulkSelectMode: enabled, selectedBookIds: enabled ? new Set() : new Set() }),
}))
