import { useCallback, useMemo } from 'react';
import { useUIStore } from '@/store/uiStore';
import { useOnlineMangaReaderStore } from '@/store/onlineMangaReaderStore';
import { MangaReader } from '@/components/manga/MangaReader';
import type { OnlineSourceConfig } from '@/store/mangaReaderStore';
import '@/styles/manga-reader.css';

/**
 * Bridge component that connects the old onlineMangaReaderStore to the unified MangaReader.
 * This allows the existing OnlineMangaView to work with the new unified reader.
 */
export function OnlineMangaReader() {
  const setCurrentView = useUIStore((s) => s.setCurrentView);
  const sourceId = useOnlineMangaReaderStore((s) => s.sourceId);
  const contentId = useOnlineMangaReaderStore((s) => s.contentId);
  const chapterId = useOnlineMangaReaderStore((s) => s.chapterId);
  const chapters = useOnlineMangaReaderStore((s) => s.chapters);
  const pages = useOnlineMangaReaderStore((s) => s.pages);
  const isLoading = useOnlineMangaReaderStore((s) => s.isLoading);
  const reset = useOnlineMangaReaderStore((s) => s.reset);
  
  // Derive ready state from loading and pages - no effect needed
  const isReady = pages.length > 0 && !isLoading;

  const handleClose = useCallback(() => {
    reset();
    setCurrentView('online-manga');
  }, [reset, setCurrentView]);

  // Build the source config for the unified reader
  const sourceConfig = useMemo((): OnlineSourceConfig | null => {
    if (!sourceId || !contentId || !chapterId || pages.length === 0) {
      return null;
    }

    const currentChapter = chapters.find(c => c.id === chapterId);
    
    return {
      sourceId,
      contentId,
      contentTitle: '', // TODO: Store content title in onlineMangaReaderStore
      chapterId,
      chapterTitle: currentChapter?.title || `Chapter ${currentChapter?.number ?? ''}`,
      chapters,
      pageUrls: pages.map(p => p.url),
    };
  }, [sourceId, contentId, chapterId, chapters, pages]);

  // Show loading while waiting for pages
  if (!sourceId || !contentId || !chapterId) {
    return (
      <div className="manga-reader" data-manga-theme="dark">
        <div className="manga-loading-screen">
          <span className="manga-loading-text">No chapter selected</span>
          <button type="button" className="manga-btn-done" onClick={handleClose}>Back</button>
        </div>
      </div>
    );
  }

  if (isLoading || !isReady || !sourceConfig) {
    return (
      <div className="manga-reader" data-manga-theme="dark">
        <div className="manga-loading-screen">
          <div className="manga-loading-spinner" />
          <span className="manga-loading-text">Loading chapter…</span>
        </div>
      </div>
    );
  }

  return (
    <MangaReader
      mode="online"
      sourceConfig={sourceConfig}
      onClose={handleClose}
    />
  );
}
