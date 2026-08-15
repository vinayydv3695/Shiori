import React, { useEffect, useState } from 'react';
import { Star, Edit3, MessageCircle, MessageSquare, ExternalLink, Eye, Clock, Layers } from 'lucide-react';
import { getUserReviews, getUserThreads, AnilistReview, AnilistThread } from '@/lib/anilist';
import { useAniListAccessToken } from '@/auth/useAniListAccessToken';
import { Skeleton } from '@/components/ui/skeleton';
import { motion } from 'framer-motion';
import { AniListWriteReviewDialog } from './AniListWriteReviewDialog';
import { openExternal } from '@/lib/externalLinks';

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } },
};

function stripMarkdown(text?: string): string {
  if (!text) return '';
  return text
    .replace(/\[img\][\s\S]*?\[\/img\]/gi, '')
    .replace(/\[\/?(b|i|u|s|quote|code|spoiler|center)\]/gi, '')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/[#*`_~]/g, '')
    .replace(/\n+/g, ' ')
    .trim();
}

export function AniListUserReviewsView({ userId }: { userId: number }) {
  const { token: anilistToken } = useAniListAccessToken();
  const [subTab, setSubTab] = useState<'reviews' | 'threads'>('reviews');
  const [reviews, setReviews] = useState<AnilistReview[]>([]);
  const [threads, setThreads] = useState<AnilistThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [isWriteReviewOpen, setIsWriteReviewOpen] = useState(false);

  const loadData = async () => {
    if (!anilistToken) return;
    try {
      setLoading(true);
      const [reviewsData, threadsData] = await Promise.all([
        getUserReviews(userId, anilistToken).catch(() => []),
        getUserThreads(userId, anilistToken).catch(() => []),
      ]);
      setReviews(reviewsData);
      setThreads(threadsData);
      
      // Auto-switch to threads if reviews are 0 and threads exist
      if (reviewsData.length === 0 && threadsData.length > 0) {
        setSubTab('threads');
      }
    } catch (err) {
      console.error("Failed to load reviews or threads:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [userId, anilistToken]);

  const handleWriteReview = () => {
    setIsWriteReviewOpen(true);
  };

  const handleReviewSuccess = () => {
    loadData();
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-5 pb-12 animate-in fade-in duration-300">
        <div className="flex justify-between items-center">
          <Skeleton className="h-10 w-64 rounded-xl" />
          <Skeleton className="h-10 w-32 rounded-xl" />
        </div>
        <div className="grid gap-3.5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-secondary/30 p-4 rounded-2xl border border-border/40 flex flex-col sm:flex-row gap-4">
              <Skeleton className="w-20 h-28 rounded-xl shrink-0" />
              <div className="flex-1 flex flex-col gap-2.5">
                <Skeleton className="h-5 w-1/2" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-4/5" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 pb-12">
      {/* Sub-tab Navigation Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-secondary/50 border border-border/50 w-fit">
          <button
            onClick={() => setSubTab('reviews')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              subTab === 'reviews'
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Star className="w-3.5 h-3.5 text-primary" />
            <span>Reviews ({reviews.length})</span>
          </button>

          <button
            onClick={() => setSubTab('threads')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              subTab === 'threads'
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5 text-primary" />
            <span>Discussions ({threads.length})</span>
          </button>
        </div>

        {subTab === 'reviews' && (
          <button 
            onClick={handleWriteReview}
            className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-xl text-xs font-bold shadow-xs hover:scale-102 active:scale-98 transition-all cursor-pointer w-fit self-start sm:self-auto"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Write a Review</span>
          </button>
        )}
      </div>

      {/* Reviews View */}
      {subTab === 'reviews' && (
        <motion.div variants={containerVariants} initial="hidden" animate="show" className="flex flex-col gap-3.5">
          {reviews.length === 0 ? (
            <motion.div variants={itemVariants} className="text-center py-14 bg-secondary/30 rounded-2xl border border-border/50 shadow-xs">
              <MessageCircle className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
              <h3 className="text-base font-bold text-foreground mb-1">No reviews published</h3>
              <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
                You haven't written any manga or anime reviews on AniList yet.
              </p>
              <button 
                onClick={handleWriteReview}
                className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-xs font-bold shadow-xs hover:bg-primary/90 transition-all cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Write Your First Review</span>
              </button>
            </motion.div>
          ) : (
            reviews.map(r => (
              <motion.div 
                variants={itemVariants} 
                key={r.id} 
                className="bg-secondary/40 hover:bg-secondary/70 transition-all duration-200 p-4 rounded-2xl border border-border/50 shadow-xs flex flex-col sm:flex-row gap-4 group"
              >
                {r.media ? (
                  <img 
                    src={r.media.coverImage.large} 
                    alt={r.media.title.romaji} 
                    className="w-20 h-28 object-cover rounded-xl shadow-xs border border-border/40 shrink-0 group-hover:scale-102 transition-transform" 
                  />
                ) : (
                  <div className="w-20 h-28 rounded-xl bg-secondary border border-border/40 flex items-center justify-center shrink-0">
                    <Star className="w-8 h-8 text-muted-foreground/50" />
                  </div>
                )}

                <div className="flex-1 flex flex-col min-w-0">
                  <div className="flex items-start justify-between gap-4">
                    <h4 className="font-extrabold text-base text-foreground line-clamp-1 group-hover:text-primary transition-colors">
                      {r.media?.title?.english || r.media?.title?.romaji || 'Untitled Review'}
                    </h4>
                    <div className="flex items-center gap-1.5 bg-primary/10 text-primary border border-primary/20 px-2.5 py-1 rounded-xl shrink-0">
                      <Star className="w-3.5 h-3.5 fill-primary text-primary" />
                      <span className="font-bold text-xs font-mono">{r.score}/100</span>
                    </div>
                  </div>

                  <p className="text-sm text-muted-foreground mt-2 line-clamp-3 italic leading-relaxed">
                    "{r.summary}"
                  </p>

                  <div className="mt-auto pt-3 text-xs text-muted-foreground flex items-center justify-between font-medium border-t border-border/30">
                    <span>Rating: {r.rating} helpful</span>
                    <div className="flex items-center gap-3">
                      <span>{new Date(r.createdAt * 1000).toLocaleDateString()}</span>
                      {r.siteUrl && (
                        <button 
                          onClick={() => openExternal(r.siteUrl!)}
                          className="hover:text-primary transition-colors flex items-center gap-1 cursor-pointer"
                          title="Open on AniList"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </motion.div>
      )}

      {/* Discussions & Threads View */}
      {subTab === 'threads' && (
        <motion.div variants={containerVariants} initial="hidden" animate="show" className="flex flex-col gap-3.5">
          {threads.length === 0 ? (
            <motion.div variants={itemVariants} className="text-center py-14 bg-secondary/30 rounded-2xl border border-border/50 shadow-xs">
              <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
              <h3 className="text-base font-bold text-foreground mb-1">No forum threads found</h3>
              <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
                No discussion threads created by this account on AniList yet.
              </p>
              <button 
                onClick={() => openExternal('https://anilist.co/forum/recent')}
                className="inline-flex items-center gap-2 bg-secondary hover:bg-secondary/80 text-foreground border border-border/50 px-4 py-2 rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5 text-primary" />
                <span>Explore AniList Forum</span>
              </button>
            </motion.div>
          ) : (
            threads.map(t => {
              const categoryName = t.categories?.[0]?.name || 'General';
              const mediaCategory = t.mediaCategories?.[0];
              const bodySnippet = stripMarkdown(t.body);

              return (
                <motion.div 
                  variants={itemVariants} 
                  key={t.id} 
                  onClick={() => openExternal(t.siteUrl || `https://anilist.co/forum/thread/${t.id}`)}
                  className="bg-secondary/40 hover:bg-secondary/70 transition-all duration-200 p-4 rounded-2xl border border-border/50 shadow-xs flex flex-col sm:flex-row gap-4 group cursor-pointer"
                >
                  {mediaCategory?.coverImage?.large ? (
                    <img 
                      src={mediaCategory.coverImage.large} 
                      alt={mediaCategory.title.romaji} 
                      className="w-16 sm:w-20 h-22 sm:h-28 object-cover rounded-xl shadow-xs border border-border/40 shrink-0 group-hover:scale-102 transition-transform" 
                    />
                  ) : null}

                  <div className="flex-1 flex flex-col min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-primary/10 text-primary border border-primary/20">
                        {categoryName}
                      </span>
                      {mediaCategory && (
                        <span className="text-xs font-bold text-muted-foreground truncate">
                          {mediaCategory.title.english || mediaCategory.title.romaji}
                        </span>
                      )}
                    </div>

                    <h4 className="font-extrabold text-base text-foreground group-hover:text-primary transition-colors line-clamp-2 leading-snug">
                      {t.title}
                    </h4>

                    {bodySnippet && (
                      <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2 leading-relaxed">
                        {bodySnippet}
                      </p>
                    )}

                    <div className="mt-auto pt-3 text-xs text-muted-foreground flex items-center justify-between font-medium border-t border-border/30 flex-wrap gap-2">
                      <div className="flex items-center gap-4">
                        <span className="flex items-center gap-1">
                          <MessageSquare className="w-3.5 h-3.5 text-primary/80" />
                          {t.replyCount} {t.replyCount === 1 ? 'reply' : 'replies'}
                        </span>
                        <span className="flex items-center gap-1">
                          <Eye className="w-3.5 h-3.5 text-muted-foreground/80" />
                          {t.viewCount} views
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-1.5 ml-auto">
                        <Clock className="w-3 h-3 text-muted-foreground/80" />
                        <span>{new Date(t.createdAt * 1000).toLocaleDateString()}</span>
                        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors ml-1" />
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </motion.div>
      )}

      {/* Review Dialog */}
      <AniListWriteReviewDialog
        open={isWriteReviewOpen}
        onOpenChange={setIsWriteReviewOpen}
        onSuccess={handleReviewSuccess}
      />
    </div>
  );
}
