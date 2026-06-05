import { useCallback, useEffect, useState } from 'react';
import { BookOpen, Globe, Search } from 'lucide-react';
import { OnlineSearchHeader } from './OnlineSearchHeader';
import { useOnlineSearchStore } from '@/store/onlineSearchStore';
import { useOnlineDownloadStore } from '@/store/onlineDownloadStore';
import { ContentCarousel, type CarouselItem } from './ContentCarousel';
import { ModernBookCard } from './ModernBookCard';
import { QuickPreviewModal, type PreviewBook } from './QuickPreviewModal';
import { fetchGutenbergBooks, fetchPopularGutenbergBooks } from '@/online-books/gutenberg/api';
import { fetchLibgenBooks } from '@/online-books/libgen/api';
import { GutendexBook } from '@/online-books/gutenberg/types';
import { fetchTrendingBooks } from '@/online-books/openlibrary/api';
import { OpenLibraryWork } from '@/online-books/openlibrary/types';
import { SearchResult, pluginApi } from '@/lib/pluginSources';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';
import { useInView } from 'react-intersection-observer';
import { useToast } from '@/store/toastStore';
import { useBookOpen } from '@/hooks/useBookOpen';
import { downloadAndImportLibgen } from '@/online-books/libgen/importer';
import { downloadAndImportGutenberg } from '@/online-books/gutenberg/importer';

let searchTimeout: number | undefined;

