import { useCallback, useMemo, useState } from 'react';
import { BookOpen, ExternalLink, Calendar, User } from 'lucide-react';
import { useOpenLibrary, type OpenLibraryBook } from '@/hooks/useOpenLibrary';
import { Button } from '@/components/ui/button';
import { logger } from '@/lib/logger';
import { useSourceStore } from '@/store/sourceStore';
import { OnlineSearchHeader } from './OnlineSearchHeader';
import { useOnlineSearchStore } from '@/store/onlineSearchStore';

let onlineBooksSearchTimeout: number | undefined;

export function OnlineBooksView() {
  const searchQuery = useOnlineSearchStore((state) => state.queries['online-books']);
  const setSearchQuery = useOnlineSearchStore((state) => state.setQueryForKind);
  const [results, setResults] = useState<OpenLibraryBook[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasSearched, setHasSearched] = useState(Boolean(searchQuery.trim()));
  const sources = useSourceStore((state) => state.sources);
  const primarySourceByKind = useSourceStore((state) => state.primarySourceByKind);
  const [lastSearchedQuery, setLastSearchedQuery] = useState('');
  
  const { searchBooks, getCoverUrl, getReadUrl, getBookDetailsUrl, loading, error } = useOpenLibrary();

  const bookSources = useMemo(
    () => sources.filter((source) => source.kind === 'books'),
    [sources]
  );
  const enabledSources = useMemo(
    () => bookSources.filter((source) => source.enabled && source.implemented),
    [bookSources]
  );
  const activeSource = useMemo(() => {
    const preferredId = primarySourceByKind.books;
    const preferred = enabledSources.find((source) => source.id === preferredId);
    return preferred ?? enabledSources[0];
  }, [enabledSources, primarySourceByKind.books]);

  const hasEnabledBookSource = enabledSources.length > 0;
  const isOpenLibraryEnabled = activeSource?.id === 'openlibrary';

  const handleSearch = useCallback(async (page: number = 1, queryOverride?: string) => {
    if (!isOpenLibraryEnabled) return;

    const query = (queryOverride ?? searchQuery).trim();
    if (!query) return;

    logger.info('Searching Open Library:', { query, page });
    
    const result = await searchBooks(query, page, 20);
    
    if (result) {
      setResults(result.docs);
      setTotalResults(result.numFound);
      setCurrentPage(page);
      setHasSearched(true);
      setLastSearchedQuery(query);
    }
  }, [isOpenLibraryEnabled, searchBooks, searchQuery]);

  const visibleResults = useMemo(() => {
    if (!isOpenLibraryEnabled || searchQuery.trim().length === 0) return [];
    return results;
  }, [isOpenLibraryEnabled, searchQuery, results]);

  const visibleTotalResults = searchQuery.trim().length === 0 || !isOpenLibraryEnabled ? 0 : totalResults;
  const visibleCurrentPage = searchQuery.trim().length === 0 || !isOpenLibraryEnabled ? 1 : currentPage;
  const hasVisibleSearched = hasSearched && searchQuery.trim().length > 0 && isOpenLibraryEnabled;
  const totalPages = Math.ceil(visibleTotalResults / 20);

  const scheduleSearch = useCallback(
    (value: string) => {
      setSearchQuery('books', value);

      const trimmed = value.trim();
      if (!trimmed || !isOpenLibraryEnabled) {
        setHasSearched(false);
        window.clearTimeout(onlineBooksSearchTimeout);
        return;
      }

      window.clearTimeout(onlineBooksSearchTimeout);
      onlineBooksSearchTimeout = window.setTimeout(() => {
        if (trimmed === lastSearchedQuery) return;
        void handleSearch(1, trimmed);
      }, 300);
    },
    [handleSearch, isOpenLibraryEnabled, lastSearchedQuery, setSearchQuery]
  );

  const openInBrowser = (url: string) => {
    try {
      const openedWindow = window.open(url, '_blank', 'noopener,noreferrer');
      if (!openedWindow) {
        window.location.assign(url);
      }
    } catch {
      window.location.assign(url);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <OnlineSearchHeader
        kind="books"
        title="Online Books"
        subtitle="Search and read books from online providers"
        searchValue={searchQuery}
        loading={loading}
        disabled={!hasEnabledBookSource}
        disabledMessage="No active book source. Enable Open Library in Settings → Online Sources."
        onSearchValueChange={scheduleSearch}
        onSubmit={() => {
          const q = searchQuery.trim();
          if (!q) return;
          void handleSearch(1, q);
        }}
      />

      <div className="px-6 pt-3 max-w-5xl mx-auto w-full">
        {!isOpenLibraryEnabled && hasEnabledBookSource && (
          <div className="p-3 rounded-lg bg-muted border border-border text-sm text-muted-foreground">
            Selected source is not wired yet. Switch to <span className="font-medium">Open Library</span> from source selector.
          </div>
        )}

        {error && (
          <div className="mt-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
            {error}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loading && hasVisibleSearched && visibleResults.length === 0 && hasEnabledBookSource && (
            <div className="text-center py-12">
              <BookOpen className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-lg font-medium text-muted-foreground">No books found</p>
              <p className="text-sm text-muted-foreground mt-1">Try a different search query</p>
            </div>
          )}

          {!loading && !hasVisibleSearched && hasEnabledBookSource && (
            <div className="text-center py-12">
              <BookOpen className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-lg font-medium text-muted-foreground">Search for books</p>
              <p className="text-sm text-muted-foreground mt-1">Enter a title, author, or ISBN to get started</p>
            </div>
          )}

          {!loading && visibleResults.length > 0 && isOpenLibraryEnabled && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Found <span className="font-medium text-foreground">{visibleTotalResults.toLocaleString()}</span> results
                </p>
                {totalPages > 1 && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSearch(visibleCurrentPage - 1)}
                      disabled={visibleCurrentPage === 1}
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Page {visibleCurrentPage} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSearch(visibleCurrentPage + 1)}
                      disabled={visibleCurrentPage === totalPages}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </div>

              <div className="grid gap-4">
                {visibleResults.map((book) => (
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
                      onClick={() => handleSearch(visibleCurrentPage - 1)}
                      disabled={visibleCurrentPage === 1}
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground px-4">
                      Page {visibleCurrentPage} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      onClick={() => handleSearch(visibleCurrentPage + 1)}
                      disabled={visibleCurrentPage === totalPages}
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
