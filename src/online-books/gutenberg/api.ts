import { GutendexResponse } from './types';
import type { OnlineAdvancedFilters } from '@/store/onlineSearchStore';

const API_BASE = 'https://gutendex.com/books/';

/**
 * fetchGutenbergBooks with a 1h client-side cache (performance plan Slice 7):
 * gutendex.com is slow and rate-limited; repeat identical searches are served
 * from localStorage. `signal` lets the caller abort a stale request.
 */
const GUTENBERG_CACHE_TTL = 60 * 60 * 1000; // 1h

function gutenbergCacheKey(url: string): string {
  return `gutenberg-cache:${url}`;
}

function readGutenbergCache(url: string): GutendexResponse | null {
  try {
    const raw = localStorage.getItem(gutenbergCacheKey(url));
    if (!raw) return null;
    const { at, data } = JSON.parse(raw) as { at: number; data: GutendexResponse };
    if (Date.now() - at > GUTENBERG_CACHE_TTL) {
      localStorage.removeItem(gutenbergCacheKey(url));
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function writeGutenbergCache(url: string, data: GutendexResponse): void {
  try {
    localStorage.setItem(gutenbergCacheKey(url), JSON.stringify({ at: Date.now(), data }));
  } catch {
    // Storage full/blocked — skip caching, never crash the search.
  }
}

export async function fetchGutenbergBooks(
  query?: string,
  page: number = 1,
  filters?: OnlineAdvancedFilters,
  signal?: AbortSignal,
): Promise<GutendexResponse> {
  const url = new URL(API_BASE);
  
  if (query) {
    url.searchParams.set('search', query);
  }
  
  if (filters) {
    if (filters.author) {
      // Gutenberg searches author + title in 'search' param, so append it
      const currentSearch = url.searchParams.get('search') || '';
      url.searchParams.set('search', currentSearch ? `${currentSearch} ${filters.author}` : filters.author);
    }
    if (filters.yearStart !== undefined) {
      url.searchParams.set('author_year_start', filters.yearStart.toString());
    }
    if (filters.yearEnd !== undefined) {
      url.searchParams.set('author_year_end', filters.yearEnd.toString());
    }
    if (filters.language) {
      url.searchParams.set('languages', filters.language);
    }
  }

  if (page > 1) {
    url.searchParams.set('page', page.toString());
  }

  const urlStr = url.toString();
  const cached = readGutenbergCache(urlStr);
  if (cached) {
    return cached;
  }

  const response = await fetch(urlStr, { signal });
  if (!response.ok) {
    throw new Error(`Failed to fetch Gutenberg books: ${response.statusText}`);
  }

  const data = (await response.json()) as GutendexResponse;
  writeGutenbergCache(urlStr, data);
  return data;
}

export async function fetchPopularGutenbergBooks(): Promise<GutendexResponse> {
  const url = new URL(API_BASE);
  url.searchParams.set('sort', 'popular');
  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Failed to fetch popular Gutenberg books: ${response.statusText}`);
  }

  return response.json();
}
