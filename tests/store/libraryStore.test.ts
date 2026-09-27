import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLibraryStore } from '@/store/libraryStore';
import { api, type Book, type SearchResult } from '@/lib/tauri';

vi.mock('@/lib/tauri', () => ({
  api: { searchBooks: vi.fn() },
}));

const mockedSearchBooks = vi.mocked(api.searchBooks);

function makeBook(id: number, title = `Book ${id}`): Book {
  return {
    id,
    uuid: `uuid-${id}`,
    title,
    file_path: `/books/${id}.epub`,
    file_format: 'EPUB',
    added_date: '2024-01-01',
  };
}

function makeResult(...ids: number[]): SearchResult {
  return {
    books: ids.map(makeBook),
    total: ids.length,
    query: '',
  };
}

/** Promise we resolve manually, so we control response ordering. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks();
  useLibraryStore.setState({
    books: [],
    hasMore: true,
    isLoading: false,
    totalCount: 0,
    serverSearchQuery: null,
  });
});

describe('libraryStore request ordering', () => {
  it('discards a stale loadInitialBooks response when a newer request started', async () => {
    const first = deferred<SearchResult>();
    const second = deferred<SearchResult>();
    mockedSearchBooks
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const p1 = useLibraryStore.getState().loadInitialBooks();
    const p2 = useLibraryStore.getState().loadInitialBooks();

    // Older request resolves LAST with stale data — must be discarded.
    second.resolve(makeResult(2));
    await p2;
    expect(useLibraryStore.getState().books.map((b) => b.id)).toEqual([2]);

    first.resolve(makeResult(1));
    await p1;
    expect(useLibraryStore.getState().books.map((b) => b.id)).toEqual([2]);
    expect(useLibraryStore.getState().isLoading).toBe(false);
    expect(useLibraryStore.getState().totalCount).toBe(1);
  });

  it('does not let a stale empty response empty the library', async () => {
    // Bug repro: an old request comes back empty AFTER a newer one delivered
    // fresh data. Last-write-wins would empty the library; the guard discards it.
    const staleEmpty = deferred<SearchResult>();
    const fresh = deferred<SearchResult>();
    mockedSearchBooks
      .mockReturnValueOnce(staleEmpty.promise)
      .mockReturnValueOnce(fresh.promise);

    const p1 = useLibraryStore.getState().loadInitialBooks();
    const p2 = useLibraryStore.getState().loadInitialBooks();

    // Newer request resolves first with fresh data.
    fresh.resolve(makeResult(3, 4));
    await p2;
    expect(useLibraryStore.getState().books).toHaveLength(2);

    // Stale empty response resolves last — must be discarded.
    staleEmpty.resolve(makeResult());
    await p1;
    expect(useLibraryStore.getState().books.map((b) => b.id)).toEqual([3, 4]);
    expect(useLibraryStore.getState().isLoading).toBe(false);
  });

  it('discards a stale refreshLibrary response', async () => {
    const stale = deferred<SearchResult>();
    const fresh = deferred<SearchResult>();
    mockedSearchBooks
      .mockReturnValueOnce(stale.promise)
      .mockReturnValueOnce(fresh.promise);

    const p1 = useLibraryStore.getState().refreshLibrary();
    const p2 = useLibraryStore.getState().refreshLibrary();

    fresh.resolve(makeResult(7));
    await p2;
    stale.resolve(makeResult(8));
    await p1;

    expect(useLibraryStore.getState().books.map((b) => b.id)).toEqual([7]);
  });

  it('does not let a stale ERROR response clear the winning request loading flag', async () => {
    const stale = deferred<SearchResult>();
    const fresh = deferred<SearchResult>();
    mockedSearchBooks
      .mockReturnValueOnce(stale.promise)
      .mockReturnValueOnce(fresh.promise);

    const p1 = useLibraryStore.getState().loadInitialBooks();
    const p2 = useLibraryStore.getState().loadInitialBooks();

    // Stale request fails while the winning request is still in flight.
    stale.reject(new Error('stale failure'));
    await p1;
    // Guard must prevent the catch block from clearing the winning request's spinner.
    expect(useLibraryStore.getState().isLoading).toBe(true);

    fresh.resolve(makeResult(5));
    await p2;
    expect(useLibraryStore.getState().isLoading).toBe(false);
    expect(useLibraryStore.getState().books.map((b) => b.id)).toEqual([5]);
  });

  it('calling loadMoreBooks while already loading does not invalidate the in-flight request', async () => {
    useLibraryStore.setState({
      books: [makeBook(1)],
      totalCount: 2,
      hasMore: true,
      isLoading: false,
    });

    const inFlight = deferred<SearchResult>();
    mockedSearchBooks.mockReturnValueOnce(inFlight.promise);

    const p1 = useLibraryStore.getState().loadMoreBooks();
    // No-op call: still loading, must return before touching the request token.
    const p2 = useLibraryStore.getState().loadMoreBooks();
    await p2;

    expect(useLibraryStore.getState().isLoading).toBe(true);

    inFlight.resolve(makeResult(1, 2));
    await p1;
    // If the no-op had bumped requestId, this would strand the spinner.
    expect(useLibraryStore.getState().isLoading).toBe(false);
    expect(useLibraryStore.getState().books.map((b) => b.id)).toEqual([1, 2]);
    expect(useLibraryStore.getState().hasMore).toBe(false);
  });
});

describe('matchesAdvancedFilters and countActiveFilterCriteria', () => {
  it('correctly counts active filter criteria including isFavorite and readingStatus', async () => {
    const { countActiveFilterCriteria, EMPTY_FILTERS } = await import('@/store/libraryStore');
    expect(countActiveFilterCriteria(null)).toBe(0);
    expect(countActiveFilterCriteria(EMPTY_FILTERS)).toBe(0);

    expect(countActiveFilterCriteria({ ...EMPTY_FILTERS, isFavorite: true })).toBe(1);
    expect(countActiveFilterCriteria({ ...EMPTY_FILTERS, readingStatus: ['reading'] })).toBe(1);
    expect(countActiveFilterCriteria({ ...EMPTY_FILTERS, readingStatus: ['reading'], isFavorite: true })).toBe(2);
  });

  it('filters books by readingStatus and isFavorite correctly', async () => {
    const { matchesAdvancedFilters, EMPTY_FILTERS } = await import('@/store/libraryStore');

    const book1: Book = {
      id: 1,
      uuid: 'uuid-1',
      title: 'Reading Book',
      file_path: '/books/1.epub',
      file_format: 'EPUB',
      added_date: '2024-01-01',
      reading_status: 'reading',
      is_favorite: true,
    };

    const book2: Book = {
      id: 2,
      uuid: 'uuid-2',
      title: 'Completed Book',
      file_path: '/books/2.epub',
      file_format: 'EPUB',
      added_date: '2024-01-01',
      reading_status: 'completed',
      is_favorite: false,
    };

    const book3: Book = {
      id: 3,
      uuid: 'uuid-3',
      title: 'On Hold Book',
      file_path: '/books/3.epub',
      file_format: 'EPUB',
      added_date: '2024-01-01',
      reading_status: 'on_hold',
      is_favorite: false,
    };

    // Filter by favorites
    expect(matchesAdvancedFilters(book1, { ...EMPTY_FILTERS, isFavorite: true })).toBe(true);
    expect(matchesAdvancedFilters(book2, { ...EMPTY_FILTERS, isFavorite: true })).toBe(false);

    // Filter by reading status
    expect(matchesAdvancedFilters(book1, { ...EMPTY_FILTERS, readingStatus: ['reading'] })).toBe(true);
    expect(matchesAdvancedFilters(book2, { ...EMPTY_FILTERS, readingStatus: ['reading'] })).toBe(false);

    expect(matchesAdvancedFilters(book2, { ...EMPTY_FILTERS, readingStatus: ['completed'] })).toBe(true);
    expect(matchesAdvancedFilters(book3, { ...EMPTY_FILTERS, readingStatus: ['on_hold'] })).toBe(true);
  });
});
