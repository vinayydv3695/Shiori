import React from 'react';
import { useMangaSettingsStore } from '@/store/mangaReaderStore';
import { SinglePageView } from './views/SinglePageView';
import { LongStripView } from './views/LongStripView';
import { WebtoonView } from './views/WebtoonView';

/**
 * Canvas controller — switches between reading mode views.
 * Only re-renders when readingMode changes (the mode swap).
 *
 * Mode → View mapping:
 *   single, comic  → SinglePageView (comic is LTR-locked single)
 *   strip          → LongStripView
 *   webtoon, manhwa → WebtoonView (seamless zero-gap scroll)
 */
export function MangaCanvas() {
    const readingMode = useMangaSettingsStore(s => s.readingMode);

    return (
        <div className="manga-canvas">
            {(readingMode === 'single' || readingMode === 'comic') && <SinglePageView />}
            {readingMode === 'strip' && <LongStripView />}
            {(readingMode === 'webtoon' || readingMode === 'manhwa') && <WebtoonView />}
        </div>
    );
}
