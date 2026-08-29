import React, { useRef } from 'react';
import { useAnnotationsData } from './useAnnotationsData';
import { AndroidAnnotationCard } from './AndroidAnnotationCard';
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
  onOpenBook?: (bookId: number, location?: string, annotationId?: number) => void;
  data: ReturnType<typeof useAnnotationsData>;
}

export function AnnotationsViewAndroid({ onClose, onOpenBook, data }: AnnotationsViewAndroidProps) {
  const {
    categories,
    loading,
    searchQuery, setSearchQuery,
    typeFilter, setTypeFilter,
    categoryFilter, setCategoryFilter,
    selectedBookId, setSelectedBookId,
    exportDialogOpen, setExportDialogOpen,
    quoteCardData, setQuoteCardData,
    uniqueBooks, displayedAnnotations, groupedAnnotations, tabs,
    hasMoreAnnotations, loadMoreAnnotations,
  } = data;

  const [isSearchOpen, setIsSearchOpen] = React.useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isFiltered = searchQuery.trim() !== '' || typeFilter !== 'all' || categoryFilter !== 'all' || selectedBookId !== 'all';

  const handleResetFilters = () => {
    setSearchQuery('');
    setTypeFilter('all');
    setCategoryFilter('all');
    setSelectedBookId('all');
    setIsSearchOpen(false);
  };

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-hidden">
      {/* ── Ultra-Sleek Sticky Mobile Header ── */}
      <div 
        className="flex-none pb-1.5 px-3 border-b border-border/30 bg-background/95 backdrop-blur-xl z-20 sticky top-0 shadow-2xs space-y-1"
        style={{
          paddingTop: 'max(env(safe-area-inset-top, 0px), 6px)',
          paddingLeft: 'calc(env(safe-area-inset-left, 0px) + 12px)',
          paddingRight: 'calc(env(safe-area-inset-right, 0px) + 12px)'
        }}
      >
        {/* Row 1: Integrated Mobile Search & Quick Actions Bar */}
        <div className="flex items-center justify-between gap-2 h-9.5 pt-0.5">
          <div className="relative flex-1 group">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input 
              type="text" 
              placeholder={`Search ${displayedAnnotations.length} annotations...`} 
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)} 
              className="w-full pl-9 pr-8 h-9 text-xs font-medium bg-muted/40 border border-border/40 focus:bg-background focus:border-primary/50 rounded-2xl outline-none transition-all placeholder:text-muted-foreground/60 text-foreground" 
            />
            {searchQuery && (
              <button 
                type="button" 
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground p-1 rounded-md cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button 
              type="button"
              onClick={() => setExportDialogOpen(true)} 
              className="w-9 h-9 flex items-center justify-center rounded-2xl bg-muted/60 hover:bg-muted text-foreground border border-border/40 transition-all active:scale-95 cursor-pointer shadow-xs" 
              title="Export Annotations"
            >
              <Share2 size={14} />
            </button>
            {onClose && (
              <button 
                type="button"
                onClick={onClose} 
                className="w-9 h-9 flex items-center justify-center rounded-2xl bg-muted/60 hover:bg-muted text-foreground border border-border/40 transition-all active:scale-95 cursor-pointer shadow-xs" 
                title="Close"
              >
                <X size={15} />
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Scrollable Filter Bar with Categories & Books Dropdowns */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-3 px-3 py-1">
          {/* Type Filter Pills */}
          {tabs.map(tab => {
            const isActive = typeFilter === tab.id;
            return (
              <button 
                key={tab.id} 
                type="button"
                onClick={() => setTypeFilter(tab.id)} 
                className={`h-7.5 px-3 rounded-xl text-xs font-bold transition-all border shrink-0 cursor-pointer active:scale-95 flex items-center justify-center ${
                  isActive 
                    ? 'bg-primary text-primary-foreground border-primary shadow-xs' 
                    : 'bg-muted/30 hover:bg-muted/60 text-muted-foreground hover:text-foreground border-border/30'
                }`}
              >
                {tab.label}
              </button>
            );
          })}

          <div className="h-4 w-px bg-border/50 shrink-0 mx-0.5" />

          {/* Category Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger className={`flex items-center gap-1.5 h-7.5 px-3 rounded-xl border text-xs font-bold transition-all outline-none cursor-pointer shrink-0 active:scale-95 ${
              categoryFilter !== 'all'
                ? 'bg-primary/15 text-primary border-primary/30 shadow-xs'
                : 'bg-muted/30 hover:bg-muted/60 text-muted-foreground border-border/30'
            }`}>
              <Filter size={11} className={categoryFilter !== 'all' ? 'text-primary' : 'text-muted-foreground'} />
              <span className="whitespace-nowrap max-w-[110px] truncate">
                {categoryFilter === 'all' ? 'Category' : categories.find(c => c.id === categoryFilter)?.name || 'Category'}
              </span>
              <ChevronDown size={11} className="text-muted-foreground shrink-0" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52 bg-popover border border-border/80 shadow-2xl rounded-2xl p-1.5 z-[200]">
              <DropdownMenuItem
                onClick={() => setCategoryFilter('all')}
                className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium cursor-pointer ${
                  categoryFilter === 'all' ? 'bg-primary/15 text-primary font-bold' : 'text-popover-foreground hover:bg-accent'
                }`}
              >
                <span>All Categories</span>
                {categoryFilter === 'all' && <Check size={13} className="text-primary" />}
              </DropdownMenuItem>
              {categories.map((c) => (
                <DropdownMenuItem
                  key={c.id ?? c.name}
                  onClick={() => c.id !== undefined && setCategoryFilter(c.id)}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium cursor-pointer ${
                    categoryFilter === c.id ? 'bg-primary/15 text-primary font-bold' : 'text-popover-foreground hover:bg-accent'
                  }`}
                >
                  <span className="truncate pr-2">{c.name}</span>
                  {categoryFilter === c.id && <Check size={13} className="text-primary shrink-0" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Book Filter Dropdown */}
          {uniqueBooks.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger className={`flex items-center gap-1.5 h-7.5 px-3 rounded-xl border text-xs font-bold transition-all outline-none cursor-pointer shrink-0 active:scale-95 ${
                selectedBookId !== 'all'
                  ? 'bg-primary/15 text-primary border-primary/30 shadow-xs'
                  : 'bg-muted/30 hover:bg-muted/60 text-muted-foreground border-border/30'
              }`}>
                <BookOpen size={11} className={selectedBookId !== 'all' ? 'text-primary' : 'text-muted-foreground'} />
                <span className="whitespace-nowrap max-w-[120px] truncate">
                  {selectedBookId === 'all' ? 'All Books' : uniqueBooks.find(b => b.id === selectedBookId)?.title || 'All Books'}
                </span>
                <ChevronDown size={11} className="text-muted-foreground shrink-0" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56 max-h-64 overflow-y-auto bg-popover border border-border/80 shadow-2xl rounded-2xl p-1.5 z-[200]">
                <DropdownMenuItem
                  onClick={() => setSelectedBookId('all')}
                  className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium cursor-pointer ${
                    selectedBookId === 'all' ? 'bg-primary/15 text-primary font-bold' : 'text-popover-foreground hover:bg-accent'
                  }`}
                >
                  <span>All Books</span>
                  {selectedBookId === 'all' && <Check size={13} className="text-primary" />}
                </DropdownMenuItem>
                {uniqueBooks.map((b) => (
                  <DropdownMenuItem
                    key={b.id}
                    onClick={() => setSelectedBookId(b.id as number)}
                    className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium cursor-pointer ${
                      selectedBookId === b.id ? 'bg-primary/15 text-primary font-bold' : 'text-popover-foreground hover:bg-accent'
                    }`}
                  >
                    <span className="truncate pr-2">{b.title}</span>
                    {selectedBookId === b.id && <Check size={13} className="text-primary shrink-0" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* ── Scrollable Feed ── */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-3 sm:p-4 bg-accent/15 dark:bg-muted/15 relative w-full"
      >
        <div className="w-full max-w-full pb-28 space-y-3">
          {loading && displayedAnnotations.length === 0 ? (
            <div className="flex items-center justify-center h-48">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            </div>
          ) : displayedAnnotations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-3">
              <div className="p-3.5 bg-muted/30 rounded-full">
                <Bookmark size={24} className="opacity-30" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-xs font-extrabold text-foreground">No annotations found</p>
                <p className="text-[11px] text-muted-foreground">
                  {isFiltered ? 'Try clearing your filters or search query' : 'Annotations and highlights will appear here'}
                </p>
              </div>
              {isFiltered && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-extrabold bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 transition-all active:scale-95 cursor-pointer"
                >
                  <RotateCcw size={12} />
                  <span>Reset filters</span>
                </button>
              )}
            </div>
          ) : selectedBookId === 'all' && groupedAnnotations ? (
            <div className="space-y-4">
              {groupedAnnotations.map(([bookId, group]) => (
                <div key={bookId} className="space-y-2">
                  <div className="flex items-center justify-between pb-1 border-b border-border/30 sticky top-0 bg-background/95 backdrop-blur-md z-10 pt-1">
                    <div className="min-w-0 pr-2 flex items-center gap-1.5">
                      <BookOpen size={12} className="text-primary shrink-0" />
                      <h3 className="font-extrabold text-xs text-foreground truncate">{group.title}</h3>
                    </div>
                    <span className="text-[9px] bg-primary/10 text-primary border border-primary/20 px-2 py-0.2 rounded-full font-extrabold shrink-0">
                      {group.items.length} {group.items.length === 1 ? 'item' : 'items'}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {group.items.map(result => (
                      <AndroidAnnotationCard
                        key={result.annotation.id}
                        result={result}
                        categories={categories}
                        onOpenBook={onOpenBook}
                        setQuoteCardData={setQuoteCardData}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {displayedAnnotations.map(result => (
                <AndroidAnnotationCard
                  key={result.annotation.id}
                  result={result}
                  categories={categories}
                  onOpenBook={onOpenBook}
                  setQuoteCardData={setQuoteCardData}
                />
              ))}
            </div>
          )}
          {hasMoreAnnotations && (
            <div className="flex justify-center pt-3 pb-4">
              <button
                type="button"
                onClick={loadMoreAnnotations}
                className="px-4 py-1.5 rounded-xl text-xs font-extrabold bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 transition-all active:scale-95 cursor-pointer"
              >
                Show more
              </button>
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
