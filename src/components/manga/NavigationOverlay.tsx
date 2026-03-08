import React, { memo, useRef } from 'react';
import { useMangaContentStore, useMangaSettingsStore } from '@/store/mangaReaderStore';
import { useToastStore } from '@/store/toastStore';

/**
 * Click-zone navigation overlay for single page modes.
 * Left 30% = prev, right 30% = next, center 40% = no-op.
 * Memoized — never changes after mount.
 */
export const NavigationOverlay = memo(function NavigationOverlay() {
    const nextPage = useMangaContentStore(s => s.nextPage);
    const prevPage = useMangaContentStore(s => s.prevPage);
    const readingDirection = useMangaSettingsStore(s => s.readingDirection);
    const showTips = useMangaSettingsStore(s => s.showNavigationTips);
    const readingMode = useMangaSettingsStore(s => s.readingMode);
    const rtl = readingDirection === 'rtl';

    // Debounce boundary toasts to avoid spam
    const lastBoundaryToast = useRef(0);

    // Don't show overlay in scroll-based modes (strip, webtoon, manhwa)
    if (readingMode === 'strip' || readingMode === 'webtoon' || readingMode === 'manhwa') return null;

    const step = 1;

    const showBoundaryToast = (message: string) => {
        const now = Date.now();
        if (now - lastBoundaryToast.current < 2000) return;
        lastBoundaryToast.current = now;
        useToastStore.getState().addToast({
            title: message,
            variant: 'info',
            duration: 1500,
        });
    };

    const handlePrev = () => {
        const moved = rtl ? nextPage(step) : prevPage(step);
        if (!moved) showBoundaryToast(rtl ? 'You\'ve reached the last page' : 'You\'re at the first page');
    };
    const handleNext = () => {
        const moved = rtl ? prevPage(step) : nextPage(step);
        if (!moved) showBoundaryToast(rtl ? 'You\'re at the first page' : 'You\'ve reached the last page');
    };

    return (
        <div className="manga-nav-overlay">
            <div
                className="manga-nav-zone manga-nav-zone--prev"
                onClick={handlePrev}
            >
                {showTips && (
                    <div className="manga-nav-hint">
                        {rtl ? 'Next →' : '← Prev'}
                    </div>
                )}
            </div>
            <div className="manga-nav-zone manga-nav-zone--center" />
            <div
                className="manga-nav-zone manga-nav-zone--next"
                onClick={handleNext}
            >
                {showTips && (
                    <div className="manga-nav-hint">
                        {rtl ? '← Prev' : 'Next →'}
                    </div>
                )}
            </div>
        </div>
    );
});
