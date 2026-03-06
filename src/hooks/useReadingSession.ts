import { useEffect, useRef, useCallback } from 'react';
import { api } from '@/lib/tauri';
import { useReaderStore } from '@/store/readerStore';

const HEARTBEAT_INTERVAL_MS = 30_000;
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'scroll', 'touchstart'] as const;

export function useReadingSession(bookId: number) {
  const { startSession, endSession, currentSessionId } = useReaderStore();
  const sessionIdRef = useRef<string | null>(null);
  const heartbeatRef = useRef<number | null>(null);
  const lastActivityRef = useRef<number>(0);
  const isIdleRef = useRef(false);
  const elapsedRef = useRef(0);

  const recordActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (isIdleRef.current) {
      isIdleRef.current = false;
    }
  }, []);

  const cleanup = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }

    const sid = sessionIdRef.current;
    if (sid) {
      api.endReadingSession(sid).catch(() => {});
      sessionIdRef.current = null;
      endSession();
    }

    for (const event of ACTIVITY_EVENTS) {
      document.removeEventListener(event, recordActivity);
    }
  }, [endSession, recordActivity]);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        lastActivityRef.current = Date.now();
        const session = await api.startReadingSession(bookId);
        if (!mounted) {
          api.endReadingSession(session.id).catch(() => {});
          return;
        }
        sessionIdRef.current = session.id;
        startSession(session.id);
        elapsedRef.current = 0;

        for (const event of ACTIVITY_EVENTS) {
          document.addEventListener(event, recordActivity, { passive: true });
        }

        heartbeatRef.current = window.setInterval(() => {
          const sid = sessionIdRef.current;
          if (!sid) return;

          const timeSinceActivity = Date.now() - lastActivityRef.current;
          if (timeSinceActivity >= IDLE_TIMEOUT_MS) {
            isIdleRef.current = true;
            return;
          }

          elapsedRef.current += HEARTBEAT_INTERVAL_MS / 1000;
          api.heartbeatReadingSession(sid, elapsedRef.current).catch(() => {});
        }, HEARTBEAT_INTERVAL_MS);
      } catch {
        // Session start failed — non-critical, reading still works
      }
    };

    init();

    const handleVisibilityChange = () => {
      if (document.hidden) {
        const sid = sessionIdRef.current;
        if (sid) {
          api.heartbeatReadingSession(sid, elapsedRef.current).catch(() => {});
        }
      } else {
        lastActivityRef.current = Date.now();
        isIdleRef.current = false;
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      mounted = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      cleanup();
    };
  }, [bookId, startSession, cleanup, recordActivity]);

  return { sessionId: currentSessionId };
}
