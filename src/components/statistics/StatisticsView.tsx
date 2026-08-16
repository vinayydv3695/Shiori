import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { api, isTauri } from '@/lib/tauri';
import type { DailyReadingStats, ReadingStreak, ReadingGoal, Book, BookReadingStats } from '@/lib/tauri';
import { 
  X, RotateCw, Library, Clock, BookCheck,
  BookDashed, PlayCircle, HardDrive,
  Layers, BookText, Image as ImageIcon,
  Activity, Star, Link2, Trophy, CheckCircle2,
  TrendingUp, BookOpen, ChevronRight, BarChart3
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ActivityHeatmap } from './ActivityHeatmap';
import { ReadingCalendar } from './ReadingCalendar';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { motion } from 'framer-motion';
import { useLibraryStore } from '@/store/libraryStore';
import { Input } from '../ui/input';
import { convertFileSrc } from '@tauri-apps/api/core';
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

const StatSection = ({ title, children }: { title: string, children: React.ReactNode }) => (
  <div className="flex flex-col gap-2.5">
    <h3 className="text-xs font-extrabold text-muted-foreground uppercase tracking-widest ml-1">{title}</h3>
    <div className="bg-card/75 backdrop-blur-2xl border border-border/50 rounded-2xl p-4 grid grid-cols-3 gap-3 shadow-xs">
      {children}
    </div>
  </div>
);

const StatItem = ({ label, value, icon: Icon, iconColor }: { label: string, value: React.ReactNode, icon: any, iconColor?: string }) => (
  <div className="bg-secondary/25 hover:bg-secondary/55 border border-border/40 rounded-xl p-3.5 flex flex-col items-center justify-center text-center gap-2 transition-all duration-200 hover:scale-[1.02] shadow-xs group">
    <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center transition-all group-hover:scale-110 shadow-xs bg-primary/10 text-primary", iconColor)}>
      <Icon size={16} />
    </div>
    <div className="text-xl md:text-2xl font-extrabold text-foreground tracking-tight leading-none">{value}</div>
    <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider line-clamp-1">{label}</div>
  </div>
);

export interface WeekBarDatum {
  date: string;
  label: string;
  seconds: number;
  pages: number;
  secondsPct: number;
  pagesPct: number;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const toDateStr = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export function buildWeeklyBars(stats: DailyReadingStats[], now: Date = new Date()): WeekBarDatum[] {
  const byDate = new Map(stats.map(s => [s.date, s]));
  const days: Omit<WeekBarDatum, 'secondsPct' | 'pagesPct'>[] = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = toDateStr(d);
    const stat = byDate.get(key);
    days.push({
      date: key,
      label: d.toLocaleDateString(undefined, { weekday: 'short' }),
      seconds: stat?.total_seconds ?? 0,
      pages: (stat?.book_pages_read ?? 0) + (stat?.manga_pages_read ?? 0),
    });
  }

  const maxSeconds = Math.max(0, ...days.map(d => d.seconds));
  const maxPages = Math.max(0, ...days.map(d => d.pages));

  return days.map(d => ({
    ...d,
    secondsPct: maxSeconds > 0 ? Math.round((d.seconds / maxSeconds) * 100) : 0,
    pagesPct: maxPages > 0 ? Math.round((d.pages / maxPages) * 100) : 0,
  }));
}

const formatMinutes = (seconds: number) => {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
};

