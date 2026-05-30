import { useCallback, useEffect, useState } from 'react';
import { BookOpen, Globe, Search, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OnlineSearchHeader } from './OnlineSearchHeader';
import { useOnlineSearchStore } from '@/store/onlineSearchStore';
import { ContentCarousel, type CarouselItem } from './ContentCarousel';
import { OnlineResultCard } from './OnlineResultCard';
import { fetchGutenbergBooks, fetchPopularGutenbergBooks } from '@/online-books/gutenberg/api';
import { fetchLibgenBooks } from '@/online-books/libgen/api';
import { GutendexBook } from '@/online-books/gutenberg/types';
import { SearchResult, pluginApi } from '@/lib/pluginSources';
import { GutenbergBookDetails } from './GutenbergBookDetails';
import { LibgenBookDetails } from './LibgenBookDetails';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';

let searchTimeout: number | undefined;

export function OnlineBooksView() {
  const searchQuery = useOnlineSearchStore((state) => state.queries['online-books']);
  const setSearchQuery = useOnlineSearchStore((state) => state.setQueryForKind);
  
  // Tabs: 'gutenberg' | 'libgen'
  const [activeTab, setActiveTab] = useState<'gutenberg' | 'libgen'>('gutenberg');
  
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

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [selectedGutenbergBook, setSelectedGutenbergBook] = useState<GutendexBook | null>(null);
  const [selectedLibgenBook, setSelectedLibgenBook] = useState<SearchResult | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  // Load popular books on mount
  useEffect(() => {
    if (popularBooks.length > 0 || gutenbergHasSearched || activeTab !== 'gutenberg') return;
    
    const loadPopular = async () => {
      setPopularLoading(true);
      try {
        const res = await fetchPopularGutenbergBooks();
        setPopularBooks(res.results.slice(0, 20)); // Take top 20
      } catch (err) {
        logger.error('Failed to load popular Gutenberg books:', err);
      } finally {
        setPopularLoading(false);
      }
    };
    
    void loadPopular();
  }, [gutenbergHasSearched, popularBooks.length, activeTab]);

  const handleSearch = useCallback(async (page: number = 1, queryOverride?: string) => {
    const query = (queryOverride ?? searchQuery).trim();
    if (!query) return;

    setError(null);
    setLoading(true);
    
    try {
      if (activeTab === 'gutenberg') {
        const res = await fetchGutenbergBooks(query, page);
        setGutenbergResults(res.results);
        setGutenbergTotal(res.count);
        setGutenbergPage(page);
        setGutenbergHasSearched(true);
      } else {
        // Query more results since we filter for EPUB only on frontend
        const res = await fetchLibgenBooks(query, page, 75);
        // Filter to keep only EPUB format
        const epubsOnly = res.items.filter(item => {
          const extra = (item.extra || {}) as Record<string, string>;
          return extra.format?.toLowerCase() === 'epub';
        });
        setLibgenResults(epubsOnly);
        setLibgenTotal(epubsOnly.length);
        setLibgenPage(page);
        setLibgenHasSearched(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      if (activeTab === 'gutenberg') {
        setGutenbergResults([]);
      } else {
        setLibgenResults([]);
      }
    } finally {
      setLoading(false);
    }
  }, [searchQuery, activeTab]);

  // Trigger search when switching tabs if search query is already filled
  useEffect(() => {
    const query = searchQuery.trim();
    if (query) {
      void handleSearch(1, query);
    }
  }, [activeTab, handleSearch]);

  const scheduleSearch = useCallback((value: string) => {
    setSearchQuery('books', value);

    const trimmed = value.trim();
    if (!trimmed) {
      if (activeTab === 'gutenberg') {
        setGutenbergHasSearched(false);
      } else {
        setLibgenHasSearched(false);
      }
      window.clearTimeout(searchTimeout);
      return;
    }

    window.clearTimeout(searchTimeout);
    searchTimeout = window.setTimeout(() => {
      void handleSearch(1, trimmed);
    }, 500);
  }, [handleSearch, setSearchQuery, activeTab]);

  const toCarouselItems = (books: GutendexBook[]): CarouselItem[] => {
    return books.map((b) => ({
      id: b.id.toString(),
      title: b.title,
      coverUrl: b.formats['image/jpeg'] || undefined,
      subtitle: b.authors.map(a => a.name).join(', '),
    }));
  };

  const handleCarouselItemClick = (item: CarouselItem) => {
    const book = popularBooks.find(b => b.id.toString() === item.id);
    if (book) {
      setSelectedGutenbergBook(book);
      setSelectedLibgenBook(null);
      setIsDetailsOpen(true);
    }
  };

  const gutenbergTotalPages = Math.ceil(gutenbergTotal / 32); // Gutendex returns 32 per page
  // Libgen is queried as a single batch and filtered, so no large page chunks needed
  const libgenTotalPages = 1;

  const currentResults = activeTab === 'gutenberg' ? gutenbergResults : libgenResults;
  const currentTotal = activeTab === 'gutenberg' ? gutenbergTotal : libgenTotal;
  const currentPage = activeTab === 'gutenberg' ? gutenbergPage : libgenPage;
  const currentTotalPages = activeTab === 'gutenberg' ? gutenbergTotalPages : libgenTotalPages;
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

      {/* Premium Glassmorphism Tabs Switcher */}
      <div className="border-b border-border px-6 py-2 bg-card/25 backdrop-blur-md flex justify-center">
        <div className="flex bg-muted/60 p-1 rounded-xl w-full max-w-md border border-border/40 shadow-inner">
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
        </div>
      </div>

      {error && (
        <div className="px-6 pt-3 max-w-5xl mx-auto w-full">
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
            {error}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto">
          
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loading && currentHasSearched && currentResults.length === 0 && (
            <div className="text-center py-12">
              <BookOpen className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-lg font-medium text-muted-foreground">No books found</p>
              <p className="text-sm text-muted-foreground mt-1">Try a different search query</p>
            </div>
          )}

          {!loading && !currentHasSearched && activeTab === 'gutenberg' && (
            <div className="space-y-8">
              <div className="bg-primary/5 rounded-2xl p-8 text-center border border-primary/10">
                <BookOpen className="w-12 h-12 mx-auto mb-4 text-primary" />
                <h2 className="text-2xl font-bold mb-2">Welcome to the Public Domain</h2>
                <p className="text-muted-foreground max-w-lg mx-auto">
                  Read thousands of classic novels, non-fiction, and historical texts directly in the app. No downloads or accounts required.
                </p>
              </div>

              <ContentCarousel
                title="Popular Classics"
                items={toCarouselItems(popularBooks)}
                loading={popularLoading}
                onItemClick={handleCarouselItemClick}
              />
            </div>
          )}

          {!loading && !currentHasSearched && activeTab === 'libgen' && (
            <div className="space-y-8">
              <div className="bg-primary/5 rounded-2xl p-8 text-center border border-primary/10">
                <Globe className="w-12 h-12 mx-auto mb-4 text-primary" />
                <h2 className="text-2xl font-bold mb-2">Explore Millions of Books</h2>
                <p className="text-muted-foreground max-w-lg mx-auto">
                  Search across one of the largest digital library collections in the world. Enjoy direct EPUB downloads that integrate seamlessly with your reading dashboard.
                </p>
              </div>
            </div>
          )}

          {!loading && currentResults.length > 0 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Found <span className="font-medium text-foreground">{currentTotal.toLocaleString()}</span> results
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
                {activeTab === 'gutenberg' ? (
                  (currentResults as GutendexBook[]).map((book) => (
                    <OnlineResultCard
                      key={book.id}
                      id={book.id.toString()}
                      title={book.title}
                      coverUrl={book.formats['image/jpeg']}
                      author={book.authors.map(a => a.name).join(', ')}
                      description={book.subjects.slice(0, 3).join(', ')}
                      format="EPUB"
                      onViewDetails={() => {
                        setSelectedGutenbergBook(book);
                        setSelectedLibgenBook(null);
                        setIsDetailsOpen(true);
                      }}
                    />
                  ))
                ) : (
                  (currentResults as SearchResult[]).map((book) => {
                    const extra = (book.extra || {}) as Record<string, string>;
                    const author = extra.author || 'Unknown Author';
                    const format = extra.format || 'EPUB';
                    const fileSize = extra.file_size;
                    const yearStr = extra.year;
                    const yearNum = yearStr ? parseInt(yearStr, 10) : undefined;
                    const language = extra.language;
                    
                    return (
                      <OnlineResultCard
                        key={book.id}
                        id={book.id}
                        title={book.title}
                        author={author}
                        description={book.description}
                        format={format}
                        fileSize={fileSize}
                        language={language}
                        year={yearNum}
                        onViewDetails={() => {
                          setSelectedLibgenBook(book);
                          setSelectedGutenbergBook(null);
                          setIsDetailsOpen(true);
                        }}
                      />
                    );
                  })
                )}
              </div>

              {currentTotalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-4">
                    <Button
                      variant="outline"
                      onClick={() => handleSearch(currentPage - 1)}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground px-4">
                      Page {currentPage} of {currentTotalPages}
                    </span>
                    <Button
                      variant="outline"
                      onClick={() => handleSearch(currentPage + 1)}
                      disabled={currentPage === currentTotalPages}
                    >
                      Next
                    </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {activeTab === 'gutenberg' ? (
        <GutenbergBookDetails 
          book={selectedGutenbergBook} 
          open={isDetailsOpen} 
          onOpenChange={setIsDetailsOpen} 
        />
      ) : (
        <LibgenBookDetails
          book={selectedLibgenBook}
          open={isDetailsOpen}
          onOpenChange={setIsDetailsOpen}
        />
      )}
    </div>
  );
}
