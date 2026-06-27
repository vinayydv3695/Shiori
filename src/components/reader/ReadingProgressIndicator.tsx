import { useEffect, useState } from 'react';
import { api } from '@/lib/tauri';
import { Clock } from '@/components/icons';
import type { BookReadingStats } from '@/lib/tauri';

interface ReadingProgressIndicatorProps {
  bookId: number;
  progressPercentage: number;
  isVisible?: boolean;
}

export function ReadingProgressIndicator({ bookId, progressPercentage, isVisible = true }: ReadingProgressIndicatorProps) {
  const [initialStats, setInitialStats] = useState<BookReadingStats | null>(null);
  const [sessionMinutes, setSessionMinutes] = useState(0);

  useEffect(() => {
    let mounted = true;
    
    // Fetch initial reading time
    api.getBookReadingStats(bookId)
      .then(stats => {
        if (mounted) setInitialStats(stats);
      })
      .catch(() => {});
      
    // Simple interval to increment session time every minute
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        setSessionMinutes(m => m + 1);
      }
    }, 60000);
    
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [bookId]);
  
  if (!isVisible) return null;
  
  // Calculate total minutes
  const totalMinutes = Math.floor(((initialStats?.total_seconds || 0) / 60) + sessionMinutes);
  
  return (
    <div className="premium-reading-progress-indicator">
      <Clock className="premium-progress-icon" />
      <span className="premium-progress-time">{totalMinutes}m</span>
      <span className="premium-progress-separator">•</span>
      <span className="premium-progress-percent">{Math.round(progressPercentage)}%</span>
    </div>
  );
}
