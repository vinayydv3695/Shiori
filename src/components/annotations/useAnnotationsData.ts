import { useState, useEffect, useCallback, useMemo } from 'react';
import { api, AnnotationSearchResult, AnnotationCategory } from '@/lib/tauri';
import { useToastStore } from '@/store/toastStore';
import { logger } from '@/lib/logger';

export function useAnnotationsData() {
  const [annotations, setAnnotations] = useState<AnnotationSearchResult[]>([]);
  const [categories, setCategories] = useState<AnnotationCategory[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters & Toggles
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<number | 'all'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  
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

  // Filtered Annotations for Main Pane
  const displayedAnnotations = useMemo(() => {
    if (selectedBookId === 'all') return annotations;
    return annotations.filter(a => a.annotation.bookId === selectedBookId);
  }, [annotations, selectedBookId]);

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
    { id: 'note', label: 'Notes' }
  ];

  return {
    annotations,
    categories,
    loading,
    searchQuery, setSearchQuery,
    typeFilter, setTypeFilter,
    categoryFilter, setCategoryFilter,
    viewMode, setViewMode,
    selectedBookId, setSelectedBookId,
    exportDialogOpen, setExportDialogOpen,
    quoteCardData, setQuoteCardData,
    uniqueBooks,
    displayedAnnotations,
    groupedAnnotations,
    fetchAnnotations,
    fetchCategories,
    tabs
  };
}
