import { logger } from '@/lib/logger';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { api, AnnotationSearchResult, AnnotationCategory } from '@/lib/tauri';
import { useToastStore } from '@/store/toastStore';
import { Highlighter, StickyNote, Bookmark, BookmarkPlus, X, LayoutGrid, List, Library, Share2, ExternalLink, BookOpen } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { AnnotationExportDialog } from '../reader/AnnotationExportDialog';
import { QuoteCardDialog } from './QuoteCardDialog';
import ReactMarkdown from 'react-markdown';

interface AnnotationsViewProps {
  onClose: () => void;
  onOpenBook?: (bookId: number, location?: string) => void;
}

export function AnnotationsView({ onClose, onOpenBook }: AnnotationsViewProps) {
  const [annotations, setAnnotations] = useState<AnnotationSearchResult[]>([]);
  const [categories, setCategories] = useState<AnnotationCategory[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters & Toggles
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<number | 'all'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
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

  const getAnnotationIcon = (type: string) => {
    switch (type) {
      case 'highlight':
        return <Highlighter className="w-5 h-5 text-yellow-500" />;
      case 'note':
        return <StickyNote className="w-5 h-5 text-blue-500" />;
      case 'bookmark':
        return <Bookmark className="w-5 h-5 text-blue-500" />;
      case 'vocabulary':
        return <BookmarkPlus className="w-5 h-5 text-purple-500" />;
      default:
        return <Highlighter className="w-5 h-5 text-muted-foreground" />;
    }
  };

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

  const renderAnnotationCard = (result: AnnotationSearchResult) => {
    let isVocabulary = false;
    let vocabData: any = null;
    if (result.annotation.annotationType === 'note' && result.annotation.noteContent) {
      try {
        vocabData = JSON.parse(result.annotation.noteContent);
        if (vocabData && (vocabData.type === 'define' || vocabData.type === 'translate')) {
          isVocabulary = true;
        }
      } catch {
        // Not JSON, just a regular note
      }
    }

    const tintColor = result.annotation.color || '#3b82f6';

    return (
      <div 
        key={result.annotation.id} 
        className="break-inside-avoid mb-6 bg-card border border-border rounded-xl shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group"
        style={{
          borderLeft: `4px solid ${tintColor}`,
          backgroundColor: `color-mix(in srgb, ${tintColor} 3%, var(--card))`
        }}
      >
        <div className="p-5 flex flex-col h-full">
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="relative pt-1 shrink-0">
                {isVocabulary ? (
                  <BookmarkPlus className="w-5 h-5 text-purple-500" />
                ) : (
                  getAnnotationIcon(result.annotation.annotationType)
                )}
              </div>
              <div className="flex flex-col">
                {selectedBookId === 'all' && (
                  <span className="font-semibold text-foreground text-sm line-clamp-1">
                    {result.book_title}
                  </span>
                )}
                <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground mt-0.5">
                  {selectedBookId === 'all' && <span>{result.book_author}</span>}
                  {selectedBookId === 'all' && <span>•</span>}
                  <span>{formatDate(result.annotation.createdAt || '')}</span>
                  {result.annotation.chapterTitle && (
                    <>
                      <span>•</span>
                      <span className="px-1.5 py-0.5 bg-muted rounded text-[10px]">
                        {result.annotation.chapterTitle}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
            
            {/* Quick Actions (Hover) */}
            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
              {result.annotation.selectedText && (
                <button 
                  onClick={() => setQuoteCardData(result)}
                  className="p-1.5 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground"
                  title="Create Quote Card"
                >
                  <Share2 size={14} />
                </button>
              )}
              {onOpenBook && (
                <button 
                  onClick={() => onOpenBook(result.annotation.bookId, result.annotation.location)}
                  className="p-1.5 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground"
                  title="Jump to location"
                >
                  <ExternalLink size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Category Tag */}
          {result.annotation.categoryId && categories.find(c => c.id === result.annotation.categoryId) && (
            <div className="mb-3">
              <span className="text-xs px-2 py-1 rounded-full font-medium" style={{ backgroundColor: `${categories.find(c => c.id === result.annotation.categoryId)?.color}20`, color: categories.find(c => c.id === result.annotation.categoryId)?.color }}>
                {categories.find(c => c.id === result.annotation.categoryId)?.name}
              </span>
            </div>
          )}

          {/* Content */}
          <div className="flex-1">
            {result.annotation.selectedText && (
              <div className="pl-3 border-l-2 border-primary/30 mb-3">
                <span className="text-foreground/90 italic text-sm md:text-base leading-relaxed">
                  "{result.annotation.selectedText}"
                </span>
              </div>
            )}

            {result.annotation.noteContent && !isVocabulary && (
              <div className="mt-3 p-3 bg-background/50 rounded-lg border border-border/50 text-sm prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown>{result.annotation.noteContent}</ReactMarkdown>
              </div>
            )}
            
            {isVocabulary && vocabData && (
              <div className="text-muted-foreground text-sm mt-3 flex flex-col gap-2 bg-background/50 p-3 rounded-lg border border-purple-500/20">
                <div className="flex items-center gap-2 text-purple-500">
                  <BookmarkPlus className="w-4 h-4 shrink-0" />
                  <span className="font-medium text-purple-700 dark:text-purple-400">Vocabulary Definition</span>
                </div>
                <div className="text-sm">
                  {vocabData.type === 'define' && vocabData.data?.meanings?.length && (
                    <div className="space-y-2">
                      {vocabData.data.phonetic && <div className="text-xs italic text-muted-foreground">/{vocabData.data.phonetic}/</div>}
                      {vocabData.data.meanings.slice(0, 2).map((m: any, i: number) => (
                        <div key={i} className="mb-1">
                          <span className="font-medium text-xs text-muted-foreground uppercase tracking-wider">{m.part_of_speech}</span>
                          <div className="text-foreground mt-0.5">{m.definitions[0]?.definition}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {vocabData.type === 'translate' && vocabData.data?.translated_text && (
                    <div>
                      <div className="text-foreground text-base">{vocabData.data.translated_text}</div>
                      <div className="text-xs text-muted-foreground mt-1">via {vocabData.data.provider}</div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const tabs = [
    { id: 'all', label: 'All Notes' },
    { id: 'highlight', label: 'Highlights' },
    { id: 'note', label: 'Notes' },
    { id: 'bookmark', label: 'Bookmarks' }
  ];

  return (
    <div className="flex h-full bg-background text-foreground overflow-hidden">
      
      {/* Left Sidebar - Books */}
      <div className="w-72 flex-none border-r border-border bg-muted/10 flex flex-col overflow-hidden hidden md:flex">
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold text-lg flex items-center gap-2">
            <Library size={18} />
            Library
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <button
            onClick={() => setSelectedBookId('all')}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-between ${
              selectedBookId === 'all' 
                ? 'bg-primary text-primary-foreground' 
                : 'hover:bg-muted text-foreground'
            }`}
          >
            <div className="flex items-center gap-2">
              <BookOpen size={16} />
              <span>All Books</span>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full ${selectedBookId === 'all' ? 'bg-primary-foreground/20' : 'bg-muted-foreground/20'}`}>
              {annotations.length}
            </span>
          </button>
          
          <div className="pt-4 pb-1 px-3">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Books</span>
          </div>
          
          {uniqueBooks.map(book => (
            <button
              key={book.id}
              onClick={() => setSelectedBookId(book.id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-start gap-2 ${
                selectedBookId === book.id 
                  ? 'bg-muted border border-border/50 text-foreground font-medium' 
                  : 'hover:bg-muted/50 text-muted-foreground hover:text-foreground'
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="truncate">{book.title}</div>
                <div className="text-xs opacity-70 truncate mt-0.5">{book.author}</div>
              </div>
              <span className="text-xs px-2 py-0.5 bg-background rounded-full border border-border/50 shrink-0">
                {book.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        
        {/* Header & Tabs */}
        <div className="flex-none pt-6 pb-0 px-6 border-b border-border bg-card">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                {selectedBookId === 'all' ? 'All Annotations' : uniqueBooks.find(b => b.id === selectedBookId)?.title}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {displayedAnnotations.length} item{displayedAnnotations.length !== 1 ? 's' : ''} found
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setExportDialogOpen(true)}
                className="px-3 py-1.5 text-sm font-medium border border-border hover:bg-muted rounded-md transition-colors flex items-center gap-2"
              >
                <Share2 size={16} />
                Export
              </button>
              <button
                onClick={onClose}
                className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                title="Close annotations"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-end">
            <div className="flex gap-6 overflow-x-auto w-full no-scrollbar">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setTypeFilter(tab.id)}
                  className={`pb-3 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${
                    typeFilter === tab.id 
                      ? 'border-primary text-foreground' 
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* View Controls */}
            <div className="flex items-center gap-2 pb-3 shrink-0">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                className="px-2 py-1.5 bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-xs min-w-[120px] text-foreground dark:[color-scheme:dark] [&>option]:bg-popover [&>option]:text-popover-foreground"
              >
                <option value="all">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              <div className="flex items-center bg-muted rounded-md p-0.5 border border-border">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1 rounded transition-colors ${viewMode === 'grid' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                  title="Grid view"
                >
                  <LayoutGrid size={14} />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-1 rounded transition-colors ${viewMode === 'list' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                  title="List view"
                >
                  <List size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Search Bar Overlay */}
        <div className="p-4 border-b border-border bg-background/80 backdrop-blur-sm z-10 sticky top-0">
          <div className="relative max-w-2xl">
            <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search in these annotations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 bg-muted border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary transition-all text-sm text-foreground placeholder:text-muted-foreground"
            />
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-background">
          <div className="max-w-7xl mx-auto pb-20">
            {loading && displayedAnnotations.length === 0 ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : displayedAnnotations.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground bg-muted/30 rounded-xl border border-border/50">
                <StickyNote className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <h3 className="text-lg font-medium text-foreground mb-1">No annotations found</h3>
                <p>Try adjusting your search or filters.</p>
              </div>
            ) : (
              <>
                {selectedBookId === 'all' && groupedAnnotations ? (
                  <div className="space-y-12">
                    {groupedAnnotations.map(([bookId, group]) => (
                      <div key={bookId} className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="flex items-center gap-3 mb-6 pb-2 border-b border-border/50 sticky top-0 bg-background/95 backdrop-blur z-10 py-2">
                          <div className="p-2 bg-primary/10 rounded-lg text-primary">
                            <BookOpen size={20} />
                          </div>
                          <div>
                            <h2 className="text-xl font-bold text-foreground cursor-pointer hover:text-primary transition-colors" onClick={() => setSelectedBookId(bookId)}>{group.title}</h2>
                            <p className="text-sm text-muted-foreground">{group.author} • {group.items.length} annotations</p>
                          </div>
                        </div>
                        <div className={viewMode === 'grid' ? 'columns-1 lg:columns-2 xl:columns-3 gap-6' : 'flex flex-col gap-4 max-w-3xl'}>
                          {group.items.map(renderAnnotationCard)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={viewMode === 'grid' ? 'columns-1 lg:columns-2 xl:columns-3 gap-6 animate-in fade-in duration-500' : 'flex flex-col gap-4 max-w-3xl animate-in fade-in duration-500'}>
                    {displayedAnnotations.map(renderAnnotationCard)}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

      </div>

      <AnnotationExportDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
      />
      
      <QuoteCardDialog
        open={!!quoteCardData}
        onOpenChange={(open) => !open && setQuoteCardData(null)}
        annotationData={quoteCardData}
      />
    </div>
  );
}
