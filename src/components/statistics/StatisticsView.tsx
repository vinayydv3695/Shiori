import { useState, useEffect, useCallback } from 'react';
import { api, isTauri } from '@/lib/tauri';
import type { DailyReadingStats, ReadingStreak, ReadingGoal } from '@/lib/tauri';
import { Loader2, X, RotateCw, Check, Edit2 } from '@/components/icons';
import { cn } from '@/lib/utils';
import { WeeklyChart } from './WeeklyChart';

interface StatisticsViewProps {
  onClose: () => void;
}

export function StatisticsView({ onClose }: StatisticsViewProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [weeklyStats, setWeeklyStats] = useState<DailyReadingStats[]>([]);
  const [streak, setStreak] = useState<ReadingStreak | null>(null);
  const [goal, setGoal] = useState<ReadingGoal | null>(null);
  const [todaySeconds, setTodaySeconds] = useState(0);

  const [isEditingGoal, setIsEditingGoal] = useState(false);
  const [tempGoalMinutes, setTempGoalMinutes] = useState(0);
  const [savingGoal, setSavingGoal] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!isTauri) {
        setWeeklyStats([
          { date: '2023-10-01', total_seconds: 1200, books_count: 1, sessions_count: 1 },
          { date: '2023-10-02', total_seconds: 2400, books_count: 1, sessions_count: 2 },
          { date: '2023-10-03', total_seconds: 0, books_count: 0, sessions_count: 0 },
          { date: '2023-10-04', total_seconds: 3600, books_count: 2, sessions_count: 3 },
          { date: '2023-10-05', total_seconds: 1800, books_count: 1, sessions_count: 1 },
          { date: '2023-10-06', total_seconds: 4200, books_count: 1, sessions_count: 4 },
          { date: '2023-10-07', total_seconds: 900, books_count: 1, sessions_count: 1 },
        ]);
        setStreak({ current_streak: 4, longest_streak: 12, total_reading_days: 45 });
        setGoal({ daily_minutes_target: 30, is_active: true, created_at: '', updated_at: '' });
        setTodaySeconds(900);
        setLoading(false);
        return;
      }

      const [stats, currentStreak, currentGoal, todayTime] = await Promise.all([
        api.getDailyReadingStats(7),
        api.getReadingStreak(),
        api.getReadingGoal(),
        api.getTodayReadingTime()
      ]);

      setWeeklyStats(stats);
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

  const handleSaveGoal = async () => {
    if (tempGoalMinutes <= 0) return;
    setSavingGoal(true);
    try {
      if (!isTauri) {
        setGoal({ daily_minutes_target: tempGoalMinutes, is_active: true, created_at: '', updated_at: '' });
      } else {
        const updatedGoal = await api.updateReadingGoal(tempGoalMinutes);
        setGoal(updatedGoal);
      }
      setIsEditingGoal(false);
    } catch (err) {
      console.error('Failed to update goal', err);
    } finally {
      setSavingGoal(false);
    }
  };

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
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 overflow-hidden">
      <div className="flex-none p-6 border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Reading Statistics</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Track your reading progress and habits
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={loadData}
              disabled={loading}
              className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors disabled:opacity-50"
              title="Refresh statistics"
            >
              <RotateCw size={20} className={cn(loading && "animate-spin")} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
              title="Close statistics"
            >
              <X size={20} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50 dark:bg-gray-950">
        <div className="max-w-5xl mx-auto space-y-6 pb-20">
          {error ? (
            <div className="flex flex-col items-center justify-center py-20 bg-white dark:bg-gray-900 rounded-xl border border-red-200 dark:border-red-900/50 p-6">
              <p className="text-red-500 dark:text-red-400 mb-4">{error}</p>
              <button
                onClick={loadData}
                className="px-4 py-2 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-md hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
              >
                Retry
              </button>
            </div>
          ) : loading && !weeklyStats.length ? (
            <div className="flex items-center justify-center py-20 text-gray-500">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 md:p-6 shadow-sm">
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Today's Reading</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {formatHoursMinutes(todaySeconds)}
                  </p>
                </div>
                <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 md:p-6 shadow-sm relative overflow-hidden">
                  <div className="absolute -right-4 -top-4 w-16 h-16 bg-orange-100 dark:bg-orange-900/20 rounded-full blur-2xl pointer-events-none" />
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1 relative z-10">Current Streak</p>
                  <div className="flex items-baseline gap-1.5 relative z-10">
                    <p className={cn(
                      "text-2xl font-bold",
                      (streak?.current_streak ?? 0) > 0
                        ? "text-orange-600 dark:text-orange-400"
                        : "text-gray-900 dark:text-gray-100"
                    )}>
                      {streak?.current_streak || 0}
                    </p>
                    <p className="text-sm text-gray-500">days</p>
                  </div>
                  {(streak?.current_streak ?? 0) > 0 && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-orange-400 via-red-400 to-yellow-400" />
                  )}
                </div>
                <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 md:p-6 shadow-sm">
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Longest Streak</p>
                  <div className="flex items-baseline gap-1">
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{streak?.longest_streak || 0}</p>
                    <p className="text-sm text-gray-500">days</p>
                  </div>
                </div>
                <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 md:p-6 shadow-sm">
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Total Days</p>
                  <div className="flex items-baseline gap-1">
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{streak?.total_reading_days || 0}</p>
                    <p className="text-sm text-gray-500">days</p>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 md:p-6 shadow-sm">
                <div className="mb-6">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Reading Time</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Last 7 Days</p>
                </div>
                <WeeklyChart data={weeklyStats} />
              </div>

              <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 md:p-6 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Daily Goal</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Track your daily reading habit</p>
                  </div>
                  {isEditingGoal ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        max="1440"
                        value={tempGoalMinutes}
                        onChange={(e) => setTempGoalMinutes(Number(e.target.value))}
                        className="w-24 px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      />
                      <span className="text-sm text-gray-500">min</span>
                      <button
                        onClick={handleSaveGoal}
                        disabled={savingGoal}
                        className="ml-2 p-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-colors disabled:opacity-50 flex items-center justify-center"
                      >
                        {savingGoal ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => setIsEditingGoal(false)}
                        disabled={savingGoal}
                        className="p-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-md transition-colors disabled:opacity-50"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-gray-900 dark:text-gray-100">{goalMinutes} minutes/day</span>
                      <button
                        onClick={() => {
                          setTempGoalMinutes(goalMinutes);
                          setIsEditingGoal(true);
                        }}
                        className="p-1.5 text-gray-400 hover:text-blue-500 bg-gray-50 hover:bg-blue-50 dark:bg-gray-800 dark:hover:bg-blue-900/30 rounded-md transition-colors"
                        title="Edit goal"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="relative pt-1">
                  <div className="flex mb-2 items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-blue-600 bg-blue-100 dark:text-blue-200 dark:bg-blue-900/50">
                        {goalProgress >= 100 ? 'Goal Reached!' : 'In Progress'}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-semibold inline-block text-blue-600 dark:text-blue-400">
                        {todayMinutes} of {goalMinutes} minutes today
                      </span>
                    </div>
                  </div>
                  <div className="overflow-hidden h-2 mb-4 text-xs flex rounded-full bg-blue-100 dark:bg-gray-800">
                    <div
                      style={{ width: `${goalProgress}%` }}
                      className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-blue-500 transition-all duration-500"
                    ></div>
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
