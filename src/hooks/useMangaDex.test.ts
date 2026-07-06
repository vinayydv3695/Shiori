import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMangaDex } from './useMangaDex';
import { pluginApi } from '@/lib/pluginSources';

// Mock the pluginApi
vi.mock('@/lib/pluginSources', () => ({
  pluginApi: {
    searchWithMeta: vi.fn(),
    browse: vi.fn(),
    getChapters: vi.fn(),
  },
}));

describe('useMangaDex', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return successfully shaped search data on success', async () => {
    (pluginApi.searchWithMeta as any).mockResolvedValueOnce({
      items: [
        { id: 'm1', title: 'Manga 1', summary: 'Summary 1', coverUrl: 'url1' },
      ],
      total: 100,
      offset: 0,
      limit: 20,
    });

    const { result } = renderHook(() => useMangaDex());
    
    let res;
    await act(async () => {
      res = await result.current.searchManga('Manga', 1, 20);
    });

    expect(res).toEqual({
      data: [{ id: 'm1', title: 'Manga 1', description: 'Summary 1', coverUrl: 'url1' }],
      total: 100,
      offset: 0,
      limit: 20,
    });
    expect(result.current.error).toBeNull();
  });

  it('should handle missing fields in search results', async () => {
    (pluginApi.searchWithMeta as any).mockResolvedValueOnce({
      items: [
        { id: 'm2', title: 'Manga 2' }, // Missing summary and coverUrl
      ],
    });

    const { result } = renderHook(() => useMangaDex());
    
    let res;
    await act(async () => {
      res = await result.current.searchManga('Manga', 1, 20);
    });

    expect(res).toEqual({
      data: [{ id: 'm2', title: 'Manga 2', description: '', coverUrl: undefined }],
      total: 1, // estimated total
      offset: 0,
      limit: 20,
    });
  });

  it('should catch errors in search and set error state instead of crashing', async () => {
    (pluginApi.searchWithMeta as any).mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useMangaDex());
    
    let res;
    await act(async () => {
      res = await result.current.searchManga('Manga', 1, 20);
    });

    expect(res).toEqual({ data: [], total: 0, offset: 0, limit: 20 });
    expect(result.current.error).toBe('Network error');
  });

  it('should parse chapters and preserve chapter 0', async () => {
    (pluginApi.getChapters as any).mockResolvedValueOnce([
      { id: 'c1', title: 'Chapter 0', number: 0, volume: '1', uploaded_at: '2023-01-01' },
      { id: 'c2', title: 'Chapter 1', number: 1, volume: '1', uploaded_at: '2023-01-02' },
    ]);

    const { result } = renderHook(() => useMangaDex());
    
    let chapters;
    await act(async () => {
      chapters = await result.current.getChapters('m1');
    });

    expect(chapters).toEqual([
      { id: 'c1', title: 'Chapter 0', chapter: '0', volume: '1', pages: 0, publishAt: '2023-01-01' },
      { id: 'c2', title: 'Chapter 1', chapter: '1', volume: '1', pages: 0, publishAt: '2023-01-02' },
    ]);
  });

  it('should return successfully shaped browse data', async () => {
    (pluginApi.browse as any).mockResolvedValueOnce([
      { id: 'm1', title: 'Manga 1' },
    ]);

    const { result } = renderHook(() => useMangaDex());
    
    let browseRes;
    await act(async () => {
      browseRes = await result.current.browseManga('popular', 20);
    });

    expect(browseRes).toEqual([
      { id: 'm1', title: 'Manga 1', description: '', coverUrl: undefined }
    ]);
  });

  it('should catch errors in browse and set error state', async () => {
    (pluginApi.browse as any).mockRejectedValueOnce(new Error('Browse error'));

    const { result } = renderHook(() => useMangaDex());
    
    let browseRes;
    await act(async () => {
      browseRes = await result.current.browseManga('popular', 20);
    });

    expect(browseRes).toEqual([]);
    expect(result.current.error).toBe('Browse error');
  });
});
