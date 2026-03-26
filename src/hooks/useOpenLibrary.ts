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

  return {
    searchBooks,
    getCoverUrl,
    getReadUrl,
    getBookDetailsUrl,
    loading,
    error,
  };
}
