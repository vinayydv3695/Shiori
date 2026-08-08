import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGlobalSearch } from '@/hooks/useGlobalSearch';
import { fetchLibgenBooks } from '@/online-books/libgen/api';
import { fetchGutenbergBooks } from '@/online-books/gutenberg/api';
import { fetchAnnasArchiveBooks } from '@/online-books/annas-archive/api';
import { useSourceStore } from '@/store/sourceStore';

vi.mock('@/online-books/libgen/api', () => ({
  fetchLibgenBooks: vi.fn(),
}));

vi.mock('@/online-books/gutenberg/api', () => ({
  fetchGutenbergBooks: vi.fn(),
}));

vi.mock('@/online-books/annas-archive/api', () => ({
  fetchAnnasArchiveBooks: vi.fn(),
}));

function enableAllSources() {
  useSourceStore.setState({
    sources: useSourceStore.getState().sources.map((s) => ({ ...s, enabled: true })),
  });
}

function resetSourceStore() {
  useSourceStore.setState(useSourceStore.getInitialState());
}

describe('useGlobalSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSourceStore();
    vi.mocked(fetchLibgenBooks).mockResolvedValue({ items: [] });
    vi.mocked(fetchGutenbergBooks).mockResolvedValue({ results: [] });
    vi.mocked(fetchAnnasArchiveBooks).mockResolvedValue({ items: [] });
  });

  it('does NOT call annas-archive when it is disabled in settings (default) during all-sources search', async () => {
    vi.mocked(fetchGutenbergBooks).mockResolvedValueOnce({
      results: [
        {
          id: 1,
          title: 'Gut Book',
          authors: [{ name: 'Gut Author' }],
          languages: ['en'],
          formats: { 'application/epub+zip': 'http://gutendex.com/1/epub' },
        },
      ],
    });
    vi.mocked(fetchLibgenBooks).mockResolvedValueOnce({
      items: [{ id: 'l1', title: 'Lib Book', extra: { author: 'Lib Author' } }],
    });

    const { result } = renderHook(() => useGlobalSearch());

    await act(async () => {
      await result.current.search('test', 1);
    });

    expect(fetchGutenbergBooks).toHaveBeenCalledTimes(1);
    expect(fetchLibgenBooks).toHaveBeenCalledTimes(1);
    expect(fetchAnnasArchiveBooks).not.toHaveBeenCalled();
    expect(result.current.results.map((r) => r.source)).toEqual(['gutenberg', 'libgen']);
  });

  it('calls all three fetchers with default source filter when annas-archive is enabled in settings', async () => {
    enableAllSources();

    vi.mocked(fetchGutenbergBooks).mockResolvedValueOnce({
      results: [
        {
          id: 1,
          title: 'Gut Book',
          authors: [{ name: 'Gut Author' }],
          languages: ['en'],
          formats: { 'application/epub+zip': 'http://gutendex.com/1/epub' },
        },
      ],
    });
    vi.mocked(fetchLibgenBooks).mockResolvedValueOnce({
      items: [{ id: 'l1', title: 'Lib Book', extra: { author: 'Lib Author' } }],
    });
    vi.mocked(fetchAnnasArchiveBooks).mockResolvedValueOnce({
      items: [
        {
          id: 'aa-1',
          title: 'AA Book',
          extra: { md5: 'aa-1', detail_url: 'https://annas-archive.org/d/aa-1' },
        },
      ],
    });

    const { result } = renderHook(() => useGlobalSearch());

    await act(async () => {
      await result.current.search('test', 1);
    });

    expect(fetchLibgenBooks).toHaveBeenCalledTimes(1);
    expect(fetchGutenbergBooks).toHaveBeenCalledTimes(1);
    expect(fetchAnnasArchiveBooks).toHaveBeenCalledTimes(1);
    expect(result.current.results.map((r) => r.source)).toEqual(
      expect.arrayContaining(['gutenberg', 'libgen', 'annas-archive'])
    );
  });

  it('skips disabled sources when libgen or gutenberg is turned off in settings', async () => {
    useSourceStore.setState({
      sources: useSourceStore.getState().sources.map((s) =>
        s.id === 'libgen' ? { ...s, enabled: false } : s
      ),
    });

    vi.mocked(fetchGutenbergBooks).mockResolvedValueOnce({
      results: [
        {
          id: 1,
          title: 'Gut Book',
          authors: [{ name: 'Gut Author' }],
          languages: ['en'],
          formats: { 'application/epub+zip': 'http://gutendex.com/1/epub' },
        },
      ],
    });

    const { result } = renderHook(() => useGlobalSearch());

    await act(async () => {
      await result.current.search('test', 1);
    });

    expect(fetchGutenbergBooks).toHaveBeenCalledTimes(1);
    expect(fetchLibgenBooks).not.toHaveBeenCalled();
    expect(fetchAnnasArchiveBooks).not.toHaveBeenCalled();
    expect(result.current.results.map((r) => r.source)).toEqual(['gutenberg']);
  });

  it('normalizes annas-archive items into UnifiedSearchResult with RAW cover', async () => {
    enableAllSources();

    vi.mocked(fetchAnnasArchiveBooks).mockResolvedValueOnce({
      items: [
        {
          id: 'aa-id-1',
          title: 'The Test Book',
          coverUrl: 'https://annas-archive.org/covers/1.jpg',
          extra: {
            md5: 'abc123',
            detail_url: 'https://annas-archive.org/d/abc123',
            author: 'Jane Doe',
            year: '1984',
            language: 'English',
            format: 'EPUB',
            file_size: '2.5MB',
          },
        },
        {
          id: 'aa-id-2',
          title: 'Minimal Book',
          cover_url: 'https://annas-archive.org/covers/2.jpg',
          extra: { md5: 'def456', detail_url: 'https://annas-archive.org/d/def456' },
        },
      ],
    });

    const { result } = renderHook(() => useGlobalSearch());

    await act(async () => {
      await result.current.search('test', 1, undefined, 'annas-archive');
    });

    expect(result.current.results).toHaveLength(2);
    expect(result.current.results[0]).toEqual({
      id: 'abc123',
      source: 'annas-archive',
      title: 'The Test Book',
      author: 'Jane Doe',
      coverUrl: 'https://annas-archive.org/covers/1.jpg',
      format: 'epub',
      year: 1984,
      language: 'English',
      size: '2.5MB',
      downloadUrl: 'https://annas-archive.org/d/abc123',
      mirrors: ['https://annas-archive.org/d/abc123'],
      extra: {
        md5: 'abc123',
        detail_url: 'https://annas-archive.org/d/abc123',
        author: 'Jane Doe',
        year: '1984',
        language: 'English',
        format: 'EPUB',
        file_size: '2.5MB',
      },
    });
    // Missing fields fall back: snake_case cover_url, Unknown author, undefined year/format/size
    expect(result.current.results[1]).toMatchObject({
      id: 'def456',
      source: 'annas-archive',
      title: 'Minimal Book',
      author: 'Unknown',
      coverUrl: 'https://annas-archive.org/covers/2.jpg',
      format: '',
      year: undefined,
      language: undefined,
      size: undefined,
      downloadUrl: 'https://annas-archive.org/d/def456',
      mirrors: ['https://annas-archive.org/d/def456'],
    });
  });

  it('keeps libgen/gutenberg results when the annas-archive fetcher rejects', async () => {
    enableAllSources();

    vi.mocked(fetchAnnasArchiveBooks).mockRejectedValueOnce(new Error('Annas Archive down'));
    vi.mocked(fetchLibgenBooks).mockResolvedValueOnce({
      items: [
        {
          id: 'l1',
          title: 'Lib Book',
          extra: { author: 'Lib Author', url: 'http://libgen.li/get/l1' },
        },
      ],
    });
    vi.mocked(fetchGutenbergBooks).mockResolvedValueOnce({
      results: [
        {
          id: 1,
          title: 'Gut Book',
          authors: [{ name: 'Gut Author' }],
          languages: ['en'],
          formats: { 'application/epub+zip': 'http://gutendex.com/1/epub' },
        },
      ],
    });

    const { result } = renderHook(() => useGlobalSearch());

    await act(async () => {
      await result.current.search('test', 1);
    });

    const sources = result.current.results.map((r) => r.source);
    expect(sources).toContain('libgen');
    expect(sources).toContain('gutenberg');
    expect(sources).not.toContain('annas-archive');
    expect(result.current.results.map((r) => r.title)).toEqual(
      expect.arrayContaining(['Lib Book', 'Gut Book'])
    );
    expect(result.current.error).toBeNull();
    expect(result.current.hasMore).toBe(true);
  });

  it('combines results from all three sources and dedupes by id', async () => {
    enableAllSources();

    vi.mocked(fetchGutenbergBooks).mockResolvedValueOnce({
      results: [
        {
          id: 1,
          title: 'Gut Book',
          authors: [{ name: 'Gut Author' }],
          languages: ['en'],
          formats: { 'application/epub+zip': 'http://gutendex.com/1/epub' },
        },
      ],
    });
    // libgen item with id 'shared' (no extra.url, so id falls back to book.id)
    vi.mocked(fetchLibgenBooks).mockResolvedValueOnce({
      items: [
        {
          id: 'shared',
          title: 'Lib Book',
          extra: { author: 'Lib Author', format: 'pdf' },
        },
      ],
    });
    // annas item with the SAME id (via md5) plus one unique item
    vi.mocked(fetchAnnasArchiveBooks).mockResolvedValueOnce({
      items: [
        {
          id: 'aa-shared',
          title: 'Dup Book',
          extra: { md5: 'shared', detail_url: 'https://annas-archive.org/d/shared' },
        },
        {
          id: 'aa-2',
          title: 'AA Unique Book',
          extra: { md5: 'unique-md5', detail_url: 'https://annas-archive.org/d/unique' },
        },
      ],
    });

    const { result } = renderHook(() => useGlobalSearch());

    await act(async () => {
      await result.current.search('test', 1);
    });

    const ids = result.current.results.map((r) => r.id);
    expect(ids).toHaveLength(3);
    expect(ids).toEqual(expect.arrayContaining(['http://gutendex.com/1/epub', 'shared', 'unique-md5']));
    expect(ids.filter((id) => id === 'shared')).toHaveLength(1);
    expect(result.current.results.map((r) => r.source)).toEqual(
      expect.arrayContaining(['gutenberg', 'libgen', 'annas-archive'])
    );
  });

  it('searches ONLY annas-archive when source filter is set and it is enabled', async () => {
    enableAllSources();

    vi.mocked(fetchAnnasArchiveBooks).mockResolvedValueOnce({
      items: [
        {
          id: 'aa-only',
          title: 'AA Only Book',
          coverUrl: 'https://annas-archive.org/covers/only.jpg',
          extra: { md5: 'aa-md5', detail_url: 'https://annas-archive.org/d/aa' },
        },
      ],
    });

    const { result } = renderHook(() => useGlobalSearch());

    await act(async () => {
      await result.current.search('test', 1, undefined, 'annas-archive');
    });

    expect(fetchAnnasArchiveBooks).toHaveBeenCalledTimes(1);
    expect(fetchLibgenBooks).not.toHaveBeenCalled();
    expect(fetchGutenbergBooks).not.toHaveBeenCalled();
    expect(result.current.results).toHaveLength(1);
    expect(result.current.results[0]).toMatchObject({
      id: 'aa-md5',
      source: 'annas-archive',
      title: 'AA Only Book',
    });
  });

  it('searches ONLY gutenberg when source filter is set', async () => {
    vi.mocked(fetchGutenbergBooks).mockResolvedValueOnce({
      results: [
        {
          id: 7,
          title: 'Gut Only Book',
          authors: [{ name: 'Gut Author' }],
          languages: ['en'],
          formats: { 'application/epub+zip': 'http://gutendex.com/7/epub' },
        },
      ],
    });

    const { result } = renderHook(() => useGlobalSearch());

    await act(async () => {
      await result.current.search('test', 1, undefined, 'gutenberg');
    });

    expect(fetchGutenbergBooks).toHaveBeenCalledTimes(1);
    expect(fetchLibgenBooks).not.toHaveBeenCalled();
    expect(fetchAnnasArchiveBooks).not.toHaveBeenCalled();
    expect(result.current.results).toHaveLength(1);
    expect(result.current.results[0]).toMatchObject({
      id: 'http://gutendex.com/7/epub',
      source: 'gutenberg',
      title: 'Gut Only Book',
    });
  });
});
