import { useState, useEffect, useCallback } from 'react';
import { api, isTauri } from '@/lib/tauri';
import type { DailyReadingStats, ReadingStreak, ReadingGoal } from '@/lib/tauri';
import { logger } from '@/lib/logger';
import { Loader2, X, RotateCw } from '@/components/icons';
import { cn } from '@/lib/utils';
interface StatisticsViewProps {
  onClose: () => void;
}

import { ActivityHeatmap } from './ActivityHeatmap';

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

  const goalMinutes = goal?.daily_minutes_target || 30;
  const todayMinutes = Math.floor(todaySeconds / 60);
  const goalProgress = Math.min(100, Math.round((todayMinutes / goalMinutes) * 100)) || 0;

  return (
    <div className="flex flex-col h-full bg-background text-foreground overflow-hidden">
      <div className="flex-none p-6 border-b border-border">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Reading Statistics</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Track your reading progress and habits
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors disabled:opacity-50"
              title="Refresh statistics"
            >
              <RotateCw size={20} className={cn(loading && "animate-spin")} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
              title="Close statistics"
            >
              <X size={20} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 bg-background">
        <div className="max-w-5xl mx-auto space-y-6 pb-20">
          {error ? (
            <div className="flex flex-col items-center justify-center py-20 bg-card rounded-xl border border-destructive/50 p-6">
              <p className="text-destructive mb-4">{error}</p>
              <button
                type="button"
                onClick={loadData}
                className="px-4 py-2 bg-destructive/10 text-destructive rounded-md hover:bg-destructive/20 transition-colors"
              >
                Retry
              </button>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-card border border-border rounded-xl p-4 md:p-6 shadow-sm">
                  <p className="text-sm font-medium text-muted-foreground mb-1">Today's Reading</p>
                  <p className="text-2xl font-bold text-foreground">
                    {formatHoursMinutes(todaySeconds)}
                  </p>
                </div>
                <div className="bg-card border border-border rounded-xl p-4 md:p-6 shadow-sm relative overflow-hidden">
                  <div className="absolute -right-4 -top-4 w-16 h-16 bg-orange-500/20 rounded-full blur-2xl pointer-events-none" />
                  <p className="text-sm font-medium text-muted-foreground mb-1 relative z-10">Current Streak</p>
                  <div className="flex items-baseline gap-1.5 relative z-10">
                    <p className={cn(
                      "text-2xl font-bold",
                      (streak?.current_streak ?? 0) > 0
                        ? "text-orange-500"
                        : "text-foreground"
                    )}>
                      {streak?.current_streak || 0}
                    </p>
                    <p className="text-sm text-muted-foreground">days</p>
                  </div>
                  {(streak?.current_streak ?? 0) > 0 && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-orange-400 via-red-400 to-yellow-400" />
                  )}
                </div>
                <div className="bg-card border border-border rounded-xl p-4 md:p-6 shadow-sm">
                  <p className="text-sm font-medium text-muted-foreground mb-1">Longest Streak</p>
                  <div className="flex items-baseline gap-1">
                    <p className="text-2xl font-bold text-foreground">{streak?.longest_streak || 0}</p>
                    <p className="text-sm text-muted-foreground">days</p>
                  </div>
                </div>
                <div className="bg-card border border-border rounded-xl p-4 md:p-6 shadow-sm">
                  <p className="text-sm font-medium text-muted-foreground mb-1">Total Days</p>
                  <div className="flex items-baseline gap-1">
                    <p className="text-2xl font-bold text-foreground">{streak?.total_reading_days || 0}</p>
                    <p className="text-sm text-muted-foreground">days</p>
                  </div>
                </div>
              </div>

              <div className="bg-card border border-border rounded-xl p-4 md:p-6 shadow-sm">
                <div className="mb-6">
                  <h2 className="text-lg font-semibold text-foreground">Reading Activity</h2>
                  <p className="text-sm text-muted-foreground">Last 365 Days</p>
                </div>
                <ActivityHeatmap data={yearlyStats} />
              </div>


            </>
          )}
        </div>
      </div>
    </div>
  );
}
