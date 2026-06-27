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
    if (result.annotation.noteContent) {
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
        className="break-inside-avoid mb-8 relative group transition-all duration-500 hover:-translate-y-1"
      >
        {/* Premium Card Background & Borders */}
        <div className="absolute inset-0 bg-gradient-to-br from-card/90 to-background border border-border/30 group-hover:border-border/60 rounded-[1.5rem] shadow-[0_8px_30px_rgba(0,0,0,0.08)] group-hover:shadow-[0_16px_40px_rgba(0,0,0,0.15)] ring-1 ring-white/[0.01] transition-all duration-500 z-0" />
        
        {/* Subtle Accent Glow */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-[0.04] transition-opacity duration-700 pointer-events-none rounded-[1.5rem] z-0" style={{ backgroundImage: `radial-gradient(circle at top right, ${tintColor}, transparent 70%)` }} />

        <div className="p-7 flex flex-col h-full relative z-10">
          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-3.5">
              <div className="shrink-0 text-muted-foreground/40 group-hover:text-primary/80 transition-colors duration-500">
                {isVocabulary ? (
                  <BookmarkPlus className="w-5 h-5" />
                ) : (
                  getAnnotationIcon(result.annotation.annotationType)
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground/60">
                <span className="font-bold tracking-[0.15em] uppercase text-[9px]">{formatDate(result.annotation.createdAt || '')}</span>
                {result.annotation.chapterTitle && (
                  <>
                    <span className="w-1 h-1 rounded-full bg-border" />
                    <span className="truncate max-w-[150px] sm:max-w-[200px] font-medium font-serif italic text-[13px]" title={result.annotation.chapterTitle}>
                      {result.annotation.chapterTitle}
                    </span>
                  </>
                )}
              </div>
            </div>
            
            {/* Quick Actions (Hover) */}
            <div className="opacity-0 group-hover:opacity-100 transition-all duration-500 flex items-center gap-1.5 -mt-1.5 -mr-1.5 translate-x-2 group-hover:translate-x-0">
              {result.annotation.selectedText && (
                <button 
                  onClick={() => setQuoteCardData(result)}
                  className="p-2 hover:bg-primary/10 rounded-full text-muted-foreground hover:text-primary transition-all duration-300 hover:shadow-[0_0_15px_rgba(var(--primary),0.2)]"
                  title="Create Quote Card"
                >
                  <Share2 size={14} />
                </button>
              )}
              {onOpenBook && (
                <button 
                  onClick={() => onOpenBook(result.annotation.bookId, result.annotation.location)}
                  className="p-2 hover:bg-primary/10 rounded-full text-muted-foreground hover:text-primary transition-all duration-300 hover:shadow-[0_0_15px_rgba(var(--primary),0.2)]"
                  title="Jump to location"
                >
                  <ExternalLink size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Category Tag */}
          {result.annotation.categoryId && categories.find(c => c.id === result.annotation.categoryId) && (
            <div className="mb-6">
              <span className="text-[9px] uppercase tracking-[0.2em] px-3 py-1.5 rounded-full font-bold shadow-sm backdrop-blur-md" style={{ 
                backgroundColor: `${categories.find(c => c.id === result.annotation.categoryId)?.color}10`, 
                color: categories.find(c => c.id === result.annotation.categoryId)?.color,
                boxShadow: `inset 0 1px 0 ${categories.find(c => c.id === result.annotation.categoryId)?.color}20`
              }}>
                {categories.find(c => c.id === result.annotation.categoryId)?.name}
              </span>
            </div>
          )}

          {/* Content */}
          <div className="flex-1 space-y-6">
            {result.annotation.selectedText && (
              <div className="relative pl-5 py-1 group/quote">
                {/* Decorative background quote mark */}
                <div className="absolute -top-4 -left-1 text-[70px] leading-none font-serif text-foreground/[0.03] select-none pointer-events-none transition-transform duration-700 group-hover:-translate-y-1">"</div>
                
                {/* Glowing vertical accent line */}
                <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-full transition-all duration-500 group-hover/quote:w-[4px]" style={{ 
                  background: `linear-gradient(to bottom, ${tintColor}, ${tintColor}10)`,
                  boxShadow: `0 0 12px ${tintColor}30`
                }} />
                
                <span className="text-foreground/95 text-[18px] md:text-[20px] leading-[1.65] font-serif font-medium tracking-tight relative z-10 block">
                  {result.annotation.selectedText}
                </span>
              </div>
            )}

            {result.annotation.noteContent && !isVocabulary && (
              <div className="text-[14px] prose prose-sm dark:prose-invert max-w-none text-muted-foreground/80 bg-muted/20 hover:bg-muted/30 transition-colors p-5 rounded-2xl border border-border/20 shadow-inner">
                <ReactMarkdown>{result.annotation.noteContent}</ReactMarkdown>
              </div>
            )}
            
            {isVocabulary && vocabData && (
              <div className="mt-4 pl-1 relative z-10">
                <div className="text-sm flex flex-col gap-5">
                  {vocabData.type === 'define' && vocabData.data?.meanings?.length && (
                    <div className="space-y-6">
                      {vocabData.data.phonetic && (
                        <div className="flex items-center gap-2.5 text-muted-foreground/50 border-b border-border/30 pb-4">
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary/50"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>
                          <span className="text-[15px] font-medium tracking-widest font-serif italic">{vocabData.data.phonetic}</span>
                        </div>
                      )}
                      <div className="space-y-5">
                        {vocabData.data.meanings.slice(0, 2).map((m: any, i: number) => (
                          <div key={i} className="flex flex-col gap-2 relative pl-4">
                            <div className="absolute left-0 top-1.5 w-1.5 h-1.5 rounded-full bg-primary/40" />
                            <span className="font-bold text-[9px] text-primary/80 uppercase tracking-[0.25em]">{m.part_of_speech}</span>
                            <div className="text-foreground/80 text-[15px] leading-relaxed font-medium">{m.definitions[0]?.definition}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {vocabData.type === 'translate' && vocabData.data?.translated_text && (
                    <div className="space-y-2 mt-3 pt-4 border-t border-border/20">
                      <div className="text-foreground/95 text-[18px] font-serif font-semibold tracking-tight">{vocabData.data.translated_text}</div>
                      <div className="text-[9px] text-muted-foreground/40 uppercase tracking-[0.2em] font-bold">Translated via {vocabData.data.provider}</div>
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
    { id: 'note', label: 'Notes' }
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
        <div className="flex-none pt-6 px-6 border-b border-border bg-card z-20 shadow-sm relative">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                {selectedBookId === 'all' ? 'All Annotations' : uniqueBooks.find(b => b.id === selectedBookId)?.title}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {displayedAnnotations.length} item{displayedAnnotations.length !== 1 ? 's' : ''} found
              </p>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              {/* Integrated Search Bar */}
              <div className="relative min-w-[240px] max-w-sm">
                <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search in these annotations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-muted/50 hover:bg-muted border border-border/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all text-sm text-foreground placeholder:text-muted-foreground"
                />
              </div>

              <button
                onClick={() => setExportDialogOpen(true)}
                className="px-3 py-2 text-sm font-medium border border-border hover:bg-muted rounded-lg transition-colors flex items-center gap-2"
              >
                <Share2 size={16} />
                <span className="hidden sm:inline">Export</span>
              </button>
              
              <button
                onClick={onClose}
                className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
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
            <div className="flex items-center gap-3 pb-3 shrink-0">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                className="px-3 py-1.5 bg-background border border-border/80 hover:border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-sm min-w-[140px] text-foreground transition-colors dark:[color-scheme:dark]"
              >
                <option value="all">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              <div className="flex items-center bg-muted/50 rounded-lg p-1 border border-border/50">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                  title="Grid view"
                >
                  <LayoutGrid size={16} />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                  title="List view"
                >
                  <List size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 bg-background relative">
          <div className="max-w-7xl mx-auto pb-24">
            {loading && displayedAnnotations.length === 0 ? (
              <div className="flex items-center justify-center h-48">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : displayedAnnotations.length === 0 ? (
              <div className="text-center py-24 px-4 max-w-md mx-auto">
                <div className="w-16 h-16 bg-muted/50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                  <StickyNote className="w-8 h-8 text-muted-foreground opacity-60" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">No annotations found</h3>
                <p className="text-muted-foreground leading-relaxed">
                  We couldn't find any annotations matching your current filters. Try adjusting your search or selecting a different category.
                </p>
              </div>
            ) : (
              <div className="space-y-10">
                {selectedBookId === 'all' && groupedAnnotations ? (
                  <div className="space-y-12">
                    {groupedAnnotations.map(([bookId, group]) => (
                      <div key={bookId} className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="flex items-center gap-4 mb-8 pb-3 pt-2 border-b border-border/40 sticky top-0 bg-background/95 backdrop-blur-xl z-20 shadow-[0_4px_12px_-8px_rgba(0,0,0,0.3)] -mx-4 px-4 rounded-b-xl lg:-mx-8 lg:px-8">
                          <div className="p-2.5 bg-primary/10 rounded-xl text-primary shadow-sm ring-1 ring-primary/20">
                            <BookOpen size={22} />
                          </div>
                          <div>
                            <h2 
                              className="text-lg md:text-xl font-bold text-foreground cursor-pointer hover:text-primary transition-colors line-clamp-1" 
                              onClick={() => setSelectedBookId(bookId)}
                              title={group.title}
                            >
                              {group.title}
                            </h2>
                            <p className="text-sm text-muted-foreground font-medium mt-0.5">
                              {group.author} <span className="opacity-50 mx-1.5">•</span> <span className="text-foreground/80">{group.items.length} annotations</span>
                            </p>
                          </div>
                        </div>
                        <div className={viewMode === 'grid' ? 'columns-1 md:columns-2 xl:columns-3 gap-6 space-y-6' : 'flex flex-col gap-6 max-w-4xl mx-auto'}>
                          {group.items.map(renderAnnotationCard)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={viewMode === 'grid' ? 'columns-1 md:columns-2 xl:columns-3 gap-6 space-y-6 animate-in fade-in duration-500' : 'flex flex-col gap-6 max-w-4xl mx-auto animate-in fade-in duration-500'}>
                    {displayedAnnotations.map(renderAnnotationCard)}
                  </div>
                )}
              </div>
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
