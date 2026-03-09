import { logger } from '@/lib/logger';
import React, { useState, useEffect, useCallback } from 'react';
import { api, AnnotationSearchResult, AnnotationCategory } from '@/lib/tauri';
import { useToastStore } from '@/store/toastStore';
import { Highlighter, StickyNote, Bookmark, X } from '@/components/icons';
import { formatDate } from '@/lib/utils';
import { AnnotationExportDialog } from '../reader/AnnotationExportDialog';

interface AnnotationsViewProps {
  onClose: () => void;
}

export function AnnotationsView({ onClose }: AnnotationsViewProps) {
  const [annotations, setAnnotations] = useState<AnnotationSearchResult[]>([]);
  const [categories, setCategories] = useState<AnnotationCategory[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<number | 'all'>('all');
  
  const [exportDialogOpen, setExportDialogOpen] = useState(false);

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

  const getAnnotationIcon = (type: string) => {
    switch (type) {
      case 'highlight':
        return <Highlighter className="w-5 h-5 text-yellow-600" />;
      case 'note':
        return <StickyNote className="w-5 h-5 text-blue-600" />;
      case 'bookmark':
        return <Bookmark className="w-5 h-5 text-blue-600" />;
      default:
        return <Highlighter className="w-5 h-5 text-gray-500" />;
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 overflow-hidden">
      
      <div className="flex-none p-6 border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-5xl mx-auto flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Annotations</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Browse and search all your highlights, notes, and bookmarks
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setExportDialogOpen(true)}
              className="px-4 py-2 text-sm font-medium border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md transition-colors flex items-center gap-2"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Export
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
              title="Close annotations"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <svg className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search in all annotations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Types</option>
              <option value="highlight">Highlights</option>
              <option value="note">Notes</option>
              <option value="bookmark">Bookmarks</option>
            </select>
            
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[150px]"
            >
              <option value="all">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50 dark:bg-gray-950">
        <div className="max-w-5xl mx-auto space-y-4 pb-20">
          {loading && annotations.length === 0 ? (
            <div className="flex items-center justify-center py-20 text-gray-500">
              <span className="animate-pulse">Loading annotations...</span>
            </div>
          ) : annotations.length === 0 ? (
            <div className="text-center py-20 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 border-dashed">
              <p className="text-gray-500 dark:text-gray-400 text-lg">No annotations found.</p>
              {searchQuery && (
                <p className="text-sm mt-2 text-gray-400">Try adjusting your search or filters.</p>
              )}
            </div>
          ) : (
            annotations.map((result, idx) => (
              <div 
                key={result.annotation.id || idx}
                className="group bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 hover:shadow-md transition-shadow cursor-pointer relative"
                onClick={() => {
                  if (result.annotation.bookId) {
                    window.dispatchEvent(new CustomEvent('open-book', {
                      detail: { bookId: result.annotation.bookId },
                    }));
                  }
                }}
              >
                <div className="flex items-start gap-4">
                  <div className="mt-1 relative shrink-0">
                    {getAnnotationIcon(result.annotation.annotationType)}
                    {result.annotation.annotationType === 'highlight' && result.annotation.color && (
                      <div 
                        className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-white dark:border-gray-900"
                        style={{ backgroundColor: result.annotation.color }}
                      />
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-2">
                      <span className="font-medium text-gray-900 dark:text-gray-100 truncate max-w-[200px] sm:max-w-xs">
                        {result.book_title}
                      </span>
                      <span className="text-gray-400 dark:text-gray-500 text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded-full">
                        {result.book_author}
                      </span>
                      {result.annotation.chapterTitle && (
                        <span className="text-gray-400 dark:text-gray-500 text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded-full truncate max-w-[150px]">
                          {result.annotation.chapterTitle}
                        </span>
                      )}
                      <span className="text-gray-400 text-xs ml-auto whitespace-nowrap">
                        {formatDate(result.annotation.createdAt)}
                      </span>
                    </div>

                    {result.annotation.selectedText && (
                      <div 
                        className="text-gray-800 dark:text-gray-200 mb-3 px-3 py-2 rounded-md text-[15px] leading-relaxed relative"
                      >
                        <div 
                          className="absolute inset-0 rounded-md opacity-20 pointer-events-none"
                          style={{ backgroundColor: result.annotation.color || '#fbbf24' }}
                        />
                        <span className="relative z-10 italic">
                          "{result.annotation.selectedText}"
                        </span>
                      </div>
                    )}

                    {result.annotation.noteContent && (
                      <div className="text-gray-600 dark:text-gray-400 text-sm mt-2 flex items-start gap-2 bg-gray-50 dark:bg-gray-800/50 p-3 rounded-md">
                        <StickyNote className="w-4 h-4 mt-0.5 shrink-0 text-blue-500/70" />
                        <p>{result.annotation.noteContent}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <AnnotationExportDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
      />
    </div>
  );
}
