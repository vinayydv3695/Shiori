import React, { useState } from 'react';
import { 
  History, Loader2, X, Search, Clock, TrendingUp, ArrowDownAZ, 
  BookOpen, Trash2, Calendar, LayoutGrid, List, MoreVertical, 
  RotateCcw, CheckCircle2, Info, Edit2, FolderPlus,
  BarChart3, ArrowRight
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useCoverImage } from '@/components/common/hooks/useCoverImage';
import { formatRelativeTime, isMangaDomain, cn } from '@/lib/utils';
import { useUIStore } from '@/store/uiStore';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import * as Dialog from '@radix-ui/react-dialog';
import { 
  useHistoryData, 
  formatDuration, 
  formatMinutes, 
  type FilterTab, 
  type SortOption, 
  type ViewMode 
} from './useHistoryData';
import type { Book } from '@/lib/tauri';

interface HistoryViewDesktopProps {
  data: ReturnType<typeof useHistoryData>;
  onClose: () => void;
  onOpenBook: (bookId: number, location?: string) => void;
  onViewDetails: (bookId: number) => void;
  onEditBook: (bookId: number) => void;
  onDeleteBook: (bookId: number) => void;
  onOpenStatistics?: () => void;
  dialogs: any;
}

function HistoryCoverImage({ 
  book, 
  className,
  imageClassName 
}: { 
  book: Book; 
  className?: string;
  imageClassName?: string;
}) {
  const { coverUrl, error } = useCoverImage(book.id, book.cover_path);
  const [imgError, setImgError] = useState(false);

  if (coverUrl && !imgError && !error) {
    return (
      <img
        src={coverUrl}
        alt={book.title}
        onError={() => setImgError(true)}
        className={cn("w-full h-full object-cover", imageClassName)}
        loading="lazy"
      />
    );
  }

  return (
    <div className={cn("w-full h-full flex flex-col items-center justify-center p-2.5 text-center bg-gradient-to-br from-primary/20 via-primary/5 to-muted/40 text-primary", className)}>
      <BookOpen size={26} className="mb-1.5 opacity-80" />
      <span className="text-[10px] sm:text-xs font-bold line-clamp-3 text-foreground/90 leading-tight px-1">
        {book.title}
      </span>
    </div>
  );
}

