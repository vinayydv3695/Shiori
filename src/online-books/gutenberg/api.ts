import { GutendexResponse } from './types';

const API_BASE = 'https://gutendex.com/books/';

export async function fetchGutenbergBooks(query?: string, page: number = 1): Promise<GutendexResponse> {
  const url = new URL(API_BASE);
  if (query) {
    url.searchParams.set('search', query);
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
