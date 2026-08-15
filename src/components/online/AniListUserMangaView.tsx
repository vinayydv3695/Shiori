import React, { useEffect, useState } from 'react';
import { BookOpen } from 'lucide-react';
import { getMediaListShelf, AnilistMediaListShelf } from '@/lib/anilist';
import { useAniListAccessToken } from '@/auth/useAniListAccessToken';
import { Skeleton } from '@/components/ui/skeleton';
import { motion } from 'framer-motion';

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } },
};

export function AniListUserMangaView({ userId }: { userId: number }) {
  const { token: anilistToken } = useAniListAccessToken();
  const [shelf, setShelf] = useState<AnilistMediaListShelf | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!anilistToken) return;
      try {
        setLoading(true);
        const data = await getMediaListShelf(userId, anilistToken);
        setShelf(data);
      } catch (err) {
        console.error("Failed to load manga lists:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [userId, anilistToken]);

  if (loading) {
    return (
      <div className="flex flex-col gap-8 pb-12 animate-in fade-in duration-300">
        {[1, 2].map((i) => (
          <div key={i} className="space-y-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-8 rounded-full" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {[...Array(5)].map((_, j) => (
                <Skeleton key={j} className="aspect-[2/3] w-full rounded-xl" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!shelf || shelf.lists.length === 0) {
    return (
      <motion.div initial="hidden" animate="show" variants={itemVariants} className="text-center py-12 bg-secondary/30 rounded-2xl border border-border/50 shadow-xs">
        <BookOpen className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
        <p className="text-muted-foreground font-medium">You don't have any manga in your lists yet.</p>
      </motion.div>
    );
  }

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="flex flex-col gap-6 pb-12">
      {shelf.lists.map(list => (
        <div key={list.name} className="space-y-3">
          <motion.div variants={itemVariants} className="flex items-center gap-2.5">
            <h3 className="font-extrabold text-base text-foreground tracking-tight">{list.name}</h3>
            <span className="bg-primary/10 text-primary border border-primary/20 text-xs px-2.5 py-0.5 rounded-full font-bold font-mono">
              {list.entries.length}
            </span>
          </motion.div>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
            {list.entries.slice(0, 10).map(entry => (
              <motion.div variants={itemVariants} key={entry.id} className="group relative aspect-[2/3] rounded-2xl overflow-hidden cursor-pointer bg-secondary/30 shadow-xs border border-border/40 hover:border-primary/50 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
                <img src={entry.media.coverImage.large} alt={entry.media.title.romaji} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent flex flex-col justify-end p-3 opacity-100">
                  <h4 className="font-bold text-white text-xs line-clamp-2 leading-snug mb-1">{entry.media.title.english || entry.media.title.romaji}</h4>
                  <div className="flex items-center justify-between text-[10px] font-bold text-white/90 font-mono">
                    <span>Ch. {entry.progress}{entry.media.chapters ? ` / ${entry.media.chapters}` : ''}</span>
                    {entry.score > 0 && <span className="text-amber-400">★ {entry.score}</span>}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
          {list.entries.length > 10 && (
            <p className="text-xs text-muted-foreground font-medium italic">+ {list.entries.length - 10} more in your main dashboard</p>
          )}
        </div>
      ))}
    </motion.div>
  );
}