export function HistoryViewDesktop({
  data,
  onClose,
  onOpenBook,
  onViewDetails,
  onEditBook,
  dialogs,
  onOpenStatistics
}: HistoryViewDesktopProps) {
  const {
    books,
    progressMap,
    bookStatsMap,
    streak,
    todaySeconds,
    searchQuery, setSearchQuery,
    activeTab, setActiveTab,
    sortOption, setSortOption,
    viewMode, setViewMode,
    loading,
    error,
    clearDialogOpen, setClearDialogOpen,
    loadHistory,
    handleRemoveFromHistory,
    handleClearAllHistory,
    stats,
    miniHeatmapDays,
    filteredAndSortedBooks,
    timelineGroups
  } = data;

  const handleGoToStatistics = () => {
    if (onOpenStatistics) {
      onOpenStatistics();
    } else {
      useUIStore.getState().setCurrentView('statistics');
    }
  };

  const hasActiveFilters = searchQuery.trim() !== '' || activeTab !== 'all';

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-hidden">
      
      {/* ── Top Header Bar ── */}
      <div className="h-16 px-4 md:px-8 border-b border-border/50 bg-background/85 backdrop-blur-2xl flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-xs">
            <History size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg md:text-xl font-extrabold tracking-tight text-foreground">Reading History</h1>
              <span className="hidden sm:inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-primary/10 text-primary border border-primary/20">
                {stats.total} {stats.total === 1 ? 'Title' : 'Titles'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground hidden md:block">
              {stats.inProgress} currently in progress • {stats.completed} completed
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {books.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setClearDialogOpen(true)}
              className="text-xs font-semibold text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl gap-1.5 transition-colors cursor-pointer"
            >
              <Trash2 size={13} />
              <span className="hidden sm:inline">Clear History</span>
            </Button>
          )}

          <div className="h-4 w-px bg-border/60 mx-1 hidden sm:block" />

          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            title="Close history"
            className="text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded-full cursor-pointer h-9 w-9"
          >
            <X size={18} />
          </Button>
        </div>
      </div>

      {/* ── Action Toolbar: Search, Filter Tabs, Sort, View Modes ── */}
      <div className="px-4 md:px-8 py-3 border-b border-border/40 bg-card/30 backdrop-blur-xl shrink-0 z-10">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          
          {/* Left: Search & Filter Tabs */}
          <div className="flex flex-wrap items-center gap-3 flex-1 min-w-0">
            <div className="relative w-full sm:w-64 md:w-72">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search history by title or author..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-7 h-9 text-xs sm:text-sm bg-card/80 hover:bg-card border-border/50 rounded-xl focus-visible:ring-1 focus-visible:ring-primary shadow-xs"
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

            {/* Filter Tabs */}
            <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-xl border border-border/40 overflow-x-auto no-scrollbar shrink-0">
              {[
                { id: 'all', label: 'All' },
                { id: 'books', label: 'Books' },
                { id: 'manga', label: 'Manga & Comics' },
                { id: 'in_progress', label: 'In Progress' },
                { id: 'completed', label: 'Completed' },
              ].map(tab => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id as FilterTab)}
                    className={cn(
                      "px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap select-none",
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

          {/* Right: Sort & View Mode Toggle */}
          <div className="flex items-center gap-2 shrink-0 justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-1.5 px-3 py-1.5 h-9 rounded-xl bg-card/80 hover:bg-card border border-border/60 hover:border-primary/40 text-xs font-bold text-foreground transition-all shadow-xs outline-none cursor-pointer">
                <Clock size={13} className="text-muted-foreground" />
                <span>
                  {sortOption === 'recent' ? 'Most Recent' : sortOption === 'oldest' ? 'Oldest Activity' : sortOption === 'progress' ? 'Highest Progress' : 'Title (A-Z)'}
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 bg-popover !bg-popover !opacity-100 border border-border/80 shadow-2xl rounded-2xl p-1.5 z-[200]">
                <DropdownMenuItem
                  onClick={() => setSortOption('recent')}
                  className={cn(
                    "flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium cursor-pointer transition-colors",
                    sortOption === 'recent' ? "bg-primary/15 text-primary font-bold" : "text-popover-foreground hover:bg-accent"
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Clock size={14} className={sortOption === 'recent' ? 'text-primary' : 'text-muted-foreground'} />
                    <span>Most Recent</span>
                  </span>
                  {sortOption === 'recent' && <CheckCircle2 size={14} className="text-primary" />}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setSortOption('oldest')}
                  className={cn(
                    "flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium cursor-pointer transition-colors",
                    sortOption === 'oldest' ? "bg-primary/15 text-primary font-bold" : "text-popover-foreground hover:bg-accent"
                  )}
                >
                  <span className="flex items-center gap-2">
                    <History size={14} className={sortOption === 'oldest' ? 'text-primary' : 'text-muted-foreground'} />
                    <span>Oldest Activity</span>
                  </span>
                  {sortOption === 'oldest' && <CheckCircle2 size={14} className="text-primary" />}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setSortOption('progress')}
                  className={cn(
                    "flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium cursor-pointer transition-colors",
                    sortOption === 'progress' ? "bg-primary/15 text-primary font-bold" : "text-popover-foreground hover:bg-accent"
                  )}
                >
                  <span className="flex items-center gap-2">
                    <TrendingUp size={14} className={sortOption === 'progress' ? 'text-primary' : 'text-muted-foreground'} />
                    <span>Highest Progress</span>
                  </span>
                  {sortOption === 'progress' && <CheckCircle2 size={14} className="text-primary" />}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setSortOption('title')}
                  className={cn(
                    "flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium cursor-pointer transition-colors",
                    sortOption === 'title' ? "bg-primary/15 text-primary font-bold" : "text-popover-foreground hover:bg-accent"
                  )}
                >
                  <span className="flex items-center gap-2">
                    <ArrowDownAZ size={14} className={sortOption === 'title' ? 'text-primary' : 'text-muted-foreground'} />
                    <span>Title (A–Z)</span>
                  </span>
                  {sortOption === 'title' && <CheckCircle2 size={14} className="text-primary" />}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* View Mode Toggle */}
            <div className="flex items-center bg-muted/60 rounded-xl p-0.5 border border-border/50">
              <button
                type="button"
                onClick={() => setViewMode('timeline')}
                title="Detailed Timeline List"
                className={cn(
                  "p-1.5 rounded-lg transition-all cursor-pointer",
                  viewMode === 'timeline' ? "bg-card text-foreground shadow-xs font-bold" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <List size={14} />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                title="Visual Grid Cards"
                className={cn(
                  "p-1.5 rounded-lg transition-all cursor-pointer",
                  viewMode === 'grid' ? "bg-card text-foreground shadow-xs font-bold" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <LayoutGrid size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Scrollable Content Area ── */}
      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 bg-background relative scroll-smooth">
        <div className="max-w-7xl mx-auto space-y-6 pb-24">
          
          {/* ── Top Live Reading Insights & 30-Day Activity Heatmap ── */}
          <div className="rounded-3xl border border-border/60 bg-card/60 backdrop-blur-xl p-4 sm:p-5 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
            {/* Left: Summary Metrics */}
            <div className="flex flex-wrap items-center gap-4 sm:gap-6 min-w-0">
              {/* Reading Streak */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500 shadow-xs border border-amber-500/20">
                  <TrendingUp size={18} />
                </div>
                <div>
                  <div className="text-sm font-extrabold text-foreground flex items-center gap-1.5">
                    <span>{streak?.current_streak || 0}-Day Streak</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {Math.round(todaySeconds / 60)}m read today
                  </p>
                </div>
              </div>

              {/* Total Logged Reading Time */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-secondary/80 flex items-center justify-center text-foreground shadow-xs border border-border/40">
                  <Clock size={18} />
                </div>
                <div>
                  <div className="text-sm font-extrabold text-foreground">
                    {formatDuration(stats.totalSecondsLogged)}
                  </div>
                  <p className="text-[11px] text-muted-foreground">Logged read time</p>
                </div>
              </div>

              {/* Pages Completed (Last 30 Days) */}
              <div className="hidden sm:flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-secondary/80 flex items-center justify-center text-foreground shadow-xs border border-border/40">
                  <BookOpen size={18} />
                </div>
                <div>
                  <div className="text-sm font-extrabold text-foreground">
                    {stats.totalPagesLogged.toLocaleString()}
                  </div>
                  <p className="text-[11px] text-muted-foreground">Pages read recently</p>
                </div>
              </div>
            </div>

            {/* Right: 30-Day Mini Activity Heatmap & Quick Action */}
            <div className="flex items-center gap-4 self-stretch md:self-auto justify-between md:justify-end border-t md:border-t-0 border-border/40 pt-3 md:pt-0">
              {/* 30-Day Mini Heatmap Bar */}
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1" title="Last 30 days activity">
                  {miniHeatmapDays.map(day => (
                    <div
                      key={day.date}
                      className={cn(
                        "w-1.5 sm:w-2 h-6 rounded-full transition-all duration-200 group relative cursor-pointer",
                        day.hasActivity 
                          ? "bg-primary hover:opacity-80 scale-y-100" 
                          : "bg-muted/70 scale-y-60 opacity-40 hover:opacity-75"
                      )}
                    >
                      {/* Tooltip */}
                      <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-popover text-popover-foreground text-[10px] font-bold py-1 px-2 rounded-lg border border-border shadow-lg pointer-events-none z-30 whitespace-nowrap">
                        <div>{day.label}</div>
                        <div className="text-primary">{day.pages} pages • {formatMinutes(day.seconds)}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between text-[9px] font-bold text-muted-foreground/80 uppercase tracking-wider">
                  <span>30d ago</span>
                  <span>Today</span>
                </div>
              </div>

              {/* View Full Analytics CTA */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleGoToStatistics}
                className="h-9 px-3 rounded-xl border-border/60 bg-card/80 hover:bg-card text-xs font-bold text-foreground gap-1.5 shadow-xs cursor-pointer active:scale-95 shrink-0"
              >
                <BarChart3 size={13} className="text-primary" />
                <span className="hidden sm:inline">Full Analytics</span>
                <ArrowRight size={12} className="text-muted-foreground" />
              </Button>
            </div>
          </div>

          {loading && books.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-xs text-muted-foreground">Loading reading history...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
              <p className="text-sm font-semibold text-destructive">{error}</p>
              <Button onClick={() => loadHistory()} variant="outline" size="sm">Retry</Button>
            </div>
          ) : filteredAndSortedBooks.length === 0 ? (
            /* Empty State */
            <div className="flex flex-col items-center justify-center h-72 text-muted-foreground gap-4">
              <div className="p-4 bg-muted/30 rounded-2xl border border-border/40">
                <History size={36} className="opacity-25" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-base font-semibold text-foreground">No reading history found</p>
                <p className="text-xs text-muted-foreground">
                  {hasActiveFilters 
                    ? `No entries match "${searchQuery}" under ${activeTab}.`
                    : "Books and manga you open will automatically appear here."}
                </p>
              </div>
              {hasActiveFilters && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setSearchQuery(''); setActiveTab('all'); }}
                  className="mt-2 rounded-xl text-xs font-bold gap-1.5 cursor-pointer"
                >
                  <RotateCcw size={13} />
                  <span>Reset filters</span>
                </Button>
              )}
            </div>
          ) : viewMode === 'timeline' ? (
            /* ── Detailed Timeline Grouped View ── */
            <div className="space-y-10">
              {timelineGroups.map(group => (
                <div key={group.name} className="space-y-3.5">
                  {/* Timeline Header Badge */}
                  <div className="flex items-center gap-2.5 pb-2 border-b border-border/50">
                    <Calendar size={15} className="text-primary" />
                    <h2 className="text-sm font-extrabold tracking-wider uppercase text-foreground">
                      {group.name}
                    </h2>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-muted/60 text-muted-foreground border border-border/40">
                      {group.items.length}
                    </span>
                  </div>

                  {/* 2 Entries per row on desktop */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                    {group.items.map(book => {
                      const p = book.id ? progressMap[book.id] : undefined;
                      const bookStats = book.id ? bookStatsMap[book.id] : undefined;
                      const progressPct = p ? Math.round(p.progressPercent) : 0;
                      const isComplete = progressPct >= 95 || book.reading_status === 'completed';
                      const lastReadTime = p?.lastRead || book.last_opened || book.added_date;
                      const isManga = isMangaDomain(book);
                      const formatBadge = book.file_format?.replace('.', '').toUpperCase() || (isManga ? 'CBZ' : 'EPUB');
                      const authorName = book.authors && book.authors.length > 0 ? book.authors.map(a => a.name).join(', ') : 'Unknown Author';
                      const readDurationSecs = bookStats?.total_seconds || 0;

                      return (
                        <div
                          key={book.id}
                          className="group relative flex items-center justify-between gap-4 p-4 sm:p-5 rounded-3xl bg-card/80 hover:bg-card border border-border/60 hover:border-primary/40 transition-all duration-200 shadow-xs hover:shadow-md"
                        >
                          {/* Left: Large Cover + Details */}
                          <div className="flex items-center gap-4 sm:gap-4.5 min-w-0 flex-1">
                            {/* Large Book Cover */}
                            <div 
                              onClick={() => book.id && onOpenBook(book.id, p?.currentLocation)}
                              className="relative w-24 sm:w-28 md:w-30 aspect-[2/3] rounded-2xl overflow-hidden bg-gradient-to-br from-primary/20 via-muted/60 to-muted border border-border/60 shrink-0 shadow-md cursor-pointer group-hover:scale-103 group-hover:shadow-lg transition-all duration-300"
                            >
                              <HistoryCoverImage book={book} />
                              
                              {/* Format Tag */}
                              <span className="absolute bottom-1.5 right-1.5 px-2 py-0.5 rounded-lg text-[9px] font-extrabold uppercase bg-black/85 text-white backdrop-blur-md shadow-xs border border-white/10">
                                {formatBadge}
                              </span>
                            </div>

                            {/* Text Info & Progress */}
                            <div className="flex-1 min-w-0 space-y-2.5">
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h3 
                                    onClick={() => book.id && onOpenBook(book.id, p?.currentLocation)}
                                    className="font-extrabold text-base sm:text-lg text-foreground hover:text-primary transition-colors cursor-pointer line-clamp-2 leading-tight"
                                    title={book.title}
                                  >
                                    {book.title}
                                  </h3>
                                </div>
                                <div className="flex items-center gap-2 mt-1">
                                  <p className="text-xs sm:text-sm text-muted-foreground truncate font-medium flex-1">
                                    {authorName}
                                  </p>
                                  {isComplete ? (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-primary/10 text-primary border border-primary/25 shrink-0">
                                      <CheckCircle2 size={11} /> Completed
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-primary/10 text-primary border border-primary/25 shrink-0">
                                      {progressPct}%
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Progress Bar & Subtitle */}
                              <div className="w-full space-y-1.5 pt-0.5">
                                <div className="h-2 w-full bg-muted/80 rounded-full overflow-hidden border border-border/30">
                                  <div 
                                    className="h-full transition-all duration-500 rounded-full bg-primary"
                                    style={{ width: `${Math.min(Math.max(progressPct, 4), 100)}%` }}
                                  />
                                </div>
                                <div className="flex items-center justify-between text-xs text-muted-foreground">
                                  <div className="flex items-center gap-2 truncate pr-2 font-medium">
                                    <span>
                                      {p?.currentPage && p?.totalPages ? `Page ${p.currentPage} of ${p.totalPages}` : `${progressPct}% finished`}
                                    </span>
                                    {readDurationSecs > 0 && (
                                      <span className="text-primary font-bold">
                                        • {formatMinutes(readDurationSecs)} read
                                      </span>
                                    )}
                                  </div>
                                  <span className="flex items-center gap-1 shrink-0 text-[11px]">
                                    <Clock size={11} className="text-muted-foreground/70" />
                                    {lastReadTime ? formatRelativeTime(lastReadTime) : 'Recently'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Right: Actions */}
                          <div className="flex flex-col items-center gap-2 shrink-0">
                            <Button
                              size="sm"
                              onClick={() => book.id && onOpenBook(book.id, p?.currentLocation)}
                              className="h-10 px-4 rounded-xl bg-primary text-primary-foreground font-bold text-xs sm:text-sm shadow-xs hover:bg-primary/90 transition-all cursor-pointer gap-2 active:scale-95"
                            >
                              <BookOpen size={14} />
                              <span className="hidden lg:inline">Continue</span>
                            </Button>

                            <DropdownMenu>
                              <DropdownMenuTrigger className="h-9 w-9 flex items-center justify-center rounded-xl bg-card hover:bg-secondary border border-border/60 text-muted-foreground hover:text-foreground transition-all cursor-pointer">
                                <MoreVertical size={15} />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48 bg-popover !bg-popover !opacity-100 border border-border/80 shadow-2xl rounded-2xl p-1.5 z-[200]">
                                <DropdownMenuItem
                                  onClick={() => book.id && onViewDetails(book.id)}
                                  className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium cursor-pointer"
                                >
                                  <Info size={14} />
                                  <span>Book Details</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => book.id && onEditBook(book.id)}
                                  className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium cursor-pointer"
                                >
                                  <Edit2 size={14} />
                                  <span>Edit Metadata</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => book.id && dialogs.openShelfSelectDialog(book.id)}
                                  className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium cursor-pointer"
                                >
                                  <FolderPlus size={14} />
                                  <span>Add to Shelf</span>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator className="my-1 border-border/40" />
                                <DropdownMenuItem
                                  onClick={() => book.id && handleRemoveFromHistory(book.id)}
                                  className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-destructive hover:bg-destructive/10 cursor-pointer"
                                >
                                  <Trash2 size={14} />
                                  <span>Remove from History</span>
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* ── Visual Cards Grid View ── */
            <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] md:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4 md:gap-6">
              {filteredAndSortedBooks.map(book => {
                const p = book.id ? progressMap[book.id] : undefined;
                const bookStats = book.id ? bookStatsMap[book.id] : undefined;
                const progressPct = p ? Math.round(p.progressPercent) : 0;
                const isComplete = progressPct >= 95 || book.reading_status === 'completed';
                const lastReadTime = p?.lastRead || book.last_opened || book.added_date;
                const isManga = isMangaDomain(book);
                const formatBadge = book.file_format?.replace('.', '').toUpperCase() || (isManga ? 'CBZ' : 'EPUB');
                const authorName = book.authors && book.authors.length > 0 ? book.authors[0].name : 'Unknown Author';
                const readDurationSecs = bookStats?.total_seconds || 0;

                return (
                  <div
                    key={book.id}
                    className="group relative flex flex-col rounded-2xl bg-card border border-border/60 hover:border-primary/40 overflow-hidden shadow-xs hover:shadow-md transition-all duration-300 select-none"
                  >
                    {/* Cover Box */}
                    <div 
                      onClick={() => book.id && onOpenBook(book.id, p?.currentLocation)}
                      className="relative aspect-[2/3] w-full overflow-hidden bg-gradient-to-br from-primary/10 via-muted/40 to-muted cursor-pointer"
                    >
                      <HistoryCoverImage book={book} imageClassName="group-hover:scale-105 transition-transform duration-500" />

                      {/* Format Badge */}
                      <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md text-[9px] font-extrabold uppercase bg-black/80 text-white backdrop-blur-xs shadow-xs border border-white/10">
                        {formatBadge}
                      </span>

                      {/* Progress Badge */}
                      <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-extrabold shadow-xs backdrop-blur-md bg-primary/90 text-primary-foreground">
                        {isComplete ? '100%' : `${progressPct}%`}
                      </span>

                      {/* Bottom Progress Bar Line */}
                      <div className="absolute inset-x-0 bottom-0 h-1.5 bg-black/40">
                        <div 
                          className="h-full transition-all duration-300 bg-primary"
                          style={{ width: `${Math.min(Math.max(progressPct, 5), 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* Meta Footer */}
                    <div className="p-3.5 flex flex-col justify-between flex-1 gap-2">
                      <div>
                        <h3 
                          onClick={() => book.id && onOpenBook(book.id, p?.currentLocation)}
                          className="font-bold text-sm text-foreground line-clamp-1 hover:text-primary transition-colors cursor-pointer"
                          title={book.title}
                        >
                          {book.title}
                        </h3>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {authorName}
                        </p>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-border/40 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1 font-medium truncate">
                          {readDurationSecs > 0 ? formatMinutes(readDurationSecs) : `${progressPct}% done`}
                        </span>
                        <span className="shrink-0 text-[10px]">
                          {lastReadTime ? formatRelativeTime(lastReadTime) : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Clear History Confirmation Dialog ── */}
      <Dialog.Root open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[300]" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-md bg-popover border border-border/80 rounded-3xl p-6 shadow-2xl z-[310] space-y-4">
            <Dialog.Title className="text-lg font-bold text-foreground flex items-center gap-2">
              <Trash2 className="text-destructive" size={18} />
              Clear Reading History
            </Dialog.Title>
            <Dialog.Description className="text-sm text-muted-foreground leading-relaxed">
              Are you sure you want to clear your reading progress across all books? Your books and downloaded chapters will not be deleted.
            </Dialog.Description>
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setClearDialogOpen(false)}
                className="rounded-xl"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleClearAllHistory}
                className="rounded-xl"
              >
                Clear History
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

    </div>
  );
}
