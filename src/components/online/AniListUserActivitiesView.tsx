import React, { useEffect, useState } from 'react';
import { Loader2, Clock } from 'lucide-react';
import { getUserActivities, AnilistActivity } from '@/lib/anilist';
import { useAniListAccessToken } from '@/auth/useAniListAccessToken';

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
    return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (activities.length === 0) {
    return <p className="text-muted-foreground text-center py-12">No recent activity found.</p>;
  }

  return (
    <div className="flex flex-col gap-4 pb-12 relative before:absolute before:inset-0 before:ml-[1.4rem] before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border/50 before:to-transparent">
      {activities.map(a => (
        <div key={a.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
          {/* Timeline Node */}
          <div className="flex items-center justify-center w-6 h-6 rounded-full border-4 border-background bg-primary/20 text-primary shadow shrink-0 md:order-1 md:group-odd:-ml-3 md:group-even:-mr-3 z-10 mx-[0.65rem] md:mx-auto">
            <div className="w-2 h-2 rounded-full bg-primary" />
          </div>

          {/* Content Card */}
          <div className="w-[calc(100%-3rem)] md:w-[calc(50%-2rem)] bg-secondary/10 hover:bg-secondary/20 transition-colors p-4 rounded-xl border border-border/20 flex gap-4">
             {a.media ? (
               <>
                 <img src={a.media.coverImage.large} alt={a.media.title.romaji} className="w-16 h-20 object-cover rounded-md shrink-0 shadow-sm" />
                 <div className="flex flex-col justify-center">
                   <p className="text-sm font-medium text-muted-foreground capitalize">{a.status} {a.progress ? `Chapter ${a.progress}` : ''}</p>
                   <p className="text-base font-bold text-foreground line-clamp-2">{a.media.title.english || a.media.title.romaji}</p>
                   <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-2">
                     <Clock className="w-3 h-3" />
                     {new Date(a.createdAt * 1000).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                   </div>
                 </div>
               </>
             ) : (
               <div className="flex flex-col justify-center w-full">
                 <p className="text-sm text-foreground">{a.text}</p>
                 <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-2">
                   <Clock className="w-3 h-3" />
                   {new Date(a.createdAt * 1000).toLocaleString()}
                 </div>
               </div>
             )}
          </div>
        </div>
      ))}
    </div>
  );
}
