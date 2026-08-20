import React, { useState, useMemo } from 'react';
import { useAnnotationsData, type AnnotationSortOrder } from './useAnnotationsData';
import { AnnotationCard } from './AnnotationCard';
import { AnnotationExportDialog } from '../reader/AnnotationExportDialog';
import { QuoteCardDialog } from './QuoteCardDialog';
import { 
  X, LayoutGrid, List, Library, Share2, BookOpen, Bookmark, 
  ChevronDown, Check, Search, ArrowUpDown, Copy, Highlighter, StickyNote, RotateCcw,
  Clock, History, ListOrdered
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToastStore } from '@/store/toastStore';
import { cn } from '@/lib/utils';

interface AnnotationsViewDesktopProps {
  onClose: () => void;
  onOpenBook?: (bookId: number, location?: string, annotationId?: number) => void;
  data: ReturnType<typeof useAnnotationsData>;
}

export function AnnotationsViewDesktop({ onClose, onOpenBook, data }: AnnotationsViewDesktopProps) {
  const {
    annotations, categories, loading,
    searchQuery, setSearchQuery,
    typeFilter, setTypeFilter,
    categoryFilter, setCategoryFilter,
    viewMode, setViewMode,
    sortOrder, setSortOrder,
    selectedBookId, setSelectedBookId,
    exportDialogOpen, setExportDialogOpen,
    quoteCardData, setQuoteCardData,
    uniqueBooks, stats, displayedAnnotations, groupedAnnotations, tabs,
    hasMoreAnnotations, loadMoreAnnotations,
  } = data;

  const [sidebarSearch, setSidebarSearch] = useState('');

  // Filter books in sidebar
  const filteredBooks = useMemo(() => {
    if (!sidebarSearch.trim()) return uniqueBooks;
    const q = sidebarSearch.toLowerCase().trim();
    return uniqueBooks.filter(
      (b) => b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q)
    );
  }, [uniqueBooks, sidebarSearch]);

  const selectedBook = useMemo(() => {
    if (selectedBookId === 'all') return null;
    return uniqueBooks.find((b) => b.id === selectedBookId);
  }, [uniqueBooks, selectedBookId]);

  // Copy all visible annotations as Markdown
  const handleCopyAll = async () => {
    if (displayedAnnotations.length === 0) return;
    try {
      const text = displayedAnnotations.map((item) => {
        const type = item.annotation.annotationType.toUpperCase();
        const textContent = item.annotation.selectedText ? `> "${item.annotation.selectedText}"\n` : '';
        const note = item.annotation.noteContent ? `**Note:** ${item.annotation.noteContent}\n` : '';
        const chapter = item.annotation.chapterTitle ? `_${item.annotation.chapterTitle}_\n` : '';
        return `### [${type}] ${item.book_title}\n${chapter}${textContent}${note}`;
      }).join('\n---\n\n');

      await navigator.clipboard.writeText(text);
      useToastStore.getState().addToast({
        title: 'Copied to Clipboard',
        description: `Copied ${displayedAnnotations.length} annotations in Markdown format.`,
        variant: 'success',
        duration: 2500,
      });
    } catch {
      useToastStore.getState().addToast({
        title: 'Failed to copy',
        variant: 'error',
      });
    }
  };

  const hasActiveFilters = searchQuery.trim() !== '' || typeFilter !== 'all' || categoryFilter !== 'all';

  const handleResetFilters = () => {
    setSearchQuery('');
    setTypeFilter('all');
    setCategoryFilter('all');
  };

  return (
    <div className="flex h-full bg-background text-foreground overflow-hidden">
      
      {/* ── Left Sidebar - Books Navigation ── */}
      <div className="w-72 md:w-80 flex-none border-r border-border/50 bg-card/30 flex flex-col overflow-hidden hidden md:flex">
        {/* Aligned Sidebar Header */}
        <div className="h-14 px-4 border-b border-border/50 flex items-center justify-between bg-card/50 backdrop-blur-xl">
          <div className="flex items-center gap-2">
            <Library size={16} className="text-primary" />
            <h2 className="font-bold text-sm text-foreground">Library Books</h2>
          </div>
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border/40">
            {uniqueBooks.length}
          </span>
        </div>

        {/* Sidebar Search */}
        {uniqueBooks.length > 5 && (
          <div className="px-3 pt-3 pb-1">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Filter books..."
                value={sidebarSearch}
                onChange={(e) => setSidebarSearch(e.target.value)}
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-muted/40 hover:bg-muted/60 border border-border/40 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground transition-all"
              />
              {sidebarSearch && (
                <button
                  type="button"
                  onClick={() => setSidebarSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        )}
        
        {/* Book List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1 no-scrollbar">
          <button
            type="button"
            onClick={() => setSelectedBookId('all')}
            className={cn(
              "w-full text-left px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center justify-between cursor-pointer select-none",
              selectedBookId === 'all' 
                ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20" 
                : "hover:bg-accent/60 text-muted-foreground hover:text-foreground"
            )}
          >
            <div className="flex items-center gap-2.5">
              <BookOpen size={16} className={selectedBookId === 'all' ? 'text-primary-foreground' : 'text-primary'} />
              <span>All Books</span>
            </div>
            <span className={cn(
              "text-xs px-2 py-0.5 rounded-full font-bold",
              selectedBookId === 'all' ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
            )}>
              {annotations.length}
            </span>
          </button>
          
          <div className="pt-3 pb-1 px-3">
            <span className="text-[11px] font-bold text-muted-foreground/70 uppercase tracking-wider">Annotated Titles</span>
          </div>
          
          {filteredBooks.map((book) => {
            const isSelected = selectedBookId === book.id;
            return (
              <button
                type="button"
                key={book.id}
                onClick={() => setSelectedBookId(book.id as number)}
                className={cn(
                  "w-full text-left px-3 py-2.5 rounded-xl text-xs sm:text-sm transition-all flex items-start gap-2.5 cursor-pointer select-none",
                  isSelected 
                    ? "bg-card border border-border shadow-xs text-foreground font-semibold" 
                    : "hover:bg-accent/50 text-muted-foreground hover:text-foreground"
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">{book.title}</div>
                  <div className="text-[11px] text-muted-foreground/75 truncate mt-0.5">{book.author}</div>
                </div>
                <span className={cn(
                  "text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 border",
                  isSelected ? "bg-primary/10 text-primary border-primary/20" : "bg-muted/60 border-border/40 text-muted-foreground"
                )}>
                  {book.count}
                </span>
              </button>
            );
          })}

          {filteredBooks.length === 0 && (
            <div className="text-center py-6 text-xs text-muted-foreground">
              No matching books
            </div>
          )}
        </div>
      </div>

      {/* ── Main Content Area ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        
        {/* Top Header Bar */}
        <div className="h-14 px-4 md:px-6 border-b border-border/50 bg-background/85 backdrop-blur-2xl flex items-center justify-between shrink-0 z-20">
          {/* Left: Title and Summary Badges */}
          <div className="flex items-center gap-3 md:gap-4 min-w-0">
            {/* Mobile book selector dropdown */}
            <div className="md:hidden flex-1 min-w-0">
              <Select
                value={String(selectedBookId)}
                onValueChange={(val) => setSelectedBookId(val === 'all' ? 'all' : Number(val))}
              >
                <SelectTrigger className="w-full text-base font-bold border-none shadow-none focus:ring-0 p-0 h-auto">
                  <SelectValue placeholder="All Annotations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Annotations</SelectItem>
                  {uniqueBooks.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>{b.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Desktop Title & Live Stats */}
            <div className="hidden md:flex items-center gap-3">
              <h1 className="text-lg md:text-xl font-extrabold tracking-tight text-foreground truncate max-w-md">
                {selectedBookId === 'all' ? 'All Annotations' : selectedBook?.title}
              </h1>

              {/* Summary Stats Badges */}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-bold">
                  {stats.total} total
                </span>
                <span className="hidden lg:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border/40">
                  <Highlighter size={11} className="text-primary" />
                  {stats.highlights}
                </span>
                <span className="hidden lg:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border/40">
                  <StickyNote size={11} className="text-primary" />
                  {stats.notes}
                </span>
                <span className="hidden xl:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border/40">
                  <Bookmark size={11} className="text-primary" />
                  {stats.bookmarks}
                </span>
              </div>
            </div>
          </div>

          {/* Right: Close button */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="p-2 hover:bg-muted rounded-full transition-colors text-muted-foreground hover:text-foreground cursor-pointer"
              title="Close Annotations"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Action Controls & Filter Toolbar */}
        <div className="px-4 md:px-6 py-3 border-b border-border/40 bg-card/30 backdrop-blur-xl shrink-0 z-10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            
            {/* Left: Search & Type Tabs */}
            <div className="flex flex-wrap items-center gap-3 flex-1 min-w-0">
              {/* Live Search Input */}
              <div className="relative w-full sm:w-60 md:w-72">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search highlights & notes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-7 h-9 text-xs sm:text-sm bg-card/75 hover:bg-card border-border/50 rounded-xl focus-visible:ring-1 focus-visible:ring-primary shadow-xs"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Type Filter Pills */}
              <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-xl border border-border/40 shrink-0">
                {tabs.map((tab) => {
                  const isActive = typeFilter === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setTypeFilter(tab.id)}
                      className={cn(
                        "px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer select-none",
                        isActive 
                          ? "bg-card text-foreground shadow-xs font-bold border border-border/50" 
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right: Actions (Categories, Sort, Export, Copy, View Mode) */}
            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
              
              {/* Category Filter Dropdown with color indicators */}
              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-2 px-3 py-1.5 h-9 rounded-xl bg-card/80 hover:bg-card border border-border/60 hover:border-primary/40 text-xs font-bold text-foreground transition-all shadow-xs outline-none cursor-pointer">
                  <span>
                    {categoryFilter === 'all' 
                      ? 'All Categories' 
                      : categories.find((c) => c.id === categoryFilter)?.name || 'Category'}
                  </span>
                  <ChevronDown size={13} className="text-muted-foreground" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52 bg-popover !bg-popover !opacity-100 border border-border/80 shadow-2xl rounded-2xl p-1.5 z-[200]">
                  <DropdownMenuItem
                    onClick={() => setCategoryFilter('all')}
                    className={cn(
                      "flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium cursor-pointer transition-colors",
                      categoryFilter === 'all' ? "bg-primary/15 text-primary font-bold" : "text-popover-foreground hover:bg-accent"
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-primary/40" />
                      All Categories
                    </span>
                    {categoryFilter === 'all' && <Check size={14} className="text-primary" />}
                  </DropdownMenuItem>
                  {categories.map((c) => (
                    <DropdownMenuItem
                      key={c.id ?? c.name}
                      onClick={() => c.id !== undefined && setCategoryFilter(c.id)}
                      className={cn(
                        "flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium cursor-pointer transition-colors",
                        categoryFilter === c.id ? "bg-primary/15 text-primary font-bold" : "text-popover-foreground hover:bg-accent"
                      )}
                    >
                      <span className="flex items-center gap-2 truncate pr-2">
                        <span 
                          className="w-2 h-2 rounded-full shrink-0" 
                          style={{ backgroundColor: c.color || '#3b82f6' }}
                        />
                        <span className="truncate">{c.name}</span>
                      </span>
                      {categoryFilter === c.id && <Check size={14} className="text-primary shrink-0" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Sort Order Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger className="flex items-center gap-1.5 px-3 py-1.5 h-9 rounded-xl bg-card/80 hover:bg-card border border-border/60 hover:border-primary/40 text-xs font-bold text-foreground transition-all shadow-xs outline-none cursor-pointer">
                  <ArrowUpDown size={13} className="text-muted-foreground" />
                  <span>
                    {sortOrder === 'newest' ? 'Newest' : sortOrder === 'oldest' ? 'Oldest' : 'Book Order'}
                  </span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 bg-popover !bg-popover !opacity-100 border border-border/80 shadow-2xl rounded-2xl p-1.5 z-[200]">
                  <DropdownMenuItem
                    onClick={() => setSortOrder('newest')}
                    className={cn(
                      "flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium cursor-pointer transition-colors",
                      sortOrder === 'newest' ? "bg-primary/15 text-primary font-bold" : "text-popover-foreground hover:bg-accent"
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <Clock size={14} className={sortOrder === 'newest' ? 'text-primary' : 'text-muted-foreground'} />
                      <span>Newest First</span>
                    </span>
                    {sortOrder === 'newest' && <Check size={14} className="text-primary" />}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setSortOrder('oldest')}
                    className={cn(
                      "flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium cursor-pointer transition-colors",
                      sortOrder === 'oldest' ? "bg-primary/15 text-primary font-bold" : "text-popover-foreground hover:bg-accent"
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <History size={14} className={sortOrder === 'oldest' ? 'text-primary' : 'text-muted-foreground'} />
                      <span>Oldest First</span>
                    </span>
                    {sortOrder === 'oldest' && <Check size={14} className="text-primary" />}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setSortOrder('book_order')}
                    className={cn(
                      "flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium cursor-pointer transition-colors",
                      sortOrder === 'book_order' ? "bg-primary/15 text-primary font-bold" : "text-popover-foreground hover:bg-accent"
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <ListOrdered size={14} className={sortOrder === 'book_order' ? 'text-primary' : 'text-muted-foreground'} />
                      <span>Book Order</span>
                    </span>
                    {sortOrder === 'book_order' && <Check size={14} className="text-primary" />}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Quick Copy Action */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyAll}
                title="Copy all visible annotations to clipboard"
                className="h-9 px-2.5 rounded-xl border-border/60 bg-card/80 hover:bg-card text-xs font-bold text-foreground cursor-pointer shadow-xs gap-1.5"
              >
                <Copy size={13} />
                <span className="hidden xl:inline">Copy All</span>
              </Button>

              {/* Repositioned Dedicated Export Button */}
              <Button
                size="sm"
                onClick={() => setExportDialogOpen(true)}
                className="h-9 px-3.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs shadow-sm shadow-primary/20 hover:bg-primary/90 transition-all cursor-pointer gap-1.5 active:scale-95"
              >
                <Share2 size={13} />
                <span>Export</span>
              </Button>

              {/* View Mode Toggle */}
              <div className="hidden sm:flex items-center bg-muted/60 rounded-xl p-0.5 border border-border/50">
                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  title="Grid View"
                  className={cn(
                    "p-1.5 rounded-lg transition-all cursor-pointer",
                    viewMode === 'grid' ? "bg-card text-foreground shadow-xs font-bold" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <LayoutGrid size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  title="List View"
                  className={cn(
                    "p-1.5 rounded-lg transition-all cursor-pointer",
                    viewMode === 'list' ? "bg-card text-foreground shadow-xs font-bold" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <List size={14} />
                </button>
              </div>

            </div>
          </div>
        </div>

        {/* ── Scrollable Annotations Feed ── */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 bg-background relative">
          <div className="max-w-7xl mx-auto pb-24">
            {loading && displayedAnnotations.length === 0 ? (
              <div className="flex items-center justify-center h-48">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : displayedAnnotations.length === 0 ? (
              /* Empty State */
              <div className="flex flex-col items-center justify-center h-72 text-muted-foreground gap-4">
                <div className="p-4 bg-muted/30 rounded-2xl border border-border/40">
                  <Bookmark size={32} className="opacity-25" />
                </div>
                <div className="text-center space-y-1">
                  <p className="text-base font-semibold text-foreground">No annotations found</p>
                  <p className="text-xs text-muted-foreground">
                    {hasActiveFilters 
                      ? "Try adjusting your search query, type filter, or category selection."
                      : "Highlight text while reading books to save notes and quotes here."}
                  </p>
                </div>
                {hasActiveFilters && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResetFilters}
                    className="mt-2 rounded-xl text-xs font-bold gap-1.5 cursor-pointer"
                  >
                    <RotateCcw size={13} />
                    <span>Reset all filters</span>
                  </Button>
                )}
              </div>
            ) : selectedBookId === 'all' && groupedAnnotations ? (
              /* Grouped by Book View */
              <div className="space-y-12">
                {groupedAnnotations.map(([bookId, group]) => (
                  <div key={bookId} className="space-y-4">
                    <div className="flex items-center justify-between border-b border-border/50 pb-2">
                      <div className="flex items-center gap-2">
                        <BookOpen size={16} className="text-primary" />
                        <h2 className="font-extrabold text-base text-foreground">{group.title}</h2>
                        <span className="text-xs text-muted-foreground">by {group.author}</span>
                      </div>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-muted border border-border/40 text-muted-foreground">
                        {group.items.length}
                      </span>
                    </div>
                    
                    {viewMode === 'grid' ? (
                      <div className="columns-1 md:columns-2 xl:columns-3 gap-4 md:gap-6 space-y-4 md:space-y-6">
                        {group.items.map((result) => (
                          <AnnotationCard
                            key={result.annotation.id}
                            result={result}
                            categories={categories}
                            onOpenBook={onOpenBook}
                            setQuoteCardData={setQuoteCardData}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {group.items.map((result) => (
                          <AnnotationCard
                            key={result.annotation.id}
                            result={result}
                            categories={categories}
                            onOpenBook={onOpenBook}
                            setQuoteCardData={setQuoteCardData}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              /* Single Book / Flat List View */
              viewMode === 'grid' ? (
                <div className="columns-1 md:columns-2 xl:columns-3 gap-4 md:gap-6 space-y-4 md:space-y-6">
                  {displayedAnnotations.map((result) => (
                    <AnnotationCard
                      key={result.annotation.id}
                      result={result}
                      categories={categories}
                      onOpenBook={onOpenBook}
                      setQuoteCardData={setQuoteCardData}
                    />
                  ))}
                </div>
              ) : (
                <div className="space-y-3 max-w-4xl mx-auto">
                  {displayedAnnotations.map((result) => (
                    <AnnotationCard
                      key={result.annotation.id}
                      result={result}
                      categories={categories}
                      onOpenBook={onOpenBook}
                      setQuoteCardData={setQuoteCardData}
                    />
                  ))}
                </div>
              )
            )}
            {hasMoreAnnotations && (
              <div className="flex justify-center pt-2 pb-6">
                <Button variant="outline" size="sm" onClick={loadMoreAnnotations}>
                  Show more annotations
                </Button>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Export Dialog */}
      <AnnotationExportDialog 
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        bookId={selectedBookId === 'all' ? undefined : selectedBookId}
      />

      {/* Quote Card Dialog */}
      {quoteCardData && (
        <QuoteCardDialog
          open={!!quoteCardData}
          onOpenChange={(open) => { if (!open) setQuoteCardData(null); }}
          annotationData={quoteCardData}
        />
      )}
    </div>
  );
}
