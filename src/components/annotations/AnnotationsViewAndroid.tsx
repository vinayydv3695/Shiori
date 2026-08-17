import React, { useRef } from 'react';
import { useAnnotationsData } from './useAnnotationsData';
import { AnnotationCard } from './AnnotationCard';
import { AnnotationExportDialog } from '../reader/AnnotationExportDialog';
import { QuoteCardDialog } from './QuoteCardDialog';
import { X, Search, Share2, Bookmark, ChevronDown, Check, Filter, BookOpen, RotateCcw } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface AnnotationsViewAndroidProps {
  onClose: () => void;
  onOpenBook?: (bookId: number, location?: string) => void;
  data: ReturnType<typeof useAnnotationsData>;
}

export function AnnotationsViewAndroid({ onClose, onOpenBook, data }: AnnotationsViewAndroidProps) {
  const {
    annotations,
    categories,
    loading,
    searchQuery, setSearchQuery,
    typeFilter, setTypeFilter,
    categoryFilter, setCategoryFilter,
    selectedBookId, setSelectedBookId,
    exportDialogOpen, setExportDialogOpen,
    quoteCardData, setQuoteCardData,
    uniqueBooks, displayedAnnotations, groupedAnnotations, tabs
  } = data;

  const scrollRef = useRef<HTMLDivElement>(null);

  const isFiltered = searchQuery.trim() !== '' || typeFilter !== 'all' || categoryFilter !== 'all' || selectedBookId !== 'all';

  const handleResetFilters = () => {
    setSearchQuery('');
    setTypeFilter('all');
    setCategoryFilter('all');
    setSelectedBookId('all');
  };

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-hidden">
      {/* Mobile Sticky Header */}
      <div 
        className="flex-none pb-3 px-4 border-b border-border/40 bg-background/90 backdrop-blur-xl z-20 sticky top-0 shadow-xs"
        style={{
          paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)',
          paddingLeft: 'calc(env(safe-area-inset-left, 0px) + 16px)',
          paddingRight: 'calc(env(safe-area-inset-right, 0px) + 16px)'
        }}
      >
        {/* Top App Bar */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-foreground truncate">Annotations</h1>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 shrink-0">
              {displayedAnnotations.length}
            </span>
          </div>
          
          <div className="flex items-center gap-2 shrink-0">
            <button 
              onClick={() => setExportDialogOpen(true)} 
              className="w-9 h-9 flex items-center justify-center rounded-full bg-muted/60 hover:bg-muted text-foreground border border-border/40 transition-all active:scale-95 shadow-xs" 
              title="Export Annotations"
            >
              <Share2 size={16} />
            </button>
            <button 
              onClick={onClose} 
              className="w-9 h-9 flex items-center justify-center rounded-full bg-muted/60 hover:bg-muted text-foreground border border-border/40 transition-all active:scale-95 shadow-xs" 
              title="Close"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative w-full mb-3">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input 
            type="text" 
            placeholder="Search notes & highlights..." 
            value={searchQuery} 
            onChange={(e) => setSearchQuery(e.target.value)} 
            className="w-full h-10 pl-10 pr-9 bg-muted/40 hover:bg-muted/60 focus:bg-background border border-border/50 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 rounded-2xl transition-all text-sm text-foreground placeholder:text-muted-foreground outline-none" 
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-muted-foreground/20 text-muted-foreground hover:bg-muted-foreground/30 hover:text-foreground flex items-center justify-center transition-colors"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Type Tabs Row (Full Width Grid) */}
        <div className="grid grid-cols-4 p-1 bg-muted/50 border border-border/50 rounded-2xl gap-1 w-full mb-2.5">
          {tabs.map(tab => {
            const isActive = typeFilter === tab.id;
            return (
              <button 
                key={tab.id} 
                onClick={() => setTypeFilter(tab.id)} 
                className={`py-1.5 px-1 rounded-xl text-xs font-bold transition-all text-center truncate select-none ${
                  isActive 
                    ? 'bg-primary text-primary-foreground shadow-xs' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Filters Row: Category Dropdown on the left + Book Chips scrolling */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-0.5">
          {/* Category Dropdown */}
          <div className="shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold transition-all shadow-xs outline-none cursor-pointer select-none shrink-0 ${
                categoryFilter !== 'all'
                  ? 'bg-primary/15 text-primary border-primary/40'
                  : 'bg-muted/50 hover:bg-muted text-foreground border-border/60'
              }`}>
                <Filter size={12} className={categoryFilter !== 'all' ? 'text-primary' : 'text-muted-foreground'} />
                <span className="whitespace-nowrap">
                  {categoryFilter === 'all' ? 'All Categories' : categories.find(c => c.id === categoryFilter)?.name || 'Category'}
                </span>
                <ChevronDown size={12} className="text-muted-foreground shrink-0" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56 bg-popover !bg-popover !opacity-100 border border-border/80 shadow-2xl rounded-2xl p-1.5 z-[200]">
                <DropdownMenuItem
                  onClick={() => setCategoryFilter('all')}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium cursor-pointer transition-colors ${
                    categoryFilter === 'all' ? 'bg-primary/15 text-primary font-bold' : 'text-popover-foreground hover:bg-accent'
                  }`}
                >
                  <span>All Categories</span>
                  {categoryFilter === 'all' && <Check size={14} className="text-primary" />}
                </DropdownMenuItem>
                {categories.map((c) => (
                  <DropdownMenuItem
                    key={c.id ?? c.name}
                    onClick={() => c.id !== undefined && setCategoryFilter(c.id)}
                    className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium cursor-pointer transition-colors ${
                      categoryFilter === c.id ? 'bg-primary/15 text-primary font-bold' : 'text-popover-foreground hover:bg-accent'
                    }`}
                  >
                    <span className="truncate pr-2">{c.name}</span>
                    {categoryFilter === c.id && <Check size={14} className="text-primary shrink-0" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="h-4 w-px bg-border/60 shrink-0" />

          {/* Book Chips */}
          <button
            onClick={() => setSelectedBookId('all')}
            className={`flex-none px-3 py-1.5 rounded-full text-xs font-semibold transition-all border shrink-0 ${
              selectedBookId === 'all' 
                ? 'bg-foreground text-background border-foreground shadow-xs font-bold' 
                : 'bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border-border/50'
            }`}
          >
            All Books ({annotations.length})
          </button>
          {uniqueBooks.map(book => (
            <button
              key={book.id}
              onClick={() => setSelectedBookId(book.id as number)}
              className={`flex-none px-3 py-1.5 rounded-full text-xs font-semibold transition-all border shrink-0 max-w-[200px] truncate ${
                selectedBookId === book.id 
                  ? 'bg-foreground text-background border-foreground shadow-xs font-bold' 
                  : 'bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border-border/50'
              }`}
            >
              <span className="truncate">{book.title}</span>
              <span className="ml-1 opacity-70 font-mono text-[10px]">({book.count})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable Content */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 bg-background/50 relative"
      >
        {/* pb-28 ensures the last item clears the Android bottom navigation bar */}
        <div className="max-w-xl mx-auto pb-28 pt-2">
          {loading && displayedAnnotations.length === 0 ? (
            <div className="flex items-center justify-center h-48">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : displayedAnnotations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-4">
              <div className="p-5 bg-muted/40 rounded-full">
                <Bookmark size={36} className="opacity-30" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-base font-semibold text-foreground">No annotations found</p>
                <p className="text-xs text-muted-foreground">
                  {isFiltered ? 'Try clearing your filters or search query' : 'Annotations and highlights will appear here'}
                </p>
              </div>
              {isFiltered && (
                <button
                  onClick={handleResetFilters}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 transition-all active:scale-95"
                >
                  <RotateCcw size={13} />
                  <span>Reset filters</span>
                </button>
              )}
            </div>
          ) : selectedBookId === 'all' && groupedAnnotations ? (
            <div className="space-y-8">
              {groupedAnnotations.map(([bookId, group]) => (
                <div key={bookId} className="space-y-3.5">
                  <div className="flex items-center justify-between pb-2 border-b border-border/40">
                    <div className="min-w-0 pr-4 flex items-center gap-2">
                      <BookOpen size={16} className="text-primary shrink-0" />
                      <div className="min-w-0">
                        <h3 className="font-bold text-[16px] text-foreground truncate">{group.title}</h3>
                        <p className="text-xs text-muted-foreground truncate">{group.author}</p>
                      </div>
                    </div>
                    <span className="text-[11px] bg-primary/10 text-primary border border-primary/20 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0">
                      {group.items.length} {group.items.length === 1 ? 'note' : 'notes'}
                    </span>
                  </div>
                  <div className="flex flex-col gap-3.5">
                    {group.items.map(result => (
                      <AnnotationCard key={result.annotation.id} result={result} categories={categories} onOpenBook={onOpenBook} setQuoteCardData={setQuoteCardData} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-3.5">
              {displayedAnnotations.map(result => (
                <AnnotationCard key={result.annotation.id} result={result} categories={categories} onOpenBook={onOpenBook} setQuoteCardData={setQuoteCardData} />
              ))}
            </div>
          )}
        </div>
      </div>

      <AnnotationExportDialog 
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        bookId={selectedBookId === 'all' ? undefined : (selectedBookId as number)}
      />

      <QuoteCardDialog 
        open={!!quoteCardData}
        onOpenChange={(open) => { if (!open) setQuoteCardData(null); }}
        annotationData={quoteCardData}
      />
    </div>
  );
}

