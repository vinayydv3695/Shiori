import { useMemo, useState, useEffect, useDeferredValue } from 'react';
import { useLibraryStore, matchesAdvancedFilters } from '@/store/libraryStore';
import { useCollectionStore } from '@/store/collectionStore';
import { api, type Book } from '@/lib/tauri';
import { logger } from '@/lib/logger';

/**
 * Extracts the library filtering + collection logic from App.tsx.
 * Takes the search query and returns the final displayBooks array.
 */
export function useLibraryFilter(searchQuery: string) {
  const deferredQuery = useDeferredValue(searchQuery);
  const books = useLibraryStore(state => state.books);
  const selectedFilters = useLibraryStore(state => state.selectedFilters);
  const activeFilters = useLibraryStore(state => state.activeFilters);
  const selectedCollection = useCollectionStore(state => state.selectedCollection);
  const [filteredBooks, setFilteredBooks] = useState<Book[]>([]);

  // Filter books when collection changes
  useEffect(() => {
    let aborted = false;

    const filterByCollection = async () => {
      if (!selectedCollection) {
        if (!aborted) setFilteredBooks(books);
        return;
      }

      try {
        const collectionBooks = await api.getCollectionBooks(selectedCollection.id!);
        if (!aborted) setFilteredBooks(collectionBooks);
      } catch (error) {
        logger.error('Failed to load collection books:', error);
        if (!aborted) setFilteredBooks([]);
      }
    };

    filterByCollection();
    return () => { aborted = true; };
  }, [selectedCollection, books]);

  const displayBooks = useMemo(() => {
    const sourceBooks = filteredBooks.length > 0 || selectedCollection ? filteredBooks : books;
    let result = sourceBooks;

    // 1. Search Query
    if (deferredQuery.trim()) {
      const query = deferredQuery.toLowerCase();
      result = result.filter(book =>
        book.title.toLowerCase().includes(query) ||
        book.authors?.some(a => a.name.toLowerCase().includes(query)) ||
        book.tags?.some(t => t.name.toLowerCase().includes(query)) ||
        book.publisher?.toLowerCase().includes(query) ||
        book.series?.toLowerCase().includes(query)
      );
    }

    // 2. Filters
    const {
      authors, languages, series, formats,
      publishers, ratings, tags, identifiers
    } = selectedFilters;

    const hasFilters = authors.length > 0 || languages.length > 0 || series.length > 0 || 
                       formats.length > 0 || publishers.length > 0 || ratings.length > 0 || 
                       tags.length > 0 || identifiers.length > 0;

    if (hasFilters) {
      const authorsSet = new Set(authors);
      const languagesSet = new Set(languages);
      const seriesSet = new Set(series);
      const formatsSet = new Set(formats);
      const publishersSet = new Set(publishers);
      const ratingsSet = new Set(ratings);
      const tagsSet = new Set(tags);
      const identifiersSet = new Set(identifiers);

      result = result.filter(book => {
        if (authorsSet.size > 0 && !book.authors?.some(a => a.name && authorsSet.has(a.name))) return false;
        if (languagesSet.size > 0 && !(book.language && languagesSet.has(book.language))) return false;
        if (seriesSet.size > 0 && !(book.series && seriesSet.has(book.series))) return false;
        if (formatsSet.size > 0 && !(book.file_format && formatsSet.has(book.file_format.toUpperCase()))) return false;
        if (publishersSet.size > 0 && !(book.publisher && publishersSet.has(book.publisher))) return false;
        
        if (ratingsSet.size > 0) {
          if (!book.rating) return false;
          const roundedRating = (Math.round(book.rating * 2) / 2).toString();
          if (!ratingsSet.has(roundedRating)) return false;
        }

        if (tagsSet.size > 0 && !book.tags?.some(t => t.name && tagsSet.has(t.name))) return false;

        if (identifiersSet.size > 0) {
          let hasId = false;
          if (book.isbn && identifiersSet.has(`ISBN: ${book.isbn}`)) hasId = true;
          if (!hasId && book.isbn13 && identifiersSet.has(`ISBN13: ${book.isbn13}`)) hasId = true;
          if (!hasId) return false;
        }

        return true;
      });
    }

    if (activeFilters) {
      result = result.filter(book => matchesAdvancedFilters(book, activeFilters));
    }

    return result;
  }, [books, deferredQuery, selectedFilters, selectedCollection, filteredBooks, activeFilters]);

  return { displayBooks, books };
}
