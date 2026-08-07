import { useEffect, useState, useCallback } from 'react';
import { useIsMobile } from '@/hooks/useIsMobile';
import { cn } from '@/lib/utils';
import { useOnlineSearchStore } from '@/store/onlineSearchStore';
import { useSourceStore } from '@/store/sourceStore';
import { useGlobalSearch, type BookSourceFilter } from '@/hooks/useGlobalSearch';
import { OnlineSearchHeader } from './OnlineSearchHeader';
import { Compass } from 'lucide-react';
import { OnlineBooksDashboard } from './OnlineBooksDashboard';
import { ModernBookCard } from './ModernBookCard';
import { SkeletonGrid } from './SkeletonLoaders';
import { OnlineBookSidePanel, type PreviewBook } from './OnlineBookSidePanel';
import { useInView } from 'react-intersection-observer';
import { downloadAndImportGutenberg } from '@/online-books/gutenberg/importer';
import { downloadAndImportLibgen } from '@/online-books/libgen/importer';
import { downloadAndImportAnnas } from '@/online-books/annas-archive/importer';
import { useLibraryStore } from '@/store/libraryStore';
import { useToast } from '@/store/toastStore';
import { useOnlineDownloadStore } from '@/store/onlineDownloadStore';
import { DownloadsButton } from './DownloadQueuePanel';
import { useBookOpen } from '@/hooks/useBookOpen';
import { invoke } from '@tauri-apps/api/core';
import { api } from '@/lib/tauri';

import { Globe, BookOpen, Library, Zap, type LucideIcon } from 'lucide-react';

const SOURCE_ICONS: Record<string, LucideIcon> = {
  all: Globe,
  gutenberg: BookOpen,
  libgen: Library,
  'annas-archive': Zap,
};

const SOURCE_FILTER_LABELS: Record<string, string> = {
  libgen: 'LibGen',
  gutenberg: 'Gutenberg',
  'annas-archive': "Anna's Archive",
};

let searchTimeout: number | undefined;

