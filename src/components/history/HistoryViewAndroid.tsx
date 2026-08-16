import React, { useRef } from 'react';
import { 
  History, Loader2, X, Search, Clock, TrendingUp, ArrowDownAZ, 
  BookOpen, Trash2, Calendar, LayoutGrid, List, MoreVertical, 
  RotateCcw, CheckCircle2, Info, Edit2, FolderPlus,
  BarChart3, ChevronDown
} from 'lucide-react';
import { Button } from '../ui/button';
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

interface HistoryViewAndroidProps {
  data: ReturnType<typeof useHistoryData>;
  onClose: () => void;
  onOpenBook: (bookId: number, location?: string) => void;
  onViewDetails: (bookId: number) => void;
  onEditBook: (bookId: number) => void;
  onDeleteBook: (bookId: number) => void;
  onOpenStatistics?: () => void;
  dialogs: any;
}

function HistoryMobileCover({ 
  book, 
  className 
}: { 
  book: Book; 
  className?: string;
}) {
  const { coverUrl, error } = useCoverImage(book.id, book.cover_path);
  const [imgError, setImgError] = React.useState(false);

  if (coverUrl && !imgError && !error) {
    return (
      <img
        src={coverUrl}
        alt={book.title}
        onError={() => setImgError(true)}
        className={cn("w-full h-full object-cover rounded-xl", className)}
        loading="lazy"
      />
    );
  }

  return (
    <div className={cn("w-full h-full flex flex-col items-center justify-center p-1.5 text-center bg-gradient-to-br from-primary/20 via-primary/5 to-muted/40 text-primary rounded-xl", className)}>
      <BookOpen size={20} className="opacity-80 mb-1" />
      <span className="text-[9px] font-bold line-clamp-2 text-foreground/90 leading-tight px-0.5">
        {book.title}
      </span>
    </div>
  );
}