/** Interactive weekly trend chart with hover tooltips */
export function WeeklyTrendChart({ data }: { data: DailyReadingStats[] }) {
  const bars = useMemo(() => buildWeeklyBars(data), [data]);
  const hasAny = bars.some(b => b.seconds > 0 || b.pages > 0);

  if (!hasAny) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
        <Activity className="w-10 h-10 mb-2.5 opacity-30 text-primary animate-pulse" />
        <p className="text-sm font-bold text-foreground">No reading recorded this week</p>
        <p className="text-xs text-muted-foreground mt-1">Your daily pages and reading time will appear here automatically.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3 h-40 pt-6 px-2">
        {bars.map(b => (
          <div key={b.date} className="flex-1 flex flex-col items-center gap-2 h-full justify-end min-w-0 group relative">
            
            {/* Interactive Floating Tooltip */}
            <div className="absolute -top-10 opacity-0 group-hover:opacity-100 transition-all duration-200 bg-popover text-popover-foreground text-[10px] font-bold py-1 px-2.5 rounded-xl border border-border/80 shadow-xl pointer-events-none z-30 whitespace-nowrap text-center">
              <div className="text-primary">{b.pages} pages read</div>
              <div className="text-muted-foreground">{formatMinutes(b.seconds)} read time</div>
            </div>

            <div className="flex items-end justify-center gap-1.5 w-full flex-1 relative">
              {/* Pages Read Bar */}
              <div
                className="w-3 md:w-4 rounded-t-lg bg-gradient-to-t from-primary/50 to-primary transition-all duration-500 shadow-xs group-hover:brightness-110"
                style={{ height: `${b.pages > 0 ? Math.max(8, b.pagesPct) : 0}%` }}
              />
              {/* Reading Time Bar */}
              <div
                className="w-3 md:w-4 rounded-t-lg bg-gradient-to-t from-primary/20 to-primary/40 transition-all duration-500 shadow-xs group-hover:brightness-110"
                style={{ height: `${b.seconds > 0 ? Math.max(8, b.secondsPct) : 0}%` }}
              />
            </div>
            <span className="text-[11px] text-muted-foreground font-bold tracking-tight group-hover:text-foreground transition-colors truncate">
              {b.label}
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-center gap-6 text-xs font-semibold text-muted-foreground pt-2 border-t border-border/30">
        <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-md bg-gradient-to-t from-primary/50 to-primary shadow-xs" />Pages read</span>
        <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-md bg-gradient-to-t from-primary/20 to-primary/40 shadow-xs" />Reading time</span>
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
  const books = useLibraryStore(s => s.books);
  
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

      const [stats, currentStreak, currentGoal] = await Promise.all([
        api.getDailyReadingStats(3650),
        api.getReadingStreak(),
        api.getReadingGoal()
      ]);

      setAllStats(stats);
      setStreak(currentStreak);
      setGoal(currentGoal);

      // Fetch stats for top recent books to showcase
      const candidateBooks = books.slice(0, 15);
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
  }, [books]);

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

  const unreadEntries = books.filter(b => b.reading_status === 'unread' || !b.reading_status).length;
  const startedEntries = books.filter(b => b.reading_status === 'reading').length;
  const localEntries = books.filter(b => b.domain === 'local').length;

  const totalPagesRead = allStats.reduce((sum, stat) => sum + (stat.book_pages_read || 0) + (stat.manga_pages_read || 0), 0);
  const isManga = (b: Book) => ['cbz', 'zip', 'cbr'].includes(b.file_format?.toLowerCase());
  const booksReadCount = books.filter(b => b.reading_status === 'completed' && !isManga(b)).length;
  const mangaReadCount = books.filter(b => b.reading_status === 'completed' && isManga(b)).length;

  const trackedEntries = books.filter(b => b.anilist_id).length;
  const booksWithScore = books.filter(b => b.rating && b.rating > 0);
  const meanScore = booksWithScore.length > 0 
    ? (booksWithScore.reduce((sum, b) => sum + (b.rating || 0), 0) / booksWithScore.length).toFixed(2) 
    : "0";
  const usedTrackers = books.some(b => b.anilist_id) ? 1 : 0;

  // Daily goal calculation
  const { success: showGoalToast } = useToast();
  const todayStr = toDateStr(new Date());
  const todaySeconds = allStats.find(s => s.date === todayStr)?.total_seconds ?? 0;
  const goalMinutes = goal?.daily_minutes_target ?? 0;
  const goalActive = goal?.is_active !== false;
  const goalReached = goalActive && goalMinutes > 0 && todaySeconds >= goalMinutes * 60;
  const dailyProgressPct = goalMinutes > 0 ? Math.min(100, Math.round((todaySeconds / (goalMinutes * 60)) * 100)) : 0;

  useEffect(() => {
    if (!goalReached) return;
    const storageKey = `shiori:daily-goal-reached:${todayStr}`;
    try {
      if (localStorage.getItem(storageKey) === '1') return;
      localStorage.setItem(storageKey, '1');
    } catch {
      // Storage unavailable
    }
    showGoalToast('Daily goal reached!', `You read ${Math.round(todaySeconds / 60)} minutes today.`);
  }, [goalReached, todayStr, goalMinutes, todaySeconds, showGoalToast]);

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-hidden">
      
      {/* ── Top Header Bar ── */}
      <div className="flex-none sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border/40">
        <div className="max-w-6xl mx-auto flex items-center justify-between p-4 md:p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-xs">
              <BarChart3 size={20} />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-extrabold text-foreground tracking-tight">Statistics</h1>
              <p className="text-xs text-muted-foreground">Detailed reading insights and habits</p>
            </div>

            {/* Minimal Badges in Header */}
            <div className="hidden sm:flex items-center gap-2.5 ml-4">
              {isEditingGoal ? (
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-card border border-primary/40 rounded-full shadow-xs">
                  <Trophy size={13} className="text-primary" />
                  <Input 
                    autoFocus
                    type="number" 
                    className="w-12 h-5 text-xs bg-transparent border-none p-0 focus-visible:ring-0 text-center font-bold text-foreground" 
                    value={newGoalInput}
                    onChange={e => setNewGoalInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleUpdateGoal()}
                    onBlur={() => setTimeout(() => setIsEditingGoal(false), 100)}
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setNewGoalInput(goal?.yearly_books_target?.toString() || "20");
                    setIsEditingGoal(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1 bg-card/80 hover:bg-card border border-border/50 hover:border-primary/40 rounded-full text-xs font-bold text-muted-foreground hover:text-foreground cursor-pointer transition-colors shadow-xs"
                  title="Yearly Reading Goal (Click to edit)"
                >
                  <Trophy size={13} className="text-primary" />
                  <span>{booksReadThisYear} / {goal?.yearly_books_target || 20}</span>
                </button>
              )}
              
              <div 
                className="flex items-center px-3 py-1 bg-card/80 border border-border/50 rounded-full text-xs font-bold text-muted-foreground shadow-xs"
                title={`Current Streak: ${streak?.current_streak || 0} days`}
              >
                <span>{streak?.current_streak || 0}d streak</span>
              </div>

              {goalReached && (
                <div 
                  className="flex items-center gap-1.5 px-3 py-1 bg-primary/10 border border-primary/25 rounded-full text-xs font-bold text-primary shadow-xs"
                  title={`Daily goal reached — ${goalMinutes} min read today`}
                >
                  <CheckCircle2 size={13} />
                  <span>Goal reached</span>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                variant="ghost"
                size="icon"
                onClick={loadData}
                disabled={loading}
                title="Refresh statistics"
                className="text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-full"
              >
                <RotateCw size={18} className={cn(loading && "animate-spin")} />
              </Button>
            </motion.div>
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                title="Close statistics"
                className="text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-full"
              >
                <X size={18} />
              </Button>
            </motion.div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 lg:p-8 bg-background">
        <div className="max-w-6xl mx-auto space-y-6 pb-20">

          {error ? (
            <div className="flex flex-col items-center justify-center py-10 bg-card rounded-2xl border border-destructive/50 p-6 shadow-xs">
              <p className="text-destructive mb-4 font-medium">{error}</p>
              <Button onClick={loadData} variant="destructive">
                Retry
              </Button>
            </div>
          ) : loading ? (
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              className="space-y-6"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="flex flex-col gap-2">
                    <Skeleton className="h-4 w-20 ml-1" />
                    <Skeleton className="h-24 w-full rounded-xl" />
                  </div>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
              className="flex flex-col gap-6"
            >
              {/* 4-section grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <StatSection title="Overview">
                  <StatItem 
                    label="In library" 
                    value={totalInLibrary} 
                    icon={Library} 
                    iconColor="text-primary" 
                  />
                  <StatItem 
                    label="Read duration" 
                    value={formatDuration(readDurationSeconds)} 
                    icon={Clock} 
                    iconColor="text-primary" 
                  />
                  <StatItem 
                    label="Completed entries" 
                    value={completedEntries} 
                    icon={BookCheck} 
                    iconColor="text-primary" 
                  />
                </StatSection>

                <StatSection title="Entries">
                  <StatItem 
                    label="Unread" 
                    value={unreadEntries} 
                    icon={BookDashed} 
                    iconColor="text-muted-foreground" 
                  />
                  <StatItem 
                    label="Started" 
                    value={startedEntries} 
                    icon={PlayCircle} 
                    iconColor="text-muted-foreground" 
                  />
                  <StatItem 
                    label="Local" 
                    value={localEntries} 
                    icon={HardDrive} 
                    iconColor="text-muted-foreground" 
                  />
                </StatSection>

                <StatSection title="Reading">
                  <StatItem 
                    label="Total Pages Read" 
                    value={totalPagesRead.toLocaleString()} 
                    icon={Layers} 
                    iconColor="text-muted-foreground" 
                  />
                  <StatItem 
                    label="Books Read" 
                    value={booksReadCount} 
                    icon={BookText} 
                    iconColor="text-muted-foreground" 
                  />
                  <StatItem 
                    label="Manga Read" 
                    value={mangaReadCount} 
                    icon={ImageIcon} 
                    iconColor="text-muted-foreground" 
                  />
                </StatSection>

                <StatSection title="Trackers">
                  <StatItem 
                    label="Tracked entries" 
                    value={trackedEntries} 
                    icon={Activity} 
                    iconColor="text-muted-foreground" 
                  />
                  <StatItem 
                    label="Mean score" 
                    value={meanScore} 
                    icon={Star} 
                    iconColor="text-muted-foreground" 
                  />
                  <StatItem 
                    label="Used" 
                    value={usedTrackers} 
                    icon={Link2} 
                    iconColor="text-muted-foreground" 
                  />
                </StatSection>
              </div>

              {/* ── Top Read Books Showcase ── */}
              {topBookStats.length > 0 && (
                <div className="flex flex-col gap-2.5">
                  <h3 className="text-xs font-extrabold text-muted-foreground uppercase tracking-widest ml-1">
                    Most Read Titles
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
                    {topBookStats.map(({ book, stats: bStats }) => {
                      return (
                        <div
                          key={book.id}
                          className="flex items-center gap-3.5 p-3 rounded-2xl bg-card/75 hover:bg-card border border-border/50 hover:border-primary/40 transition-all shadow-xs"
                        >
                          <div className="relative w-14 h-20 rounded-xl overflow-hidden bg-muted/40 border border-border/40 shrink-0 shadow-xs">
                            <StatBookCover book={book} />
                          </div>
                          <div className="flex-1 min-w-0 space-y-1">
                            <h4 className="font-extrabold text-xs text-foreground truncate leading-tight" title={book.title}>
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
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Weekly Trend with Interactive Bar Tooltips */}
              <div className="flex flex-col gap-2">
                <h3 className="text-xs font-extrabold text-muted-foreground uppercase tracking-widest ml-1">Weekly Trend</h3>
                <div className="bg-card/75 backdrop-blur-md border border-border/50 rounded-2xl p-4 shadow-xs">
                  <WeeklyTrendChart data={allStats} />
                </div>
              </div>

              {/* Activity & Calendar Section */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 flex flex-col">
                  <div className="mb-4">
                    <h2 className="text-lg font-bold text-foreground tracking-tight">Reading Activity</h2>
                    <p className="text-xs text-muted-foreground">Your journey over the last 365 days</p>
                  </div>
                  <div className="flex-1 flex items-center bg-card/75 p-4 rounded-2xl border border-border/50 shadow-xs">
                    <ActivityHeatmap data={allStats} currentStreak={streak?.current_streak} />
                  </div>
                </div>

                <div className="flex flex-col">
                  <div className="mb-4">
                    <h2 className="text-lg font-bold text-foreground tracking-tight">Monthly Overview</h2>
                    <p className="text-xs text-muted-foreground">Days active</p>
                  </div>
                  <div className="flex-1 bg-card/75 p-4 rounded-2xl border border-border/50 shadow-xs">
                    <ReadingCalendar data={allStats} />
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
