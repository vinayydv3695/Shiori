import { useState } from 'react';
import { logger } from '@/lib/logger';

export interface OpenLibraryBook {
  key: string;
  title: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  isbn?: string[];
  has_fulltext?: boolean;
  ia?: string[];
  edition_count?: number;
  language?: string[];
}

export interface OpenLibrarySearchResult {
  numFound: number;
  docs: OpenLibraryBook[];
  offset: number;
  q: string;
}

export interface OpenLibraryTrendingWork {
  key: string;
  title: string;
  author_key?: string[];
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  cover_edition_key?: string;
  edition_count?: number;
  has_fulltext?: boolean;
  ia?: string[];
}

export type BookBrowseMode = 'trending' | 'want-to-read' | 'currently-reading' | 'already-read';

const BASE_URL = 'https://openlibrary.org';
const COVER_BASE_URL = 'https://covers.openlibrary.org/b';
const RATE_LIMIT_DELAY = 350;

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

export function useOpenLibrary() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchBooks = async (
    query: string,
    page: number = 1,
    limit: number = 20
  ): Promise<OpenLibrarySearchResult | null> => {
    if (!query.trim()) {
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const offset = (page - 1) * limit;
      const fields = [
        'key',
        'title',
        'author_name',
        'first_publish_year',
        'cover_i',
        'isbn',
        'has_fulltext',
        'ia',
        'edition_count',
        'language'
      ].join(',');

      const url = `${BASE_URL}/search.json?q=${encodeURIComponent(query)}&page=${page}&limit=${limit}&offset=${offset}&fields=${fields}`;
      
      logger.info('Open Library search:', { query, page, limit });
      
      const response = await rateLimitedFetch(url);
      
      if (!response.ok) {
        throw new Error(`Open Library API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      return {
        numFound: data.numFound || 0,
        docs: data.docs || [],
        offset: offset,
        q: query,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to search Open Library';
      logger.error('Open Library search failed:', err);
      setError(errorMessage);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const getCoverUrl = (coverId: number | undefined, size: 'S' | 'M' | 'L' = 'M'): string | null => {
    if (!coverId) return null;
    return `${COVER_BASE_URL}/id/${coverId}-${size}.jpg`;
  };

  const getReadUrl = (iaId: string): string => {
    return `https://archive.org/details/${iaId}`;
  };

  const getBookDetailsUrl = (bookKey: string): string => {
    return `${BASE_URL}${bookKey}`;
  };

  /**
   * Browse trending books from Open Library
   * Uses the trending API endpoint
   */
  const browseTrending = async (
    mode: BookBrowseMode = 'trending',
    limit: number = 20
  ): Promise<OpenLibraryBook[]> => {
    setLoading(true);
    setError(null);

    try {
      // Open Library trending API endpoints
      const modeEndpoints: Record<BookBrowseMode, string> = {
        'trending': '/trending/daily.json',
        'want-to-read': '/trending/want-to-read.json',
        'currently-reading': '/trending/now.json',
        'already-read': '/trending/daily.json', // fallback to daily
      };

      const endpoint = modeEndpoints[mode];
      const url = `${BASE_URL}${endpoint}?limit=${limit}`;
      
      logger.info('Open Library browse:', { mode, limit, url });
      
      const response = await rateLimitedFetch(url);
      
      if (!response.ok) {
        throw new Error(`Open Library API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // Convert trending works to our book format
      const works: OpenLibraryTrendingWork[] = data.works || [];
      
      return works.map((work) => ({
        key: work.key,
        title: work.title,
        author_name: work.author_name,
        first_publish_year: work.first_publish_year,
        cover_i: work.cover_i,
        edition_count: work.edition_count,
        has_fulltext: work.has_fulltext,
        ia: work.ia,
      }));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to browse Open Library';
      logger.error('Open Library browse failed:', err);
      setError(errorMessage);
      return [];
    } finally {
      setLoading(false);
    }
  };

  return {
    searchBooks,
    browseTrending,
    getCoverUrl,
    getReadUrl,
    getBookDetailsUrl,
    loading,
    error,
  };
}
