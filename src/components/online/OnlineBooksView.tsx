import { useCallback, useEffect, useState } from 'react';
import { BookOpen, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OnlineSearchHeader } from './OnlineSearchHeader';
import { useOnlineSearchStore } from '@/store/onlineSearchStore';
import { ContentCarousel, type CarouselItem } from './ContentCarousel';
import { OnlineResultCard } from './OnlineResultCard';
import { fetchGutenbergBooks, fetchPopularGutenbergBooks } from '@/online-books/gutenberg/api';
import { GutendexBook } from '@/online-books/gutenberg/types';
import { GutenbergBookDetails } from './GutenbergBookDetails';
import { logger } from '@/lib/logger';

let searchTimeout: number | undefined;

export function OnlineBooksView() {
  const searchQuery = useOnlineSearchStore((state) => state.queries['online-books']);
  const setSearchQuery = useOnlineSearchStore((state) => state.setQueryForKind);
  
  const [results, setResults] = useState<GutendexBook[]>([]);
  const [popularBooks, setPopularBooks] = useState<GutendexBook[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  
  const [hasSearched, setHasSearched] = useState(Boolean(searchQuery.trim()));
  const [loading, setLoading] = useState(false);
  const [popularLoading, setPopularLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [selectedBook, setSelectedBook] = useState<GutendexBook | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  // Load popular books on mount
  useEffect(() => {
    if (popularBooks.length > 0 || hasSearched) return;
    
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
  }, [hasSearched, popularBooks.length]);

  const handleSearch = useCallback(async (page: number = 1, queryOverride?: string) => {
    const query = (queryOverride ?? searchQuery).trim();
    if (!query) return;

    setError(null);
    setLoading(true);
    
    try {
      const res = await fetchGutenbergBooks(query, page);
      setResults(res.results);
      setTotalResults(res.count);
      setCurrentPage(page);
      setHasSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  const scheduleSearch = useCallback((value: string) => {
    setSearchQuery('books', value);

    const trimmed = value.trim();
    if (!trimmed) {
      setHasSearched(false);
      window.clearTimeout(searchTimeout);
      return;
    }

    window.clearTimeout(searchTimeout);
    searchTimeout = window.setTimeout(() => {
      void handleSearch(1, trimmed);
    }, 500);
  }, [handleSearch, setSearchQuery]);

  const toCarouselItems = (books: GutendexBook[]): CarouselItem[] => {
    return books.map((b) => ({
      id: b.id.toString(),
      title: b.title,
      // Gutenberg cover images are often in 'image/jpeg' format URL in the formats dict
      coverUrl: b.formats['image/jpeg'] || undefined,
      subtitle: b.authors.map(a => a.name).join(', '),
    }));
  };

  const handleCarouselItemClick = (item: CarouselItem) => {
    const book = popularBooks.find(b => b.id.toString() === item.id);
    if (book) {
      setSelectedBook(book);
      setIsDetailsOpen(true);
    }
  };

  const totalPages = Math.ceil(totalResults / 32); // Gutendex returns 32 per page

  return (
    <div className="flex flex-col h-full bg-background">
      <OnlineSearchHeader
        kind="books"
        title="Project Gutenberg"
        subtitle="Search and read thousands of public domain books instantly"
        searchValue={searchQuery}
        loading={loading}
        disabled={loading}
        onSearchValueChange={scheduleSearch}
        onSubmit={() => {
          const q = searchQuery.trim();
          if (q) void handleSearch(1, q);
        }}
      />

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

          {!loading && hasSearched && results.length === 0 && (
            <div className="text-center py-12">
              <BookOpen className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-lg font-medium text-muted-foreground">No books found</p>
              <p className="text-sm text-muted-foreground mt-1">Try a different search query</p>
            </div>
          )}

          {!loading && !hasSearched && (
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

          {!loading && results.length > 0 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Found <span className="font-medium text-foreground">{totalResults.toLocaleString()}</span> results
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
                {results.map((book) => {
                  return (
                    <OnlineResultCard
                      key={book.id}
                      id={book.id.toString()}
                      title={book.title}
                      coverUrl={book.formats['image/jpeg']}
                      author={book.authors.map(a => a.name).join(', ')}
                      description={book.subjects.slice(0, 3).join(', ')}
                      onViewDetails={() => {
                        setSelectedBook(book);
                        setIsDetailsOpen(true);
                      }}
                    />
                  );
                })}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-4">
                    <Button
                      variant="outline"
                      onClick={() => handleSearch(currentPage - 1)}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground px-4">
                      Page {currentPage} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      onClick={() => handleSearch(currentPage + 1)}
                      disabled={currentPage === totalPages}
                    >
                      Next
                    </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <GutenbergBookDetails 
        book={selectedBook} 
        open={isDetailsOpen} 
        onOpenChange={setIsDetailsOpen} 
      />
    </div>
  );
}
