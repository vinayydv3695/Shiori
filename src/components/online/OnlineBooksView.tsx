import { useEffect, useState, useCallback } from 'react';
import { useIsMobile } from '@/hooks/useIsMobile';
import { cn } from '@/lib/utils';
import { useOnlineSearchStore } from '@/store/onlineSearchStore';
import { useGlobalSearch } from '@/hooks/useGlobalSearch';
import { OnlineSearchHeader } from './OnlineSearchHeader';
import { Search } from 'lucide-react';
import { OnlineBooksDashboard } from './OnlineBooksDashboard';
import { ModernBookCard } from './ModernBookCard';
import { SkeletonGrid } from './SkeletonLoaders';
import { OnlineBookSidePanel, type PreviewBook } from './OnlineBookSidePanel';
import { useInView } from 'react-intersection-observer';
import { downloadAndImportGutenberg } from '@/online-books/gutenberg/importer';
import { downloadAndImportLibgen } from '@/online-books/libgen/importer';
import { useLibraryStore } from '@/store/libraryStore';
import { useToast } from '@/store/toastStore';
import { useBookOpen } from '@/hooks/useBookOpen';
import { invoke } from '@tauri-apps/api/core';
import { api } from '@/lib/tauri';

let searchTimeout: number | undefined;

export function OnlineBooksView() {
  const isMobile = useIsMobile();
  const searchQuery = useOnlineSearchStore((state) => state.queries['online-books']);
  const filters = useOnlineSearchStore((state) => state.filters['online-books']);
  const { results, search, loading, error, hasMore } = useGlobalSearch();
  
  const [page, setPage] = useState(1);
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
    search(searchQuery, p, filters);
  }, [searchQuery, filters, search]);

  useEffect(() => {
    setHasSearched(false);
    setPage(1);
    
    if (searchTimeout) window.clearTimeout(searchTimeout);
    
    if (searchQuery || Object.keys(filters).length > 0) {
      searchTimeout = window.setTimeout(() => {
        if (!loading) {
          search(searchQuery, 1, filters);
          setHasSearched(true);
        }
      }, 500);
    }
    
    return () => {
      if (searchTimeout) window.clearTimeout(searchTimeout);
    };
  }, [searchQuery, filters]);

  // Infinite scroll
  useEffect(() => {
    if (inView && !loading && hasSearched && hasMore) {
      setPage((p) => {
        search(searchQuery, p + 1, filters);
        return p + 1;
      });
    }
  }, [inView, loading, hasSearched, hasMore, search, searchQuery, filters]);

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
      let result;
      if (book.source === 'gutenberg') {
        result = await downloadAndImportGutenberg(book.downloadUrl, book.title);
      } else {
        result = await downloadAndImportLibgen(book.downloadUrl, book.title, book.mirrors);
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
      let bookId: number;
      if (book.source === 'gutenberg') {
        const result = await downloadAndImportGutenberg(book.downloadUrl, book.title);
        if (result.success.length === 0) {
          const errMsg = result.failed && result.failed.length > 0 ? result.failed[0][1] : 'Failed to import book';
          throw new Error(errMsg);
        }
      } else {
        const result = await downloadAndImportLibgen(book.downloadUrl, book.title, book.mirrors);
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
      <OnlineSearchHeader 
        kind="books"
        title="Online Library"
        subtitle="Search Libgen & Gutenberg"
        searchValue={searchQuery}
        loading={loading}
        disabled={false}
        onSearchValueChange={(val) => useOnlineSearchStore.getState().setQuery('online-books', val)}
        onSubmit={() => doSearch(1)}
      />

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
              <div className="grid grid-cols-[repeat(auto-fill,minmax(115px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] md:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2 md:gap-4">
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
                <Search className="w-12 h-12 mb-4 opacity-20" />
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
