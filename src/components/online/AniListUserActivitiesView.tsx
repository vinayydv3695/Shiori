import React, { useEffect, useState } from 'react';
import { 
  Clock, CheckCircle2, BookOpen, Bookmark, XCircle, PauseCircle, 
  Activity, MessageSquare 
} from 'lucide-react';
import { getUserActivities, AnilistActivity } from '@/lib/anilist';
import { useAniListAccessToken } from '@/auth/useAniListAccessToken';
import { Skeleton } from '@/components/ui/skeleton';
import { motion } from 'framer-motion';

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' as const } },
};

function formatActivityDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return `Yesterday • ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  if (diffDays < 7) return `${diffDays}d ago • ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

  return date.toLocaleDateString(undefined, { 
    month: 'short', 
    day: 'numeric', 
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined 
  }) + ` • ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function getActivityMeta(status?: string, progress?: string) {
  const s = (status || '').toLowerCase();
  
  if (s.includes('completed')) {
    return {
      label: 'Completed',
      badgeClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
      iconClass: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/40 ring-2 ring-emerald-500/10',
      Icon: CheckCircle2,
    };
  }
  if (s.includes('read') || s.includes('watched') || s.includes('chapter')) {
    const chapterText = progress ? `Chapter ${progress}` : '';
    return {
      label: chapterText ? `Read ${chapterText}` : 'Read Chapter',
      badgeClass: 'bg-primary/15 text-primary border-primary/30',
      iconClass: 'bg-primary/20 text-primary border-primary/40 ring-2 ring-primary/10',
      Icon: BookOpen,
    };
  }
  if (s.includes('plan') || s.includes('planning')) {
    return {
      label: 'Plans to Read',
      badgeClass: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30',
      iconClass: 'bg-sky-500/20 text-sky-600 dark:text-sky-400 border-sky-500/40 ring-2 ring-sky-500/10',
      Icon: Bookmark,
    };
  }
  if (s.includes('drop')) {
    return {
      label: 'Dropped',
      badgeClass: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30',
      iconClass: 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/40 ring-2 ring-rose-500/10',
      Icon: XCircle,
    };
  }
  if (s.includes('pause') || s.includes('hold')) {
    return {
      label: 'On Hold',
      badgeClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
      iconClass: 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/40 ring-2 ring-amber-500/10',
      Icon: PauseCircle,
    };
  }

  return {
    label: status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Activity',
    badgeClass: 'bg-secondary text-foreground border-border/60',
    iconClass: 'bg-secondary text-primary border-border/60 ring-2 ring-primary/10',
    Icon: Activity,
  };
}

export function AniListUserActivitiesView({ userId }: { userId: number }) {
  const { token: anilistToken } = useAniListAccessToken();
  const [activities, setActivities] = useState<AnilistActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!anilistToken) return;
      try {
        setLoading(true);
        const data = await getUserActivities(userId, anilistToken);
        setActivities(data);
      } catch (err) {
        console.error("Failed to load activities:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [userId, anilistToken]);

  if (loading) {
    return (
      <div className="flex flex-col gap-4 pb-12 animate-in fade-in duration-300">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex gap-4 items-center bg-secondary/30 p-4 rounded-2xl border border-border/50">
            <Skeleton className="w-16 h-22 rounded-xl shrink-0" />
            <div className="flex-1 space-y-2.5">
              <Skeleton className="h-4 w-28 rounded-full" />
              <Skeleton className="h-5 w-3/4 rounded-md" />
              <Skeleton className="h-3.5 w-36 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <motion.div initial="hidden" animate="show" variants={itemVariants} className="text-center py-14 bg-secondary/30 rounded-2xl border border-border/50 shadow-xs">
        <Activity className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
        <p className="text-muted-foreground font-medium">No recent activity found on AniList.</p>
      </motion.div>
    );
  }

  return (
    <motion.div 
      variants={containerVariants} 
      initial="hidden" 
      animate="show" 
      className="flex flex-col gap-3.5 pb-12 relative"
    >
      {activities.map((a) => {
        const meta = getActivityMeta(a.status, a.progress);
        const IconComponent = meta.Icon;

        return (
          <motion.div 
            variants={itemVariants} 
            key={a.id} 
            className="group relative flex items-center gap-4 bg-secondary/40 hover:bg-secondary/70 border border-border/60 hover:border-primary/40 rounded-2xl p-3.5 sm:p-4 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 shadow-xs"
          >
            {/* Manga Cover Image */}
            {a.media ? (
              <div className="relative aspect-[2/3] w-14 sm:w-16 h-20 sm:h-24 rounded-xl overflow-hidden shrink-0 border border-border/50 shadow-xs bg-muted">
                <img 
                  src={a.media.coverImage.large} 
                  alt={a.media.title.romaji} 
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                />
              </div>
            ) : (
              <div className="flex items-center justify-center w-14 h-20 rounded-xl bg-secondary border border-border/50 text-muted-foreground shrink-0">
                <MessageSquare className="w-6 h-6 text-primary/70" />
              </div>
            )}

            {/* Activity Content */}
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
              {/* Status Badge & Icon Row */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] sm:text-xs font-bold border ${meta.badgeClass}`}>
                  <IconComponent className="w-3 h-3 shrink-0" />
                  {meta.label}
                </span>

                <span className="text-xs text-muted-foreground flex items-center gap-1 font-medium ml-auto">
                  <Clock className="w-3 h-3 text-muted-foreground/70" />
                  {formatActivityDate(a.createdAt)}
                </span>
              </div>

              {/* Title / Description */}
              {a.media ? (
                <h3 className="text-sm sm:text-base font-extrabold text-foreground group-hover:text-primary transition-colors line-clamp-1 tracking-tight mt-0.5">
                  {a.media.title.english || a.media.title.romaji}
                </h3>
              ) : (
                <p className="text-sm font-medium text-foreground line-clamp-2 mt-0.5">
                  {a.text}
                </p>
              )}

              {/* Optional Progress Details */}
              {a.media && a.progress && (
                <p className="text-xs text-muted-foreground font-mono font-semibold">
                  Progress: Chapter {a.progress}
                </p>
              )}
            </div>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
