import { useState, useEffect, useCallback } from 'react';
import { api, isTauri } from '@/lib/tauri';
import type { DailyReadingStats, ReadingStreak, ReadingGoal } from '@/lib/tauri';
import { Loader2, X, RotateCw, BarChart2, CalendarDays, Flame, Trophy, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ActivityHeatmap } from './ActivityHeatmap';
import { ReadingCalendar } from './ReadingCalendar';
import { Button } from '../ui/button';

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

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!isTauri) {
        const dummyStats = [
          { date: '2023-10-01', total_seconds: 1200, books_count: 1, sessions_count: 1 },
          { date: '2023-10-02', total_seconds: 2400, books_count: 1, sessions_count: 2 },
          { date: '2023-10-03', total_seconds: 0, books_count: 0, sessions_count: 0 },
          { date: '2023-10-04', total_seconds: 3600, books_count: 2, sessions_count: 3 },
          { date: '2023-10-05', total_seconds: 1800, books_count: 1, sessions_count: 1 },
          { date: '2023-10-06', total_seconds: 4200, books_count: 1, sessions_count: 4 },
          { date: '2023-10-07', total_seconds: 900, books_count: 1, sessions_count: 1 },
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
      setError(err instanceof Error ? err.message : String(err));
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
      {/* Sticky Header matching the dialog vibe */}
      <div className="flex-none sticky top-0 z-10 bg-muted/20 border-b border-border backdrop-blur-md">
        <div className="max-w-6xl mx-auto flex items-center justify-between p-6">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 shadow-sm border border-primary/20">
              <BarChart2 className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Reading Statistics</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Track your reading progress and habits
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={loadData}
              disabled={loading}
              title="Refresh statistics"
              className="bg-background"
            >
              <RotateCw size={18} className={cn(loading && "animate-spin")} />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={onClose}
              title="Close statistics"
              className="bg-background"
            >
              <X size={18} />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-background">
        <div className="max-w-6xl mx-auto space-y-6 pb-20">
          {error ? (
            <div className="flex flex-col items-center justify-center py-20 bg-card rounded-xl border border-destructive/50 p-6 shadow-sm">
              <p className="text-destructive mb-4 font-medium">{error}</p>
              <Button onClick={loadData} variant="destructive">
                Retry
              </Button>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-32 text-muted-foreground">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-sm font-medium">Loading statistics...</p>
              </div>
            </div>
          ) : (
            <>
              {/* Stat Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-card/50 hover:bg-card border border-border rounded-xl p-5 transition-colors shadow-sm relative overflow-hidden group">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">Today's Reading</p>
                    <Clock className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <p className="text-3xl font-bold text-foreground tracking-tight">
                    {formatHoursMinutes(todaySeconds)}
                  </p>
                </div>

                <div className="bg-card border-2 border-primary/20 rounded-xl p-5 shadow-md relative overflow-hidden group">
                  <div className="absolute -right-6 -top-6 w-24 h-24 bg-primary/10 rounded-full blur-2xl pointer-events-none group-hover:bg-primary/20 transition-colors" />
                  <div className="flex items-center justify-between mb-4 relative z-10">
                    <p className="text-sm font-medium text-foreground">Current Streak</p>
                    <Flame className="w-4 h-4 text-primary animate-pulse" />
                  </div>
                  <div className="flex items-baseline gap-1.5 relative z-10">
                    <p className={cn(
                      "text-3xl font-bold tracking-tight",
                      (streak?.current_streak ?? 0) > 0 ? "text-primary" : "text-foreground"
                    )}>
                      {streak?.current_streak || 0}
                    </p>
                    <p className="text-sm font-medium text-muted-foreground">days</p>
                  </div>
                  {(streak?.current_streak ?? 0) > 0 && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-primary/50 via-primary to-primary/50" />
                  )}
                </div>

                <div className="bg-card/50 hover:bg-card border border-border rounded-xl p-5 transition-colors shadow-sm group">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">Longest Streak</p>
                    <Trophy className="w-4 h-4 text-muted-foreground group-hover:text-yellow-500 transition-colors" />
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <p className="text-3xl font-bold text-foreground tracking-tight">{streak?.longest_streak || 0}</p>
                    <p className="text-sm font-medium text-muted-foreground">days</p>
                  </div>
                </div>

                <div className="bg-card/50 hover:bg-card border border-border rounded-xl p-5 transition-colors shadow-sm group">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">Total Days</p>
                    <CalendarDays className="w-4 h-4 text-muted-foreground group-hover:text-blue-500 transition-colors" />
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <p className="text-3xl font-bold text-foreground tracking-tight">{streak?.total_reading_days || 0}</p>
                    <p className="text-sm font-medium text-muted-foreground">days</p>
                  </div>
                </div>
              </div>

              {/* Activity & Calendar Section */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-card border border-border rounded-xl p-6 shadow-sm overflow-hidden flex flex-col">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <CalendarDays className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-foreground">Reading Activity</h2>
                      <p className="text-sm text-muted-foreground">Your reading journey over the last 365 days</p>
                    </div>
                  </div>
                  <div className="bg-muted/10 rounded-lg p-6 border border-border/50 flex-1 flex items-center">
                    <ActivityHeatmap data={yearlyStats} />
                  </div>
                </div>

                <div className="bg-card border border-border rounded-xl p-6 shadow-sm overflow-hidden flex flex-col">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Clock className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-foreground">Monthly Calendar</h2>
                      <p className="text-sm text-muted-foreground">Your reading days</p>
                    </div>
                  </div>
                  <div className="bg-muted/10 rounded-lg p-4 border border-border/50 flex-1">
                    <ReadingCalendar data={yearlyStats} />
                  </div>
                </div>
              </div>

            </>
          )}
        </div>
      </div>
    </div>
  );
}

