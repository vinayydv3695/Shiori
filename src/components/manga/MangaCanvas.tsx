import React from 'react';
import { useMangaSettingsStore } from '@/store/mangaReaderStore';
import { SinglePageView } from './views/SinglePageView';
import { DoublePageView } from './views/DoublePageView';
import { LongStripView } from './views/LongStripView';

/**
 * Canvas controller — switches between reading mode views.
 * Only re-renders when readingMode changes (the mode swap).
 */
export function MangaCanvas() {
    const readingMode = useMangaSettingsStore(s => s.readingMode);

    return (
        <div className="manga-canvas">
            {readingMode === 'single' && <SinglePageView />}
            {readingMode === 'double' && <DoublePageView />}
            {readingMode === 'strip' && <LongStripView />}
        </div>
    );
}
