import { create } from "zustand"
import type { Book } from "../lib/tauri"

export interface FilterState {
  authors: string[]
  languages: string[]
  series: string[]
  formats: string[]
  publishers: string[]
  ratings: string[]
  tags: string[]
  identifiers: string[]
}

const initialFilters: FilterState = {
  authors: [],
  languages: [],
  series: [],
  formats: [],
  publishers: [],
  ratings: [],
  tags: [],
  identifiers: [],
}

interface LibraryStore {
  books: Book[]
  selectedBook: Book | null
  selectedBookIds: Set<number>
  bulkSelectMode: boolean
  viewMode: "grid" | "list" | "table"
  selectedFilters: FilterState
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
  toggleFilter: (category: keyof FilterState, id: string) => void
  clearFilters: () => void
}

export const useLibraryStore = create<LibraryStore>((set) => ({
  books: [],
  selectedBook: null,
  selectedBookIds: new Set(),
  bulkSelectMode: false,
  viewMode: "grid",
  selectedFilters: initialFilters,
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
  toggleFilter: (category, id) =>
    set((state) => {
      const current = state.selectedFilters[category];
      const next = current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id];

      return {
        selectedFilters: {
          ...state.selectedFilters,
          [category]: next,
        },
      };
    }),
  clearFilters: () => set({ selectedFilters: initialFilters }),
}))
