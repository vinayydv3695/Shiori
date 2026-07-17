import { useEffect, useRef } from 'react';
import { useUIStore } from '@/store/uiStore';
import { useReaderStore } from '@/store/readerStore';
import { useMangaContentStore } from '@/store/mangaReaderStore';
import { useDiscordPresence } from '@/hooks/useDiscordPresence';
import { invoke } from '@tauri-apps/api/core';

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

/**
 * Returns a public https:// URL suitable for Discord's large_image field,
 * or the 'shiori_logo' asset key as a fallback.
 *
 * Strategy:
 * 1. If a real ISBN-10/13 is stored, use Open Library covers (free, no auth)
 * 2. Otherwise fallback to the Shiori logo
 *
 * Local file paths and localhost URLs cannot be used — Discord can't reach them.
 */
const getCoverImageKey = (cover: string | undefined | null, isbn?: string | null, title?: string, author?: string): string => {
  // Already a public https URL — pass through directly
  if (cover && cover.startsWith('https://') && !cover.includes('127.0.0.1') && !cover.includes('localhost')) {
    return cover;
  }

  if (isbn) {
    // Strip any surrounding quotes that may have been stored (SQLite quirk)
    const cleanIsbn = isbn.replace(/^['"]|['"]$/g, '').trim();
    // Only use if it looks like a real ISBN-10 or ISBN-13 (digits only, correct length)
    if (/^\d{10}$/.test(cleanIsbn) || /^\d{13}$/.test(cleanIsbn)) {
      return `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-L.jpg`;
    }
  }

  // Try Google Books thumbnail via title + author (works for books without a proper ISBN)
  if (title) {
    const q = encodeURIComponent(title + (author ? ` ${author}` : ''));
    return `https://books.google.com/books/content?vid=ISBN&printsec=frontcover&img=1&zoom=1&source=gbs_api&q=${q}`;
  }

  return 'shiori_logo';
};

/**
 * Resolves an OpenLibrary redirect to get the direct archive.org CDN URL,
 * which Discord can load without needing to follow redirects.
 * Uses the Rust backend to bypass CORS restrictions.
 */
const resolvedUrlCache: Record<string, string> = {};
const resolveOpenLibraryUrl = async (url: string): Promise<string> => {
  if (resolvedUrlCache[url]) return resolvedUrlCache[url];
  try {
    const finalUrl = await invoke<string>('discord_resolve_image', { url });
    resolvedUrlCache[url] = finalUrl;
    return finalUrl;
  } catch {
    return url; // fallback: use original, Discord will try and possibly fail
  }
};

/**
 * Discord's internal image parser strictly requires the URL to end in a known image extension.
 * If a URL doesn't have an extension (e.g. Google Books API or dynamic endpoints), we append `#.jpg` 
 * to trick the regex parser without breaking the actual HTTP request.
 */
const formatForDiscordRpc = (url: string): string => {
  if (!url || url === 'shiori_logo') return url;
  
  // Extract path to avoid checking query params incorrectly, though Discord doesn't mind query params
  // actually Discord parses the whole string.
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.endsWith('.jpg') || lowerUrl.endsWith('.png') || lowerUrl.endsWith('.jpeg') || lowerUrl.endsWith('.webp') || lowerUrl.endsWith('.gif')) {
    return url;
  }
  
  // Append a fragment so the URL "ends" with .jpg 
  // e.g. https://books.google.com/...?vid=123#.jpg
  return `${url}#.jpg`;
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
  const cancelRef = useRef(false);

  useEffect(() => {
    cancelRef.current = false;

    const update = async () => {
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

        let imageKey = getCoverImageKey(mangaOnlineSource?.coverUrl, null, title);
        if (imageKey.startsWith('https://covers.openlibrary.org')) {
          imageKey = await resolveOpenLibraryUrl(imageKey);
        }
        imageKey = formatForDiscordRpc(imageKey);
        if (cancelRef.current) return;

        setActivity({
          details: `Reading: ${title}`,
          state,
          largeImageKey: imageKey,
          largeImageText: title,
        });
        return;
      }

      // 2. Standard Reader
      if (isReaderOpen && readerContent) {
        let state = readerContent.author ? `by ${readerContent.author}` : 'Unknown Author';
        
        if (readerProgress) {
          if (readerProgress.currentPage && readerProgress.totalPages) {
            state += ` • Page ${readerProgress.currentPage} of ${readerProgress.totalPages}`;
          } else if (readerProgress.progressPercent > 0) {
            state += ` • ${readerProgress.progressPercent.toFixed(1)}% Complete`;
          }
        }

        let imageKey = getCoverImageKey(readerContent.cover, readerContent.isbn, readerContent.title, readerContent.author);
        if (imageKey.startsWith('https://covers.openlibrary.org')) {
          imageKey = await resolveOpenLibraryUrl(imageKey);
        }
        imageKey = formatForDiscordRpc(imageKey);
        if (cancelRef.current) return;

        setActivity({
          details: `Reading: ${readerContent.title}`,
          state,
          largeImageKey: imageKey,
          largeImageText: readerContent.title,
        });
        return;
      }

      // 3. Browsing
      if (!cancelRef.current) {
        setActivity({
          details: getViewDescription(currentView),
          state: 'Shiori',
          largeImageKey: 'shiori_logo',
          largeImageText: 'Shiori',
        });
      }
    };

    update();
    return () => { cancelRef.current = true; };
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
