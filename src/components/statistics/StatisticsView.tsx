import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { api, isTauri, isAndroid } from '@/lib/tauri';
import type { DailyReadingStats, ReadingStreak, ReadingGoal, Book, BookReadingStats } from '@/lib/tauri';
import { 
  X, RotateCw, Library, Clock, BookCheck,
  BookDashed, PlayCircle, HardDrive,
  Layers, BookText, Image as ImageIcon,
  Activity, Star, Link2, Trophy, CheckCircle2,
  TrendingUp, BookOpen, ChevronRight, BarChart3,
  Flame, LayoutGrid
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ActivityHeatmap } from './ActivityHeatmap';
import { ReadingCalendar } from './ReadingCalendar';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { motion } from 'framer-motion';
import { useLibraryStore } from '@/store/libraryStore';
import { Input } from '../ui/input';
import { useCoverImage } from '@/components/common/hooks/useCoverImage';
import { toast } from 'sonner';
import { useToast } from '@/store/toastStore';

interface StatisticsViewProps {
  onClose: () => void;
  onOpenBook?: (bookId: number, location?: string) => void;
}

function StatBookCover({ book }: { book: Book }) {
  const { coverUrl, error } = useCoverImage(book.id, book.cover_path);
  const [imgError, setImgError] = useState(false);

  if (coverUrl && !imgError && !error) {
    return (
      <img 
        src={coverUrl} 
        alt={book.title} 
        onError={() => setImgError(true)} 
        className="w-full h-full object-cover" 
        loading="lazy" 
      />
    );
  }

  return (
    <div className="w-full h-full flex items-center justify-center bg-primary/10 text-primary">
      <BookOpen size={16} />
    </div>
  );
}

const formatMinutes = (seconds: number) => {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
};

const pad2 = (n: number) => String(n).padStart(2, '0');
const toDateStr = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export interface Last30DaysDatum {
  date: string;
  label: string;
  shortLabel: string;
  seconds: number;
  minutes: number;
}

export interface WeeklyBar {
  date: string;
  seconds: number;
  pages: number;
  secondsPct: number;
  pagesPct: number;
}

export function buildWeeklyBars(stats: DailyReadingStats[], now = new Date()): WeeklyBar[] {
  const byDate = new Map(stats.map(s => [s.date, s]));
  const bars: WeeklyBar[] = [];

  const d = new Date(now);
  const dayOfWeek = d.getDay();
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  const monday = new Date(d);
  monday.setDate(d.getDate() - daysSinceMonday);

  for (let i = 0; i < 7; i++) {
    const cur = new Date(monday);
    cur.setDate(monday.getDate() + i);
    const dateStr = `${cur.getFullYear()}-${pad2(cur.getMonth() + 1)}-${pad2(cur.getDate())}`;
    const stat = byDate.get(dateStr);
    const sec = stat?.total_seconds ?? 0;
    const pages = (stat?.book_pages_read ?? 0) + (stat?.manga_pages_read ?? 0);
    bars.push({
      date: dateStr,
      seconds: sec,
      pages,
      secondsPct: 0,
      pagesPct: 0,
    });
  }

  const maxSec = Math.max(0, ...bars.map(b => b.seconds));
  const maxPages = Math.max(0, ...bars.map(b => b.pages));

  for (const b of bars) {
    b.secondsPct = maxSec > 0 ? (b.seconds / maxSec) * 100 : 0;
    b.pagesPct = maxPages > 0 ? (b.pages / maxPages) * 100 : 0;
  }

  return bars;
}


