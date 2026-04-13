import { useState } from 'react';
import { logger } from '@/lib/logger';
import { pluginApi, type Chapter as PluginChapter, type SearchResult as PluginSearchResult } from '@/lib/pluginSources';

export interface MangaDexManga {
  id: string;
  title: string;
  description?: string;
  status?: string;
  coverUrl?: string;
  tags?: string[];
  contentRating?: string;
  year?: number;
  author?: string;
  artist?: string;
}

export interface MangaDexChapter {
  id: string;
  title?: string;
  chapter?: string;
  volume?: string;
  pages: number;
  publishAt: string;
  scanlationGroup?: string;
}

export interface MangaDexSearchResult {
  data: MangaDexManga[];
  total: number;
  offset: number;
  limit: number;
}

export type BrowseMode = 'popular' | 'latest' | 'recent' | 'top-rated';

function parsePluginSearchResults(results: PluginSearchResult[]): MangaDexManga[] {
  return results.map((item) => ({
    id: item.id,
    title: item.title,
    description: item.summary || item.description || '',
    coverUrl: item.coverUrl || item.cover_url,
  }));
}

function parsePluginChapters(chapters: PluginChapter[]): MangaDexChapter[] {
  return chapters.map((chapter) => ({
    id: chapter.id,
    title: chapter.title,
    chapter: typeof chapter.number === 'number' && chapter.number > 0 ? String(chapter.number) : undefined,
    volume: chapter.volume,
    pages: 0,
    publishAt: chapter.uploaded_at || '',
  }));
}

export function useMangaDex() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchManga = async (
    query: string,
    page: number = 1,
    limit: number = 20
  ): Promise<MangaDexSearchResult | null> => {
    if (!query.trim()) {
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const offset = (page - 1) * limit;
      logger.info('MangaDex search via plugin:', { query, page, limit });

      const searchResponse = await pluginApi.searchWithMeta('mangadex', query, page, limit);
      const mangaList = parsePluginSearchResults(searchResponse.items);
      const responseOffset = searchResponse.offset ?? offset;
      const responseLimit = searchResponse.limit ?? limit;
      const estimatedTotal =
        responseOffset + mangaList.length + (mangaList.length >= responseLimit ? 1 : 0);

      return {
        data: mangaList,
        total: searchResponse.total ?? estimatedTotal,
        offset: responseOffset,
        limit: responseLimit,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to search MangaDex';
      logger.error('MangaDex search failed:', err);
      setError(errorMessage);
      return null;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Browse manga by different modes (popular, latest, recent, top-rated)
   */
  const browseManga = async (
    mode: BrowseMode,
    limit: number = 20
  ): Promise<MangaDexManga[]> => {
    setLoading(true);
    setError(null);

    try {
      logger.info('MangaDex browse via plugin:', { mode, limit });
      const browseResults = await pluginApi.browse('mangadex', mode, 1, limit);
      return parsePluginSearchResults(browseResults);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to browse MangaDex';
      logger.error('MangaDex browse failed:', err);
      setError(errorMessage);
      return [];
    } finally {
      setLoading(false);
    }
  };

  const getChapters = async (mangaId: string, limit: number = 100): Promise<MangaDexChapter[]> => {
    setLoading(true);
    setError(null);

    try {
      logger.info('MangaDex chapters via plugin:', { mangaId, limit });
      const chapterList = await pluginApi.getChapters('mangadex', mangaId);
      return parsePluginChapters(chapterList).slice(0, limit);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to get chapters';
      logger.error('MangaDex chapters failed:', err);
      setError(errorMessage);
      return [];
    } finally {
      setLoading(false);
    }
  };

  const getMangaUrl = (mangaId: string): string => {
    return `https://mangadex.org/title/${mangaId}`;
  };

  const getChapterUrl = (chapterId: string): string => {
    return `https://mangadex.org/chapter/${chapterId}`;
  };

  return {
    searchManga,
    browseManga,
    getChapters,
    getMangaUrl,
    getChapterUrl,
    loading,
    error,
  };
}
