import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGlobalSearch } from '@/hooks/useGlobalSearch';
import { fetchLibgenBooks } from '@/online-books/libgen/api';
import { fetchGutenbergBooks } from '@/online-books/gutenberg/api';
import { fetchAnnasArchiveBooks } from '@/online-books/annas-archive/api';
import { getProxyUrl } from '@/lib/tauri';

vi.mock('@/online-books/libgen/api', () => ({
  fetchLibgenBooks: vi.fn(),
}));

vi.mock('@/online-books/gutenberg/api', () => ({
  fetchGutenbergBooks: vi.fn(),
}));

vi.mock('@/online-books/annas-archive/api', () => ({
  fetchAnnasArchiveBooks: vi.fn(),
}));

vi.mock('@/lib/tauri', () => ({
  getProxyUrl: vi.fn((sourceId: string, url: string) => `proxy:${sourceId}:${url}`),
}));

describe('useGlobalSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchLibgenBooks).mockResolvedValue({ items: [] });
    vi.mocked(fetchGutenbergBooks).mockResolvedValue({ results: [] });
    vi.mocked(fetchAnnasArchiveBooks).mockResolvedValue({ items: [] });
  });

  it('normalizes annas-archive items into UnifiedSearchResult with proxied cover', async () => {
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
      await result.current.search('test', 1);
    });

    expect(result.current.results).toHaveLength(2);
    expect(result.current.results[0]).toEqual({
      id: 'abc123',
      source: 'annas-archive',
      title: 'The Test Book',
      author: 'Jane Doe',
      coverUrl: 'proxy:annas-archive:https://annas-archive.org/covers/1.jpg',
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
      coverUrl: 'proxy:annas-archive:https://annas-archive.org/covers/2.jpg',
      format: '',
      year: undefined,
      language: undefined,
      size: undefined,
      downloadUrl: 'https://annas-archive.org/d/def456',
      mirrors: ['https://annas-archive.org/d/def456'],
    });
    expect(getProxyUrl).toHaveBeenCalledWith(
      'annas-archive',
      'https://annas-archive.org/covers/1.jpg'
    );
  });

  it('keeps libgen/gutenberg results when the annas-archive fetcher rejects', async () => {
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
});
