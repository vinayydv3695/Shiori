import React, { useEffect, useState } from 'react';
import { Loader2, BookOpen } from 'lucide-react';
import { getMediaListCollection, AnilistMediaListCollection } from '@/lib/anilist';
import { useAniListAccessToken } from '@/auth/useAniListAccessToken';

export function AniListUserMangaView({ userId }: { userId: number }) {
  const { token: anilistToken } = useAniListAccessToken();
  const [collection, setCollection] = useState<AnilistMediaListCollection | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!anilistToken) return;
      try {
        setLoading(true);
        const data = await getMediaListCollection(userId, anilistToken);
        setCollection(data);
      } catch (err) {
        console.error("Failed to load manga lists:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [userId, anilistToken]);

  if (loading) {
    return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (!collection || collection.lists.length === 0) {
    return (
      <div className="text-center py-12 bg-secondary/10 rounded-xl border border-border/20">
        <BookOpen className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
        <p className="text-muted-foreground">You don't have any manga in your lists yet.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 pb-12">
      {collection.lists.map(list => (
        <div key={list.name} className="space-y-4">
          <div className="flex items-center gap-3">
            <h3 className="font-bold text-lg">{list.name}</h3>
            <span className="bg-secondary/50 text-secondary-foreground text-xs px-2 py-0.5 rounded-full font-medium">
              {list.entries.length}
            </span>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {list.entries.slice(0, 10).map(entry => (
              <div key={entry.id} className="group relative aspect-[2/3] rounded-xl overflow-hidden cursor-pointer bg-secondary/20">
                <img src={entry.media.coverImage.large} alt={entry.media.title.romaji} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent flex flex-col justify-end p-3 opacity-100">
                  <h4 className="font-bold text-white text-xs line-clamp-2 leading-tight mb-1">{entry.media.title.english || entry.media.title.romaji}</h4>
                  <div className="flex items-center justify-between text-[10px] font-medium text-white/80">
                    <span>Ch. {entry.progress}{entry.media.chapters ? ` / ${entry.media.chapters}` : ''}</span>
                    {entry.score > 0 && <span>⭐ {entry.score}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {list.entries.length > 10 && (
            <p className="text-xs text-muted-foreground mt-2 italic">+ {list.entries.length - 10} more in your main dashboard</p>
          )}
        </div>
      ))}
    </div>
  );
}
