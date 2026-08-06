import { useMemo, useState, useEffect, useDeferredValue } from 'react';
import { useLibraryStore, matchesAdvancedFilters } from '@/store/libraryStore';
import { useShelfStore } from '@/store/shelfStore';
import { api, type Book, type SearchQuery } from '@/lib/tauri';
import { logger } from '@/lib/logger';
import { useDebounce } from './useDebounce';

/**
 * Extracts the library filtering + shelf logic from App.tsx.
 * Takes the search query and returns the final displayBooks array.
 */
export function useLibraryFilter(searchQuery: string) {
  const deferredQuery = useDeferredValue(searchQuery);
  const books = useLibraryStore(state => state.books);
  const selectedFilters = useLibraryStore(state => state.selectedFilters);
  const activeFilters = useLibraryStore(state => state.activeFilters);
  const serverSearchQueryState = useLibraryStore(state => state.serverSearchQuery);
  const setServerSearchQuery = useLibraryStore(state => state.setServerSearchQuery);
  const loadInitialBooks = useLibraryStore(state => state.loadInitialBooks);
  const selectedShelf = useShelfStore(state => state.selectedShelf);
  const [filteredBooks, setFilteredBooks] = useState<Book[]>([]);

  // Filter books only when shelf changes.
  // Keep base library (`books`) out of local state to avoid full-array copy churn.
  useEffect(() => {
    let aborted = false;

    const filterByShelf = async () => {
      if (!selectedShelf) {
        if (!aborted) setFilteredBooks([]);
        return;
      }

      try {
        const shelfBooks = await api.getShelfBooks(selectedShelf.id!);
        if (!aborted) setFilteredBooks(shelfBooks);
      } catch (error) {
        logger.error('Failed to load shelf books:', error);
        if (!aborted) setFilteredBooks([]);
      }
    };

    filterByShelf();
    return () => { aborted = true; };
  }, [selectedShelf]);

  const sourceBooks = useMemo(
    () => (selectedShelf ? filteredBooks : books),
    [selectedShelf, filteredBooks, books],
  );

  const query = deferredQuery.trim().toLowerCase();

  const canUseServerSearch = !selectedShelf;

  const serverSearchQuery = useMemo<SearchQuery | null>(() => {
    if (!canUseServerSearch) return null;

    const advanced = activeFilters;

    const textTokens = [query, advanced?.textSearch?.trim().toLowerCase()]
      .filter(Boolean)
      .join(' ')
      .trim();

    const authors = Array.from(new Set([
      ...selectedFilters.authors,
      ...(advanced?.authors ?? []),
    ]));

    const tags = Array.from(new Set([
      ...selectedFilters.tags,
      ...(advanced?.tags ?? []),
    ]));

    const formats = Array.from(new Set([
      ...selectedFilters.formats.map(f => f.toLowerCase()),
      ...(advanced?.formats ?? []).map(f => f.toLowerCase()),
    ]));

    const languages = Array.from(new Set([
      ...selectedFilters.languages,
      ...(advanced?.languages ?? []),
    ]));

    const publishers = Array.from(new Set([
      ...selectedFilters.publishers,
      ...(advanced?.publishers ?? []),
    ]));

    const seriesList = Array.from(new Set([
      ...selectedFilters.series,
      ...(advanced?.series ?? []),
    ]));

    const selectedRatings = selectedFilters.ratings
      .map(r => Number(r))
      .filter(n => !Number.isNaN(n));
    const selectedMinRating = selectedRatings.length > 0
      ? Math.floor(Math.min(...selectedRatings))
      : undefined;

    const minRatingRaw = Math.max(
      selectedMinRating ?? 0,
      advanced?.ratingMin ?? 0,
    );
    const minRating = minRatingRaw > 0 ? minRatingRaw : undefined;

    const maxRatingRaw = advanced?.ratingMax !== undefined
      ? Math.ceil(advanced.ratingMax)
      : undefined;
    const maxRating = maxRatingRaw !== undefined && maxRatingRaw < 5 ? maxRatingRaw : undefined;

    const isbns: string[] = [];
    const isbn13s: string[] = [];
    for (const identifier of selectedFilters.identifiers) {
      if (identifier.startsWith('ISBN13:')) {
        isbn13s.push(identifier.replace('ISBN13:', '').trim());
      } else if (identifier.startsWith('ISBN:')) {
        isbns.push(identifier.replace('ISBN:', '').trim());
      }
    }

    const dateTo = advanced?.dateTo
      ? `${advanced.dateTo}T23:59:59`
      : undefined;

    const next: SearchQuery = {
      query: textTokens || undefined,
      authors: authors.length > 0 ? authors : undefined,
      tags: tags.length > 0 ? tags : undefined,
      formats: formats.length > 0 ? formats : undefined,
      languages: languages.length > 0 ? languages : undefined,
      publishers: publishers.length > 0 ? publishers : undefined,
      series: seriesList.length === 1 ? seriesList[0] : undefined,
      series_list: seriesList.length > 1 ? seriesList : undefined,
      isbns: isbns.length > 0 ? isbns : undefined,
      isbn13s: isbn13s.length > 0 ? isbn13s : undefined,
      min_rating: minRating,
      max_rating: maxRating,
      date_from: advanced?.dateFrom,
      date_to: dateTo,
      reading_status: advanced?.readingStatus,
    };

    const hasCriteria = Boolean(
      next.query ||
      (next.authors && next.authors.length > 0) ||
      (next.tags && next.tags.length > 0) ||
      (next.formats && next.formats.length > 0) ||
      (next.languages && next.languages.length > 0) ||
      (next.publishers && next.publishers.length > 0) ||
      next.series ||
      (next.series_list && next.series_list.length > 0) ||
      (next.isbns && next.isbns.length > 0) ||
      (next.isbn13s && next.isbn13s.length > 0) ||
      next.min_rating !== undefined ||
      next.max_rating !== undefined ||
      next.date_from ||
      next.date_to ||
      (next.reading_status && next.reading_status.length > 0),
    );

    return hasCriteria ? next : null;
  }, [canUseServerSearch, query, selectedFilters, activeFilters]);

  // Debounce the server-side query so typing doesn't fire a searchBooks IPC
  // round-trip per keystroke on a 50k-book library. Display logic keeps using
  // the raw (deferred) serverSearchQuery, so the previous results stay on
  // screen while the debounce window elapses — no loading flicker.
  const debouncedServerSearchQuery = useDebounce(serverSearchQuery, 250);

  // Keep store in sync with server-side query mode.
  useEffect(() => {
    const currentKey = JSON.stringify(serverSearchQueryState);
    const nextKey = JSON.stringify(debouncedServerSearchQuery);
    if (currentKey === nextKey) return;

    setServerSearchQuery(debouncedServerSearchQuery);
    void loadInitialBooks();
  }, [debouncedServerSearchQuery, serverSearchQueryState, setServerSearchQuery, loadInitialBooks]);

  // Precompute lowercase searchable fields once per source array.
  const searchIndex = useMemo(() => {
    if (!query || serverSearchQuery) return null;
    return sourceBooks.map(book => ({
      book,
      title: book.title.toLowerCase(),
      authors: (book.authors ?? []).map(a => a.name.toLowerCase()),
      tags: (book.tags ?? []).map(t => t.name.toLowerCase()),
      publisher: (book.publisher ?? '').toLowerCase(),
      series: (book.series ?? '').toLowerCase(),
    }));
  }, [sourceBooks, query, serverSearchQuery]);

  const displayBooks = useMemo(() => {
    // In server-query mode, store.books already contains the filtered page.
    if (serverSearchQuery && !selectedShelf) {
      return sourceBooks;
    }

    let result = sourceBooks;

    // 1. Search Query
    if (query && searchIndex) {
      result = searchIndex
        .filter(entry =>
          entry.title.includes(query) ||
          entry.authors.some(a => a.includes(query)) ||
          entry.tags.some(t => t.includes(query)) ||
          entry.publisher.includes(query) ||
          entry.series.includes(query)
        )
        .map(entry => entry.book);
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
  }, [sourceBooks, query, searchIndex, selectedFilters, activeFilters, serverSearchQuery, selectedShelf]);

  return { displayBooks, books };
}
