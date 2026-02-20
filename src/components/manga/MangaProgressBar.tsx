import React from 'react';
import { useMangaSettingsStore, useMangaUIStore } from '@/store/mangaReaderStore';

/**
 * Configurable progress bar.
 * Uses CSS transform: scaleX/scaleY for GPU-composited animation.
 * Progress value is set via CSS variable --manga-progress (no React re-renders).
 */
export function MangaProgressBar() {
    const position = useMangaSettingsStore(s => s.progressBarPosition);

    if (position === 'none') return null;

    return (
        <div className={`manga-progress-bar manga-progress-bar--${position}`}>
            <div className="manga-progress-fill" />
        </div>
    );
}
