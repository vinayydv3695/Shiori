import React, { useEffect, useState } from 'react';
import { Star, Edit3, MessageCircle } from 'lucide-react';
import { getUserReviews, AnilistReview } from '@/lib/anilist';
import { useAniListAccessToken } from '@/auth/useAniListAccessToken';
import { Skeleton } from '@/components/ui/skeleton';
import { motion } from 'framer-motion';
import { AniListWriteReviewDialog } from './AniListWriteReviewDialog';

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' as const } },
};

export function AniListUserReviewsView({ userId }: { userId: number }) {
  const { token: anilistToken } = useAniListAccessToken();
  const [reviews, setReviews] = useState<AnilistReview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!anilistToken) return;
      try {
        setLoading(true);
        const data = await getUserReviews(userId, anilistToken);
        setReviews(data);
      } catch (err) {
        console.error("Failed to load reviews:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [userId, anilistToken]);

  const [isWriteReviewOpen, setIsWriteReviewOpen] = useState(false);

  const handleWriteReview = () => {
    setIsWriteReviewOpen(true);
  };

  const handleReviewSuccess = () => {
    // Reload reviews
    if (!anilistToken) return;
    setLoading(true);
    getUserReviews(userId, anilistToken)
      .then(setReviews)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-6 pb-12 animate-in fade-in duration-300">
        <div className="flex justify-end">
          <Skeleton className="h-9 w-32 rounded-full" />
        </div>
        <div className="grid gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-secondary/5 p-4 rounded-xl border border-white/5 flex flex-col md:flex-row gap-4">
              <Skeleton className="w-20 h-28 rounded-md shadow-sm shrink-0" />
              <div className="flex-1 flex flex-col gap-2">
                <Skeleton className="h-6 w-1/2 max-w-[200px]" />
                <Skeleton className="h-4 w-16 mb-2" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-5/6" />
                <Skeleton className="h-3 w-4/6" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="flex flex-col gap-6 pb-12">
      <motion.div variants={itemVariants} className="flex justify-end">
        <button 
          onClick={handleWriteReview}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-full font-medium shadow-sm hover:opacity-90 transition-opacity"
        >
          <Edit3 className="w-4 h-4" />
          Write a Review
        </button>
      </motion.div>

      {reviews.length === 0 ? (
        <motion.div variants={itemVariants} className="text-center py-12 bg-secondary/10 rounded-xl border border-border/20">
          <MessageCircle className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground">You haven't written any reviews yet.</p>
        </motion.div>
      ) : (
        <div className="grid gap-4">
          {reviews.map(r => (
            <motion.div variants={itemVariants} key={r.id} className="bg-secondary/10 hover:bg-secondary/20 transition-colors p-4 rounded-xl border border-border/20 flex flex-col md:flex-row gap-4">
              <img src={r.media.coverImage.large} alt={r.media.title.romaji} className="w-20 h-28 object-cover rounded-md shadow-sm" />
              <div className="flex-1 flex flex-col">
                <div className="flex items-start justify-between gap-4">
                  <h4 className="font-bold text-lg text-foreground line-clamp-1">{r.media.title.english || r.media.title.romaji}</h4>
                  <div className="flex items-center gap-1 bg-primary/10 text-primary px-2 py-1 rounded-md shrink-0">
                    <Star className="w-3.5 h-3.5 fill-primary" />
                    <span className="font-bold text-sm">{r.score}/100</span>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mt-2 line-clamp-3 italic">"{r.summary}"</p>
                <div className="mt-auto pt-3 text-xs text-muted-foreground flex items-center justify-between">
                  <span>Rating: {r.rating} helpful</span>
                  <span>{new Date(r.createdAt * 1000).toLocaleDateString()}</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
      {/* Dialog */}
      <AniListWriteReviewDialog
        open={isWriteReviewOpen}
        onOpenChange={setIsWriteReviewOpen}
        onSuccess={handleReviewSuccess}
      />
    </motion.div>
  );
}
