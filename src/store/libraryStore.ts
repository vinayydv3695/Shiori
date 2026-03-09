import { create } from "zustand"
import { api, type Book } from "../lib/tauri"

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

export type ReadingStatus = 'planning' | 'reading' | 'completed';

export interface FilterCriteria {
  textSearch?: string;
  authors?: string[];
  tags?: string[];
  formats?: string[];
  ratingMin?: number;
  ratingMax?: number;
  dateFrom?: string;
  dateTo?: string;
  readingStatus?: ReadingStatus[];
}

export interface FilterPreset {
  name: string;
  filters: FilterCriteria;
}

export function countActiveFilterCriteria(filters: FilterCriteria | null): number {
  if (!filters) return 0
  let count = 0
  if (filters.textSearch?.trim()) count++
  if (filters.authors?.length) count++
  if (filters.tags?.length) count++
  if (filters.formats?.length) count++
  if (filters.ratingMin !== undefined && filters.ratingMin > 0) count++
  if (filters.ratingMax !== undefined && filters.ratingMax < 5) count++
  if (filters.dateFrom) count++
  if (filters.dateTo) count++
  if (filters.readingStatus?.length) count++
  return count
}

/** AND between categories, OR within each category */
export function matchesAdvancedFilters(book: Book, filters: FilterCriteria): boolean {
  if (filters.textSearch?.trim()) {
    const q = filters.textSearch.toLowerCase()
    const titleMatch = book.title.toLowerCase().includes(q)
    const authorMatch = book.authors?.some(a => a.name.toLowerCase().includes(q))
    if (!titleMatch && !authorMatch) return false
  }

  if (filters.authors?.length) {
    const bookAuthors = book.authors?.map(a => a.name) ?? []
    if (!filters.authors.some(a => bookAuthors.includes(a))) return false
  }

  if (filters.tags?.length) {
    const bookTags = book.tags?.map(t => t.name) ?? []
    if (!filters.tags.some(t => bookTags.includes(t))) return false
  }

  if (filters.formats?.length) {
    const fmt = book.file_format?.toUpperCase() ?? ''
    if (!filters.formats.includes(fmt)) return false
  }

  if (filters.ratingMin !== undefined && filters.ratingMin > 0) {
    if ((book.rating ?? 0) < filters.ratingMin) return false
  }
  if (filters.ratingMax !== undefined && filters.ratingMax < 5) {
    if ((book.rating ?? 0) > filters.ratingMax) return false
  }

  if (filters.dateFrom) {
    if (book.added_date < filters.dateFrom) return false
  }
  if (filters.dateTo) {
    if (book.added_date > filters.dateTo + 'T23:59:59') return false
  }

  if (filters.readingStatus?.length) {
    const status = (book.reading_status ?? '') as ReadingStatus
    if (!filters.readingStatus.includes(status)) return false
  }

  return true
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
  activeFilters: FilterCriteria | null
  setActiveFilters: (filters: FilterCriteria | null) => void
  favoriteBookIds: Set<number>
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
  setFavoriteBookIds: (ids: number[]) => void
  toggleFavorite: (bookId: number) => void
  hasMore: boolean
  isLoading: boolean
  totalCount: number
  loadInitialBooks: () => Promise<void>
  loadMoreBooks: () => Promise<void>
}

export const useLibraryStore = create<LibraryStore>((set, get) => ({
  books: [],
  selectedBook: null,
  selectedBookIds: new Set(),
  bulkSelectMode: false,
  viewMode: "grid",
  selectedFilters: initialFilters,
  activeFilters: null,
  setActiveFilters: (activeFilters) => set({ activeFilters }),
  favoriteBookIds: new Set(),
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
  setFavoriteBookIds: (ids) => set({ favoriteBookIds: new Set(ids) }),
  toggleFavorite: (bookId) => set((state) => {
    const newSet = new Set(state.favoriteBookIds);
    if (newSet.has(bookId)) {
      newSet.delete(bookId);
    } else {
      newSet.add(bookId);
    }
    return { favoriteBookIds: newSet };
  }),
  hasMore: true,
  isLoading: false,
  totalCount: 0,
  loadInitialBooks: async () => {
    set({ isLoading: true })
    try {
      const [books, totalCount] = await Promise.all([
        api.getBooks(50, 0),
        api.getTotalBooks()
      ])
      set({ books, totalCount, hasMore: books.length < totalCount, isLoading: false })
    } catch {
      set({ isLoading: false })
    }
  },
  loadMoreBooks: async () => {
    const state = get();
    if (state.isLoading || !state.hasMore) return;

    set({ isLoading: true });
    try {
      const newBooks = await api.getBooks(50, state.books.length);
      const currentBooks = get().books;
      const appended = [...currentBooks, ...newBooks];

      const uniqueBooksMap = new Map();
      for (const item of appended) {
        uniqueBooksMap.set(item.id, item);
      }
      const uniqueBooks = Array.from(uniqueBooksMap.values()) as Book[];

      set({
        books: uniqueBooks,
        hasMore: uniqueBooks.length < get().totalCount,
        isLoading: false
      });
    } catch {
      set({ isLoading: false });
    }
  }
}))
