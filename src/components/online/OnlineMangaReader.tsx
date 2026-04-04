import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useUIStore } from '@/store/uiStore';
import { useOnlineMangaReaderStore } from '@/store/onlineMangaReaderStore';
import '@/styles/manga-reader.css';

type ReaderMode = 'single' | 'strip' | 'webtoon' | 'manhwa' | 'comic';
type ReaderDirection = 'ltr' | 'rtl';

export function OnlineMangaReader() {
  const setCurrentView = useUIStore((s) => s.setCurrentView);
  const sourceId = useOnlineMangaReaderStore((s) => s.sourceId);
  const contentId = useOnlineMangaReaderStore((s) => s.contentId);
  const chapterId = useOnlineMangaReaderStore((s) => s.chapterId);
  const chapters = useOnlineMangaReaderStore((s) => s.chapters);
  const pages = useOnlineMangaReaderStore((s) => s.pages);
  const currentPageIndex = useOnlineMangaReaderStore((s) => s.currentPageIndex);
  const isLoading = useOnlineMangaReaderStore((s) => s.isLoading);
  const error = useOnlineMangaReaderStore((s) => s.error);
  const nextPage = useOnlineMangaReaderStore((s) => s.nextPage);
  const prevPage = useOnlineMangaReaderStore((s) => s.prevPage);
  const goToPage = useOnlineMangaReaderStore((s) => s.goToPage);
  const setChapter = useOnlineMangaReaderStore((s) => s.setChapter);

  const [readingMode, setReadingMode] = useState<ReaderMode>('single');
  const [readingDirection, setReadingDirection] = useState<ReaderDirection>('ltr');
  const [loadedImages, setLoadedImages] = useState<Record<number, boolean>>({});

  const currentChapterIndex = useMemo(
    () => chapters.findIndex((c) => c.id === chapterId),
    [chapters, chapterId]
  );
  const currentChapter = currentChapterIndex >= 0 ? chapters[currentChapterIndex] : null;
  const canPrevChapter = currentChapterIndex > 0;
  const canNextChapter = currentChapterIndex >= 0 && currentChapterIndex < chapters.length - 1;

  const handleBack = useCallback(() => {
    setCurrentView('online-manga');
  }, [setCurrentView]);

  const handlePrevChapter = useCallback(() => {
    if (!canPrevChapter) return;
    const prev = chapters[currentChapterIndex - 1];
    if (prev) {
      void setChapter(prev.id);
    }
  }, [canPrevChapter, chapters, currentChapterIndex, setChapter]);

  const handleNextChapter = useCallback(() => {
    if (!canNextChapter) return;
    const next = chapters[currentChapterIndex + 1];
    if (next) {
      void setChapter(next.id);
    }
  }, [canNextChapter, chapters, currentChapterIndex, setChapter]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;

      const isScrollMode = readingMode === 'strip' || readingMode === 'webtoon' || readingMode === 'manhwa';
      const effectiveRtl = readingMode === 'comic' ? false : readingDirection === 'rtl';

      if (e.key === 'Escape') {
        e.preventDefault();
        handleBack();
        return;
      }

      if (isScrollMode) return;

      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          effectiveRtl ? prevPage() : nextPage();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          effectiveRtl ? nextPage() : prevPage();
          break;
        case 'ArrowDown':
        case ' ':
          e.preventDefault();
          e.shiftKey ? prevPage() : nextPage();
          break;
        case 'ArrowUp':
          e.preventDefault();
          prevPage();
          break;
        case 'Home':
          e.preventDefault();
          goToPage(0);
          break;
        case 'End':
          e.preventDefault();
          goToPage(pages.length - 1);
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goToPage, handleBack, nextPage, pages.length, prevPage, readingDirection, readingMode]);

  if (!sourceId || !contentId || !chapterId) {
    return (
      <div className="manga-reader" data-manga-theme="dark">
        <div className="manga-loading-screen">
          <span className="manga-loading-text">No chapter selected</span>
          <button type="button" className="manga-btn-done" onClick={handleBack}>Back</button>
        </div>
      </div>
    );
  }

  const progress = pages.length > 0 ? Math.round(((currentPageIndex + 1) / pages.length) * 100) : 0;
  const isScrollMode = readingMode === 'strip' || readingMode === 'webtoon' || readingMode === 'manhwa';

  return (
    <div className="manga-reader" data-manga-theme="dark">
      <div className="manga-topbar">
        <div className="manga-topbar-content">
          <div className="manga-topbar-left">
            <button type="button" className="manga-topbar-btn" onClick={handleBack}>←</button>
            <span className="manga-indicator">{currentChapter?.title || `Chapter ${currentChapter?.number ?? ''}`}</span>
          </div>
          <div className="manga-topbar-center">
            <span className="manga-indicator">Page {Math.min(currentPageIndex + 1, Math.max(1, pages.length))} / {pages.length}</span>
            <span className="manga-indicator">{progress}%</span>
          </div>
          <div className="manga-topbar-right">
            <select className="manga-select" value={readingMode} onChange={(e) => setReadingMode(e.target.value as ReaderMode)}>
              <option value="single">Single</option>
              <option value="strip">Strip</option>
              <option value="webtoon">Webtoon</option>
              <option value="manhwa">Manhwa</option>
              <option value="comic">Comic</option>
            </select>
            <select className="manga-select" value={readingDirection} onChange={(e) => setReadingDirection(e.target.value as ReaderDirection)}>
              <option value="ltr">Left → Right</option>
              <option value="rtl">Right → Left</option>
            </select>
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="manga-loading-screen">
          <div className="manga-loading-spinner" />
          <span className="manga-loading-text">Loading chapter…</span>
        </div>
      )}

      {!isLoading && error && (
        <div className="manga-loading-screen">
          <span className="manga-loading-text" style={{ color: 'var(--manga-accent)' }}>Error: {error}</span>
        </div>
      )}

      {!isLoading && !error && (
        <div className="manga-canvas" style={{ paddingTop: 52 }}>
          {!isScrollMode && pages[currentPageIndex] && (
            <div className="manga-single-view">
              <div className="manga-page-container">
                {!loadedImages[currentPageIndex] && <div className="manga-page-skeleton" style={{ width: '70vw', height: '80vh' }} />}
                <img
                  src={pages[currentPageIndex].url}
                  alt={`Page ${currentPageIndex + 1}`}
                  className={`manga-page-img manga-page-img--fit-contain ${loadedImages[currentPageIndex] ? 'manga-page-img--loaded' : 'manga-page-img--loading'}`}
                  onLoad={() => setLoadedImages((s) => ({ ...s, [currentPageIndex]: true }))}
                />
              </div>
            </div>
          )}

          {isScrollMode && (
            <div className={readingMode === 'strip' ? 'manga-strip-container' : 'manga-webtoon-container'}>
              <div className="space-y-3 py-3">
                {pages.map((page, idx) => (
                  <div key={`${chapterId}-${page.index}`} className="flex justify-center">
                    {!loadedImages[idx] && <div className="manga-page-skeleton" style={{ width: '70vw', height: '40vh' }} />}
                    <img
                      src={page.url}
                      alt={`Page ${idx + 1}`}
                      className={`manga-page-img ${loadedImages[idx] ? 'manga-page-img--loaded' : 'manga-page-img--loading'}`}
                      style={{ width: 'min(100%, 980px)', height: 'auto' }}
                      onLoad={() => setLoadedImages((s) => ({ ...s, [idx]: true }))}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 p-3 bg-black/70 border-t border-white/10 z-[120]">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handlePrevChapter} disabled={!canPrevChapter || isLoading}>Prev Chapter</Button>
            <Button variant="outline" size="sm" onClick={handleNextChapter} disabled={!canNextChapter || isLoading}>Next Chapter</Button>
          </div>
          <div className="flex items-center gap-2">
            {!isScrollMode && <Button variant="outline" size="sm" onClick={() => prevPage()} disabled={currentPageIndex === 0 || isLoading}>Prev Page</Button>}
            {!isScrollMode && <Button variant="outline" size="sm" onClick={() => nextPage()} disabled={currentPageIndex >= pages.length - 1 || isLoading}>Next Page</Button>}
          </div>
        </div>
      </div>
    </div>
  );
}
