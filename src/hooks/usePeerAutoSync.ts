import { useEffect } from 'react';
import { usePeerSyncStore } from '@/store/peerSyncStore';

export function usePeerAutoSync() {
  const initStore = usePeerSyncStore((s) => s.initStore);
  const autoResumeSync = usePeerSyncStore((s) => s.autoResumeSync);

  useEffect(() => {
    let mounted = true;

    const runInitAndSync = async () => {
      await initStore();
      if (!mounted) return;
      // Delay slightly after app mount to allow library load
      setTimeout(() => {
        if (mounted) {
          void autoResumeSync();
        }
      }, 1500);
    };

    void runInitAndSync();

    // Also auto-sync on app resume / tab refocus
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void autoResumeSync();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      mounted = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [initStore, autoResumeSync]);
}
