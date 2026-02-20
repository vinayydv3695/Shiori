import { useEffect, useRef, useCallback } from 'react';

/**
 * Hook for scroll-based progress tracking and auto-hide top bar.
 * Uses requestAnimationFrame and passive listeners for zero jank.
 */
export function useMangaScroll(
    containerRef: React.RefObject<HTMLElement | null>,
    onProgressChange: (progress: number) => void,
    onScrollDirectionChange?: (direction: 'up' | 'down') => void,
) {
    const lastScrollY = useRef(0);
    const ticking = useRef(false);

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

                // Detect scroll direction
                if (onScrollDirectionChange) {
                    const direction = scrollTop > lastScrollY.current ? 'down' : 'up';
                    onScrollDirectionChange(direction);
                }

                lastScrollY.current = scrollTop;
                ticking.current = false;
            });
            ticking.current = true;
        }
    }, [containerRef, onProgressChange, onScrollDirectionChange]);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        el.addEventListener('scroll', onScroll, { passive: true });
        return () => el.removeEventListener('scroll', onScroll);
    }, [containerRef, onScroll]);
}
