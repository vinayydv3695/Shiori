import { useEffect } from 'react';
import { useUIStore } from '@/store/uiStore';
import { useReaderStore } from '@/store/readerStore';
import { useMangaContentStore } from '@/store/mangaReaderStore';
import { useDiscordPresence } from '@/hooks/useDiscordPresence';

const getViewDescription = (view: string): string => {
  switch (view) {
    case 'home':
    case 'library':
      return 'Browsing Library';
    case 'annotations':
      return 'Reviewing Annotations';
    case 'statistics':
      return 'Viewing Statistics';
    case 'online-books':
      return 'Searching Libgen';
    case 'online-manga':
      return 'Searching MangaDex';
    case 'online-manga-reader':
      return 'Reading Online Manga';
    case 'torbox-discover':
    case 'torbox-books':
    case 'torbox-manga':
      return 'Browsing TorBox';
    case 'rss-feeds':
    case 'rss-articles':
      return 'Reading RSS Feeds';
    default:
      return 'Browsing Library';
  }
};

const getValidCoverUrl = (url: string | undefined | null): string => {
  if (!url) return 'shiori_logo';
  // Discord Rich Presence cannot load local file paths or proxied localhost URLs.
  if (url.startsWith('http') && !url.includes('127.0.0.1') && !url.includes('localhost')) {
    return url;
  }
  return 'shiori_logo';
};

export function useDiscordRPCUpdater() {
  const currentView = useUIStore(s => s.currentView);
  
  // Standard Reader state
  const isReaderOpen = useReaderStore(s => s.isReaderOpen);
  const readerProgress = useReaderStore(s => s.progress);
  const readerContent = useReaderStore(s => s.currentContent);

  // Manga Reader state
  const isMangaOpen = useMangaContentStore(s => s.bookId !== null || s.onlineSource !== null);
  const mangaCurrentPage = useMangaContentStore(s => s.currentPage);
  const mangaTotalPages = useMangaContentStore(s => s.totalPages);
  const mangaTitle = useMangaContentStore(s => s.title);
  const mangaOnlineSource = useMangaContentStore(s => s.onlineSource);

  const { setActivity, isConnected } = useDiscordPresence();

  useEffect(() => {
    // 1. Prioritize Manga Reader
    if (isMangaOpen) {
      const title = mangaTitle || mangaOnlineSource?.contentTitle || 'Unknown Manga';
      let state = '';
      
      if (mangaOnlineSource?.chapterTitle) {
         state = `${mangaOnlineSource.chapterTitle}`;
         if (mangaTotalPages > 0) {
             state += ` • Page ${mangaCurrentPage + 1} of ${mangaTotalPages}`;
         } else {
             state += ` • Page ${mangaCurrentPage + 1}`;
         }
      } else if (mangaTotalPages > 0) {
         state = `Page ${mangaCurrentPage + 1} of ${mangaTotalPages}`;
      } else {
         state = `Page ${mangaCurrentPage + 1}`;
      }

      setActivity({
        details: `Reading: ${title}`,
        state,
        largeImageKey: 'shiori_logo', // Manga doesn't store cover URL in its content store currently
        largeImageText: 'Shiori Manga',
      });
      return;
    }

    // 2. Fallback to Standard Reader
    if (isReaderOpen && readerContent) {
      let state = readerContent.author ? `by ${readerContent.author}` : 'Unknown Author';
      
      if (readerProgress) {
        if (readerProgress.currentPage && readerProgress.totalPages) {
          state += ` • Page ${readerProgress.currentPage} of ${readerProgress.totalPages}`;
        } else if (readerProgress.progressPercent > 0) {
          state += ` • ${readerProgress.progressPercent.toFixed(1)}% Complete`;
        }
      }

      setActivity({
        details: `Reading: ${readerContent.title}`,
        state,
        largeImageKey: getValidCoverUrl(readerContent.cover),
        largeImageText: readerContent.title,
      });
      return;
    }

    // 3. Fallback to Browsing Status
    setActivity({
      details: getViewDescription(currentView),
      state: 'Shiori',
      largeImageKey: 'shiori_logo',
      largeImageText: 'Shiori',
    });
  }, [
    currentView,
    
    isReaderOpen,
    readerProgress,
    readerContent,
    
    isMangaOpen,
    mangaCurrentPage,
    mangaTotalPages,
    mangaTitle,
    mangaOnlineSource,
    
    setActivity,
    isConnected
  ]);
}
