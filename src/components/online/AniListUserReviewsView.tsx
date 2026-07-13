import React, { useEffect, useState } from 'react';
import { Loader2, Star, Edit3 } from 'lucide-react';
import { getUserReviews, AnilistReview } from '@/lib/anilist';
import { useAniListAccessToken } from '@/auth/useAniListAccessToken';

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

  const handleWriteReview = () => {
    // A simple alert for now. Writing a review requires selecting a media item first.
    alert("To write a review, please navigate to the specific Manga's detail page and write it from there.");
  };

  if (loading) {
    return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex justify-end">
        <button 
          onClick={handleWriteReview}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-full font-medium shadow-sm hover:opacity-90 transition-opacity"
        >
          <Edit3 className="w-4 h-4" />
          Write a Review
        </button>
      </div>

      {reviews.length === 0 ? (
        <div className="text-center py-12 bg-secondary/10 rounded-xl border border-border/20">
          <MessageCircle className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground">You haven't written any reviews yet.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {reviews.map(r => (
            <div key={r.id} className="bg-secondary/10 hover:bg-secondary/20 transition-colors p-4 rounded-xl border border-border/20 flex flex-col md:flex-row gap-4">
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import { MessageCircle } from 'lucide-react';
