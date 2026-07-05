import { useEffect, useRef, useCallback } from 'react';
import { useMangaUIStore } from '@/store/mangaReaderStore';

/**
 * Hook for scroll-based progress tracking and scroll activity callbacks.
 * Uses requestAnimationFrame and passive listeners for zero jank.
 */
export function useMangaScroll(
    containerRef: React.RefObject<HTMLElement | null>,
    onProgressChange: (progress: number) => void,
    onScrollActivity?: () => void,
    isActive: boolean = true
) {
    const ticking = useRef(false);
    const lastActivityMark = useRef(0);
    const lastScrollTopRef = useRef(0);

    const onScroll = useCallback(() => {
        if (!ticking.current) {
            requestAnimationFrame(() => {
                const el = containerRef.current;
                if (!el) {
                    ticking.current = false;
                    return;
                }

                const { scrollTop, scrollHeight, clientHeight } = el;
                const maxScroll = scrollHeight - clientHeight;

                // Auto-hide TopBar logic
                const diff = scrollTop - lastScrollTopRef.current;
                if (Math.abs(diff) > 5) {
                    if (diff > 0 && scrollTop > 50) {
                        useMangaUIStore.getState().setTopBarVisible(false);
                    } else if (diff < 0 || scrollTop < 50) {
                        useMangaUIStore.getState().setTopBarVisible(true);
                    }
                    lastScrollTopRef.current = scrollTop;
                }

                // Update progress
                if (maxScroll > 0) {
                    const progress = (scrollTop / maxScroll) * 100;
                    onProgressChange(Math.min(100, Math.max(0, progress)));

                    // Update CSS variable directly (no React re-render)
                    document.documentElement.style.setProperty(
                        '--manga-progress',
                        String(Math.min(1, Math.max(0, progress / 100)))
                    );
                }

                // Mark user scroll activity, but throttle store updates.
                if (onScrollActivity) {
                    const now = Date.now();
                    if (now - lastActivityMark.current >= 250) {
                        lastActivityMark.current = now;
                        onScrollActivity();
                    }
                }

                ticking.current = false;
            });
            ticking.current = true;
        }
    }, [containerRef, onProgressChange, onScrollActivity]);

    useEffect(() => {
        if (!isActive) return;
        const el = containerRef.current;
        if (!el) return;

        el.addEventListener('scroll', onScroll, { passive: true });
        return () => el.removeEventListener('scroll', onScroll);
    }, [containerRef, onScroll, isActive]);
}
