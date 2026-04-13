import { useEffect, useRef, useCallback } from 'react';

/**
 * Hook for scroll-based progress tracking and scroll activity callbacks.
 * Uses requestAnimationFrame and passive listeners for zero jank.
 */
export function useMangaScroll(
    containerRef: React.RefObject<HTMLElement | null>,
    onProgressChange: (progress: number) => void,
    onScrollActivity?: () => void,
) {
    const ticking = useRef(false);
    const lastActivityMark = useRef(0);

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
        const el = containerRef.current;
        if (!el) return;

        el.addEventListener('scroll', onScroll, { passive: true });
        return () => el.removeEventListener('scroll', onScroll);
    }, [containerRef, onScroll]);
}
