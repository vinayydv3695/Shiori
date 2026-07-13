import React, { useEffect, useState } from 'react';
import { getUserSocial, AnilistUserSocial } from '@/lib/anilist';
import { useAniListAccessToken } from '@/auth/useAniListAccessToken';
import { Skeleton } from '@/components/ui/skeleton';
import { motion } from 'framer-motion';

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, x: -10 },
  show: { opacity: 1, x: 0, transition: { duration: 0.4, ease: 'easeOut' } },
};

export function AniListUserSocialView({ userId }: { userId: number }) {
  const { token: anilistToken } = useAniListAccessToken();
  const [following, setFollowing] = useState<AnilistUserSocial[]>([]);
  const [followers, setFollowers] = useState<AnilistUserSocial[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!anilistToken) return;
      try {
        setLoading(true);
        const data = await getUserSocial(userId, anilistToken);
        setFollowing(data.following);
        setFollowers(data.followers);
      } catch (err) {
        console.error("Failed to load social:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [userId, anilistToken]);

  if (loading) {
    return (
      <div className="flex flex-col gap-8 pb-12 animate-in fade-in duration-300">
        {[1, 2].map((group) => (
          <div key={group}>
            <Skeleton className="h-4 w-32 mb-4" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 bg-secondary/5 p-3 rounded-xl border border-white/5">
                  <Skeleton className="w-12 h-12 rounded-full shrink-0" />
                  <Skeleton className="h-5 w-32" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="flex flex-col gap-8 pb-12">
      <motion.div variants={itemVariants}>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Following ({following.length})</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {following.length === 0 ? <p className="text-muted-foreground text-sm">Not following anyone.</p> : following.map(u => (
            <motion.div variants={itemVariants} key={u.id} className="flex items-center gap-3 bg-secondary/10 p-3 rounded-xl border border-border/20">
              <img src={u.avatar.large} alt={u.name} className="w-12 h-12 rounded-full object-cover" />
              <span className="font-medium text-foreground">{u.name}</span>
            </motion.div>
          ))}
        </div>
      </motion.div>
      
      <motion.div variants={itemVariants}>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Followers ({followers.length})</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {followers.length === 0 ? <p className="text-muted-foreground text-sm">No followers.</p> : followers.map(u => (
            <motion.div variants={itemVariants} key={u.id} className="flex items-center gap-3 bg-secondary/10 p-3 rounded-xl border border-border/20">
              <img src={u.avatar.large} alt={u.name} className="w-12 h-12 rounded-full object-cover" />
              <span className="font-medium text-foreground">{u.name}</span>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
