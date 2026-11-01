import React, { useState, useEffect, useMemo } from 'react';
import { motion, type Variants } from 'framer-motion';
import {
  BarChart2,
  History,
  NotebookPen,
  Rss,
  Trash2,
  Settings,
  Moon,
  Sun,
  TrendingUp,
  Library,
  Timer,
  HardDrive,
  RefreshCw,
  ChevronRight,
} from 'lucide-react';
import { AniListIcon, TorboxIcon, BookshelfIcon } from '@/components/icons';
import { usePreferencesStore } from '@/store/preferencesStore';
import { useTorboxStore } from '@/store/useTorboxStore';
import { useLibraryStore } from '@/store/libraryStore';
import { useTheme } from '@/hooks/useTheme';
import { IS_STORE_BUILD } from '@/lib/storeConfig';
import { api, isTauri, type ReadingStreak } from '@/lib/tauri';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { CurrentView } from '@/store/uiStore';

export interface MoreViewProps {
  onNavigateToView: (view: CurrentView) => void;
  onOpenSettings: () => void;
}

interface MoreCardItem {
  id: string;
  label: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  onClick: () => void;
}

interface MoreCardSection {
  id: string;
  title: string;
  items: MoreCardItem[];
}

const triggerHaptic = (ms = 25) => {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(ms);
    } catch {
      // Ignore vibration errors on unsupported platforms
    }
  }
};

const pad2 = (n: number) => String(n).padStart(2, '0');
const getTodayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 MB';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${Math.round(mb)} MB`;
}

function formatMinutes(seconds: number): string {
  if (!seconds || seconds <= 0) return '0m';
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.03,
      delayChildren: 0.02,
    },
  },
};

const sectionVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.2, ease: 'easeOut' },
  },
};

