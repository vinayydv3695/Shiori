import { useState } from 'react';
import { logger } from '@/lib/logger';

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

const BASE_URL = 'https://api.mangadex.org';
const RATE_LIMIT_DELAY = 250;

let lastRequestTime = 0;

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  
  if (timeSinceLastRequest < RATE_LIMIT_DELAY) {
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY - timeSinceLastRequest));
  }
  
  lastRequestTime = Date.now();
  
  return fetch(url);
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
      const params = new URLSearchParams();
      params.set('title', query);
      params.set('limit', String(limit));
      params.set('offset', String(offset));
      params.set('hasAvailableChapters', 'true');
      params.append('availableTranslatedLanguage[]', 'en');
      params.append('includes[]', 'cover_art');
      params.append('includes[]', 'author');
      params.append('includes[]', 'artist');
      params.set('order[relevance]', 'desc');

      const url = `${BASE_URL}/manga?${params.toString()}`;
      
      logger.info('MangaDex search:', { query, page, limit });
      
      const response = await rateLimitedFetch(url);
      
      if (!response.ok) {
        throw new Error(`MangaDex API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      const mangaList: MangaDexManga[] = (data.data || []).map((item: any) => {
        const titleObj = item.attributes?.title || {};
        const title = titleObj.en || titleObj['ja-ro'] || Object.values(titleObj)[0] || 'Unknown Title';
        
        const descObj = item.attributes?.description || {};
        const description = descObj.en || Object.values(descObj)[0] || '';
        
        let coverUrl: string | undefined;
        const coverRel = (item.relationships || []).find((rel: any) => rel.type === 'cover_art');
        if (coverRel?.attributes?.fileName) {
          coverUrl = `https://uploads.mangadex.org/covers/${item.id}/${coverRel.attributes.fileName}.256.jpg`;
        }
        
        const authorRel = (item.relationships || []).find((rel: any) => rel.type === 'author');
        const artistRel = (item.relationships || []).find((rel: any) => rel.type === 'artist');
        
        return {
          id: item.id,
          title,
          description,
          status: item.attributes?.status,
          coverUrl,
          tags: (item.attributes?.tags || []).map((tag: any) => tag.attributes?.name?.en).filter(Boolean),
          contentRating: item.attributes?.contentRating,
          year: item.attributes?.year,
          author: authorRel?.attributes?.name,
          artist: artistRel?.attributes?.name,
        };
      });
      
      return {
        data: mangaList,
        total: data.total || 0,
        offset,
        limit,
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

  const getChapters = async (mangaId: string, limit: number = 100): Promise<MangaDexChapter[]> => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.append('translatedLanguage[]', 'en');
      params.set('limit', String(limit));
      params.set('order[chapter]', 'asc');
      params.append('includes[]', 'scanlation_group');

      const url = `${BASE_URL}/manga/${mangaId}/feed?${params.toString()}`;
      
      logger.info('MangaDex chapters:', { mangaId, limit });
      
      const response = await rateLimitedFetch(url);
      
      if (!response.ok) {
        throw new Error(`MangaDex API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      return (data.data || []).map((item: any) => {
        const scanlationRel = (item.relationships || []).find((rel: any) => rel.type === 'scanlation_group');
        
        return {
          id: item.id,
          title: item.attributes?.title || '',
          chapter: item.attributes?.chapter,
          volume: item.attributes?.volume,
          pages: item.attributes?.pages || 0,
          publishAt: item.attributes?.publishAt,
          scanlationGroup: scanlationRel?.attributes?.name,
        };
      });
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
    getChapters,
    getMangaUrl,
    getChapterUrl,
    loading,
    error,
  };
}
