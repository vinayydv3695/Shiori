import { useMemo, useState, useEffect } from 'react';
import { useLibraryStore, matchesAdvancedFilters } from '@/store/libraryStore';
import { useCollectionStore } from '@/store/collectionStore';
import { api, type Book } from '@/lib/tauri';
import { logger } from '@/lib/logger';

/**
 * Extracts the library filtering + collection logic from App.tsx.
 * Takes the search query and returns the final displayBooks array.
 */
export function useLibraryFilter(searchQuery: string) {
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
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
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

    if (authors.length > 0) {
      result = result.filter(book =>
        book.authors?.some(a => a.name && authors.includes(a.name))
      );
    }

    if (languages.length > 0) {
      result = result.filter(book =>
        book.language && languages.includes(book.language)
      );
    }

    if (series.length > 0) {
      result = result.filter(book =>
        book.series && series.includes(book.series)
      );
    }

    if (formats.length > 0) {
      result = result.filter(book =>
        book.file_format && formats.includes(book.file_format.toUpperCase())
      );
    }

    if (publishers.length > 0) {
      result = result.filter(book =>
        book.publisher && publishers.includes(book.publisher)
      );
    }

    if (ratings.length > 0) {
      result = result.filter(book => {
        if (!book.rating) return false;
        const roundedRating = (Math.round(book.rating * 2) / 2).toString();
        return ratings.includes(roundedRating);
      });
    }

    if (tags.length > 0) {
      result = result.filter(book =>
        book.tags?.some(t => t.name && tags.includes(t.name))
      );
    }

    if (identifiers.length > 0) {
      result = result.filter(book => {
        const ids = [];
        if (book.isbn) ids.push(`ISBN: ${book.isbn}`);
        if (book.isbn13) ids.push(`ISBN13: ${book.isbn13}`);
        return ids.some(id => identifiers.includes(id));
      });
    }

    if (activeFilters) {
      result = result.filter(book => matchesAdvancedFilters(book, activeFilters));
    }

    return result;
  }, [books, searchQuery, selectedFilters, selectedCollection, filteredBooks, activeFilters]);

  return { displayBooks, books };
}