export function HistoryViewAndroid({
  data,
  onClose,
  onOpenBook,
  onViewDetails,
  onEditBook,
  dialogs,
  onOpenStatistics
}: HistoryViewAndroidProps) {
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
    filteredAndSortedBooks,
    timelineGroups
  } = data;

  const scrollRef = useRef<HTMLDivElement>(null);

  const handleGoToStatistics = () => {
    if (onOpenStatistics) {
      onOpenStatistics();
    } else {
      useUIStore.getState().setCurrentView('statistics');
    }
  };

  const hasActiveFilters = searchQuery.trim() !== '' || activeTab !== 'all';

  const filterTabs: { id: FilterTab; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'books', label: 'Books' },
    { id: 'manga', label: 'Manga' },
    { id: 'in_progress', label: 'In Progress' },
    { id: 'completed', label: 'Completed' },
  ];

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-hidden">
      
      {/* ── Mobile Sticky Header with Safe-Area Insets ── */}
      <div 
        className="flex-none pb-2.5 px-4 border-b border-border/40 bg-background/90 backdrop-blur-xl z-20 sticky top-0 shadow-xs"
        style={{
          paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)',
          paddingLeft: 'calc(env(safe-area-inset-left, 0px) + 16px)',
          paddingRight: 'calc(env(safe-area-inset-right, 0px) + 16px)'
        }}
      >
        {/* Top App Bar Row */}
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <History size={17} />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-foreground truncate">History</h1>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 shrink-0">
              {filteredAndSortedBooks.length}
            </span>
          </div>
          
          <div className="flex items-center gap-1.5 shrink-0">
            {books.length > 0 && (
              <button 
                onClick={() => setClearDialogOpen(true)} 
                className="w-8 h-8 flex items-center justify-center rounded-full bg-muted/60 hover:bg-destructive/10 text-muted-foreground hover:text-destructive border border-border/40 transition-all active:scale-95 shadow-xs" 
                title="Clear History"
              >
                <Trash2 size={14} />
              </button>
            )}
            <button 
              onClick={onClose} 
              className="w-8 h-8 flex items-center justify-center rounded-full bg-muted/60 hover:bg-muted text-foreground border border-border/40 transition-all active:scale-95 shadow-xs" 
              title="Close"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative w-full mb-2.5">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input 
            type="text" 
            placeholder="Search reading history..." 
            value={searchQuery} 
            onChange={(e) => setSearchQuery(e.target.value)} 
            className="w-full h-9 pl-9 pr-8 bg-muted/40 hover:bg-muted/60 focus:bg-background border border-border/50 focus:border-primary/50 focus:ring-2 focus:ring-primary/20 rounded-xl transition-all text-xs sm:text-sm text-foreground placeholder:text-muted-foreground outline-none" 
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-muted-foreground/20 text-muted-foreground hover:bg-muted-foreground/30 hover:text-foreground flex items-center justify-center transition-colors"
            >
              <X size={11} />
            </button>
          )}
        </div>

        {/* Horizontal Filter Tabs Row */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1 mb-2">
          {filterTabs.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex-none px-3 py-1.5 rounded-full text-xs font-semibold transition-all border shrink-0",
                  isActive
                    ? "bg-primary text-primary-foreground border-primary shadow-xs font-bold"
                    : "bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border-border/50"
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Controls Row: Sort & View Toggle */}
        <div className="flex items-center justify-between gap-2 pt-0.5">
          {/* Sort Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-muted/50 border border-border/50 text-[11px] font-bold text-foreground transition-all shadow-xs outline-none cursor-pointer">
              <Clock size={12} className="text-muted-foreground shrink-0" />
              <span className="truncate max-w-[130px]">
                {sortOption === 'recent' ? 'Recent' : sortOption === 'oldest' ? 'Oldest' : sortOption === 'progress' ? 'Progress' : 'A–Z'}
              </span>
              <ChevronDown size={11} className="text-muted-foreground shrink-0" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44 bg-popover !bg-popover !opacity-100 border border-border/80 shadow-2xl rounded-2xl p-1 z-[200]">
              <DropdownMenuItem
                onClick={() => setSortOption('recent')}
                className={cn(
                  "flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-medium cursor-pointer",
                  sortOption === 'recent' ? "bg-primary/15 text-primary font-bold" : "text-popover-foreground hover:bg-accent"
                )}
              >
                <span>Most Recent</span>
                {sortOption === 'recent' && <CheckCircle2 size={13} className="text-primary" />}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setSortOption('oldest')}
                className={cn(
                  "flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-medium cursor-pointer",
                  sortOption === 'oldest' ? "bg-primary/15 text-primary font-bold" : "text-popover-foreground hover:bg-accent"
                )}
              >
                <span>Oldest Activity</span>
                {sortOption === 'oldest' && <CheckCircle2 size={13} className="text-primary" />}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setSortOption('progress')}
                className={cn(
                  "flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-medium cursor-pointer",
                  sortOption === 'progress' ? "bg-primary/15 text-primary font-bold" : "text-popover-foreground hover:bg-accent"
                )}
              >
                <span>Highest Progress</span>
                {sortOption === 'progress' && <CheckCircle2 size={13} className="text-primary" />}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setSortOption('title')}
                className={cn(
                  "flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-medium cursor-pointer",
                  sortOption === 'title' ? "bg-primary/15 text-primary font-bold" : "text-popover-foreground hover:bg-accent"
                )}
              >
                <span>Title (A–Z)</span>
                {sortOption === 'title' && <CheckCircle2 size={13} className="text-primary" />}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* View Mode Toggle */}
          <div className="flex items-center bg-muted/60 rounded-xl p-0.5 border border-border/50 shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('timeline')}
              title="Timeline List"
              className={cn(
                "p-1 rounded-lg transition-all",
                viewMode === 'timeline' ? "bg-card text-foreground shadow-xs font-bold" : "text-muted-foreground"
              )}
            >
              <List size={13} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              title="Cards Grid"
              className={cn(
                "p-1 rounded-lg transition-all",
                viewMode === 'grid' ? "bg-card text-foreground shadow-xs font-bold" : "text-muted-foreground"
              )}
            >
              <LayoutGrid size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Scrollable Body ── */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-3 bg-background/50 relative scroll-smooth"
      >
        {/* pb-28 ensures clear separation above the Android bottom navigation bar */}
        <div className="max-w-xl mx-auto space-y-4 pb-28">

          {/* Compact Mobile Reading Stats Card */}
          <div className="rounded-2xl border border-border/50 bg-card/70 backdrop-blur-md p-3 shadow-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center text-amber-500 shrink-0 border border-amber-500/25">
                <TrendingUp size={16} />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-foreground truncate">
                  {streak?.current_streak ? `${streak.current_streak}-Day Streak` : 'Start your streak'}
                </div>
                <div className="text-[10px] text-muted-foreground truncate">
                  {Math.round(todaySeconds / 60)}m read today • {formatDuration(stats.totalSecondsLogged)} total
                </div>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleGoToStatistics}
              className="h-7 px-2.5 text-[11px] font-bold rounded-lg border-border/60 bg-muted/40 hover:bg-muted text-foreground gap-1 shrink-0 active:scale-95"
            >
              <BarChart3 size={11} className="text-primary" />
              <span>Stats</span>
            </Button>
          </div>

          {loading && books.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2.5">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <p className="text-xs text-muted-foreground">Loading history...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3">
              <p className="text-xs font-semibold text-destructive">{error}</p>
              <Button onClick={() => loadHistory()} variant="outline" size="sm" className="rounded-xl text-xs">Retry</Button>
            </div>
          ) : filteredAndSortedBooks.length === 0 ? (
            /* Empty State */
            <div className="flex flex-col items-center justify-center h-56 text-muted-foreground gap-3">
              <div className="p-3.5 bg-muted/30 rounded-2xl border border-border/40">
                <History size={28} className="opacity-30" />
              </div>
              <div className="text-center space-y-1 px-4">
                <p className="text-sm font-semibold text-foreground">No history entries</p>
                <p className="text-xs text-muted-foreground">
                  {hasActiveFilters 
                    ? `No entries match "${searchQuery}" under ${activeTab}.`
                    : "Books you read will automatically appear here."}
                </p>
              </div>
              {hasActiveFilters && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setSearchQuery(''); setActiveTab('all'); }}
                  className="rounded-xl text-xs font-bold gap-1 mt-1"
                >
                  <RotateCcw size={12} />
                  <span>Reset filters</span>
                </Button>
              )}
            </div>
          ) : viewMode === 'timeline' ? (
            /* ── Touch-Friendly Timeline List on Mobile ── */
            <div className="space-y-6">
              {timelineGroups.map(group => (
                <div key={group.name} className="space-y-2.5">
                  {/* Bucket Header */}
                  <div className="flex items-center gap-2 pb-1.5 border-b border-border/40">
                    <Calendar size={13} className="text-primary" />
                    <h2 className="text-xs font-extrabold tracking-wider uppercase text-foreground">
                      {group.name}
                    </h2>
                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-muted/60 text-muted-foreground">
                      {group.items.length}
                    </span>
                  </div>

                  {/* Vertical Stack of Mobile Cards */}
                  <div className="flex flex-col gap-2.5">
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
                          className="flex items-center gap-3 p-2.5 rounded-2xl bg-card/85 border border-border/50 shadow-2xs active:bg-accent/40 transition-colors"
                        >
                          {/* Cover Thumbnail */}
                          <div 
                            onClick={() => book.id && onOpenBook(book.id, p?.currentLocation)}
                            className="relative w-14 aspect-[2/3] rounded-xl overflow-hidden bg-muted shrink-0 shadow-xs cursor-pointer"
                          >
                            <HistoryMobileCover book={book} />
                            <span className="absolute bottom-1 right-1 px-1 py-0.2 rounded text-[7.5px] font-extrabold uppercase bg-black/80 text-white backdrop-blur-xs">
                              {formatBadge}
                            </span>
                          </div>

                          {/* Info Column */}
                          <div 
                            onClick={() => book.id && onOpenBook(book.id, p?.currentLocation)}
                            className="flex-1 min-w-0 space-y-1.5 cursor-pointer"
                          >
                            <div>
                              <h3 className="font-bold text-xs sm:text-sm text-foreground truncate leading-tight">
                                {book.title}
                              </h3>
                              <p className="text-[11px] text-muted-foreground truncate">
                                {authorName}
                              </p>
                            </div>

                            {/* Progress bar */}
                            <div className="space-y-1">
                              <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-primary rounded-full transition-all duration-300"
                                  style={{ width: `${Math.min(Math.max(progressPct, 4), 100)}%` }}
                                />
                              </div>
                              <div className="flex items-center justify-between text-[10px] text-muted-foreground font-medium">
                                <span className="text-primary font-semibold">
                                  {isComplete ? 'Completed' : `${progressPct}%`}
                                  {readDurationSecs > 0 && ` • ${formatMinutes(readDurationSecs)}`}
                                </span>
                                <span>
                                  {lastReadTime ? formatRelativeTime(lastReadTime) : ''}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* 3-Dot Actions Menu */}
                          <DropdownMenu>
                            <DropdownMenuTrigger className="w-8 h-8 flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground active:bg-muted/80 transition-colors shrink-0 outline-none">
                              <MoreVertical size={16} />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44 bg-popover !bg-popover !opacity-100 border border-border/80 shadow-2xl rounded-2xl p-1 z-[200]">
                              <DropdownMenuItem
                                onClick={() => book.id && onViewDetails(book.id)}
                                className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-medium cursor-pointer"
                              >
                                <Info size={13} />
                                <span>Book Details</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => book.id && onEditBook(book.id)}
                                className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-medium cursor-pointer"
                              >
                                <Edit2 size={13} />
                                <span>Edit Metadata</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => book.id && dialogs.openShelfSelectDialog(book.id)}
                                className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-medium cursor-pointer"
                              >
                                <FolderPlus size={13} />
                                <span>Add to Shelf</span>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator className="my-0.5 border-border/40" />
                              <DropdownMenuItem
                                onClick={() => book.id && handleRemoveFromHistory(book.id)}
                                className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-medium text-destructive hover:bg-destructive/10 cursor-pointer"
                              >
                                <Trash2 size={13} />
                                <span>Remove</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* ── 2-Column Visual Cards Grid on Mobile ── */
            <div className="grid grid-cols-2 gap-3">
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
                    onClick={() => book.id && onOpenBook(book.id, p?.currentLocation)}
                    className="flex flex-col rounded-2xl bg-card border border-border/60 overflow-hidden shadow-2xs active:scale-[0.98] transition-transform select-none cursor-pointer"
                  >
                    {/* Cover Box */}
                    <div className="relative aspect-[2/3] w-full overflow-hidden bg-muted">
                      <HistoryMobileCover book={book} />

                      {/* Format Badge */}
                      <span className="absolute top-1.5 left-1.5 px-1.5 py-0.2 rounded text-[8px] font-extrabold uppercase bg-black/80 text-white backdrop-blur-xs">
                        {formatBadge}
                      </span>

                      {/* Progress Badge */}
                      <span className="absolute top-1.5 right-1.5 px-1.5 py-0.2 rounded-full text-[9px] font-extrabold shadow-xs bg-primary text-primary-foreground">
                        {isComplete ? '100%' : `${progressPct}%`}
                      </span>

                      {/* Bottom Progress Bar Line */}
                      <div className="absolute inset-x-0 bottom-0 h-1 bg-black/40">
                        <div 
                          className="h-full bg-primary transition-all duration-300"
                          style={{ width: `${Math.min(Math.max(progressPct, 5), 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="p-2.5 flex flex-col justify-between flex-1 gap-1">
                      <div>
                        <h3 className="font-bold text-xs text-foreground line-clamp-1">
                          {book.title}
                        </h3>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {authorName}
                        </p>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-border/30 text-[9px] text-muted-foreground">
                        <span>{readDurationSecs > 0 ? formatMinutes(readDurationSecs) : `${progressPct}% done`}</span>
                        <span>{lastReadTime ? formatRelativeTime(lastReadTime) : ''}</span>
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
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[88vw] max-w-sm bg-popover border border-border/80 rounded-3xl p-5 shadow-2xl z-[310] space-y-3">
            <Dialog.Title className="text-base font-bold text-foreground flex items-center gap-2">
              <Trash2 className="text-destructive" size={16} />
              Clear Reading History
            </Dialog.Title>
            <Dialog.Description className="text-xs text-muted-foreground leading-relaxed">
              Are you sure you want to clear reading progress for all books? Books in your library will remain intact.
            </Dialog.Description>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setClearDialogOpen(false)}
                className="rounded-xl text-xs"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleClearAllHistory}
                className="rounded-xl text-xs"
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
