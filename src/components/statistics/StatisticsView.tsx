import { useState, useEffect, useCallback } from 'react';
import { api, isTauri } from '@/lib/tauri';
import type { DailyReadingStats, ReadingStreak, ReadingGoal } from '@/lib/tauri';
import { Loader2, X, RotateCw, BarChart2, CalendarDays, Flame, Trophy, Clock, BookOpen, Image, BookText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ActivityHeatmap } from './ActivityHeatmap';
import { ReadingCalendar } from './ReadingCalendar';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { motion, Variants } from 'framer-motion';
import { useLibraryStore } from '@/store/libraryStore';
import { Input } from '../ui/input';
import { toast } from 'sonner';

interface StatisticsViewProps {
  onClose: () => void;
}



export function StatisticsView({ onClose }: StatisticsViewProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [yearlyStats, setYearlyStats] = useState<DailyReadingStats[]>([]);
  const [streak, setStreak] = useState<ReadingStreak | null>(null);
  const [goal, setGoal] = useState<ReadingGoal | null>(null);
  const [todaySeconds, setTodaySeconds] = useState(0);
  const books = useLibraryStore(s => s.books);
  
  const [isEditingGoal, setIsEditingGoal] = useState(false);
  const [newGoalInput, setNewGoalInput] = useState("");

  const currentYear = new Date().getFullYear();
  const booksReadThisYear = books.filter(b => {
    if (b.reading_status !== 'completed') return false;
    // Fallback to added_date if modified_date is not available or if last_opened isn't there
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
        setYearlyStats(dummyStats);
        setStreak({ current_streak: 4, longest_streak: 12, total_reading_days: 45 });
        setGoal({ daily_minutes_target: 30, is_active: true, created_at: '', updated_at: '' });
        setTodaySeconds(900);
        setLoading(false);
        return;
      }

      const [stats, currentStreak, currentGoal, todayTime] = await Promise.all([
        api.getDailyReadingStats(365),
        api.getReadingStreak(),
        api.getReadingGoal(),
        api.getTodayReadingTime()
      ]);

      setYearlyStats(stats);
      setStreak(currentStreak);
      setGoal(currentGoal);
      setTodaySeconds(todayTime);
    } catch (err) {
      setError(err instanceof Error ? err.message : (typeof err === 'object' ? JSON.stringify(err) : String(err)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const formatHoursMinutes = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-hidden">
      <div className="flex-none sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border/40">
        <div className="max-w-5xl mx-auto flex items-center justify-between p-6">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-2xl font-light text-foreground tracking-tight">Reading Statistics</h1>
              <p className="text-sm text-muted-foreground mt-1">
                A minimal overview of your reading habits
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
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

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-background">
        <div className="max-w-5xl mx-auto space-y-6 pb-20 pt-4">
          {error ? (
            <div className="flex flex-col items-center justify-center py-20 bg-card rounded-xl border border-destructive/50 p-6 shadow-sm">
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
              <div className="flex flex-col md:flex-row items-start gap-12 md:gap-20 border-b border-border/40 pb-10 mb-10">
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-12 w-48 mt-1" />
                </div>
                <div className="flex flex-col gap-2 flex-1 max-w-sm w-full">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-12 w-48 mt-1" />
                  <div className="mt-2 space-y-3">
                    <Skeleton className="h-1 w-full rounded-full" />
                    <div className="flex items-center gap-6">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-4 w-20" />
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-12 w-40 mt-1" />
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                <div className="lg:col-span-2 flex flex-col gap-6">
                  <div>
                    <Skeleton className="h-6 w-48 mb-2" />
                    <Skeleton className="h-4 w-64" />
                  </div>
                  <Skeleton className="h-64 w-full rounded-xl" />
                </div>
                <div className="flex flex-col gap-6">
                  <div>
                    <Skeleton className="h-6 w-48 mb-2" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                  <Skeleton className="h-64 w-full rounded-xl" />
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
            >
              {/* Minimalist Stat Row */}
              <div className="flex flex-col md:flex-row items-start gap-12 md:gap-20 border-b border-border/40 pb-10 mb-10">
                
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-semibold text-muted-foreground tracking-widest uppercase">Today's Reading</p>
                  <p className="text-5xl font-light text-foreground tracking-tight">
                    {formatHoursMinutes(todaySeconds)}
                  </p>
                </div>

                <div className="flex flex-col gap-2 flex-1 max-w-sm">
                  <p className="text-xs font-semibold text-muted-foreground tracking-widest uppercase">Total Pages Read</p>
                  <p className="text-5xl font-light text-foreground tracking-tight">
                    {yearlyStats.reduce((sum, stat) => sum + (stat.book_pages_read || 0) + (stat.manga_pages_read || 0), 0).toLocaleString()}
                  </p>
                  
                  {(() => {
                    const books = yearlyStats.reduce((sum, stat) => sum + (stat.book_pages_read || 0), 0);
                    const manga = yearlyStats.reduce((sum, stat) => sum + (stat.manga_pages_read || 0), 0);
                    const total = books + manga;
                    const bookPct = total === 0 ? 0 : (books / total) * 100;
                    const mangaPct = total === 0 ? 0 : (manga / total) * 100;
                    
                    return (
                      <div className="mt-2 space-y-3">
                        <div className="h-1 w-full bg-muted overflow-hidden rounded-full flex">
                          {total > 0 ? (
                            <>
                              <div className="h-full bg-primary" style={{ width: `${bookPct}%` }} />
                              <div className="h-full bg-muted-foreground/30" style={{ width: `${mangaPct}%` }} />
                            </>
                          ) : (
                            <div className="h-full bg-muted-foreground/10 w-full" />
                          )}
                        </div>
                        <div className="flex items-center gap-6 text-sm">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-primary" />
                            <span className="text-muted-foreground">Books: <span className="text-foreground font-medium">{books.toLocaleString()}</span></span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-muted-foreground/30" />
                            <span className="text-muted-foreground">Manga: <span className="text-foreground font-medium">{manga.toLocaleString()}</span></span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <div className="flex flex-col gap-2">
                  <p className="text-xs font-semibold text-muted-foreground tracking-widest uppercase">Current Streak</p>
                  <div className="flex items-baseline gap-2">
                    <p className="text-5xl font-light text-foreground tracking-tight">
                      {streak?.current_streak || 0}
                    </p>
                    <span className="text-sm font-medium text-muted-foreground">
                      / {streak?.longest_streak || 0} best
                    </span>
                  </div>
                  {streak && streak.current_streak > 0 && (
                    <div className="flex items-center gap-1.5 mt-1 text-orange-500 font-medium text-sm bg-orange-500/10 w-fit px-2 py-0.5 rounded-md">
                      <Flame size={14} className="animate-pulse" />
                      <span>{streak.current_streak} Day Streak</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <p className="text-xs font-semibold text-muted-foreground tracking-widest uppercase">Yearly Goal ({currentYear})</p>
                  {goal?.yearly_books_target ? (
                    <div className="group cursor-pointer" onClick={() => {
                      setNewGoalInput(goal.yearly_books_target?.toString() || "");
                      setIsEditingGoal(true);
                    }}>
                      {isEditingGoal ? (
                        <div className="flex items-center gap-2 mt-1">
                          <Input 
                            autoFocus
                            type="number" 
                            className="w-20 h-10 text-lg bg-background" 
                            value={newGoalInput}
                            onChange={e => setNewGoalInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleUpdateGoal()}
                            onBlur={() => setIsEditingGoal(false)}
                          />
                          <Button size="sm" onClick={handleUpdateGoal}>Save</Button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-baseline gap-2">
                            <p className="text-5xl font-light text-foreground tracking-tight group-hover:text-primary transition-colors">
                              {booksReadThisYear}
                            </p>
                            <span className="text-sm font-medium text-muted-foreground">
                              / {goal.yearly_books_target} books
                            </span>
                          </div>
                          
                          <div className="mt-4 space-y-2">
                            <div className="h-1.5 w-full bg-muted overflow-hidden rounded-full flex">
                              <div 
                                className="h-full bg-primary transition-all duration-1000 ease-out" 
                                style={{ width: `${Math.min(100, (booksReadThisYear / goal.yearly_books_target) * 100)}%` }} 
                              />
                            </div>
                            <p className="text-[10px] text-muted-foreground font-medium text-right">
                              {Math.round((booksReadThisYear / goal.yearly_books_target) * 100)}% Completed
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="mt-2">
                      {isEditingGoal ? (
                        <div className="flex items-center gap-2">
                          <Input 
                            autoFocus
                            type="number" 
                            placeholder="e.g. 50"
                            className="w-24 h-10 text-sm bg-background" 
                            value={newGoalInput}
                            onChange={e => setNewGoalInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleUpdateGoal()}
                            onBlur={() => setTimeout(() => setIsEditingGoal(false), 100)}
                          />
                          <Button size="sm" onClick={handleUpdateGoal}>Set</Button>
                        </div>
                      ) : (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="h-10 border-dashed hover:border-solid hover:bg-primary/5"
                          onClick={() => {
                            setNewGoalInput("50");
                            setIsEditingGoal(true);
                          }}
                        >
                          <Trophy size={14} className="mr-2 text-yellow-500" />
                          Set {currentYear} Goal
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                
                
              </div>

              {/* Activity & Calendar Section - Cleaned up */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                <div className="lg:col-span-2 flex flex-col">
                  <div className="mb-6">
                    <h2 className="text-lg font-medium text-foreground tracking-tight">Reading Activity</h2>
                    <p className="text-sm text-muted-foreground">Your journey over the last 365 days</p>
                  </div>
                  <div className="flex-1 flex items-center">
                    <ActivityHeatmap data={yearlyStats} currentStreak={streak?.current_streak} />
                  </div>
                </div>

                <div className="flex flex-col">
                  <div className="mb-6">
                    <h2 className="text-lg font-medium text-foreground tracking-tight">Monthly Overview</h2>
                    <p className="text-sm text-muted-foreground">Days active</p>
                  </div>
                  <div className="flex-1">
                    <ReadingCalendar data={yearlyStats} />
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

