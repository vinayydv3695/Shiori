import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  api, type Book, type ReadingProgress, type ReadingStreak, 
  type DailyReadingStats, type BookReadingStats 
} from '@/lib/tauri';
import { isMangaDomain } from '@/lib/utils';
import { useToastStore } from '@/store/toastStore';

export type FilterTab = 'all' | 'books' | 'manga' | 'in_progress' | 'completed';
export type SortOption = 'recent' | 'oldest' | 'progress' | 'title';
export type ViewMode = 'timeline' | 'grid';

export type TimelineBucket = 'Today' | 'Yesterday' | 'This Week' | 'Earlier this Month' | 'Past Months & Older';

export function getTimelineBucket(dateStr?: string | null): TimelineBucket {
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

export function formatDuration(totalSeconds: number) {
  const days = Math.floor(totalSeconds / (3600 * 24));
  const hours = Math.floor((totalSeconds % (3600 * 24)) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function formatMinutes(seconds: number) {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export function useHistoryData() {
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

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
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

      const bookIds = fetchedBooks.map(b => b.id).filter(Boolean) as number[];
      if (bookIds.length > 0) {
        const pMap = await api.getReadingProgressBatch(bookIds).catch(() => ({}));
        setProgressMap(pMap);

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

  return {
    books,
    progressMap,
    bookStatsMap,
    streak,
    todaySeconds,
    dailyStats30d,
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
    miniHeatmapDays,
    filteredAndSortedBooks,
    timelineGroups,
  };
}
