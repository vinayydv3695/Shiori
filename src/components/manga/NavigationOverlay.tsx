import React, { memo } from 'react';
import { useMangaContentStore, useMangaSettingsStore } from '@/store/mangaReaderStore';

/**
 * Click-zone navigation overlay for single/double page modes.
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

    // Don't show overlay in strip mode (scroll-based navigation)
    if (readingMode === 'strip') return null;

    const handlePrev = () => rtl ? nextPage() : prevPage();
    const handleNext = () => rtl ? prevPage() : nextPage();

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