export function OnlineBooksView() {
  const searchQuery = useOnlineSearchStore((state) => state.queries['online-books']);
  const filters = useOnlineSearchStore((state) => state.filters['online-books']);
  const setSearchQuery = useOnlineSearchStore((state) => state.setQueryForKind);
  
  const { initializeListeners } = useOnlineDownloadStore();
  const { success: showSuccessToast, error: showErrorToast } = useToast();
  const { handleOpenBook } = useBookOpen();

  useEffect(() => {
    initializeListeners();
  }, [initializeListeners]);
  
  // Tabs: 'gutenberg' | 'libgen'
  const [activeTab, setActiveTab] = useState<'gutenberg' | 'libgen'>('libgen');
  
  // Project Gutenberg State
  const [gutenbergResults, setGutenbergResults] = useState<GutendexBook[]>([]);
  const [popularBooks, setPopularBooks] = useState<GutendexBook[]>([]);
  const [gutenbergTotal, setGutenbergTotal] = useState(0);
  const [gutenbergPage, setGutenbergPage] = useState(1);
  const [gutenbergHasSearched, setGutenbergHasSearched] = useState(false);
  const [popularLoading, setPopularLoading] = useState(false);
  
  // LibGen State
  const [libgenResults, setLibgenResults] = useState<SearchResult[]>([]);
  const [libgenTotal, setLibgenTotal] = useState(0);
  const [libgenPage, setLibgenPage] = useState(1);
  const [libgenHasSearched, setLibgenHasSearched] = useState(false);
  const [libgenTrending, setLibgenTrending] = useState<OpenLibraryWork[]>([]);
  const [libgenTrendingLoading, setLibgenTrendingLoading] = useState(false);

  const [loading, setLoading] = useState(false);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Modal State
  const [previewBook, setPreviewBook] = useState<PreviewBook | null>(null);

  // Infinite Scroll Hook
  const { ref: loadMoreRef, inView } = useInView({
    threshold: 0.1,
    rootMargin: '400px',
  });

  // Load popular books on mount
  useEffect(() => {
    if (popularBooks.length > 0 || gutenbergHasSearched || activeTab !== 'gutenberg') return;
    const loadPopular = async () => {
      setPopularLoading(true);
      try {
        const res = await fetchPopularGutenbergBooks();
        setPopularBooks(res.results.slice(0, 20));
      } catch (err) {
        logger.error('Failed to load popular Gutenberg books:', err);
      } finally {
        setPopularLoading(false);
      }
    };
    void loadPopular();
  }, [gutenbergHasSearched, popularBooks.length, activeTab]);

  // Load libgen trending books on mount
  useEffect(() => {
    if (libgenTrending.length > 0 || libgenHasSearched || activeTab !== 'libgen') return;
    const loadTrending = async () => {
      setLibgenTrendingLoading(true);
      try {
        const res = await fetchTrendingBooks();
        setLibgenTrending(res.slice(0, 20));
      } catch (err) {
        logger.error('Failed to load trending LibGen books:', err);
      } finally {
        setLibgenTrendingLoading(false);
      }
    };
    void loadTrending();
  }, [libgenHasSearched, libgenTrending.length, activeTab]);

  const handleSearch = useCallback(async (page: number = 1, queryOverride?: string) => {
    const query = (queryOverride ?? useOnlineSearchStore.getState().queries['online-books']).trim();
    const currentFilters = useOnlineSearchStore.getState().filters['online-books'] || {};
    const hasFilters = Object.keys(currentFilters).length > 0;
    
    if (!query && !hasFilters) return;

    setError(null);
    if (page === 1) setLoading(true);
    else setIsFetchingMore(true);
    
    try {
      if (activeTab === 'gutenberg') {
        const res = await fetchGutenbergBooks(query, page, currentFilters);
        setGutenbergResults(prev => page === 1 ? res.results : [...prev, ...res.results]);
        setGutenbergTotal(res.count);
        setGutenbergPage(page);
        setGutenbergHasSearched(true);
      } else {
        let libgenQuery = query;
        if (hasFilters) {
          const parts = [query];
          if (currentFilters.author) parts.push(currentFilters.author);
          if (currentFilters.yearStart) parts.push(currentFilters.yearStart.toString());
          if (currentFilters.publisher) parts.push(currentFilters.publisher);
          libgenQuery = parts.filter(Boolean).join(' ');
        }
        
        const res = await fetchLibgenBooks(libgenQuery, page, 75);
        const epubsOnly = res.items.filter(item => {
          const extra = (item.extra || {}) as Record<string, string>;
          return extra.format?.toLowerCase() === 'epub';
        });
        setLibgenResults(prev => page === 1 ? epubsOnly : [...prev, ...epubsOnly]);
        setLibgenTotal(1000); // Fake total
        setLibgenPage(page);
        setLibgenHasSearched(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      if (page === 1) {
        if (activeTab === 'gutenberg') setGutenbergResults([]);
        else setLibgenResults([]);
      }
    } finally {
      setLoading(false);
      setIsFetchingMore(false);
    }
  }, [activeTab]);

  // Infinite Scroll Trigger
  useEffect(() => {
    if (inView && !loading && !isFetchingMore) {
      if (activeTab === 'gutenberg' && gutenbergResults.length < gutenbergTotal) {
        void handleSearch(gutenbergPage + 1);
      } else if (activeTab === 'libgen' && libgenHasSearched) {
        // LibGen infinite scroll (assuming we can just fetch next page if results aren't empty)
        void handleSearch(libgenPage + 1);
      }
    }
  }, [inView, activeTab, loading, isFetchingMore, gutenbergResults.length, gutenbergTotal, gutenbergPage, libgenHasSearched, libgenPage, handleSearch]);

  // Trigger search when switching tabs if search query is already filled
  useEffect(() => {
    const query = useOnlineSearchStore.getState().queries['online-books'].trim();
    if (query || Object.keys(filters).length > 0) {
      void handleSearch(1, query);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const scheduleSearch = useCallback((value: string) => {
    setSearchQuery('books', value);

    const trimmed = value.trim();
    const currentFilters = useOnlineSearchStore.getState().filters['online-books'] || {};
    const hasFilters = Object.keys(currentFilters).length > 0;

    if (!trimmed && !hasFilters) {
      if (activeTab === 'gutenberg') setGutenbergHasSearched(false);
      else setLibgenHasSearched(false);
      window.clearTimeout(searchTimeout);
      return;
    }

    window.clearTimeout(searchTimeout);
    searchTimeout = window.setTimeout(() => {
      void handleSearch(1, trimmed);
    }, 500);
  }, [handleSearch, setSearchQuery, activeTab]);

  const handleCarouselItemClick = (item: CarouselItem) => {
    if (activeTab === 'gutenberg') {
      const book = popularBooks.find(b => b.id.toString() === item.id);
      if (book) openGutenbergPreview(book);
    } else {
      setSearchQuery('books', item.title);
      void handleSearch(1, item.title);
    }
  };

  const toCarouselItems = (books: GutendexBook[]): CarouselItem[] => books.map((b) => ({
    id: b.id.toString(),
    title: b.title,
    coverUrl: b.formats['image/jpeg'] || undefined,
    subtitle: b.authors.map(a => a.name).join(', '),
  }));

  const toLibgenCarouselItems = (books: OpenLibraryWork[]): CarouselItem[] => books.map((b) => ({
    id: b.key,
    title: b.title,
    coverUrl: b.cover_i ? `https://covers.openlibrary.org/b/id/${b.cover_i}-M.jpg` : undefined,
    subtitle: b.author_name ? b.author_name.join(', ') : 'Unknown Author',
  }));

  const openGutenbergPreview = (book: GutendexBook) => {
    const epubUrl = book.formats['application/epub+zip'];
    setPreviewBook({
      id: book.id.toString(),
      title: book.title,
      author: book.authors.map(a => a.name).join(', '),
      coverUrl: book.formats['image/jpeg'],
      description: book.subjects.slice(0, 10).join(', '),
      format: 'EPUB',
      source: 'gutenberg',
      url: epubUrl || ''
    });
  };

  const openLibgenPreview = (book: SearchResult) => {
    const extra = (book.extra || {}) as Record<string, string>;
    const yearStr = extra.year;
    setPreviewBook({
      id: book.id,
      title: book.title,
      author: extra.author,
      coverUrl: book.coverUrl,
      description: book.description,
      format: extra.format || 'EPUB',
      fileSize: extra.file_size,
      language: extra.language,
      year: yearStr ? parseInt(yearStr, 10) : undefined,
      source: 'libgen',
      url: book.id // We use book ID to fetch the actual url later
    });
  };

  const handleDownload = async (preview: PreviewBook) => {
    try {
      let result;
      if (preview.source === 'gutenberg') {
        if (!preview.url) throw new Error("No EPUB format available.");
        result = await downloadAndImportGutenberg(preview.url, preview.title);
      } else {
        const pages = await pluginApi.getPages('libgen', preview.id);
        const directPage = pages.find(p => p.url.startsWith('direct|'));
        if (!directPage) throw new Error('No direct download links found for this book on LibGen.');
        const epubUrl = directPage.url.replace(/^direct\|/, '');
        
        // We set the URL in the preview object so the progress ring matches the target_id
        setPreviewBook(prev => prev ? { ...prev, url: epubUrl } : prev);
        
        result = await downloadAndImportLibgen(epubUrl, preview.title);
      }
      
      if (result.success.length > 0 || result.duplicates.length > 0) {
        showSuccessToast('Added to Library', `${preview.title} was added to your library.`);
        setPreviewBook(null); // Close modal on success
      } else if (result.failed.length > 0) {
        showErrorToast('Import Failed', result.failed[0][1] || 'Unknown error occurred.');
      }
    } catch (err) {
      showErrorToast('Download Failed', err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const currentResults = activeTab === 'gutenberg' ? gutenbergResults : libgenResults;
  const currentTotal = activeTab === 'gutenberg' ? gutenbergTotal : libgenTotal;
  const currentHasSearched = activeTab === 'gutenberg' ? gutenbergHasSearched : libgenHasSearched;

  return (
    <div className="flex flex-col h-full bg-background">
      <OnlineSearchHeader
        kind="books"
        title={activeTab === 'gutenberg' ? "Project Gutenberg" : "LibGen"}
        subtitle={activeTab === 'gutenberg' 
          ? "Search and read thousands of public domain books instantly" 
          : "Access millions of books and educational articles instantly"
        }
        searchValue={searchQuery}
        loading={loading}
        disabled={loading}
        onSearchValueChange={scheduleSearch}
        onSubmit={() => {
          const q = searchQuery.trim();
          if (q) void handleSearch(1, q);
        }}
      />

      <div className="border-b border-border px-6 py-2 bg-card/25 backdrop-blur-md flex justify-center">
        <div className="flex bg-muted/60 p-1 rounded-xl w-full max-w-md border border-border/40 shadow-inner">
          <button
            type="button"
            onClick={() => setActiveTab('libgen')}
            className={cn(
              "flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all duration-300 flex items-center justify-center gap-2",
              activeTab === 'libgen' 
                ? "bg-card text-foreground shadow-sm border border-border/20 scale-[1.02]" 
                : "text-muted-foreground hover:text-foreground hover:bg-card/10"
            )}
          >
            <Globe className="w-3.5 h-3.5" />
            LibGen (EPUB)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('gutenberg')}
            className={cn(
              "flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all duration-300 flex items-center justify-center gap-2",
              activeTab === 'gutenberg' 
                ? "bg-card text-foreground shadow-sm border border-border/20 scale-[1.02]" 
                : "text-muted-foreground hover:text-foreground hover:bg-card/10"
            )}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Project Gutenberg
          </button>
        </div>
      </div>

      {error && (
        <div className="px-6 pt-3 max-w-5xl mx-auto w-full">
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
            {error}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        <div className="max-w-7xl mx-auto">
          
          {loading && currentResults.length === 0 && (
            <div className="flex items-center justify-center py-20">
              <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin shadow-lg" />
            </div>
          )}

          {!loading && currentHasSearched && currentResults.length === 0 && (
            <div className="text-center py-24 bg-card/30 rounded-2xl border border-border/40 backdrop-blur-sm">
              <BookOpen className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
              <p className="text-xl font-medium text-foreground">No books found</p>
              <p className="text-sm text-muted-foreground mt-2">Try adjusting your filters or search query.</p>
            </div>
          )}

          {!loading && !currentHasSearched && activeTab === 'gutenberg' && (
            <div className="space-y-10 animate-in fade-in duration-700">
              <ContentCarousel
                title="Trending Classics"
                items={toCarouselItems(popularBooks)}
                loading={popularLoading}
                onItemClick={handleCarouselItemClick}
              />
              <ContentCarousel
                title="Timeless Fiction"
                items={toCarouselItems(popularBooks.filter(b => b.subjects.some(s => s.toLowerCase().includes('fiction'))))}
                loading={popularLoading}
                onItemClick={handleCarouselItemClick}
              />
              <ContentCarousel
                title="Historical Works"
                items={toCarouselItems(popularBooks.filter(b => b.subjects.some(s => s.toLowerCase().includes('history'))))}
                loading={popularLoading}
                onItemClick={handleCarouselItemClick}
              />
            </div>
          )}

          {!loading && !currentHasSearched && activeTab === 'libgen' && (
            <div className="space-y-10 animate-in fade-in duration-700">
              <ContentCarousel
                title="Trending Worldwide"
                items={toLibgenCarouselItems(libgenTrending)}
                loading={libgenTrendingLoading}
                onItemClick={handleCarouselItemClick}
              />
              <ContentCarousel
                title="What's New"
                items={toLibgenCarouselItems(libgenTrending.slice().reverse())}
                loading={libgenTrendingLoading}
                onItemClick={handleCarouselItemClick}
              />
            </div>
          )}

          {currentResults.length > 0 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Found <span className="font-semibold text-foreground">{currentTotal > 999 ? '1000+' : currentTotal.toLocaleString()}</span> results
                </p>
              </div>

              {/* Modern CSS Grid Layout */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-4 gap-y-8">
                {activeTab === 'gutenberg' ? (
                  (currentResults as GutendexBook[]).map((book) => (
                    <ModernBookCard
                      key={book.id}
                      id={book.formats['application/epub+zip'] || book.id.toString()}
                      title={book.title}
                      coverUrl={book.formats['image/jpeg']}
                      author={book.authors.map(a => a.name).join(', ')}
                      format="EPUB"
                      onClick={() => openGutenbergPreview(book)}
                    />
                  ))
                ) : (
                  (currentResults as SearchResult[]).map((book) => {
                    const extra = (book.extra || {}) as Record<string, string>;
                    const yearStr = extra.year;
                    const yearNum = yearStr ? parseInt(yearStr, 10) : undefined;
                    
                    return (
                      <ModernBookCard
                        key={book.id}
                        id={book.id} // Replaced with URL dynamically when downloading
                        title={book.title}
                        coverUrl={book.coverUrl}
                        author={extra.author}
                        format={extra.format || 'EPUB'}
                        year={yearNum}
                        onClick={() => openLibgenPreview(book)}
                      />
                    );
                  })
                )}
              </div>

              {/* Infinite Scroll Trigger */}
              <div ref={loadMoreRef} className="py-12 flex justify-center">
                {isFetchingMore && (
                  <div className="w-8 h-8 border-4 border-primary/40 border-t-primary rounded-full animate-spin" />
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <QuickPreviewModal 
        isOpen={!!previewBook}
        book={previewBook}
        onClose={() => setPreviewBook(null)}
        onDownload={handleDownload}
      />
    </div>
  );
}
