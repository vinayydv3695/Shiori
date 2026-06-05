import { GutendexResponse } from './types';
import type { OnlineAdvancedFilters } from '@/store/onlineSearchStore';

const API_BASE = 'https://gutendex.com/books/';

export async function fetchGutenbergBooks(
  query?: string, 
  page: number = 1,
  filters?: OnlineAdvancedFilters
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

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Failed to fetch Gutenberg books: ${response.statusText}`);
  }

  return response.json();
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
