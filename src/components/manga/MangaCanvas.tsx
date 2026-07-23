import React from 'react';
import { useMangaSettingsStore, useMangaContentStore } from '@/store/mangaReaderStore';
import { SinglePageView } from './views/SinglePageView';
import { LongStripView } from './views/LongStripView';
import { WebtoonView } from './views/WebtoonView';
import { ContinuousWebtoonView } from './views/ContinuousWebtoonView';
import { ZoomPanContainer } from './ZoomPanContainer';

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
    const continuousChapter = useMangaSettingsStore(s => s.continuousChapter);
    const sourceType = useMangaContentStore(s => s.sourceType);

    const isScrollingMode = readingMode === 'strip' || readingMode === 'webtoon' || readingMode === 'manhwa';
    const useContinuousView = isScrollingMode && continuousChapter && sourceType === 'online';

    return (
        <div className="manga-canvas">
            <ZoomPanContainer>
                {(readingMode === 'single' || readingMode === 'comic') && <SinglePageView />}
                
                {/* If continuous mode is on for online sources, use the ContinuousWebtoonView for ALL scroll modes */}
                {useContinuousView && <ContinuousWebtoonView />}
                
                {/* Fallback to original views if continuous mode is disabled or local source */}
                {!useContinuousView && readingMode === 'strip' && <LongStripView />}
                {!useContinuousView && (readingMode === 'webtoon' || readingMode === 'manhwa') && <WebtoonView />}
            </ZoomPanContainer>
        </div>
    );
}
