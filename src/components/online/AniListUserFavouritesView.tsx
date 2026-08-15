import React, { useEffect, useState } from 'react';
import { Heart } from 'lucide-react';
import { getUserFavourites, AnilistFavourite } from '@/lib/anilist';
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

export function AniListUserFavouritesView({ userId }: { userId: number }) {
  const { token: anilistToken } = useAniListAccessToken();
  const [favourites, setFavourites] = useState<AnilistFavourite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!anilistToken) return;
      try {
        setLoading(true);
        const data = await getUserFavourites(userId, anilistToken);
        setFavourites(data);
      } catch (err) {
        console.error("Failed to load favourites:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [userId, anilistToken]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 pb-12 animate-in fade-in duration-300">
        {[...Array(10)].map((_, i) => (
          <Skeleton key={i} className="aspect-[2/3] w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (favourites.length === 0) {
    return (
      <motion.div initial="hidden" animate="show" variants={itemVariants} className="text-center py-12 bg-secondary/30 rounded-2xl border border-border/50 shadow-xs">
        <Heart className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
        <p className="text-muted-foreground font-medium">You don't have any favourite manga yet.</p>
      </motion.div>
    );
  }

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5 pb-12">
      {favourites.map(f => (
        <motion.div variants={itemVariants} key={f.id} className="group relative aspect-[2/3] rounded-2xl overflow-hidden cursor-pointer bg-secondary/30 shadow-xs border border-border/40 hover:border-primary/50 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
          <img src={f.coverImage.large} alt={f.title.romaji} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent flex flex-col justify-end p-3 opacity-90 group-hover:opacity-100 transition-opacity">
            <h4 className="font-bold text-white text-xs sm:text-sm line-clamp-2 leading-snug">{f.title.english || f.title.romaji}</h4>
          </div>
          <div className="absolute top-2 right-2 bg-black/60 p-1.5 rounded-full backdrop-blur-md shadow-xs">
            <Heart className="w-3.5 h-3.5 fill-primary text-primary" />
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
}
