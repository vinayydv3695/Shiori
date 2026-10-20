import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  BookOpen,
  BarChart2,
  History,
  NotebookPen,
  Rss,
  Trash2,
  Settings,
  Moon,
  Sun,
  ChevronRight,
} from 'lucide-react';
import { AniListIcon, TorboxIcon } from '@/components/icons';
import { usePreferencesStore } from '@/store/preferencesStore';
import { useTorboxStore } from '@/store/useTorboxStore';
import { useTheme } from '@/hooks/useTheme';
import { IS_STORE_BUILD } from '@/lib/storeConfig';
import type { CurrentView } from '@/store/uiStore';
import { cn } from '@/lib/utils';

export interface MoreViewProps {
  onNavigateToView: (view: CurrentView) => void;
  onOpenSettings: () => void;
}

interface MoreItem {
  id: string;
  label: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  bgClass: string;
  iconClass: string;
  onClick: () => void;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.05,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 14, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring' as const, stiffness: 380, damping: 26 },
  },
};

export function MoreView({ onNavigateToView, onOpenSettings }: MoreViewProps) {
  const preferredContentType = usePreferencesStore((s) => s.preferences?.preferredContentType);
  const hasTorboxKey = useTorboxStore((s) => s.hasApiKey);
  const { isDark, toggleTheme } = useTheme();

  // Curated, 9 core library & extension tools (forms a clean 3x3 grid)
  // Designed with theme-matched antique ink tones on soft warm translucent paper discs
  const moreItems = useMemo(() => {
    const items: MoreItem[] = [
      {
        id: 'shelves',
        label: 'Bookshelf',
        subtitle: 'Shelves',
        icon: BookOpen,
        bgClass: 'bg-[#8C3A27]/10 dark:bg-[#E07A5F]/15 border border-[#8C3A27]/25 dark:border-[#E07A5F]/30 shadow-xs',
        iconClass: 'text-[#8C3A27] dark:text-[#E07A5F]',
        onClick: () => onNavigateToView('shelves'),
      },
      {
        id: 'statistics',
        label: 'Statistics',
        subtitle: 'Insights',
        icon: BarChart2,
        bgClass: 'bg-[#9E6D18]/10 dark:bg-[#E5B558]/15 border border-[#9E6D18]/25 dark:border-[#E5B558]/30 shadow-xs',
        iconClass: 'text-[#9E6D18] dark:text-[#E5B558]',
        onClick: () => onNavigateToView('statistics'),
      },
      {
        id: 'history',
        label: 'History',
        subtitle: 'Timeline',
        icon: History,
        bgClass: 'bg-[#2D6646]/10 dark:bg-[#64B584]/15 border border-[#2D6646]/25 dark:border-[#64B584]/30 shadow-xs',
        iconClass: 'text-[#2D6646] dark:text-[#64B584]',
        onClick: () => onNavigateToView('history'),
      },
      {
        id: 'annotations',
        label: 'Annotations',
        subtitle: 'Notes',
        icon: NotebookPen,
        bgClass: 'bg-[#1F6472]/10 dark:bg-[#56B3C2]/15 border border-[#1F6472]/25 dark:border-[#56B3C2]/30 shadow-xs',
        iconClass: 'text-[#1F6472] dark:text-[#56B3C2]',
        onClick: () => onNavigateToView('annotations'),
      },
      {
        id: 'rss',
        label: 'RSS Feeds',
        subtitle: 'News',
        icon: Rss,
        bgClass: 'bg-[#A34E17]/10 dark:bg-[#EF8E4E]/15 border border-[#A34E17]/25 dark:border-[#EF8E4E]/30 shadow-xs',
        iconClass: 'text-[#A34E17] dark:text-[#EF8E4E]',
        onClick: () => onNavigateToView('rss-articles'),
      },
      {
        id: 'dark-mode',
        label: 'Dark mode',
        subtitle: isDark ? 'On' : 'Off',
        icon: isDark ? Sun : Moon,
        bgClass: 'bg-[#52497B]/10 dark:bg-[#A397D6]/15 border border-[#52497B]/25 dark:border-[#A397D6]/30 shadow-xs',
        iconClass: 'text-[#52497B] dark:text-[#A397D6]',
        onClick: () => toggleTheme(),
      },
    ];

    // AniList Tracker (manga/both modes)
    if (preferredContentType !== 'books') {
      items.push({
        id: 'anilist',
        label: 'AniList',
        subtitle: 'Tracker',
        icon: AniListIcon,
        bgClass: 'bg-[#22537A]/10 dark:bg-[#6CAEE0]/15 border border-[#22537A]/25 dark:border-[#6CAEE0]/30 shadow-xs',
        iconClass: 'text-[#22537A] dark:text-[#6CAEE0]',
        onClick: () => onNavigateToView('anilist'),
      });
    }

    // Torbox Cloud Debrid (non-store builds)
    if (!IS_STORE_BUILD) {
      items.push({
        id: 'torbox',
        label: 'Torbox',
        subtitle: hasTorboxKey ? 'Connected' : 'Discover',
        icon: TorboxIcon,
        bgClass: 'bg-[#6A3479]/10 dark:bg-[#C27DD7]/15 border border-[#6A3479]/25 dark:border-[#C27DD7]/30 shadow-xs',
        iconClass: 'text-[#6A3479] dark:text-[#C27DD7]',
        onClick: () => onNavigateToView('torbox-discover'),
      });
    }

    // Trash / Recycle Bin
    items.push({
      id: 'trash',
      label: 'Trash',
      subtitle: 'Bin',
      icon: Trash2,
      bgClass: 'bg-[#912930]/10 dark:bg-[#E56F77]/15 border border-[#912930]/25 dark:border-[#E56F77]/30 shadow-xs',
      iconClass: 'text-[#912930] dark:text-[#E56F77]',
      onClick: () => onNavigateToView('recycle-bin'),
    });

    // Settings
    items.push({
      id: 'settings',
      label: 'Settings',
      subtitle: 'Preferences',
      icon: Settings,
      bgClass: 'bg-[#4A443B]/10 dark:bg-[#D1C7B8]/15 border border-[#4A443B]/25 dark:border-[#D1C7B8]/30 shadow-xs',
      iconClass: 'text-[#4A443B] dark:text-[#D1C7B8]',
      onClick: onOpenSettings,
    });

    return items;
  }, [preferredContentType, hasTorboxKey, isDark, toggleTheme, onNavigateToView, onOpenSettings]);

  return (
    <div className="min-h-screen bg-background text-foreground select-none">
      {/* ── 2-COLUMN CIRCULAR ICON GRID SECTION (Header removed per user request) ── */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-2 gap-y-7 gap-x-6 px-6 max-w-sm mx-auto w-full"
        style={{
          paddingTop: 'max(32px, env(safe-area-inset-top, 24px))',
          paddingBottom: 'calc(100px + env(safe-area-inset-bottom, 24px))',
        }}
      >
        {moreItems.map((item) => {
          const Icon = item.icon;
          return (
            <motion.button
              key={item.id}
              variants={itemVariants}
              type="button"
              onClick={item.onClick}
              className="flex flex-col items-center justify-center group cursor-pointer active:scale-95 transition-transform py-1"
            >
              {/* Premium Tonal Theme-Matched Circle Bubble */}
              <div
                className={cn(
                  'w-[74px] h-[74px] sm:w-20 sm:h-20 rounded-full flex items-center justify-center transition-all duration-200 group-hover:scale-105 active:scale-90',
                  item.bgClass
                )}
              >
                <Icon className={cn('w-7 h-7 sm:w-8 sm:h-8 stroke-[2.2] transition-colors', item.iconClass)} />
              </div>

              {/* Primary Label */}
              <span className="text-sm font-bold text-foreground tracking-tight mt-2.5 text-center">
                {item.label}
              </span>

              {/* Subtitle / Status */}
              <span className="text-xs font-medium text-muted-foreground mt-0.5 text-center">
                {item.subtitle}
              </span>
            </motion.button>
          );
        })}
      </motion.div>
    </div>
  );
}
