import { useState, useEffect } from 'react';
import { api } from '@/lib/tauri';

export function useBookReadingTime(bookId: number) {
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [sessionsCount, setSessionsCount] = useState(0);

  useEffect(() => {
    let mounted = true;
    api.getBookReadingStats(bookId).then((stats) => {
      if (mounted) {
        setTotalSeconds(stats.total_seconds);
        setSessionsCount(stats.sessions_count);
      }
    }).catch(() => {});
    return () => { mounted = false; };
  }, [bookId]);

  useEffect(() => {
    const interval = setInterval(() => {
      api.getBookReadingStats(bookId).then((stats) => {
        setTotalSeconds(stats.total_seconds);
        setSessionsCount(stats.sessions_count);
      }).catch(() => {});
    }, 60_000);
    return () => clearInterval(interval);
  }, [bookId]);

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return 'Just started';
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  return {
    totalSeconds,
    sessionsCount,
    formattedTime: formatTime(totalSeconds),
  };
}