export function Last30DaysChart({ stats }: { stats: DailyReadingStats[] }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const data = useMemo(() => {
    const byDate = new Map(stats.map(s => [s.date, s]));
    const days: Last30DaysDatum[] = [];
    const today = new Date();

    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = toDateStr(d);
      const stat = byDate.get(key);
      const sec = stat?.total_seconds ?? 0;
      days.push({
        date: key,
        label: `${d.getMonth() + 1}/${d.getDate()}`,
        shortLabel: d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }),
        seconds: sec,
        minutes: Math.round(sec / 60),
      });
    }
    return days;
  }, [stats]);

  const maxMinutes = Math.max(1, ...data.map(d => d.minutes));
  const yTicks = [
    maxMinutes,
    Math.round(maxMinutes * 0.75),
    Math.round(maxMinutes * 0.5),
    Math.round(maxMinutes * 0.25),
    0
  ];

  return (
    <div className="flex flex-col gap-4 select-none">
      {/* Card Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h3 className="text-base font-bold text-foreground">Last 30 Days</h3>
            <p className="text-xs text-muted-foreground">Daily reading minutes log</p>
          </div>
          {hoveredIdx !== null && (
            <span className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-bold text-primary shadow-2xs">
              {data[hoveredIdx].shortLabel}: {data[hoveredIdx].minutes} min
            </span>
          )}
        </div>
      </div>

      {/* Bar Chart Canvas Area */}
      <div className="relative pt-6 pb-2 pl-10 pr-2 h-56 flex flex-col justify-between overflow-hidden">
        {/* Y-Axis Grid Lines & Labels */}
        <div className="absolute inset-0 pl-10 pr-2 pointer-events-none flex flex-col justify-between pt-6 pb-8">
          {yTicks.map((val, idx) => (
            <div key={idx} className="flex items-center w-full relative">
              <span className="absolute -left-9 text-[10px] font-semibold text-muted-foreground/70">
                {val >= 60 ? `${(val / 60).toFixed(1)}h` : `${val}m`}
              </span>
              <div className="w-full border-b border-border/25 border-dashed" />
            </div>
          ))}
        </div>

        {/* Bar Chart Render */}
        <div className="relative z-10 flex-1 w-full h-full flex items-end justify-between gap-1 pt-2 pb-6">
          {data.map((d, idx) => {
            const heightPct = (d.minutes / maxMinutes) * 100;
            const isHovered = hoveredIdx === idx;
            return (
              <div
                key={d.date}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                className="flex-1 flex flex-col items-center justify-end h-full relative group cursor-pointer"
              >
                <div
                  className={cn(
                    "w-full max-w-[14px] rounded-t-sm transition-all duration-300",
                    d.minutes > 0
                      ? "bg-foreground/80 group-hover:bg-primary"
                      : "bg-muted/40",
                    isHovered && "ring-2 ring-primary/60 shadow-md bg-primary"
                  )}
                  style={{ height: `${Math.max(4, heightPct)}%` }}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* X-Axis Date Labels */}
      <div className="flex justify-between items-center text-[10px] font-bold text-muted-foreground pt-1 border-t border-border/30">
        {data.filter((_, idx) => idx % 5 === 0 || idx === data.length - 1).map(d => (
          <span key={d.date}>{d.label}</span>
        ))}
      </div>
    </div>
  );
}

export function StatisticsView({ onClose, onOpenBook }: StatisticsViewProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [allStats, setAllStats] = useState<DailyReadingStats[]>([]);
  const [streak, setStreak] = useState<ReadingStreak | null>(null);
  const [goal, setGoal] = useState<ReadingGoal | null>(null);
  const [topBookStats, setTopBookStats] = useState<Array<{ book: Book; stats: BookReadingStats }>>([]);
  const storeBooks = useLibraryStore(s => s.books);
  const [allLibraryBooks, setAllLibraryBooks] = useState<Book[]>([]);

  const books = allLibraryBooks.length > 0 ? allLibraryBooks : storeBooks;
  
  const [isEditingGoal, setIsEditingGoal] = useState(false);
  const [newGoalInput, setNewGoalInput] = useState("");

  const currentYear = new Date().getFullYear();
  const booksReadThisYear = books.filter(b => {
    if (b.reading_status !== 'completed') return false;
    const dateStr = b.last_opened || b.modified_date || b.added_date;
    if (!dateStr) return false;
    return new Date(dateStr).getFullYear() === currentYear;
  }).length;

  const handleUpdateGoal = async () => {
    try {
      const val = parseInt(newGoalInput, 10);
      if (isNaN(val) || val <= 0) {
        toast.error("Please enter a valid number");
        return;
      }
      
      const currentGoal = goal || { daily_minutes_target: 30 } as ReadingGoal;
      const updated = await api.updateReadingGoal(currentGoal.daily_minutes_target, val);
      setGoal(updated);
      setIsEditingGoal(false);
      toast.success("Yearly goal updated!");
    } catch (err) {
      toast.error("Failed to update goal");
    }
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!isTauri) {
        const dummyStats = [
          { date: '2023-10-01', total_seconds: 1200, books_count: 1, sessions_count: 1, book_pages_read: 15, manga_pages_read: 0 },
          { date: '2023-10-02', total_seconds: 2400, books_count: 1, sessions_count: 2, book_pages_read: 30, manga_pages_read: 0 },
          { date: '2023-10-03', total_seconds: 0, books_count: 0, sessions_count: 0, book_pages_read: 0, manga_pages_read: 0 },
          { date: '2023-10-04', total_seconds: 3600, books_count: 2, sessions_count: 3, book_pages_read: 20, manga_pages_read: 50 },
          { date: '2023-10-05', total_seconds: 1800, books_count: 1, sessions_count: 1, book_pages_read: 0, manga_pages_read: 100 },
          { date: '2023-10-06', total_seconds: 4200, books_count: 1, sessions_count: 4, book_pages_read: 45, manga_pages_read: 120 },
          { date: '2023-10-07', total_seconds: 900, books_count: 1, sessions_count: 1, book_pages_read: 10, manga_pages_read: 0 },
        ];
        setAllStats(dummyStats);
        setStreak({ current_streak: 4, longest_streak: 12, total_reading_days: 45 });
        setGoal({ daily_minutes_target: 30, yearly_books_target: 20, is_active: true, created_at: '', updated_at: '' });
        setLoading(false);
        return;
      }

      const [stats, currentStreak, currentGoal, fullLibraryRes] = await Promise.all([
        api.getDailyReadingStats(3650),
        api.getReadingStreak(),
        api.getReadingGoal(),
        api.searchBooks({ limit: 10000 }).catch(() => ({ books: [] }))
      ]);

      const fetchedBooks = fullLibraryRes.books && fullLibraryRes.books.length > 0 ? fullLibraryRes.books : storeBooks;

      setAllStats(stats);
      setStreak(currentStreak);
      setGoal(currentGoal);
      setAllLibraryBooks(fetchedBooks);

      const candidateBooks = fetchedBooks.slice(0, 50);
      const topStatsPromises = candidateBooks.map(async b => {
        if (!b.id) return null;
        try {
          const bStats = await api.getBookReadingStats(b.id);
          return { book: b, stats: bStats };
        } catch {
          return null;
        }
      });
      const topResults = await Promise.all(topStatsPromises);

      const validTop = topResults
        .filter((item): item is { book: Book; stats: BookReadingStats } => item !== null && item.stats.total_seconds > 0)
        .sort((a, b) => b.stats.total_seconds - a.stats.total_seconds)
        .slice(0, 6);
      
      setTopBookStats(validTop);
    } catch (err) {
      setError(err instanceof Error ? err.message : (typeof err === 'object' ? JSON.stringify(err) : String(err)));
    } finally {
      setLoading(false);
    }
  }, [storeBooks]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const formatDuration = (totalSeconds: number) => {
    const days = Math.floor(totalSeconds / (3600 * 24));
    const hours = Math.floor((totalSeconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const totalInLibrary = books.length;
  const readDurationSeconds = allStats.reduce((sum, stat) => sum + stat.total_seconds, 0);
  const completedEntries = books.filter(b => b.reading_status === 'completed').length;

  const activeDaysCount = Math.max(1, allStats.filter(s => s.total_seconds > 0).length);
  const dailyAverageSeconds = Math.round(readDurationSeconds / Math.max(1, activeDaysCount));

  const unreadEntries = books.filter(b => b.reading_status === 'unread' || !b.reading_status).length;
  const startedEntries = books.filter(b => b.reading_status === 'reading').length;

  const isManga = (b: Book) =>
    b.domain === 'manga' ||
    b.domain === 'comics' ||
    b.domain === 'manga_comics' ||
    ['cbz', 'zip', 'cbr', 'rar', '7z'].includes(b.file_format?.toLowerCase() || '');

  const booksReadCount = books.filter(b => b.reading_status === 'completed' && !isManga(b)).length;
  const mangaReadCount = books.filter(b => b.reading_status === 'completed' && isManga(b)).length;

  const bookPagesRead = allStats.reduce((sum, stat) => sum + (stat.book_pages_read || 0), 0);
  const mangaPagesRead = allStats.reduce((sum, stat) => sum + (stat.manga_pages_read || 0), 0);
  const totalPagesRead = bookPagesRead + mangaPagesRead;

  const trackedEntries = books.filter(b => b.anilist_id).length;
  const booksWithScore = books.filter(b => b.rating && b.rating > 0);
  const meanScore = booksWithScore.length > 0 
    ? (booksWithScore.reduce((sum, b) => sum + (b.rating || 0), 0) / booksWithScore.length).toFixed(2) 
    : "0";

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-hidden select-none">
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 sm:p-4 md:p-6 lg:p-8 pt-1 sm:pt-2 bg-background">
        <div className={cn("max-w-6xl mx-auto space-y-6 pt-1", isAndroid ? "pb-36" : "pb-28 md:pb-20")}>

          {error ? (
            <div className="flex flex-col items-center justify-center py-10 bg-card rounded-2xl border border-destructive/50 p-6 shadow-xs">
              <p className="text-destructive mb-4 font-medium">{error}</p>
              <Button onClick={loadData} variant="destructive">
                Retry
              </Button>
            </div>
          ) : loading ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map(i => (
                  <Skeleton key={i} className="h-28 rounded-2xl" />
                ))}
              </div>
              <Skeleton className="h-64 rounded-2xl" />
              <Skeleton className="h-64 rounded-2xl" />
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col gap-6"
            >
              {/* ── 1. Top Row Overview Hero Cards ── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Books & Manga Read */}
                <div className="bg-card/75 backdrop-blur-xl border border-border/50 rounded-2xl p-5 flex flex-col justify-between gap-3 shadow-xs hover:border-border transition-all">
                  <div className="w-10 h-10 rounded-xl bg-muted/60 flex items-center justify-center text-foreground">
                    <BookOpen size={20} />
                  </div>
                  <div>
                    <div className="text-3xl font-black tracking-tight text-foreground">{completedEntries}</div>
                    <div className="text-xs font-semibold text-muted-foreground mt-0.5">
                      {booksReadCount} books · {mangaReadCount} manga read
                    </div>
                  </div>
                </div>

                {/* Total Reading Time */}
                <div className="bg-card/75 backdrop-blur-xl border border-border/50 rounded-2xl p-5 flex flex-col justify-between gap-3 shadow-xs hover:border-border transition-all">
                  <div className="w-10 h-10 rounded-xl bg-muted/60 flex items-center justify-center text-foreground">
                    <LayoutGrid size={20} />
                  </div>
                  <div>
                    <div className="text-3xl font-black tracking-tight text-foreground">{formatDuration(readDurationSeconds)}</div>
                    <div className="text-xs font-semibold text-muted-foreground mt-0.5">Total reading time</div>
                  </div>
                </div>

                {/* Total Pages Read */}
                <div className="bg-card/75 backdrop-blur-xl border border-border/50 rounded-2xl p-5 flex flex-col justify-between gap-3 shadow-xs hover:border-border transition-all">
                  <div className="w-10 h-10 rounded-xl bg-muted/60 flex items-center justify-center text-foreground">
                    <Layers size={20} />
                  </div>
                  <div>
                    <div className="text-3xl font-black tracking-tight text-foreground">{totalPagesRead.toLocaleString()}</div>
                    <div className="text-xs font-semibold text-muted-foreground mt-0.5">
                      {bookPagesRead.toLocaleString()} book · {mangaPagesRead.toLocaleString()} manga pages
                    </div>
                  </div>
                </div>

                {/* Daily Average */}
                <div className="bg-card/75 backdrop-blur-xl border border-border/50 rounded-2xl p-5 flex flex-col justify-between gap-3 shadow-xs hover:border-border transition-all">
                  <div className="w-10 h-10 rounded-xl bg-muted/60 flex items-center justify-center text-foreground">
                    <TrendingUp size={20} />
                  </div>
                  <div>
                    <div className="text-3xl font-black tracking-tight text-foreground">{formatMinutes(dailyAverageSeconds)}</div>
                    <div className="text-xs font-semibold text-muted-foreground mt-0.5">Daily average</div>
                  </div>
                </div>
              </div>

              {/* ── 2. Last 30 Days Interactive Chart ── */}
              <div className="bg-card/75 backdrop-blur-xl border border-border/50 rounded-2xl p-6 shadow-xs overflow-hidden">
                <Last30DaysChart stats={allStats} />
              </div>

              {/* ── 3. Reading Activity GitHub-Style Heatmap Grid ── */}
              <div className="bg-card/75 backdrop-blur-xl border border-border/50 rounded-2xl p-6 shadow-xs flex flex-col gap-4">
                <div>
                  <h3 className="text-base font-bold text-foreground">Reading Activity</h3>
                  <p className="text-xs text-muted-foreground">Logged reading contributions over the last 365 days</p>
                </div>
                <ActivityHeatmap data={allStats} currentStreak={streak?.current_streak} />
              </div>

              {/* ── 4. Most Read Titles Showcase ── */}
              {topBookStats.length > 0 && (
                <div className="flex flex-col gap-3">
                  <h3 className="text-base font-bold text-foreground">Most Read Titles</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {topBookStats.map(({ book, stats: bStats }) => (
                      <div
                        key={book.id}
                        className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-card/75 hover:bg-card border border-border/50 hover:border-primary/40 transition-all shadow-xs"
                      >
                        <div className="relative w-12 h-16 rounded-xl overflow-hidden bg-muted/40 border border-border/40 shrink-0 shadow-xs">
                          <StatBookCover book={book} />
                        </div>
                        <div className="flex-1 min-w-0 space-y-1">
                          <h4 className="font-bold text-xs text-foreground truncate leading-tight" title={book.title}>
                            {book.title}
                          </h4>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {book.authors?.[0]?.name || 'Unknown'}
                          </p>
                          <div className="flex items-center gap-1.5 text-[11px] text-primary font-bold pt-0.5">
                            <Clock size={11} />
                            <span>{formatMinutes(bStats.total_seconds)} logged</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── 5. Library Metrics Grid (including Streak) ── */}
              <div className="bg-card/75 backdrop-blur-xl border border-border/50 rounded-2xl p-6 shadow-xs flex flex-col gap-4">
                <h3 className="text-base font-bold text-foreground">Library Overview</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                  <div className="bg-muted/30 border border-border/40 rounded-xl p-3 text-center">
                    <div className="text-lg font-extrabold text-foreground">{totalInLibrary}</div>
                    <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">In Library</div>
                  </div>
                  <div className="bg-muted/30 border border-border/40 rounded-xl p-3 text-center">
                    <div className="text-lg font-extrabold text-foreground">{streak?.current_streak || 0}d</div>
                    <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Streak</div>
                  </div>
                  <div className="bg-muted/30 border border-border/40 rounded-xl p-3 text-center">
                    <div className="text-lg font-extrabold text-foreground">{booksReadCount}</div>
                    <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Books Read</div>
                  </div>
                  <div className="bg-muted/30 border border-border/40 rounded-xl p-3 text-center">
                    <div className="text-lg font-extrabold text-foreground">{mangaReadCount}</div>
                    <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Manga Read</div>
                  </div>
                  <div className="bg-muted/30 border border-border/40 rounded-xl p-3 text-center">
                    <div className="text-lg font-extrabold text-foreground">{unreadEntries}</div>
                    <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Unread</div>
                  </div>
                  <div className="bg-muted/30 border border-border/40 rounded-xl p-3 text-center">
                    <div className="text-lg font-extrabold text-foreground">{meanScore}</div>
                    <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Mean Score</div>
                  </div>
                </div>
              </div>

            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
