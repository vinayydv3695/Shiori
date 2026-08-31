import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLibraryStore } from '@/store/libraryStore';
import { api, type Book, type SearchResult } from '@/lib/tauri';

vi.mock('@/lib/tauri', () => ({
  api: {
    searchBooks: vi.fn(),
    getBook: vi.fn(),
  },
}));

const mockedSearchBooks = vi.mocked(api.searchBooks);
const mockedGetBook = vi.mocked(api.getBook);

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

describe('applyLibraryUpdate — mutation-aware library-updated handling', () => {
  it('book-updated patches only matched ids in place without calling searchBooks', async () => {
    useLibraryStore.setState({
      books: [makeBook(1, 'old title'), makeBook(2), makeBook(3)],
      totalCount: 3,
    });
    mockedGetBook.mockResolvedValueOnce(makeBook(1, 'patched title'));

    await useLibraryStore.getState().applyLibraryUpdate({ kind: 'book-updated', ids: [1] });

    const books = useLibraryStore.getState().books;
    expect(books.map((b) => b.id)).toEqual([1, 2, 3]); // order + length preserved
    expect(books[0].title).toBe('patched title');
    expect(books[1].title).toBe('Book 2');
    expect(mockedGetBook).toHaveBeenCalledTimes(1);
    expect(mockedSearchBooks).not.toHaveBeenCalled();
  });

  it('book-updated skips ids not in state (no visible change)', async () => {
    useLibraryStore.setState({ books: [makeBook(1)], totalCount: 1 });

    await useLibraryStore.getState().applyLibraryUpdate({ kind: 'book-updated', ids: [99] });

    expect(mockedGetBook).not.toHaveBeenCalled();
    expect(useLibraryStore.getState().books.map((b) => b.id)).toEqual([1]);
    expect(mockedSearchBooks).not.toHaveBeenCalled();
  });

  it('bulk-delete removes ids locally and decrements totalCount', async () => {
    useLibraryStore.setState({
      books: [makeBook(1), makeBook(2), makeBook(3), makeBook(4)],
      totalCount: 10,
    });

    await useLibraryStore.getState().applyLibraryUpdate({ kind: 'bulk-delete', ids: [2, 3] });

    expect(useLibraryStore.getState().books.map((b) => b.id)).toEqual([1, 4]);
    expect(useLibraryStore.getState().totalCount).toBe(8);
    expect(mockedSearchBooks).not.toHaveBeenCalled();
  });

  it('bulk-delete of >80% of loaded rows falls back to full refresh', async () => {
    useLibraryStore.setState({
      books: [makeBook(1), makeBook(2), makeBook(3)],
      totalCount: 5,
    });
    mockedSearchBooks.mockResolvedValueOnce(makeResult(1, 2, 3, 4, 5));

    await useLibraryStore.getState().applyLibraryUpdate({ kind: 'bulk-delete', ids: [1, 2, 3] });

    expect(mockedSearchBooks).toHaveBeenCalledTimes(1);
    expect(useLibraryStore.getState().books.map((b) => b.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it('unknown kind falls back to refreshLibrary', async () => {
    useLibraryStore.setState({ books: [makeBook(1)], totalCount: 2 });
    mockedSearchBooks.mockResolvedValueOnce(makeResult(1, 2));

    await useLibraryStore.getState().applyLibraryUpdate({ kind: 'reindexed', ids: [1] });

    expect(mockedSearchBooks).toHaveBeenCalledTimes(1);
  });

  it('books-imported with empty ids falls back to refreshLibrary', async () => {
    useLibraryStore.setState({ books: [makeBook(1)], totalCount: 2 });
    mockedSearchBooks.mockResolvedValueOnce(makeResult(1, 2));

    await useLibraryStore.getState().applyLibraryUpdate({ kind: 'books-imported', ids: [] });

    expect(mockedSearchBooks).toHaveBeenCalledTimes(1);
  });

  it('books-imported with ids does a window refetch merged by id (existing rows stable)', async () => {
    useLibraryStore.setState({
      books: [makeBook(1, 't1'), makeBook(2, 't2')],
      totalCount: 2,
      hasMore: false,
    });
    mockedSearchBooks.mockResolvedValueOnce({
      books: [makeBook(3), makeBook(1, 't1-refreshed'), makeBook(2), makeBook(4)],
      total: 4,
      query: '',
    });

    await useLibraryStore.getState().applyLibraryUpdate({ kind: 'books-imported', ids: [3, 4] });

    const books = useLibraryStore.getState().books;
    // Existing rows keep their indices (scroll anchor); new ids appended.
    expect(books.map((b) => b.id)).toEqual([1, 2, 3, 4]);
    expect(books[0].title).toBe('t1-refreshed');
    expect(useLibraryStore.getState().totalCount).toBe(4);
    expect(useLibraryStore.getState().hasMore).toBe(false);
  });

  it('payload without kind falls back to refreshLibrary (old backend shape)', async () => {
    useLibraryStore.setState({ books: [makeBook(1)], totalCount: 2 });
    mockedSearchBooks.mockResolvedValueOnce(makeResult(1, 2));

    await useLibraryStore.getState().applyLibraryUpdate({ ids: [1] });

    expect(mockedSearchBooks).toHaveBeenCalledTimes(1);
  });

  it('non-object payload (legacy unit event) falls back to refreshLibrary', async () => {
    useLibraryStore.setState({ books: [makeBook(1)], totalCount: 2 });
    mockedSearchBooks.mockResolvedValueOnce(makeResult(1, 2));

    await useLibraryStore.getState().applyLibraryUpdate(undefined);

    expect(mockedSearchBooks).toHaveBeenCalledTimes(1);
  });
});