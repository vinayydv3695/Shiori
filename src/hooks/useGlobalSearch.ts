import { useState, useCallback } from 'react';
import { fetchLibgenBooks } from '@/online-books/libgen/api';
import { fetchGutenbergBooks } from '@/online-books/gutenberg/api';
import type { OnlineAdvancedFilters } from '@/store/onlineSearchStore';

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
      let libgenQuery = query;
      if (!libgenQuery && filters) {
        if (filters.title) libgenQuery = filters.title;
        else if (filters.author) libgenQuery = filters.author;
        else if (filters.series) libgenQuery = filters.series;
      }

      if (page === 1) {
        setResults([]);
      }

      const applyFiltersAndSort = (unified: UnifiedSearchResult[]) => {
        let filtered = unified;
        if (filters) {
          if (filters.title) filtered = filtered.filter(b => b.title.toLowerCase().includes(filters.title!.toLowerCase()));
          if (filters.series) filtered = filtered.filter(b => b.title.toLowerCase().includes(filters.series!.toLowerCase()));
          if (filters.author) filtered = filtered.filter(b => b.author?.toLowerCase().includes(filters.author!.toLowerCase()));
          if (filters.publisher) filtered = filtered.filter(b => b.publisher?.toLowerCase().includes(filters.publisher!.toLowerCase()));
          if (filters.format && filters.format !== 'any') filtered = filtered.filter(b => b.format?.toLowerCase() === filters.format);
          if (filters.language) filtered = filtered.filter(b => b.language?.toLowerCase().includes(filters.language!.toLowerCase()));
          if (filters.yearStart) filtered = filtered.filter(b => b.year && b.year >= filters.yearStart!);
          if (filters.yearEnd) filtered = filtered.filter(b => b.year && b.year <= filters.yearEnd!);
        }
        
        filtered.sort((a, b) => {
          if (a.format === 'epub' && b.format !== 'epub') return -1;
          if (a.format !== 'epub' && b.format === 'epub') return 1;
          return 0;
        });
        
        return filtered;
      };

      let anyHasMore = false;

      const fetchGutenberg = async () => {
        try {
          const gutenbergRes = await fetchGutenbergBooks(query, page, filters);
          if (gutenbergRes.results) {
            const unified: UnifiedSearchResult[] = [];
            gutenbergRes.results.forEach((book) => {
              const epubFormat = book.formats['application/epub+zip'];
              const downloadUrl = epubFormat || book.formats['application/x-mobipocket-ebook'];
              if (!downloadUrl) return;
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
            const filtered = applyFiltersAndSort(unified);
            if (filtered.length > 0) anyHasMore = true;
            setResults(prev => {
              const existingIds = new Set(prev.map(p => p.id));
              const newItems = filtered.filter(f => !existingIds.has(f.id));
              const combined = [...prev, ...newItems];
              return applyFiltersAndSort(combined);
            });
          }
        } catch (e) {
          console.error("Gutenberg search error:", e);
        }
      };

      const fetchLibgen = async () => {
        try {
          const libgenRes = await fetchLibgenBooks(libgenQuery, page, 50);
          if (libgenRes.items) {
            const unified: UnifiedSearchResult[] = [];
            libgenRes.items.forEach((book: any) => {
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
            const filtered = applyFiltersAndSort(unified);
            if (filtered.length > 0) anyHasMore = true;
            setResults(prev => {
              const existingIds = new Set(prev.map(p => p.id));
              const newItems = filtered.filter(f => !existingIds.has(f.id));
              const combined = [...prev, ...newItems];
              return applyFiltersAndSort(combined);
            });
          }
        } catch (e) {
          console.error("Libgen search error:", e);
        }
      };

      await Promise.allSettled([fetchGutenberg(), fetchLibgen()]);
      setHasMore(anyHasMore);
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
