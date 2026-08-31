import { create } from "zustand"
import { api, type Book, type SearchQuery } from "../lib/tauri"

// Monotonic token for search requests. Overlapping searchBooks() calls can
// resolve out of order; the last write wins, so a stale (possibly empty)
// response could otherwise clobber fresh data. Each loader captures a token
// and discards its result if a newer request has started.
let requestId = 0;

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
  series?: string[];
  languages?: string[];
  publishers?: string[];
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
  if (filters.series?.length) count++
  if (filters.languages?.length) count++
  if (filters.publishers?.length) count++
  if (filters.ratingMin !== undefined && filters.ratingMin > 0) count++
  if (filters.ratingMax !== undefined && filters.ratingMax < 5) count++
  if (filters.dateFrom || filters.dateTo) count++
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
    if (!book.authors?.some(a => a.name && filters.authors!.includes(a.name))) return false
  }

  if (filters.tags?.length) {
    if (!book.tags?.some(t => t.name && filters.tags!.includes(t.name))) return false
  }

  if (filters.formats?.length) {
    const fmt = book.file_format?.toUpperCase() ?? ''
    if (!filters.formats.includes(fmt)) return false
  }

  if (filters.series?.length) {
    if (!book.series || !filters.series.includes(book.series)) return false
  }

  if (filters.languages?.length) {
    if (!book.language || !filters.languages.includes(book.language)) return false
  }

  if (filters.publishers?.length) {
    if (!book.publisher || !filters.publishers.includes(book.publisher)) return false
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

/** Payload shape of the backend `library-updated` event (new contract). */
export type LibraryMutation =
  | { kind: 'book-updated'; ids: number[] }
  | { kind: 'books-imported'; ids: number[] }
  | { kind: 'bulk-delete'; ids: number[] }

interface LibraryStore {
  books: Book[]
  selectedBook: Book | null
  selectedBookIds: Set<number>
  bulkSelectMode: boolean
  viewMode: "grid" | "list" | "table"
  sortBy: string
  sortOrder: "asc" | "desc"
  setSort: (sortBy: string, sortOrder: "asc" | "desc") => void
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
  serverSearchQuery: SearchQuery | null
  setServerSearchQuery: (query: SearchQuery | null) => void
  loadInitialBooks: () => Promise<void>
  loadMoreBooks: () => Promise<void>
  /** Silent refresh that keeps the currently-loaded window (no grid collapse). */
  refreshLibrary: () => Promise<void>
  /** Wider-window refetch (limit = loaded + extraCount, offset 0) merged by id so existing rows keep their position. */
  refreshWindow: (extraCount?: number) => Promise<void>
  /** Apply a backend `library-updated` payload; falls back to refreshLibrary() for the old unit payload. */
  applyLibraryUpdate: (payload: unknown) => Promise<void>
}

export const useLibraryStore = create<LibraryStore>((set, get) => ({
  books: [],
  selectedBook: null,
  selectedBookIds: new Set(),
  bulkSelectMode: false,
  viewMode: "grid",
  sortBy: "added_date",
  sortOrder: "desc",
  setSort: (sortBy, sortOrder) => set({ sortBy, sortOrder }),
  selectedFilters: initialFilters,
  activeFilters: null,
  setActiveFilters: (activeFilters) => set({ activeFilters }),
  favoriteBookIds: new Set(),
  setBooks: (books) => set({ books }),
  setSelectedBook: (selectedBook) => set({ selectedBook }),
  setViewMode: (viewMode) => set({ viewMode }),
  addBook: (book) => set((state) => ({ books: [book, ...state.books] })),
  updateBook: (book) =>
    set((state) => {
      const index = state.books.findIndex((b) => b.id === book.id);
      if (index === -1) return state;
      const newBooks = [...state.books];
      newBooks[index] = book;
      return { books: newBooks };
    }),
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
  serverSearchQuery: null,
  setServerSearchQuery: (serverSearchQuery) => {
    const prev = get().serverSearchQuery
    const same = JSON.stringify(prev) === JSON.stringify(serverSearchQuery)
    if (same) return
    set({ serverSearchQuery, hasMore: true })
  },
  loadInitialBooks: async () => {
    const id = ++requestId
    set({ isLoading: true })
    try {
      const state = get()
      const pageSize = 50

      const query = {
        ...(state.serverSearchQuery || {}),
        sort_by: state.sortBy,
        sort_order: state.sortOrder,
        limit: pageSize,
        offset: 0,
      }

      const result = await api.searchBooks(query)
      if (id !== requestId) return // stale: a newer request owns the state (and the loading clear)
      set({
        books: result.books,
        totalCount: result.total,
        hasMore: result.books.length < result.total,
        isLoading: false,
      })
    } catch {
      if (id !== requestId) return // stale: a newer request owns the loading clear
      set({ isLoading: false })
    }
  },
  loadMoreBooks: async () => {
    const state = get();
    if (state.isLoading || !state.hasMore) return; // no-op: never touch the request token

    const id = ++requestId

    set({ isLoading: true });
    try {
      const pageSize = 50

      const query = {
        ...(state.serverSearchQuery || {}),
        sort_by: state.sortBy,
        sort_order: state.sortOrder,
        limit: pageSize,
        offset: state.books.length,
      }

      const result = await api.searchBooks(query)
      if (id !== requestId) return // stale: the newer request set isLoading itself and owns the clear
      const newBooks = result.books

      const currentBooks = get().books;
      const appended = [...currentBooks, ...newBooks];

      const uniqueBooksMap = new Map<number, Book>();
      for (const item of appended) {
        if (item.id != null) uniqueBooksMap.set(item.id, item);
      }
      const uniqueBooks = Array.from(uniqueBooksMap.values());

      set({
        books: uniqueBooks,
        hasMore: uniqueBooks.length < get().totalCount,
        isLoading: false
      });
    } catch {
      if (id !== requestId) return // stale: a newer request owns the loading clear
      set({ isLoading: false });
    }
  },
  refreshLibrary: async () => {
    const id = ++requestId
    // Refetch the same window the user already has loaded instead of collapsing
    // to the first 50 rows: loadInitialBooks() would reset pagination mid-scroll
    // (grid shrinks, scroll position clamps). Newly imported books sort to the
    // top, so the window stays the same size and the user keeps their place.
    const state = get()
    const limit = Math.max(state.books.length, 50)
    const query = {
      ...(state.serverSearchQuery || {}),
      sort_by: state.sortBy,
      sort_order: state.sortOrder,
      limit,
      offset: 0,
    }
    try {
      const result = await api.searchBooks(query)
      if (id !== requestId) return // stale: keep current books, don't touch loading flags
      set({
        books: result.books,
        totalCount: result.total,
        hasMore: result.books.length < result.total,
      })
    } catch {
      // Silent: keep current books on failure
    }
  },
  refreshWindow: async (extraCount = 0) => {
    const id = ++requestId
    const state = get()
    const limit = state.books.length + extraCount
    if (limit <= state.books.length) return // nothing new to fetch
    const query = {
      ...(state.serverSearchQuery || {}),
      sort_by: state.sortBy,
      sort_order: state.sortOrder,
      limit,
      offset: 0,
    }
    try {
      const result = await api.searchBooks(query)
      if (id !== requestId) return // stale: keep current books, don't touch loading flags
      set((state) => {
        // Merge by id: existing rows keep their index (scroll anchor), newly
        // discovered ids (fresh imports) are appended in server order.
        const freshById = new Map<number, Book>()
        for (const book of result.books) {
          if (book.id != null) freshById.set(book.id, book)
        }
        const merged = state.books.map(
          (b) => (b.id != null && freshById.get(b.id)) ?? b
        )
        const present = new Set<number>()
        for (const book of merged) if (book.id != null) present.add(book.id)
        for (const book of result.books) {
          if (book.id != null && !present.has(book.id)) {
            merged.push(book)
            present.add(book.id)
          }
        }
        return {
          books: merged,
          totalCount: result.total,
          hasMore: result.books.length < result.total,
        }
      })
    } catch {
      // Silent: keep current books on failure
    }
  },
  applyLibraryUpdate: async (payload: unknown) => {
    const isMutation = (p: unknown): p is LibraryMutation =>
      !!p &&
      typeof p === 'object' &&
      typeof (p as LibraryMutation).kind === 'string' &&
      Array.isArray((p as LibraryMutation).ids)

    if (!isMutation(payload)) {
      // Old backend emitted `()` (unit payload): full window-preserving refresh.
      await get().refreshLibrary()
      return
    }

    switch (payload.kind) {
      case 'book-updated': {
        const ids = new Set(payload.ids)
        const state = get()
        const onScreen = state.books
          .filter((b) => b.id != null && ids.has(b.id))
          .map((b) => b.id as number)
        if (onScreen.length === 0) return // nothing visible changed: skip
        try {
          const fresh = await Promise.all(onScreen.map((id) => api.getBook(id)))
          set((state) => {
            const freshById = new Map<number, Book>()
            for (const book of fresh) {
              if (book.id != null) freshById.set(book.id, book)
            }
            // Patch in place: same array length, order and scroll preserved.
            return { books: state.books.map((b) => freshById.get(b.id as number) ?? b) }
          })
        } catch {
          // Silent: keep current rows on failure
        }
        return
      }
      case 'bulk-delete': {
        const state = get()
        const loadedIds = state.books
          .filter((b) => b.id != null)
          .map((b) => b.id as number)
        const deleted = new Set(payload.ids)
        const deletedLoaded = loadedIds.filter((id) => deleted.has(id)).length
        if (loadedIds.length > 0 && deletedLoaded / loadedIds.length > 0.8) {
          // Window mostly wiped: fall back to a full window-preserving refresh.
          await get().refreshLibrary()
          return
        }
        set((state) => ({
          books: state.books.filter((b) => b.id == null || !deleted.has(b.id)),
          totalCount:
            state.totalCount > 0
              ? Math.max(0, state.totalCount - payload.ids.length)
              : state.totalCount,
        }))
        return
      }
      case 'books-imported':
        if (payload.ids.length === 0) {
          await get().refreshLibrary()
          return
        }
        // Window refetch around the current scroll position: fetch a wider
        // window (loaded + imported), merge by id so existing rows stay put.
        await get().refreshWindow(payload.ids.length)
        return
      default:
        await get().refreshLibrary()
    }
  },
}))
