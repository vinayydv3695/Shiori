import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { getUserSocial, AnilistUserSocial } from '@/lib/anilist';
import { useAniListAccessToken } from '@/auth/useAniListAccessToken';

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
    return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="flex flex-col gap-8 pb-12">
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Following ({following.length})</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {following.length === 0 ? <p className="text-muted-foreground text-sm">Not following anyone.</p> : following.map(u => (
            <div key={u.id} className="flex items-center gap-3 bg-secondary/10 p-3 rounded-xl border border-border/20">
              <img src={u.avatar.large} alt={u.name} className="w-12 h-12 rounded-full object-cover" />
              <span className="font-medium text-foreground">{u.name}</span>
            </div>
          ))}
        </div>
      </div>
      
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Followers ({followers.length})</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {followers.length === 0 ? <p className="text-muted-foreground text-sm">No followers.</p> : followers.map(u => (
            <div key={u.id} className="flex items-center gap-3 bg-secondary/10 p-3 rounded-xl border border-border/20">
              <img src={u.avatar.large} alt={u.name} className="w-12 h-12 rounded-full object-cover" />
              <span className="font-medium text-foreground">{u.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
