import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  api, type Book, type ReadingProgress, type ReadingStreak, 
  type DailyReadingStats, type BookReadingStats 
} from '@/lib/tauri';
import { 
  History, Loader2, X, Search, Clock, TrendingUp, ArrowDownAZ, 
  BookOpen, Trash2, Calendar, LayoutGrid, List, MoreVertical, 
  RotateCcw, CheckCircle2, Bookmark, Info, Edit2, FolderPlus,
  BarChart3, ArrowRight, Layers
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useCoverImage } from '@/components/common/hooks/useCoverImage';
import { formatRelativeTime, isMangaDomain, cn } from '@/lib/utils';
import { useToastStore } from '@/store/toastStore';
import { useUIStore } from '@/store/uiStore';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import * as Dialog from '@radix-ui/react-dialog';

interface HistoryViewProps {
  onClose: () => void;
  onOpenBook: (bookId: number, location?: string) => void;
  onViewDetails: (bookId: number) => void;
  onEditBook: (bookId: number) => void;
  onDeleteBook: (bookId: number) => void;
  onOpenStatistics?: () => void;
  dialogs: any;
}

type FilterTab = 'all' | 'books' | 'manga' | 'in_progress' | 'completed';
type SortOption = 'recent' | 'oldest' | 'progress' | 'title';
type ViewMode = 'timeline' | 'grid';

type TimelineBucket = 'Today' | 'Yesterday' | 'This Week' | 'Earlier this Month' | 'Past Months & Older';

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

function getTimelineBucket(dateStr?: string | null): TimelineBucket {
  if (!dateStr) return 'Past Months & Older';
  const d = new Date(dateStr);
  const now = new Date();
  
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 86400000);
  const startOf7DaysAgo = new Date(startOfToday.getTime() - 6 * 86400000);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  if (d >= startOfToday) return 'Today';
  if (d >= startOfYesterday) return 'Yesterday';
  if (d >= startOf7DaysAgo) return 'This Week';
  if (d >= startOfMonth) return 'Earlier this Month';
  return 'Past Months & Older';
}

