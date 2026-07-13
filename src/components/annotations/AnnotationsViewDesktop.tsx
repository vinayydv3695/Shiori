import React from 'react';
import { useAnnotationsData } from './useAnnotationsData';
import { AnnotationCard } from './AnnotationCard';
import { AnnotationExportDialog } from '../reader/AnnotationExportDialog';
import { QuoteCardDialog } from './QuoteCardDialog';
import { X, LayoutGrid, List, Library, Share2, BookOpen, Bookmark } from 'lucide-react';

interface AnnotationsViewDesktopProps {
  onClose: () => void;
  onOpenBook?: (bookId: number, location?: string) => void;
  data: ReturnType<typeof useAnnotationsData>;
}

export function AnnotationsViewDesktop({ onClose, onOpenBook, data }: AnnotationsViewDesktopProps) {
  const {
    annotations, categories, loading,
    searchQuery, setSearchQuery,
    typeFilter, setTypeFilter,
    categoryFilter, setCategoryFilter,
    viewMode, setViewMode,
    selectedBookId, setSelectedBookId,
    exportDialogOpen, setExportDialogOpen,
    quoteCardData, setQuoteCardData,
    uniqueBooks, displayedAnnotations, groupedAnnotations, tabs
  } = data;

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
        
        <div className="flex-1 overflow-y-auto p-2 space-y-1 no-scrollbar">
          <button
            onClick={() => setSelectedBookId('all')}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-between ${
              selectedBookId === 'all' 
                ? 'bg-primary text-primary-foreground shadow-sm' 
                : 'hover:bg-muted/50 text-muted-foreground hover:text-foreground'
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
              onClick={() => setSelectedBookId(book.id as number)}
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
        <div className="flex-none pt-[max(env(safe-area-inset-top,1rem),1rem)] md:pt-6 px-4 md:px-6 border-b border-border/40 bg-background/80 backdrop-blur-xl z-20 sticky top-0">
          <div className="flex flex-col gap-3 mb-3">
            {/* Top Row: Dropdown, Actions, Close */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0 md:hidden">
                <select
                  value={selectedBookId}
                  onChange={(e) => setSelectedBookId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                  className="w-full bg-transparent text-xl font-bold truncate focus:outline-none appearance-none"
                >
                  <option value="all">All Annotations</option>
                  {uniqueBooks.map(b => (
                    <option key={b.id} value={b.id}>{b.title}</option>
                  ))}
                </select>
              </div>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight hidden md:block">
                {selectedBookId === 'all' ? 'All Annotations' : uniqueBooks.find(b => b.id === selectedBookId)?.title}
              </h1>
              
              <div className="flex items-center gap-1 shrink-0 text-muted-foreground">
                <button onClick={() => setExportDialogOpen(true)} className="p-2 hover:bg-muted rounded-full transition-colors" title="Export"><Share2 size={18} /></button>
                <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors md:hidden" title="Close"><X size={20} /></button>
              </div>
            </div>

            {/* Search Bar */}
            <div className="relative w-full">
              <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input type="text" placeholder="Search annotations..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-9 pr-4 py-2 bg-muted/30 hover:bg-muted/50 border border-border/50 rounded-xl focus:outline-none focus:ring-1 focus:ring-primary transition-all text-sm text-foreground placeholder:text-muted-foreground" />
            </div>

            {/* Tabs & Categories Row */}
            <div className="flex items-center justify-between gap-4 overflow-x-auto no-scrollbar">
              <div className="flex gap-4 shrink-0">
                {tabs.map(tab => (
                  <button key={tab.id} onClick={() => setTypeFilter(tab.id)} className={`pb-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${typeFilter === tab.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{tab.label}</button>
                ))}
              </div>
              <div className="flex items-center gap-2 shrink-0 pb-2">
                <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))} className="bg-muted/30 border border-border/50 rounded-lg px-2.5 py-1 text-xs font-medium text-foreground focus:outline-none dark:[color-scheme:dark]">
                  <option value="all">All Categories</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <div className="hidden md:flex items-center bg-muted/50 rounded-lg p-0.5 border border-border/50">
                   <button onClick={() => setViewMode('grid')} className={`p-1 rounded-md transition-all ${viewMode==='grid'?'bg-background text-foreground shadow-sm':'text-muted-foreground hover:text-foreground'}`}><LayoutGrid size={14}/></button>
                   <button onClick={() => setViewMode('list')} className={`p-1 rounded-md transition-all ${viewMode==='list'?'bg-background text-foreground shadow-sm':'text-muted-foreground hover:text-foreground'}`}><List size={14}/></button>
                </div>
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
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-4">
                <div className="p-4 bg-muted/30 rounded-full">
                  <Bookmark size={32} className="opacity-20" />
                </div>
                <p>No annotations found</p>
              </div>
            ) : selectedBookId === 'all' && groupedAnnotations ? (
              <div className="space-y-12">
                {groupedAnnotations.map(([bookId, group]) => (
                  <div key={bookId} className="space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-border/50">
                      <div>
                        <h3 className="font-semibold text-lg">{group.title}</h3>
                        <p className="text-sm text-muted-foreground">{group.author}</p>
                      </div>
                      <span className="text-xs bg-muted px-2 py-1 rounded-full font-medium">{group.items.length} notes</span>
                    </div>
                    <div className={`grid gap-4 ${viewMode === 'grid' ? 'grid-cols-1 lg:grid-cols-2 xl:grid-cols-3' : 'grid-cols-1 md:grid-cols-2 max-w-4xl'}`}>
                      {group.items.map(result => (
                        <AnnotationCard key={result.annotation.id} result={result} categories={categories} onOpenBook={onOpenBook} setQuoteCardData={setQuoteCardData} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={`grid gap-4 ${viewMode === 'grid' ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'grid-cols-1 md:grid-cols-2 max-w-4xl'}`}>
                {displayedAnnotations.map(result => (
                  <AnnotationCard key={result.annotation.id} result={result} categories={categories} onOpenBook={onOpenBook} setQuoteCardData={setQuoteCardData} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <AnnotationExportDialog 
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        bookId={selectedBookId === 'all' ? undefined : selectedBookId}
        typeFilter={typeFilter === 'all' ? undefined : typeFilter}
        categoryFilter={categoryFilter === 'all' ? undefined : categoryFilter}
        searchQuery={searchQuery.trim()}
      />

      <QuoteCardDialog 
        data={quoteCardData}
        onClose={() => setQuoteCardData(null)}
      />
    </div>
  );
}
