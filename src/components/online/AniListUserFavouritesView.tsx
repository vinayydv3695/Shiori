import React, { useEffect, useState } from 'react';
import { Loader2, Heart } from 'lucide-react';
import { getUserFavourites, AnilistFavourite } from '@/lib/anilist';
import { useAniListAccessToken } from '@/auth/useAniListAccessToken';

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
    return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (favourites.length === 0) {
    return (
      <div className="text-center py-12 bg-secondary/10 rounded-xl border border-border/20">
        <Heart className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
        <p className="text-muted-foreground">You don't have any favourite manga yet.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 pb-12">
      {favourites.map(f => (
        <div key={f.id} className="group relative aspect-[2/3] rounded-xl overflow-hidden cursor-pointer bg-secondary/20">
          <img src={f.coverImage.large} alt={f.title.romaji} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent flex flex-col justify-end p-3 opacity-90 group-hover:opacity-100 transition-opacity">
            <h4 className="font-bold text-white text-sm line-clamp-2">{f.title.english || f.title.romaji}</h4>
          </div>
          <div className="absolute top-2 right-2 bg-black/60 p-1.5 rounded-full backdrop-blur-md">
            <Heart className="w-4 h-4 fill-primary text-primary" />
          </div>
        </div>
      ))}
    </div>
  );
}
