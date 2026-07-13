import React, { useRef } from 'react';
import { useAnnotationsData } from './useAnnotationsData';
import { AnnotationCard } from './AnnotationCard';
import { AnnotationExportDialog } from '../reader/AnnotationExportDialog';
import { QuoteCardDialog } from './QuoteCardDialog';
import { X, Search, Share2, Bookmark } from 'lucide-react';

interface AnnotationsViewAndroidProps {
  onClose: () => void;
  onOpenBook?: (bookId: number, location?: string) => void;
  data: ReturnType<typeof useAnnotationsData>;
}

export function AnnotationsViewAndroid({ onClose, onOpenBook, data }: AnnotationsViewAndroidProps) {
  const {
    categories, loading,
    searchQuery, setSearchQuery,
    typeFilter, setTypeFilter,
    categoryFilter, setCategoryFilter,
    selectedBookId, setSelectedBookId,
    exportDialogOpen, setExportDialogOpen,
    quoteCardData, setQuoteCardData,
    uniqueBooks, displayedAnnotations, groupedAnnotations, tabs
  } = data;

  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-hidden">
      {/* Mobile Sticky Header */}
      {/* pt-12 clears the Android status bar. env(safe-area-inset-top) acts as fallback if configured */}
      <div className="flex-none pt-[max(env(safe-area-inset-top,3rem),3rem)] pb-3 px-4 border-b border-border/40 bg-background/90 backdrop-blur-2xl z-20 sticky top-0 shadow-sm">
        
        {/* Top App Bar */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold tracking-tight">Annotations</h1>
          <div className="flex items-center gap-1">
            <button 
              onClick={() => setExportDialogOpen(true)} 
              className="p-2.5 bg-muted/50 hover:bg-muted rounded-full transition-colors active:scale-95" 
            >
              <Share2 size={20} />
            </button>
            {/* Close button usually not needed if it's a tab, but kept for overlay compatibility */}
            <button 
              onClick={onClose} 
              className="p-2.5 bg-muted/50 hover:bg-muted rounded-full transition-colors active:scale-95 ml-1 md:hidden" 
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative w-full mb-4">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input 
            type="text" 
            placeholder="Search notes & highlights..." 
            value={searchQuery} 
            onChange={(e) => setSearchQuery(e.target.value)} 
            className="w-full pl-10 pr-4 py-3 bg-muted/40 border border-border/50 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-[15px] text-foreground placeholder:text-muted-foreground" 
          />
        </div>

        {/* Scrollable Filters (Books) */}
        <div className="flex overflow-x-auto no-scrollbar gap-2 mb-3 pb-1 -mx-4 px-4">
          <button
            onClick={() => setSelectedBookId('all')}
            className={`flex-none px-4 py-2 rounded-full text-sm font-medium transition-colors border ${
              selectedBookId === 'all' 
                ? 'bg-primary text-primary-foreground border-primary' 
                : 'bg-background text-muted-foreground border-border/60'
            }`}
          >
            All Books
          </button>
          {uniqueBooks.map(book => (
            <button
              key={book.id}
              onClick={() => setSelectedBookId(book.id as number)}
              className={`flex-none px-4 py-2 rounded-full text-sm font-medium transition-colors border max-w-[200px] truncate ${
                selectedBookId === book.id 
                  ? 'bg-primary text-primary-foreground border-primary' 
                  : 'bg-background text-muted-foreground border-border/60'
              }`}
            >
              {book.title}
            </button>
          ))}
        </div>

        {/* Scrollable Filters (Types & Categories) */}
        <div className="flex items-center gap-4 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1">
          <div className="flex gap-4 shrink-0 border-r border-border/50 pr-4">
            {tabs.map(tab => (
              <button 
                key={tab.id} 
                onClick={() => setTypeFilter(tab.id)} 
                className={`pb-1 text-[15px] font-medium whitespace-nowrap border-b-2 transition-colors ${
                  typeFilter === tab.id 
                    ? 'border-primary text-foreground' 
                    : 'border-transparent text-muted-foreground'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="shrink-0">
            <select 
              value={categoryFilter} 
              onChange={(e) => setCategoryFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))} 
              className="bg-muted/40 border border-border/50 rounded-xl px-3 py-1.5 text-sm font-medium text-foreground focus:outline-none appearance-none"
            >
              <option value="all">All Categories</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 bg-background/50 relative"
      >
        {/* pb-24 ensures the last item clears the Android bottom navigation bar */}
        <div className="max-w-xl mx-auto pb-24 pt-2">
          {loading && displayedAnnotations.length === 0 ? (
            <div className="flex items-center justify-center h-48">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : displayedAnnotations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-4">
              <div className="p-5 bg-muted/40 rounded-full">
                <Bookmark size={36} className="opacity-30" />
              </div>
              <p className="text-lg font-medium">No annotations found</p>
            </div>
          ) : selectedBookId === 'all' && groupedAnnotations ? (
            <div className="space-y-10">
              {groupedAnnotations.map(([bookId, group]) => (
                <div key={bookId} className="space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-border/40">
                    <div className="min-w-0 pr-4">
                      <h3 className="font-bold text-[17px] truncate">{group.title}</h3>
                      <p className="text-sm text-muted-foreground truncate">{group.author}</p>
                    </div>
                    <span className="text-[11px] bg-muted/60 px-2.5 py-1 rounded-full font-bold uppercase tracking-wider shrink-0">
                      {group.items.length} notes
                    </span>
                  </div>
                  <div className="flex flex-col gap-4">
                    {group.items.map(result => (
                      <AnnotationCard key={result.annotation.id} result={result} categories={categories} onOpenBook={onOpenBook} setQuoteCardData={setQuoteCardData} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
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
