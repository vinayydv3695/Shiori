import { useState } from 'react';
import { Search, BookOpen, ExternalLink, Calendar, User, Globe } from 'lucide-react';
import { useOpenLibrary, type OpenLibraryBook } from '@/hooks/useOpenLibrary';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { logger } from '@/lib/logger';

export function OnlineBooksView() {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<OpenLibraryBook[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasSearched, setHasSearched] = useState(false);
  
  const { searchBooks, getCoverUrl, getReadUrl, getBookDetailsUrl, loading, error } = useOpenLibrary();

  const handleSearch = async (page: number = 1) => {
    if (!searchQuery.trim()) return;

    logger.info('Searching Open Library:', { query: searchQuery, page });
    
    const result = await searchBooks(searchQuery, page, 20);
    
    if (result) {
      setResults(result.docs);
      setTotalResults(result.numFound);
      setCurrentPage(page);
      setHasSearched(true);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch(1);
    }
  };

  const openInBrowser = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const totalPages = Math.ceil(totalResults / 20);

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex-shrink-0 border-b border-border bg-muted/30 p-6">
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="flex items-center gap-3">
            <Globe className="w-8 h-8 text-primary" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Online Books</h1>
              <p className="text-sm text-muted-foreground">Search and read books from Open Library</p>
            </div>
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Search by title, author, ISBN..."
                className="pl-10"
              />
            </div>
            <Button onClick={() => handleSearch(1)} disabled={loading || !searchQuery.trim()}>
              {loading ? 'Searching...' : 'Search'}
            </Button>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
              {error}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">
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
            <div className="text-center py-12">
              <Search className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-lg font-medium text-muted-foreground">Search for books</p>
              <p className="text-sm text-muted-foreground mt-1">Enter a title, author, or ISBN to get started</p>
            </div>
          )}

          {!loading && results.length > 0 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Found <span className="font-medium text-foreground">{totalResults.toLocaleString()}</span> results
                </p>
                {totalPages > 1 && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSearch(currentPage - 1)}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Page {currentPage} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSearch(currentPage + 1)}
                      disabled={currentPage === totalPages}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </div>

              <div className="grid gap-4">
                {results.map((book) => (
                  <div
                    key={book.key}
                    className="flex gap-4 p-4 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <div className="w-24 h-36 flex-shrink-0 bg-muted rounded overflow-hidden">
                      {book.cover_i ? (
                        <img
                          src={getCoverUrl(book.cover_i, 'M') || ''}
                          alt={book.title}
                          className="w-full h-full object-contain bg-muted"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <BookOpen className="w-8 h-8 text-muted-foreground opacity-50" />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0 space-y-2">
                      <div>
                        <h3 className="font-semibold text-lg line-clamp-2">{book.title}</h3>
                        {book.author_name && book.author_name.length > 0 && (
                          <div className="flex items-center gap-1.5 mt-1 text-sm text-muted-foreground">
                            <User className="w-3.5 h-3.5" />
                            <span className="line-clamp-1">{book.author_name.join(', ')}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                        {book.first_publish_year && (
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            <span>{book.first_publish_year}</span>
                          </div>
                        )}
                        {book.edition_count && (
                          <div>
                            <span className="font-medium">{book.edition_count}</span> editions
                          </div>
                        )}
                        {book.language && book.language.length > 0 && (
                          <div>
                            {book.language.slice(0, 3).join(', ')}
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2 pt-2">
                        {book.has_fulltext && book.ia && book.ia.length > 0 && (
                          <Button
                            size="sm"
                            onClick={() => openInBrowser(getReadUrl(book.ia![0]))}
                            className="gap-1.5"
                          >
                            <BookOpen className="w-3.5 h-3.5" />
                            Read Online
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openInBrowser(getBookDetailsUrl(book.key))}
                          className="gap-1.5"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          View Details
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
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
    </div>
  );
}