export function OnlineBooksView() {
  const isMobile = useIsMobile();
  const searchQuery = useOnlineSearchStore((state) => state.queries['online-books']);
  const filters = useOnlineSearchStore((state) => state.filters['online-books']);
  const { results, search, loading, error, hasMore } = useGlobalSearch();
  const enabledBookSources = useSourceStore((state) => state.sources).filter(
    (s) => s.kind === 'books' && s.enabled
  );
  
  const [page, setPage] = useState(1);
  const [source, setSource] = useState<BookSourceFilter>('all');
  const [hasSearched, setHasSearched] = useState(false);
  const [previewBook, setPreviewBook] = useState<PreviewBook | null>(null);
  
  const { success: showSuccessToast, error: showErrorToast } = useToast();
  const { handleOpenBook } = useBookOpen();

  const { ref: loadMoreRef, inView } = useInView({
    threshold: 0.1,
    rootMargin: '400px',
  });

  const doSearch = useCallback((p: number = 1) => {
    if (!searchQuery && Object.keys(filters).length === 0) {
      return;
    }
    
    setHasSearched(true);
    setPage(p);
    search(searchQuery, p, filters, source);
  }, [searchQuery, filters, search, source]);

  useEffect(() => {
    setHasSearched(false);
    setPage(1);
    
    if (searchTimeout) window.clearTimeout(searchTimeout);
    
    if (searchQuery || Object.keys(filters).length > 0) {
      searchTimeout = window.setTimeout(() => {
        if (!loading) {
          search(searchQuery, 1, filters, source);
          setHasSearched(true);
        }
      }, 500);
    }
    
    return () => {
      if (searchTimeout) window.clearTimeout(searchTimeout);
    };
  }, [searchQuery, filters, source]);

  // Infinite scroll
  useEffect(() => {
    if (inView && !loading && hasSearched && hasMore) {
      setPage((p) => {
        search(searchQuery, p + 1, filters, source);
        return p + 1;
      });
    }
  }, [inView, loading, hasSearched, hasMore, search, searchQuery, filters, source]);

  const handleBookClick = (book: any) => {
    // Determine the source and format
    setPreviewBook({
      title: book.title,
      author: book.author,
      coverUrl: book.coverUrl,
      source: book.source,
      downloadUrl: book.id,
      format: book.format || 'epub',
      language: book.language,
      size: book.size,
      mirrors: book.mirrors,
    });
  };

  const handleDownload = async (book: PreviewBook) => {
    try {
      showSuccessToast('Download Started', `Downloading ${book.title}`);
      // Register the title up-front so the queue panel can show it (the
      // backend progress payload only carries target_id).
      useOnlineDownloadStore.getState().registerDownload(book.downloadUrl, book.title);
      let result;
      if (book.source === 'gutenberg') {
        result = await downloadAndImportGutenberg(book.downloadUrl, book.title);
      } else if (book.source === 'annas-archive') {
        result = await downloadAndImportAnnas(book.downloadUrl, book.title);
      } else {
        result = await downloadAndImportLibgen(book.downloadUrl, book.title, book.mirrors, book.format);
      }
      if (result.success.length > 0) {
        await useLibraryStore.getState().loadInitialBooks();
        showSuccessToast('Download Complete', `${book.title} added to your library`);
      }
      if (result.failed && result.failed.length > 0) {
        showErrorToast('Import Failed', result.failed[0][1] || 'Unknown error occurred during import.');
      }
    } catch (err: any) {
      showErrorToast('Download Failed', err.message);
    }
  };

  // Smart Streaming / Read Now
  const handleReadNow = async (book: PreviewBook) => {
    try {
      showSuccessToast('Buffering...', `Preparing ${book.title} for reading`);
      useOnlineDownloadStore.getState().registerDownload(book.downloadUrl, book.title);
      let bookId: number;
      if (book.source === 'gutenberg') {
        const result = await downloadAndImportGutenberg(book.downloadUrl, book.title);
        if (result.success.length === 0) {
          const errMsg = result.failed && result.failed.length > 0 ? result.failed[0][1] : 'Failed to import book';
          throw new Error(errMsg);
        }
      } else if (book.source === 'annas-archive') {
        const result = await downloadAndImportAnnas(book.downloadUrl, book.title);
        if (result.success.length === 0) {
          const errMsg = result.failed && result.failed.length > 0 ? result.failed[0][1] : 'Failed to import book';
          throw new Error(errMsg);
        }
      } else {
        const result = await downloadAndImportLibgen(book.downloadUrl, book.title, book.mirrors, book.format);
        if (result.success.length === 0) {
          const errMsg = result.failed && result.failed.length > 0 ? result.failed[0][1] : 'Failed to import book';
          throw new Error(errMsg);
        }
      }
      
      const searchRes = await api.searchBooks({ query: book.title });
      if (searchRes.books.length > 0) {
        await useLibraryStore.getState().loadInitialBooks();
        handleOpenBook(searchRes.books[0].id!);
      } else {
        throw new Error('Could not find the imported book in library.');
      }
    } catch (err: any) {
      showErrorToast('Read Now Failed', err.message);
    }
  };

  const handleAddToWishlist = async (book: PreviewBook) => {
    try {
      showSuccessToast('Adding...', `Adding ${book.title} to wishlist`);
      
      const newBook = {
        uuid: crypto.randomUUID(),
        title: book.title,
        authors: book.author ? [{ name: book.author }] : [],
        file_path: `shiori-wishlist://${book.downloadUrl}`,
        file_format: book.format || 'epub',
        is_wishlist: true,
        cover_path: book.coverUrl,
        reading_status: 'planning',
        added_date: new Date().toISOString(),
        modified_date: new Date().toISOString(),
        language: book.language || 'en',
        domain: book.source,
      };

      const result = await invoke('add_book', { book: newBook });
      showSuccessToast('Added to Wishlist', `${book.title} has been added to your reading plan.`);
    } catch (err: any) {
      showErrorToast('Failed to Add', err.message || 'Could not add to wishlist.');
    }
  };

  return (
    <div className="flex flex-col h-full bg-background relative z-10">
      <div className="relative">
        <OnlineSearchHeader 
          kind="books"
          title="Online Library"
          subtitle="Search Libgen, Gutenberg & Anna's Archive"
          searchValue={searchQuery}
          loading={loading}
          disabled={false}
          onSearchValueChange={(val) => useOnlineSearchStore.getState().setQuery('online-books', val)}
          onSubmit={() => doSearch(1)}
        />
      </div>

      {/* Executive Source Selector Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto px-4 md:px-8 py-3 border-b border-border/40 bg-background/60 backdrop-blur-xl no-scrollbar z-10">
        <button
          onClick={() => {
            setSource('all');
            setPage(1);
          }}
          className={cn(
            "flex items-center gap-2 shrink-0 rounded-2xl px-4 py-2 text-xs font-extrabold transition-all duration-200 shadow-xs",
            source === 'all'
              ? "bg-primary text-primary-foreground shadow-md shadow-primary/25 ring-1 ring-primary/40 scale-[1.02]"
              : "bg-secondary/40 text-muted-foreground hover:text-foreground hover:bg-secondary/80 border border-border/50"
          )}
        >
          <Globe className="w-3.5 h-3.5" />
          <span>All Sources</span>
        </button>
        {enabledBookSources.map((s) => {
          const IconComp = SOURCE_ICONS[s.id] || Globe;
          const label = SOURCE_FILTER_LABELS[s.id] ?? s.name;
          const isActive = source === s.id;

          return (
            <button
              key={s.id}
              onClick={() => {
                setSource(s.id as BookSourceFilter);
                setPage(1);
              }}
              className={cn(
                "flex items-center gap-2 shrink-0 rounded-2xl px-4 py-2 text-xs font-extrabold transition-all duration-200 shadow-xs",
                isActive
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/25 ring-1 ring-primary/40 scale-[1.02]"
                  : "bg-secondary/40 text-muted-foreground hover:text-foreground hover:bg-secondary/80 border border-border/50"
              )}
            >
              <IconComp className={cn("w-3.5 h-3.5", isActive ? "text-primary-foreground" : "text-primary/70")} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      {!hasSearched ? (
        <OnlineBooksDashboard />
      ) : (
        <div className={cn("flex-1 overflow-y-auto scroll-smooth", isMobile ? "pb-24 p-6" : "p-6")}>
          <div className="max-w-[1600px] mx-auto">
            {error && (
              <div className="bg-red-500/10 text-red-500 p-4 rounded-lg mb-6 border border-red-500/20">
                {error}
              </div>
            )}

            {results.length > 0 ? (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(115px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] md:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3 md:gap-6">
                {results.map((book) => (
                  <ModernBookCard
                    key={`${book.source}-${book.id}`}
                    id={book.id}
                    title={book.title}
                    author={book.author}
                    coverUrl={book.coverUrl}
                    format={book.format}
                    year={book.year}
                    onClick={() => handleBookClick(book)}
                  />
                ))}
              </div>
            ) : !loading && hasSearched && !error ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <Compass className="w-12 h-12 mb-4 opacity-20" />
                <p className="text-lg">No books found for this search.</p>
                <p className="text-sm opacity-70">Try using different keywords or removing filters.</p>
              </div>
            ) : null}

            {loading && (
              <div className="mt-8">
                <SkeletonGrid count={12} />
              </div>
            )}

            <div ref={loadMoreRef} className="h-20 w-full" />
          </div>
        </div>
      )}

      {previewBook && (
        <OnlineBookSidePanel
          book={previewBook}
          onClose={() => setPreviewBook(null)}
          onDownload={() => {
            handleDownload(previewBook);
            setPreviewBook(null);
          }}
        />
      )}
    </div>
  );
}