function formatDuration(totalSeconds: number) {
  const days = Math.floor(totalSeconds / (3600 * 24));
  const hours = Math.floor((totalSeconds % (3600 * 24)) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatMinutes(seconds: number) {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export function HistoryView({
  onClose,
  onOpenBook,
  onViewDetails,
  onEditBook,
  onDeleteBook,
  onOpenStatistics,
  dialogs
}: HistoryViewProps) {
  const [books, setBooks] = useState<Book[]>([]);
  const [progressMap, setProgressMap] = useState<Record<number, ReadingProgress>>({});
  const [bookStatsMap, setBookStatsMap] = useState<Record<number, BookReadingStats>>({});
  const [streak, setStreak] = useState<ReadingStreak | null>(null);
  const [todaySeconds, setTodaySeconds] = useState(0);
  const [dailyStats30d, setDailyStats30d] = useState<DailyReadingStats[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [sortOption, setSortOption] = useState<SortOption>('recent');
  const [viewMode, setViewMode] = useState<ViewMode>('timeline');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clearDialogOpen, setClearDialogOpen] = useState(false);

  const handleGoToStatistics = () => {
    if (onOpenStatistics) {
      onOpenStatistics();
    } else {
      useUIStore.getState().setCurrentView('statistics');
    }
  };

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Concurrently fetch reading history, streak, today time, and daily stats
      const [fetchedBooks, fetchedStreak, fetchedTodaySecs, fetchedDailyStats] = await Promise.all([
        api.getReadingHistory(100, 0),
        api.getReadingStreak().catch(() => null),
        api.getTodayReadingTime().catch(() => 0),
        api.getDailyReadingStats(30).catch(() => []),
      ]);

      setBooks(fetchedBooks);
      setStreak(fetchedStreak);
      setTodaySeconds(fetchedTodaySecs);
      setDailyStats30d(fetchedDailyStats);

      // Fetch batch reading progress for all books
      const bookIds = fetchedBooks.map(b => b.id).filter(Boolean) as number[];
      if (bookIds.length > 0) {
        const pMap = await api.getReadingProgressBatch(bookIds).catch(() => ({}));
        setProgressMap(pMap);

        // Concurrently fetch book-level stats for read durations
        const statsPromises = bookIds.slice(0, 50).map(async id => {
          try {
            const stats = await api.getBookReadingStats(id);
            return { id, stats };
          } catch {
            return null;
          }
        });
        const results = await Promise.all(statsPromises);
        const bMap: Record<number, BookReadingStats> = {};
        for (const res of results) {
          if (res && res.stats) {
            bMap[res.id] = res.stats;
          }
        }
        setBookStatsMap(bMap);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleRemoveFromHistory = async (bookId: number) => {
    try {
      await api.saveReadingProgress(bookId, '', 0);

      setBooks(prev => prev.filter(b => b.id !== bookId));
      useToastStore.getState().addToast({
        title: 'Removed from history',
        variant: 'success',
        duration: 2000,
      });
    } catch {
      useToastStore.getState().addToast({
        title: 'Failed to remove from history',
        variant: 'error',
      });
    }
  };

  const handleClearAllHistory = async () => {
    try {
      for (const book of books) {
        if (book.id) {
          await api.saveReadingProgress(book.id, '', 0);
        }
      }
      setBooks([]);
      setProgressMap({});
      setBookStatsMap({});
      setClearDialogOpen(false);
      useToastStore.getState().addToast({
        title: 'Reading history cleared',
        variant: 'success',
        duration: 2500,
      });
    } catch {
      useToastStore.getState().addToast({
        title: 'Failed to clear history',
        variant: 'error',
      });
    }
  };

  const stats = useMemo(() => {
    let inProgress = 0;
    let completed = 0;

    for (const b of books) {
      const p = b.id ? progressMap[b.id] : undefined;
      const pct = p ? p.progressPercent : 0;
      if (pct >= 95 || b.reading_status === 'completed') {
        completed++;
      } else if (pct > 0 || b.reading_status === 'reading') {
        inProgress++;
      }
    }

    const totalSecondsLogged = dailyStats30d.reduce((sum, s) => sum + (s.total_seconds || 0), 0);
    const totalPagesLogged = dailyStats30d.reduce((sum, s) => sum + (s.book_pages_read || 0) + (s.manga_pages_read || 0), 0);

    return {
      total: books.length,
      inProgress,
      completed,
      totalSecondsLogged,
      totalPagesLogged,
    };
  }, [books, progressMap, dailyStats30d]);

  // Build 30-day activity bar points
  const miniHeatmapDays = useMemo(() => {
    const map = new Map(dailyStats30d.map(s => [s.date, s]));
    const days = [];
    const now = new Date();

    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const stat = map.get(key);
      const seconds = stat?.total_seconds || 0;
      const pages = (stat?.book_pages_read || 0) + (stat?.manga_pages_read || 0);

      days.push({
        date: key,
        label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        seconds,
        pages,
        hasActivity: seconds > 0 || pages > 0,
      });
    }
    return days;
  }, [dailyStats30d]);

  const filteredAndSortedBooks = useMemo(() => {
    let list = books.filter(book => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesTitle = book.title.toLowerCase().includes(q);
        const matchesAuthor = book.authors?.some(a => a.name.toLowerCase().includes(q)) || false;
        const matchesSeries = book.series ? book.series.toLowerCase().includes(q) : false;
        if (!matchesTitle && !matchesAuthor && !matchesSeries) return false;
      }

      const isManga = isMangaDomain(book);
      const p = book.id ? progressMap[book.id] : undefined;
      const pct = p ? p.progressPercent : 0;
      const isDone = pct >= 95 || book.reading_status === 'completed';

      if (activeTab === 'books' && isManga) return false;
      if (activeTab === 'manga' && !isManga) return false;
      if (activeTab === 'in_progress' && (isDone || pct === 0)) return false;
      if (activeTab === 'completed' && !isDone) return false;

      return true;
    });

    list.sort((a, b) => {
      const pA = a.id ? progressMap[a.id] : undefined;
      const pB = b.id ? progressMap[b.id] : undefined;
      const dateA = new Date(pA?.lastRead || a.last_opened || a.added_date || 0).getTime();
      const dateB = new Date(pB?.lastRead || b.last_opened || b.added_date || 0).getTime();

      if (sortOption === 'recent') return dateB - dateA;
      if (sortOption === 'oldest') return dateA - dateB;
      if (sortOption === 'progress') {
        const pctA = pA ? pA.progressPercent : 0;
        const pctB = pB ? pB.progressPercent : 0;
        return pctB - pctA;
      }
      if (sortOption === 'title') {
        return a.title.localeCompare(b.title);
      }
      return 0;
    });

    return list;
  }, [books, progressMap, searchQuery, activeTab, sortOption]);

  const timelineGroups = useMemo(() => {
    const order: TimelineBucket[] = ['Today', 'Yesterday', 'This Week', 'Earlier this Month', 'Past Months & Older'];
    const groups: Record<TimelineBucket, Book[]> = {
      'Today': [],
      'Yesterday': [],
      'This Week': [],
      'Earlier this Month': [],
      'Past Months & Older': [],
    };

    for (const book of filteredAndSortedBooks) {
      const p = book.id ? progressMap[book.id] : undefined;
      const dateStr = p?.lastRead || book.last_opened || book.added_date;
      const bucket = getTimelineBucket(dateStr);
      groups[bucket].push(book);
    }

    return order
      .filter(bucket => groups[bucket].length > 0)
      .map(bucket => ({
        name: bucket,
        items: groups[bucket],
      }));
  }, [filteredAndSortedBooks, progressMap]);

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
            /* ── Detailed Timeline Grouped View (2 columns per row on desktop) ── */
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
                      const coverSrc = book.cover_path ? convertFileSrc(book.cover_path) : undefined;
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
                const coverSrc = book.cover_path ? convertFileSrc(book.cover_path) : undefined;
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
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{authorName}</p>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1.5 border-t border-border/40">
                        <span>{readDurationSecs > 0 ? formatMinutes(readDurationSecs) : (lastReadTime ? formatRelativeTime(lastReadTime) : 'Recently')}</span>
                        <button
                          type="button"
                          onClick={() => book.id && handleRemoveFromHistory(book.id)}
                          title="Remove from history"
                          className="text-muted-foreground hover:text-destructive transition-colors p-1 cursor-pointer"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Clear All History Confirmation Dialog ── */}
      <Dialog.Root open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[250]" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-md bg-card border border-border p-6 rounded-3xl shadow-2xl z-[260] space-y-4 focus:outline-none">
            <div className="flex items-center gap-3 text-destructive">
              <div className="w-10 h-10 rounded-2xl bg-destructive/10 flex items-center justify-center">
                <Trash2 size={20} />
              </div>
              <Dialog.Title className="text-lg font-bold text-foreground">
                Clear Reading History?
              </Dialog.Title>
            </div>
            <Dialog.Description className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              This will reset your reading history timeline. Your books, tags, annotations, and bookmarks will not be deleted.
            </Dialog.Description>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setClearDialogOpen(false)}
                className="rounded-xl font-bold cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleClearAllHistory}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-xl font-bold cursor-pointer"
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
