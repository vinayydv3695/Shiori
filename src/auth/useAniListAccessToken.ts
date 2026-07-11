import { useEffect, useState } from 'react';
import { anilistAuth } from '@/auth';
import { usePreferencesStore } from '@/store/preferencesStore';

export function useAniListAccessToken() {
  const preferencesToken = usePreferencesStore((state) => state.preferences?.anilistToken);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadToken = async () => {
      const nextToken = await anilistAuth.getAccessToken();
      if (!mounted) return;
      setToken(nextToken);
      setLoading(false);
    };

    void loadToken();

    const handleAuthChange = () => {
      void loadToken();
    };

    window.addEventListener('anilist-auth-changed', handleAuthChange);
    return () => {
      mounted = false;
      window.removeEventListener('anilist-auth-changed', handleAuthChange);
    };
  }, [preferencesToken]);

  return { token, loading };
}
