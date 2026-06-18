import { useState, useCallback } from 'react';
import { fetchLibgenBooks } from '@/online-books/libgen/api';
import { fetchGutenbergBooks } from '@/online-books/gutenberg/api';
import type { OnlineAdvancedFilters } from '@/store/onlineSearchStore';
import { fetchCoverForBook } from '@/online-books/openlibrary/api';

export interface UnifiedSearchResult {
  id: string; // The URL to download
  source: 'libgen' | 'gutenberg';
  title: string;
  author: string;
  coverUrl?: string;
  format?: string;
  year?: number;
  language?: string;
  downloadUrl: string;
  mirrors?: string[];
  size?: string;
  publisher?: string;
  extra?: Record<string, any>;
}

export function useGlobalSearch() {
  const [results, setResults] = useState<UnifiedSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const search = useCallback(async (query: string, page: number = 1, filters?: OnlineAdvancedFilters) => {
    setLoading(true);
    setError(null);

    try {
      // Execute both searches concurrently
      const [libgenRes, gutenbergRes] = await Promise.allSettled([
        fetchLibgenBooks(query, page, 50),
        fetchGutenbergBooks(query, page, filters)
      ]);

      const unified: UnifiedSearchResult[] = [];

      // Process Gutenberg results
      if (gutenbergRes.status === 'fulfilled' && gutenbergRes.value.results) {
        gutenbergRes.value.results.forEach((book) => {
          const epubFormat = book.formats['application/epub+zip'];
          const downloadUrl = epubFormat || book.formats['application/x-mobipocket-ebook'];
          
          if (!downloadUrl) return; // Only show downloadable books
          
          unified.push({
            id: downloadUrl,
            source: 'gutenberg',
            title: book.title,
            author: book.authors.map(a => a.name).join(', '),
            coverUrl: book.formats['image/jpeg'],
            format: epubFormat ? 'epub' : 'mobi',
            language: book.languages[0],
            year: book.authors[0]?.birth_year || undefined,
            downloadUrl: downloadUrl,
          });
        });
      }

      // Process Libgen results
      if (libgenRes.status === 'fulfilled' && libgenRes.value.items) {
        libgenRes.value.items.forEach((book: any) => {
          unified.push({
            id: book.extra?.url || book.id,
            source: 'libgen',
            title: book.title,
            author: book.extra?.author || 'Unknown',
            coverUrl: book.coverUrl || book.cover_url,
            format: (book.extra?.format || '').toLowerCase(),
            year: book.extra?.year ? parseInt(book.extra.year) : undefined,
            language: book.extra?.language,
            size: book.extra?.file_size,
            downloadUrl: book.extra?.url || book.id,
            mirrors: [
              book.extra?.url,
              book.extra?.mirror_1,
              book.extra?.mirror_2,
              book.extra?.mirror_3,
              book.extra?.mirror_4,
            ].filter(Boolean) as string[],
            extra: book.extra,
          });
        });
      }

      // Apply Advanced Filters (since Libgen API doesn't support them natively, we filter frontend)
      let filtered = unified;
      if (filters) {
        if (filters.title) {
          filtered = filtered.filter(b => b.title.toLowerCase().includes(filters.title!.toLowerCase()));
        }
        if (filters.series) {
          // Series might be in title, e.g., "Harry Potter (Book 1)"
          filtered = filtered.filter(b => b.title.toLowerCase().includes(filters.series!.toLowerCase()));
        }
        if (filters.author) {
          filtered = filtered.filter(b => b.author?.toLowerCase().includes(filters.author!.toLowerCase()));
        }
        if (filters.publisher) {
          filtered = filtered.filter(b => b.publisher?.toLowerCase().includes(filters.publisher!.toLowerCase()));
        }
        if (filters.format && filters.format !== 'any') {
          filtered = filtered.filter(b => b.format?.toLowerCase() === filters.format);
        }
        if (filters.language) {
          filtered = filtered.filter(b => b.language?.toLowerCase().includes(filters.language!.toLowerCase()));
        }
        if (filters.yearStart) {
          filtered = filtered.filter(b => b.year && b.year >= filters.yearStart!);
        }
        if (filters.yearEnd) {
          filtered = filtered.filter(b => b.year && b.year <= filters.yearEnd!);
        }
      }

      // Sort or blend results (e.g., prioritize EPUBs)
      filtered.sort((a, b) => {
        if (a.format === 'epub' && b.format !== 'epub') return -1;
        if (a.format !== 'epub' && b.format === 'epub') return 1;
        return 0;
      });

      setHasMore(filtered.length > 0);
      setResults(prev => page === 1 ? filtered : [...prev, ...filtered]);
    } catch (err: any) {
      setError(err.message || 'An error occurred during search');
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setResults([]);
    setError(null);
    setHasMore(true);
  }, []);

  return { results, loading, error, hasMore, search, clear };
}
