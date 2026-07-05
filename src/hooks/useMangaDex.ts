import { useState, useCallback } from 'react';
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
  const [error, setError] = useState<string | null>(null);

  const searchManga = useCallback(
    async (
      query: string,
      page: number = 1,
      limit: number = 20
    ): Promise<MangaDexSearchResult> => {
      setError(null);

      try {
        logger.info('MangaDex search via plugin:', { query, page, limit });

        const searchResponse = await pluginApi.searchWithMeta('mangadex', query, page, limit);
        const mangaList = parsePluginSearchResults(searchResponse.items);
        const responseOffset = searchResponse.offset ?? (page - 1) * limit;
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
        return { data: [], total: 0, offset: 0, limit };
      }
    },
    []
  );

  /**
   * Browse manga by different modes (popular, latest, recent, top-rated)
   */
  const browseManga = useCallback(
    async (
      mode: BrowseMode = 'popular',
      limit: number = 20
    ): Promise<MangaDexManga[]> => {
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
      }
    },
    []
  );

  const getChapters = async (mangaId: string): Promise<MangaDexChapter[]> => {
    setError(null);

    try {
      logger.info('MangaDex chapters via plugin:', { mangaId });
      const chapterList = await pluginApi.getChapters('mangadex', mangaId);
      return parsePluginChapters(chapterList);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to get chapters';
      logger.error('MangaDex chapters failed:', err);
      setError(errorMessage);
      return [];
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
    error,
    setError,
  };
}
