import { useState, useEffect, useCallback, useMemo } from 'react';
import { api, AnnotationSearchResult, AnnotationCategory } from '@/lib/tauri';
import { useToastStore } from '@/store/toastStore';
import { logger } from '@/lib/logger';

export type AnnotationSortOrder = 'newest' | 'oldest' | 'book_order';

export function useAnnotationsData() {
  const [annotations, setAnnotations] = useState<AnnotationSearchResult[]>([]);
  const [categories, setCategories] = useState<AnnotationCategory[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters & Toggles
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<number | 'all'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [sortOrder, setSortOrder] = useState<AnnotationSortOrder>('newest');

  // Render cap: long libraries can hold 1000+ annotations; rendering them all
  // at once stalls weak Android WebViews. Display in pages of 100.
  const [limit, setLimit] = useState(100);
  const PAGE_SIZE = 100;
  
  // Sidebar State
  const [selectedBookId, setSelectedBookId] = useState<number | 'all'>('all');
  
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [quoteCardData, setQuoteCardData] = useState<AnnotationSearchResult | null>(null);

  const fetchAnnotations = useCallback(async () => {
    setLoading(true);
    try {
      const typeParam = typeFilter === 'all' ? undefined : typeFilter;
      const catParam = categoryFilter === 'all' ? undefined : categoryFilter;
      
      let results: AnnotationSearchResult[];
      if (searchQuery.trim()) {
        results = await api.searchAnnotationsGlobal(searchQuery.trim(), undefined, typeParam, catParam, 1000, 0);
      } else {
        results = await api.getAllAnnotations(undefined, typeParam, catParam, 1000, 0);
      }
      setAnnotations(results);
    } catch (error) {
      useToastStore.getState().addToast({
        title: 'Failed to fetch annotations',
        description: String(error),
        variant: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [searchQuery, typeFilter, categoryFilter]);

  const fetchCategories = useCallback(async () => {
    try {
      const cats = await api.getAnnotationCategories();
      setCategories(cats);
    } catch (err) {
      logger.error('Failed to fetch categories:', err);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchAnnotations();
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchAnnotations]);

  // Unique Books for Sidebar
  const uniqueBooks = useMemo(() => {
    const map = new Map<number, { title: string; author: string; count: number }>();
    annotations.forEach(a => {
      if (!map.has(a.annotation.bookId)) {
        map.set(a.annotation.bookId, { title: a.book_title, author: a.book_author || 'Unknown', count: 0 });
      }
      map.get(a.annotation.bookId)!.count++;
    });
    return Array.from(map.entries()).map(([id, data]) => ({ id, ...data })).sort((a, b) => a.title.localeCompare(b.title));
  }, [annotations]);

  // Stats summary
  const stats = useMemo(() => {
    const targetSet = selectedBookId === 'all' ? annotations : annotations.filter(a => a.annotation.bookId === selectedBookId);
    let highlights = 0;
    let notes = 0;
    let bookmarks = 0;
    let vocabulary = 0;

    for (const a of targetSet) {
      const t = a.annotation.annotationType;
      if (t === 'highlight') highlights++;
      else if (t === 'note') notes++;
      else if (t === 'bookmark') bookmarks++;

      if (a.annotation.noteContent) {
        try {
          const v = JSON.parse(a.annotation.noteContent);
          if (v && (v.type === 'define' || v.type === 'translate')) vocabulary++;
        } catch {
          // ignore
        }
      }
    }

    return {
      total: targetSet.length,
      highlights,
      notes,
      bookmarks,
      vocabulary,
      booksCount: uniqueBooks.length,
    };
  }, [annotations, selectedBookId, uniqueBooks]);

  // Filtered & Sorted Annotations for Main Pane
  const totalAnnotations = useMemo(() => {
    const list = selectedBookId === 'all' ? [...annotations] : annotations.filter(a => a.annotation.bookId === selectedBookId);
    if (sortOrder === 'newest') {
      list.sort((a, b) => new Date(b.annotation.createdAt || 0).getTime() - new Date(a.annotation.createdAt || 0).getTime());
    } else if (sortOrder === 'oldest') {
      list.sort((a, b) => new Date(a.annotation.createdAt || 0).getTime() - new Date(b.annotation.createdAt || 0).getTime());
    } else if (sortOrder === 'book_order') {
      list.sort((a, b) => (a.annotation.location || '').localeCompare(b.annotation.location || '', undefined, { numeric: true }));
    }

    return list;
  }, [annotations, selectedBookId, sortOrder]);

  const displayedAnnotations = useMemo(() => totalAnnotations.slice(0, limit), [totalAnnotations, limit]);

  const hasMoreAnnotations = totalAnnotations.length > displayedAnnotations.length;
  const loadMoreAnnotations = () => setLimit(prev => prev + PAGE_SIZE);

  // Grouped Annotations (only used when 'all' is selected)
  const groupedAnnotations = useMemo(() => {
    if (selectedBookId !== 'all') return null;
    const map = new Map<number, { title: string; author: string; items: AnnotationSearchResult[] }>();
    for (const a of displayedAnnotations) {
      if (!map.has(a.annotation.bookId)) {
        map.set(a.annotation.bookId, { title: a.book_title, author: a.book_author || 'Unknown', items: [] });
      }
      map.get(a.annotation.bookId)!.items.push(a);
    }
    return Array.from(map.entries());
  }, [displayedAnnotations, selectedBookId]);

  const tabs = [
    { id: 'all', label: 'All Notes' },
    { id: 'highlight', label: 'Highlights' },
    { id: 'note', label: 'Notes' },
    { id: 'bookmark', label: 'Bookmarks' }
  ];

  return {
    annotations,
    categories,
    loading,
    searchQuery, setSearchQuery,
    typeFilter, setTypeFilter,
    categoryFilter, setCategoryFilter,
    viewMode, setViewMode,
    sortOrder, setSortOrder,
    selectedBookId, setSelectedBookId,
    exportDialogOpen, setExportDialogOpen,
    quoteCardData, setQuoteCardData,
    uniqueBooks,
    stats,
    displayedAnnotations,
    groupedAnnotations,
    fetchAnnotations,
    fetchCategories,
    hasMoreAnnotations,
    loadMoreAnnotations,
    tabs
  };
}
