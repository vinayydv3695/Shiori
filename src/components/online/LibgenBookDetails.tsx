import * as Dialog from '@radix-ui/react-dialog';
import { Button } from '@/components/ui/button';
import { SearchResult } from '@/lib/pluginSources';
import { Download, Loader2, X, AlertTriangle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { downloadAndImportLibgen } from '@/online-books/libgen/importer';
import { useToast } from '@/store/toastStore';
import { useBookOpen } from '@/hooks/useBookOpen';
import { useOnlineDownloadStore } from '@/store/onlineDownloadStore';
import { DownloadProgressBar } from './DownloadProgressBar';
import { pluginApi } from '@/lib/pluginSources';
import { logger } from '@/lib/logger';
import { api, isAndroid } from '@/lib/tauri';
import { fetchCoverForBook } from '@/online-books/openlibrary/api';

interface Props {
  book: SearchResult | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LibgenBookDetails({ book, open, onOpenChange }: Props) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [activeDownloadUrl, setActiveDownloadUrl] = useState<string | null>(null);
  const { success: showSuccessToast, error: showErrorToast } = useToast();

  // Backend emits progress keyed by target_id = first mirror URL (the epubUrl we pass in).
  // Per-download subscription: the store replaces the whole downloads object on
  // every progress tick, so a whole-object subscription re-renders this dialog
  // at tick rate. Select just this download's entry.
  const downloadProgress = useOnlineDownloadStore((state) =>
    activeDownloadUrl ? state.downloads[activeDownloadUrl] : undefined,
  );

  useEffect(() => {
    if (!book || !open) return;
    
    // Reset cover
    setCoverUrl(null);
    let active = true;
    let objectUrl: string | null = null;
    
    const fetchCover = async () => {
      try {
        const pages = await pluginApi.getPages('libgen', book.id);
        const coverPage = pages.find(p => p.url.startsWith('cover|'));
        if (coverPage && active) {
          const rawUrl = coverPage.url.replace(/^cover\|/, '');
          if (rawUrl.includes('libgen')) {
            try {
              const arr = await api.proxyMangaImage('libgen', rawUrl);
              if (!active) return;
              if (arr.length < 100) throw new Error('Invalid or empty cover image');
              const u8arr = new Uint8Array(arr as unknown as Iterable<number>);
              const blob = new Blob([u8arr], { type: 'image/jpeg' });
              objectUrl = URL.createObjectURL(blob);
              setCoverUrl(objectUrl);
            } catch (err) {
              logger.error('Failed to proxy LibGen cover:', err);
              if (!active) return;
              const extra = (book.extra || {}) as Record<string, string>;
              const fallbackUrl = await fetchCoverForBook(book.title, extra.author);
              if (active && fallbackUrl) {
                setCoverUrl(fallbackUrl);
              } else if (active) {
                setCoverUrl(null);
              }
            }
          } else {
            setCoverUrl(rawUrl);
          }
        }
      } catch (err) {
        logger.error('Failed to load cover from LibGen detail page:', err);
      }
    };
    
    void fetchCover();

    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [book?.id, open]);

  if (!book) return null;

  const extra = (book.extra || {}) as Record<string, string>;
  const author = extra.author || 'Unknown Author';
  const publisher = extra.publisher;
  const year = extra.year;
  const language = extra.language;
  const format = extra.format || 'EPUB';
  const fileSize = extra.file_size;

  /** All direct (get.php) download URLs for this book, in page order. */
  const resolveDirectUrls = async (): Promise<string[]> => {
    try {
      const pages = await pluginApi.getPages('libgen', book.id);
      return pages
        .filter(p => p.url.startsWith('direct|'))
        .map(p => p.url.replace(/^direct\|/, ''));
    } catch (err) {
      logger.error('Failed to resolve LibGen download links:', err);
      return [];
    }
  };

  const resolveEpubUrl = async (): Promise<string | null> => {
    const urls = await resolveDirectUrls();
    return urls[0] ?? null;
  };

  /** Mirrors for the backend fallback chain: remaining direct links first,
   *  then the raw mirror links from the search row. */
  const collectMirrors = (directUrls: string[]): string[] => {
    const rawMirrors = book.extra
      ? Object.keys(book.extra).filter(k => k.startsWith('mirror_')).map(k => book.extra![k] as string)
      : [];
    return [...directUrls.slice(1), ...rawMirrors];
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const epubUrl = await resolveEpubUrl();
      if (!epubUrl) {
        throw new Error('No direct download links found for this book on LibGen.');
      }

      const directUrls = await resolveDirectUrls();
      setActiveDownloadUrl(epubUrl);
      // Register the title up-front — backend progress payloads only carry target_id.
      useOnlineDownloadStore.getState().registerDownload(epubUrl, book.title);
      const result = await downloadAndImportLibgen(
        epubUrl,
        book.title,
        collectMirrors(directUrls),
        format.toLowerCase()
      );
      if (result.success.length > 0 || result.duplicates.length > 0) {
        showSuccessToast('Added to Library', `${book.title} was added to your library.`);
        onOpenChange(false);
      } else if (result.failed.length > 0) {
        showErrorToast('Import Failed', result.failed[0][1] || 'Unknown error occurred.');
      }
    } catch (err) {
      showErrorToast('Download Failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleReadNow = async () => {
    setIsReading(true);
    try {
      const epubUrl = await resolveEpubUrl();
      if (!epubUrl) {
        throw new Error('No direct download links found for this book on LibGen.');
      }

      // 1. Download and import directly (all direct links as fallback mirrors)
      const directUrls = await resolveDirectUrls();
      useOnlineDownloadStore.getState().registerDownload(epubUrl, book.title);
      const result = await downloadAndImportLibgen(
        epubUrl,
        book.title,
        collectMirrors(directUrls),
        format.toLowerCase()
      );
      const path = result.success[0] || result.duplicates[0];
      
      if (!path) {
        throw new Error(result.failed[0]?.[1] || "Failed to download book.");
      }

      // 2. Fetch books to find the newly imported book's ID by its path
      const { api } = await import('@/lib/tauri');
      const recentBooks = await api.getBooks(100, 0);
      
      const foundBook = recentBooks.find(b => 
        b.file_path === path || 
        (b.title && book.title && b.title.toLowerCase().trim() === book.title.toLowerCase().trim())
      );

      if (!foundBook?.id) {
        throw new Error(`Could not find imported book ID to open reader.`);
      }

      // 3. Open it via Reader integration
      window.dispatchEvent(new CustomEvent('open-book', { detail: { bookId: foundBook.id } }));
      onOpenChange(false);
    } catch (err) {
      showErrorToast('Failed to Open Reader', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsReading(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content aria-describedby="libgen-dialog-description" className="dialog-content fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card/40 backdrop-blur-2xl border border-border/50 rounded-2xl sm:rounded-[2rem] shadow-2xl w-[calc(100vw-2rem)] max-w-[600px] max-h-[90vh] flex flex-col z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 duration-500 overflow-hidden">
          <Dialog.Description id="libgen-dialog-description" className="sr-only">
            Libgen book details and download options.
          </Dialog.Description>
          
          <div className="flex-none bg-transparent backdrop-blur-xl border-b border-border/50 px-4 sm:px-8 py-4 sm:py-6 z-10 flex flex-col justify-between relative">
            <Dialog.Title className="text-xl sm:text-2xl font-black tracking-tight text-foreground pr-8">
              {book.title}
            </Dialog.Title>
            <Dialog.Description className="text-muted-foreground mt-1 text-xs sm:text-sm font-medium">
              {author}
            </Dialog.Description>
            <Dialog.Close asChild>
              <button className="absolute right-4 sm:right-6 top-4 sm:top-6 p-2 sm:p-2.5 bg-card/40 hover:bg-card/80 border border-border/50 rounded-xl sm:rounded-2xl transition-all duration-300 text-muted-foreground hover:text-foreground cursor-pointer" title="Close">
                <X className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-4 sm:space-y-6 custom-scrollbar">
            {/* Elegant Scraped Cover Rendering */}
            {coverUrl && (
              <div className="flex justify-center mb-4">
                <div className="w-36 h-52 bg-muted/40 rounded-xl overflow-hidden shadow-md border border-border/50 flex-shrink-0">
                  <img
                    src={coverUrl}
                    alt={book.title}
                    className="w-full h-full object-cover transition-opacity duration-300"
                    loading="lazy"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {publisher && (
                <div className="bg-muted/10 p-3 rounded-2xl border border-border/30">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Publisher</span>
                  <p className="text-sm font-medium text-foreground mt-0.5 truncate">{publisher}</p>
                </div>
              )}
              {year && (
                <div className="bg-muted/10 p-3 rounded-2xl border border-border/30">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Published Year</span>
                  <p className="text-sm font-medium text-foreground mt-0.5">{year}</p>
                </div>
              )}
              {language && (
                <div className="bg-muted/10 p-3 rounded-2xl border border-border/30">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Language</span>
                  <p className="text-sm font-medium text-foreground mt-0.5 uppercase">{language}</p>
                </div>
              )}
              {fileSize && (
                <div className="bg-muted/10 p-3 rounded-2xl border border-border/30">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">File Size</span>
                  <p className="text-sm font-medium text-foreground mt-0.5">{fileSize}</p>
                </div>
              )}
            </div>

            <div>
              <h3 className="font-semibold text-sm text-foreground tracking-tight mb-2.5">Metadata</h3>
              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1.5 rounded-xl bg-primary/10 text-primary border border-primary/20 text-xs font-semibold uppercase">
                  {format} Book
                </span>
                {book.description && (
                  <span className="px-3 py-1.5 rounded-xl bg-muted text-muted-foreground border border-border text-xs font-medium">
                    {book.description}
                  </span>
                )}
              </div>
            </div>
            
            <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/10 text-amber-600 dark:text-amber-400 text-xs flex gap-3 leading-normal">
              <div className="p-1.5 bg-amber-500/10 rounded-xl h-fit">
                <AlertTriangle className="w-3.5 h-3.5" />
              </div>
              <p>
                LibGen links are retrieved dynamically from mirror sites. The download might take a few moments to resolve and fetch. Thank you for your patience!
              </p>
            </div>

            <DownloadProgressBar bookTitle={book.title} progress={downloadProgress} />
          </div>

          <div className="flex-none p-4 sm:p-6 border-t border-border/50 bg-muted/30 flex justify-end gap-2 sm:gap-3 backdrop-blur-md">
            <Dialog.Close asChild>
              <Button variant="outline" className="rounded-xl sm:rounded-2xl px-4 sm:px-6 h-9 sm:h-10 text-xs sm:text-sm">
                Close
              </Button>
            </Dialog.Close>
            
            <Button 
              variant="default" 
              onClick={handleDownload}
              disabled={isDownloading || isReading}
              className="gap-2 rounded-xl sm:rounded-2xl shadow-primary/20 shadow-lg hover:shadow-primary/30 transition-all h-9 sm:h-10 text-xs sm:text-sm"
            >
              {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {isAndroid ? 'Download Now' : 'Add to Library'}
            </Button>
          </div>

        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