export function MoreView({ onNavigateToView, onOpenSettings }: MoreViewProps) {
  const preferredContentType = usePreferencesStore((s) => s.preferences?.preferredContentType);
  const hasTorboxKey = useTorboxStore((s) => s.hasApiKey);
  const totalCount = useLibraryStore((s) => s.totalCount || s.books.length);
  const { isDark, toggleTheme } = useTheme();

  // Snapshot and storage state
  const [streak, setStreak] = useState<ReadingStreak | null>(null);
  const [todaySeconds, setTodaySeconds] = useState(0);
  const [storageBytes, setStorageBytes] = useState(0);
  const [isClearingCache, setIsClearingCache] = useState(false);

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      try {
        const todayStr = getTodayStr();
        const [libStats, userStreak, dailyStats] = await Promise.all([
          api.getLibraryStats().catch(() => null),
          api.getReadingStreak().catch(() => null),
          api.getDailyReadingStats(7).catch(() => []),
        ]);

        if (!active) return;
        if (libStats) setStorageBytes(libStats.total_size_bytes);
        if (userStreak) setStreak(userStreak);
        if (dailyStats && dailyStats.length > 0) {
          const todayStat = dailyStats.find((s) => s.date === todayStr);
          if (todayStat) setTodaySeconds(todayStat.total_seconds);
        }
      } catch {
        // Ignore background stat load failures
      }
    };

    void loadData();

    return () => {
      active = false;
    };
  }, []);

  const handleClearCache = async () => {
    triggerHaptic(30);
    setIsClearingCache(true);
    try {
      if (isTauri) {
        await Promise.all([
          api.clearOnlineCache('images').catch(() => {}),
          api.clearOnlineCache('source').catch(() => {}),
        ]);
      }
      toast.success('Cache cleaned successfully');
    } catch {
      toast.error('Failed to clean cache');
    } finally {
      setIsClearingCache(false);
    }
  };

  const sections = useMemo<MoreCardSection[]>(() => {
    // 1. Reading & Library tools
    const readingItems: MoreCardItem[] = [
      {
        id: 'shelves',
        label: 'Bookshelves',
        subtitle: 'Collections',
        icon: BookshelfIcon,
        onClick: () => onNavigateToView('shelves'),
      },
      {
        id: 'statistics',
        label: 'Statistics',
        subtitle: 'Insights',
        icon: BarChart2,
        onClick: () => onNavigateToView('statistics'),
      },
      {
        id: 'history',
        label: 'History',
        subtitle: 'Activity',
        icon: History,
        onClick: () => onNavigateToView('history'),
      },
      {
        id: 'annotations',
        label: 'Annotations',
        subtitle: 'Notes & quotes',
        icon: NotebookPen,
        onClick: () => onNavigateToView('annotations'),
      },
    ];

    // 2. Extensions & Discovery
    const extensionItems: MoreCardItem[] = [
      {
        id: 'rss',
        label: 'RSS Feeds',
        subtitle: 'Articles',
        icon: Rss,
        onClick: () => onNavigateToView('rss-articles'),
      },
    ];

    if (preferredContentType !== 'books') {
      extensionItems.push({
        id: 'anilist',
        label: 'AniList',
        subtitle: 'Tracker',
        icon: AniListIcon,
        onClick: () => onNavigateToView('anilist'),
      });
    }

    if (!IS_STORE_BUILD) {
      extensionItems.push({
        id: 'torbox',
        label: 'Torbox',
        subtitle: hasTorboxKey ? 'Connected' : 'Cloud debrid',
        badge: hasTorboxKey ? 'Active' : undefined,
        icon: TorboxIcon,
        onClick: () => onNavigateToView('torbox-discover'),
      });
    }

    // 3. App & System preferences
    const systemItems: MoreCardItem[] = [
      {
        id: 'dark-mode',
        label: 'Dark Mode',
        subtitle: isDark ? 'On' : 'Off',
        icon: isDark ? Sun : Moon,
        onClick: () => {
          triggerHaptic(30);
          toggleTheme();
        },
      },
      {
        id: 'settings',
        label: 'Settings',
        subtitle: 'Preferences',
        icon: Settings,
        onClick: onOpenSettings,
      },
      {
        id: 'trash',
        label: 'Recycle Bin',
        subtitle: 'Trash',
        icon: Trash2,
        onClick: () => onNavigateToView('recycle-bin'),
      },
    ];

    const result: MoreCardSection[] = [
      {
        id: 'reading',
        title: 'Reading & Library',
        items: readingItems,
      },
    ];

    if (extensionItems.length > 0) {
      result.push({
        id: 'extensions',
        title: 'Extensions',
        items: extensionItems,
      });
    }

    result.push({
      id: 'system',
      title: 'App & System',
      items: systemItems,
    });

    return result;
  }, [preferredContentType, hasTorboxKey, isDark, toggleTheme, onNavigateToView, onOpenSettings]);

  return (
    <div className="min-h-screen bg-background text-foreground select-none overflow-y-auto custom-scrollbar">
      {/* ── 2-COLUMN SPACIOUS NATIVE CARDS ── */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="px-4 sm:px-6 max-w-md sm:max-w-lg mx-auto w-full space-y-4 pt-1"
        style={{
          paddingTop: 'max(24px, env(safe-area-inset-top, 16px))',
          paddingBottom: 'calc(100px + env(safe-area-inset-bottom, 24px))',
        }}
      >
        {sections.map((section) => (
          <motion.div key={section.id} variants={sectionVariants} className="space-y-1.5">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/75 px-1.5">
              {section.title}
            </h2>

            <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
              {section.items.map((item, idx) => {
                const Icon = item.icon;
                const isOddLast = idx === section.items.length - 1 && section.items.length % 2 === 1;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      triggerHaptic(25);
                      item.onClick();
                    }}
                    className={cn(
                      'flex items-center gap-3 sm:gap-3.5 p-3.5 sm:p-4 rounded-2xl transition-all duration-150 text-left cursor-pointer group',
                      'bg-card dark:bg-card/90',
                      'border border-border/60 dark:border-border/40',
                      'shadow-[0_2px_8px_rgba(0,0,0,0.03),0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-[0_3px_12px_rgba(0,0,0,0.35)]',
                      'hover:bg-secondary/40 active:bg-secondary/70 active:scale-[0.98]',
                      isOddLast ? 'col-span-2' : 'col-span-1'
                    )}
                  >
                    {/* Native Theme Squircle Icon with Tactile Depth */}
                    <div
                      className={cn(
                        'w-11 h-11 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105',
                        'bg-secondary/80 dark:bg-secondary/60 text-foreground',
                        'border border-border/50 dark:border-border/40',
                        'shadow-[inset_0_1.5px_1px_rgba(255,255,255,0.5),0_1px_3px_rgba(0,0,0,0.06)] dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.08),0_2px_6px_rgba(0,0,0,0.4)]'
                      )}
                    >
                      <Icon className="w-5 h-5 sm:w-[22px] sm:h-[22px] stroke-[2.2]" />
                    </div>

                    {/* Typography */}
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-[13.5px] sm:text-sm font-bold text-foreground tracking-tight truncate">
                        {item.label}
                      </span>
                      <span className="text-[11px] font-medium text-muted-foreground/80 truncate mt-0.5">
                        {item.subtitle}
                      </span>
                    </div>

                    {/* Optional Trailing Badge */}
                    {item.badge && (
                      <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>
        ))}

        {/* ── 1. QUICK READING SNAPSHOT WIDGET ── */}
        <motion.div variants={sectionVariants} className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between px-1.5">
            <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/75">
              Reading Snapshot
            </h2>
            <button
              type="button"
              onClick={() => {
                triggerHaptic(20);
                onNavigateToView('statistics');
              }}
              className="text-[11px] font-semibold text-primary hover:underline cursor-pointer flex items-center gap-0.5"
            >
              Details
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              triggerHaptic(25);
              onNavigateToView('statistics');
            }}
            className="w-full p-4 rounded-2xl bg-card dark:bg-card/90 border border-border/60 dark:border-border/40 shadow-[0_2px_8px_rgba(0,0,0,0.03),0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-[0_3px_12px_rgba(0,0,0,0.35)] hover:bg-secondary/40 active:bg-secondary/70 active:scale-[0.985] transition-all cursor-pointer text-left group"
          >
            <div className="grid grid-cols-3 divide-x divide-border/40 text-center">
              {/* Daily Streak */}
              <div className="flex flex-col items-center justify-center px-1">
                <div className="flex items-center gap-1.5 text-muted-foreground/90 mb-1">
                  <TrendingUp className="w-3.5 h-3.5 text-primary stroke-[2.2]" />
                  <span className="text-[11px] font-bold uppercase tracking-wide">Streak</span>
                </div>
                <span className="text-base sm:text-lg font-black text-foreground tracking-tight">
                  {streak?.current_streak ? `${streak.current_streak}d` : '0d'}
                </span>
              </div>

              {/* Library Count */}
              <div className="flex flex-col items-center justify-center px-1">
                <div className="flex items-center gap-1.5 text-muted-foreground/90 mb-1">
                  <Library className="w-3.5 h-3.5 text-primary stroke-[2.2]" />
                  <span className="text-[11px] font-bold uppercase tracking-wide">Library</span>
                </div>
                <span className="text-base sm:text-lg font-black text-foreground tracking-tight">
                  {totalCount}
                </span>
              </div>

              {/* Reading Time Today */}
              <div className="flex flex-col items-center justify-center px-1">
                <div className="flex items-center gap-1.5 text-muted-foreground/90 mb-1">
                  <Timer className="w-3.5 h-3.5 text-primary stroke-[2.2]" />
                  <span className="text-[11px] font-bold uppercase tracking-wide">Today</span>
                </div>
                <span className="text-base sm:text-lg font-black text-foreground tracking-tight">
                  {formatMinutes(todaySeconds)}
                </span>
              </div>
            </div>
          </button>
        </motion.div>

        {/* ── 2. STORAGE & CACHE GLANCE CARD ── */}
        <motion.div variants={sectionVariants} className="space-y-1.5 pt-1">
          <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/75 px-1.5">
            Storage &amp; Cache
          </h2>

          <div className="flex items-center justify-between p-3.5 sm:p-4 rounded-2xl bg-card dark:bg-card/90 border border-border/60 dark:border-border/40 shadow-[0_2px_8px_rgba(0,0,0,0.03),0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-[0_3px_12px_rgba(0,0,0,0.35)]">
            <div className="flex items-center gap-3 sm:gap-3.5 min-w-0">
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0 bg-secondary/80 dark:bg-secondary/60 text-foreground border border-border/50 dark:border-border/40 shadow-[inset_0_1.5px_1px_rgba(255,255,255,0.5),0_1px_3px_rgba(0,0,0,0.06)] dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.08),0_2px_6px_rgba(0,0,0,0.4)]">
                <HardDrive className="w-5 h-5 sm:w-[22px] sm:h-[22px] stroke-[2.2]" />
              </div>

              <div className="flex flex-col min-w-0">
                <span className="text-[13.5px] sm:text-sm font-bold text-foreground tracking-tight">
                  Library Storage
                </span>
                <span className="text-[11px] font-medium text-muted-foreground/80 truncate mt-0.5">
                  {formatBytes(storageBytes)} used
                </span>
              </div>
            </div>

            {/* Quick Action: Clean Cache */}
            <button
              type="button"
              onClick={handleClearCache}
              disabled={isClearingCache}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-secondary/80 hover:bg-secondary text-foreground text-xs font-semibold border border-border/50 active:scale-95 transition-all cursor-pointer disabled:opacity-60 shrink-0"
            >
              <RefreshCw className={cn('w-3.5 h-3.5 text-primary', isClearingCache && 'animate-spin')} />
              <span>{isClearingCache ? 'Cleaning...' : 'Clean Cache'}</span>
            </button>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}