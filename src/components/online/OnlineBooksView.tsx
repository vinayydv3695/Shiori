import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, ExternalLink, Calendar, User, Download, Loader2 } from 'lucide-react';
import { useOpenLibrary, type OpenLibraryBook, type BookBrowseMode } from '@/hooks/useOpenLibrary';
import { Button } from '@/components/ui/button';
import { logger } from '@/lib/logger';
import { useSourceStore } from '@/store/sourceStore';
import { useUIStore } from '@/store/uiStore';
import { OnlineSearchHeader } from './OnlineSearchHeader';
import { useOnlineSearchStore } from '@/store/onlineSearchStore';
import { pluginApi, type SearchResult as PluginSearchResult } from '@/lib/pluginSources';
import { api } from '@/lib/tauri';
import { ContentCarousel, type CarouselItem } from './ContentCarousel';
import { useTorboxStore } from '@/stores/useTorboxStore';

let onlineBooksSearchTimeout: number | undefined;

export function OnlineBooksView() {
  const searchQuery = useOnlineSearchStore((state) => state.queries['online-books']);
  const setSearchQuery = useOnlineSearchStore((state) => state.setQueryForKind);
  const [results, setResults] = useState<OpenLibraryBook[]>([]);
  const [pluginResults, setPluginResults] = useState<PluginSearchResult[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasSearched, setHasSearched] = useState(Boolean(searchQuery.trim()));
  const [pluginLoading, setPluginLoading] = useState(false);
  const [pluginError, setPluginError] = useState<string | null>(null);
  const setCurrentView = useUIStore((state) => state.setCurrentView);
  const enqueueFromAnna = useTorboxStore((state) => state.enqueueFromAnna);
  const sources = useSourceStore((state) => state.sources);
  const primarySourceByKind = useSourceStore((state) => state.primarySourceByKind);
  const [lastSearchedQuery, setLastSearchedQuery] = useState('');
  const [downloadingBooks, setDownloadingBooks] = useState<Record<string, string>>({});
  const [hasTorboxKey, setHasTorboxKey] = useState(false);
  
  // Browse mode state
  const [browseData, setBrowseData] = useState<Record<BookBrowseMode, OpenLibraryBook[]>>({
    trending: [],
    'want-to-read': [],
    'currently-reading': [],
    'already-read': [],
  });
  const [browseLoading, setBrowseLoading] = useState<Record<BookBrowseMode, boolean>>({
    trending: false,
    'want-to-read': false,
    'currently-reading': false,
    'already-read': false,
  });
  const [browseInitialized, setBrowseInitialized] = useState(false);
  
  const { searchBooks, browseTrending, getCoverUrl, getReadUrl, getBookDetailsUrl, loading, error } = useOpenLibrary();

  // Check for Torbox API key on mount
  useEffect(() => {
    api.getTorboxKey()
      .then(key => setHasTorboxKey(!!key))
      .catch(() => setHasTorboxKey(false));
  }, []);

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
  const isPluginBookSource = activeSource?.id === 'anna-archive' && activeSource?.kind === 'books';
  const activePluginSourceId = isPluginBookSource ? activeSource?.id : null;

  // Load browse data on mount for Open Library
  useEffect(() => {
    if (!isOpenLibraryEnabled || browseInitialized) return;
    
    const loadBrowseData = async (mode: BookBrowseMode) => {
      setBrowseLoading((prev) => ({ ...prev, [mode]: true }));
      try {
        const data = await browseTrending(mode, 20);
        setBrowseData((prev) => ({ ...prev, [mode]: data }));
      } catch (err) {
        logger.error(`Failed to load ${mode} books:`, err);
      } finally {
        setBrowseLoading((prev) => ({ ...prev, [mode]: false }));
      }
    };
    
    setBrowseInitialized(true);
    // Load browse modes in parallel
    void loadBrowseData('trending');
    void loadBrowseData('want-to-read');
    void loadBrowseData('currently-reading');
  }, [isOpenLibraryEnabled, browseInitialized, browseTrending]);

  // Convert OpenLibraryBook to CarouselItem
  const toCarouselItems = useCallback((books: OpenLibraryBook[]): CarouselItem[] => {
    return books.map((b) => ({
      id: b.key,
      title: b.title,
      coverUrl: b.cover_i ? getCoverUrl(b.cover_i, 'M') || undefined : undefined,
      subtitle: b.author_name?.join(', ') || (b.first_publish_year ? String(b.first_publish_year) : undefined),
    }));
  }, [getCoverUrl]);

  // Handle carousel item click - open book details
  const handleCarouselItemClick = useCallback((item: CarouselItem) => {
    const url = getBookDetailsUrl(item.id);
    try {
      const openedWindow = window.open(url, '_blank', 'noopener,noreferrer');
      if (!openedWindow) {
        window.location.assign(url);
      }
    } catch {
      window.location.assign(url);
    }
  }, [getBookDetailsUrl]);

  const handleSearch = useCallback(async (page: number = 1, queryOverride?: string) => {
    const query = (queryOverride ?? searchQuery).trim();
    if (!query) return;

    if (isOpenLibraryEnabled) {
      setPluginError(null);
      logger.info('Searching Open Library:', { query, page });
      
      const result = await searchBooks(query, page, 20);
      
      if (result) {
        setResults(result.docs);
        setPluginResults([]);
        setTotalResults(result.numFound);
        setCurrentPage(page);
        setHasSearched(true);
        setLastSearchedQuery(query);
      }

      return;
    }

    if (activePluginSourceId) {
      setPluginError(null);
      setResults([]);
      setTotalResults(0);
      setCurrentPage(1);
      setPluginLoading(true);

      try {
        logger.info('Searching plugin book source:', { query, sourceId: activePluginSourceId });
        const result = await pluginApi.search(activePluginSourceId, query, page);
        setPluginResults(result);
        setHasSearched(true);
        setLastSearchedQuery(query);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to search plugin source';
        logger.error('Plugin book search failed:', err);
        setPluginError(message);
        setPluginResults([]);
      } finally {
        setPluginLoading(false);
      }
    }
  }, [activePluginSourceId, isOpenLibraryEnabled, searchBooks, searchQuery]);

  const visibleResults = useMemo(() => {
    if (!isOpenLibraryEnabled || searchQuery.trim().length === 0) return [];
    return results;
  }, [isOpenLibraryEnabled, searchQuery, results]);

  const visiblePluginResults = useMemo(() => {
    if (!isPluginBookSource || searchQuery.trim().length === 0) return [];
    return pluginResults;
  }, [isPluginBookSource, pluginResults, searchQuery]);

  const visibleTotalResults = searchQuery.trim().length === 0 || !isOpenLibraryEnabled ? 0 : totalResults;
  const visibleCurrentPage = searchQuery.trim().length === 0 || !isOpenLibraryEnabled ? 1 : currentPage;
  const hasVisibleSearched = hasSearched && searchQuery.trim().length > 0 && (isOpenLibraryEnabled || isPluginBookSource);
  const totalPages = Math.ceil(visibleTotalResults / 20);

  const scheduleSearch = useCallback(
    (value: string) => {
      setSearchQuery('books', value);

      const trimmed = value.trim();
      if (!trimmed || (!isOpenLibraryEnabled && !isPluginBookSource)) {
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
    [handleSearch, isOpenLibraryEnabled, isPluginBookSource, lastSearchedQuery, setSearchQuery]
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

  const handleDirectDownload = useCallback(async (book: PluginSearchResult) => {
    if (!book.id) return;
    
    setDownloadingBooks(prev => ({ ...prev, [book.id]: 'Downloading...' }));
    
    try {
      // Try direct download via backend
      await api.annasArchiveDownload(book.id, book.title);
      
      setDownloadingBooks(prev => ({ ...prev, [book.id]: 'Imported to library!' }));
      
      // Clear status after 3 seconds
      setTimeout(() => {
        setDownloadingBooks(prev => {
          const copy = { ...prev };
          delete copy[book.id];
          return copy;
        });
      }, 3000);
      
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Download failed';
      
      // If direct download fails, offer to open in browser
      setDownloadingBooks(prev => ({ ...prev, [book.id]: `Failed: ${message}` }));
      
      setTimeout(() => {
        setDownloadingBooks(prev => {
          const copy = { ...prev };
          delete copy[book.id];
          return copy;
        });
      }, 5000);
    }
  }, []);

  const annaAccountHint = useMemo(() => {
    if (!pluginError) return null;
    const lower = pluginError.toLowerCase();
    if (lower.includes('rapidapi')) {
      return 'Anna RapidAPI request failed. Verify the API key in Settings -> Online Sources -> Anna API Key.';
    }
    const mentionsAccess =
      lower.includes('account') ||
      lower.includes('members') ||
      lower.includes('restricted') ||
      lower.includes('auth') ||
      lower.includes('cookie') ||
      lower.includes('login');

    if (!mentionsAccess) return null;
    return 'Anna account access may be required for this title. In Settings -> Online Sources -> Anna, set Auth Cookie (and Auth Key/API key if available).';
  }, [pluginError]);

  const handleTorboxDownload = useCallback(async (book: PluginSearchResult) => {
    if (!book.id) return;
    
    setDownloadingBooks(prev => ({ ...prev, [book.id]: 'Getting download links...' }));
    
      try {
        // Get download options (chapters represent download links for books)
        const chapters = await pluginApi.getChapters('anna-archive', book.id);
      
      if (chapters.length === 0) {
        throw new Error('No download options available for this book.');
      }
      
      // Get pages for the first chapter (download option)
      const pages = await pluginApi.getPages('anna-archive', chapters[0].id);
      
      const parseCandidate = (rawValue: string): { type: string; url: string } | null => {
        const raw = rawValue.trim();
        if (!raw) return null;
        const splitIndex = raw.indexOf('|');
        if (splitIndex > 0) {
          const type = raw.slice(0, splitIndex).trim().toLowerCase();
          const url = raw.slice(splitIndex + 1).trim();
          if (!url) return null;
          return { type, url };
        }
        return { type: 'unknown', url: raw };
      };

      const isHttp = (value: string): boolean => {
        const normalized = value.trim().toLowerCase();
        return normalized.startsWith('http://') || normalized.startsWith('https://');
      };

      const isTorrentish = (value: string): boolean => {
        const normalized = value.trim().toLowerCase();
        return normalized.startsWith('magnet:') || normalized.includes('.torrent') || normalized.includes('/torrent');
      };

      const getPriority = (type: string, url: string): number => {
        if (type === 'anna') return 0;
        if (type === 'magnet') return 0;
        if (type === 'torrent') return 1;
        if (type === 'direct') return 2;
        if (type === 'external') return 3;
        if (isTorrentish(url)) return 4;
        return 5;
      };

      const candidatePriority = new Map<string, number>();

      pages.forEach((p) => {
        const parsed = parseCandidate(p.url);
        if (!parsed) return;
        if (!isTorrentish(parsed.url) && !isHttp(parsed.url)) return;
        const priority = getPriority(parsed.type, parsed.url);
        const existing = candidatePriority.get(parsed.url);
        if (existing === undefined || priority < existing) {
          candidatePriority.set(parsed.url, priority);
        }
      });

      const candidateLinks = Array.from(candidatePriority.entries())
        .sort((a, b) => a[1] - b[1])
        .map(([url]) => url);

      if (candidateLinks.length === 0) {
        throw new Error('No compatible download link available for this book. Try opening the detail page manually.');
      }
      
      const firstCandidate = candidateLinks[0];
      if (!firstCandidate) {
        throw new Error('No valid magnet/torrent candidate found.');
      }

      setDownloadingBooks(prev => ({ ...prev, [book.id]: 'Queued in Torbox...' }));

      await enqueueFromAnna({ title: book.title, magnetLink: firstCandidate });

      setDownloadingBooks(prev => ({ ...prev, [book.id]: 'Imported to library!' }));
      setCurrentView('torbox-books');
      
      // Clear status after 3 seconds
      setTimeout(() => {
        setDownloadingBooks(prev => {
          const copy = { ...prev };
          delete copy[book.id];
          return copy;
        });
      }, 3000);
      
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Download failed';
      setDownloadingBooks(prev => ({ ...prev, [book.id]: `Error: ${message}` }));
      
      setTimeout(() => {
        setDownloadingBooks(prev => {
          const copy = { ...prev };
          delete copy[book.id];
          return copy;
        });
      }, 5000);
    }
  }, [enqueueFromAnna, setCurrentView]);

  return (
    <div className="flex flex-col h-full bg-background">
      <OnlineSearchHeader
        kind="books"
        title="Online Books"
        subtitle="Search and read books from online providers"
        searchValue={searchQuery}
        loading={loading || pluginLoading}
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
            {isPluginBookSource
              ? 'Using plugin book source.'
              : <>Selected source is not wired yet. Switch to <span className="font-medium">Open Library</span> from source selector.</>}
          </div>
        )}

        {error && (
          <div className="mt-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
            {error}
          </div>
        )}

        {pluginError && (
          <div className="mt-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
            {pluginError}
            {annaAccountHint && (
              <div className="mt-2 text-xs text-muted-foreground">{annaAccountHint}</div>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto">
          {(loading || pluginLoading) && (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loading && !pluginLoading && hasVisibleSearched && isOpenLibraryEnabled && visibleResults.length === 0 && hasEnabledBookSource && (
            <div className="text-center py-12">
              <BookOpen className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-lg font-medium text-muted-foreground">No books found</p>
              <p className="text-sm text-muted-foreground mt-1">Try a different search query</p>
            </div>
          )}

          {!loading && !pluginLoading && hasVisibleSearched && isPluginBookSource && visiblePluginResults.length === 0 && hasEnabledBookSource && (
            <div className="text-center py-12">
              <BookOpen className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-lg font-medium text-muted-foreground">No books found</p>
              <p className="text-sm text-muted-foreground mt-1">Try a different search query</p>
            </div>
          )}

          {!loading && !pluginLoading && !hasVisibleSearched && hasEnabledBookSource && isOpenLibraryEnabled && (
            <div className="space-y-8">
              {/* Trending Books Carousel */}
              <ContentCarousel
                title="Trending Today"
                items={toCarouselItems(browseData.trending)}
                loading={browseLoading.trending}
                onItemClick={handleCarouselItemClick}
              />
              
              {/* Want to Read Carousel */}
              <ContentCarousel
                title="Want to Read"
                items={toCarouselItems(browseData['want-to-read'])}
                loading={browseLoading['want-to-read']}
                onItemClick={handleCarouselItemClick}
              />
              
              {/* Currently Reading Carousel */}
              <ContentCarousel
                title="Currently Reading"
                items={toCarouselItems(browseData['currently-reading'])}
                loading={browseLoading['currently-reading']}
                onItemClick={handleCarouselItemClick}
              />
            </div>
          )}

          {!loading && !pluginLoading && !hasVisibleSearched && hasEnabledBookSource && !isOpenLibraryEnabled && (
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
                            onClick={() => {
                              const iaId = book.ia?.[0];
                              if (!iaId) return;
                              openInBrowser(getReadUrl(iaId));
                            }}
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

          {!pluginLoading && visiblePluginResults.length > 0 && isPluginBookSource && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Found <span className="font-medium text-foreground">{visiblePluginResults.length.toLocaleString()}</span> results
                </p>
              </div>

              <div className="grid gap-4">
                {visiblePluginResults.map((book) => {
                  // Extract metadata from extra
                  const format = book.extra?.format as string | undefined;
                  const author = book.extra?.author as string | undefined;
                  const fileSize = book.extra?.file_size as string | undefined;
                  const language = book.extra?.language as string | undefined;
                  
                  return (
                  <div
                    key={book.id}
                    className="flex gap-4 p-4 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <div className="w-24 h-36 flex-shrink-0 bg-muted rounded overflow-hidden">
                      {(book.coverUrl || book.cover_url) ? (
                        <img
                          src={book.coverUrl || book.cover_url}
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
                        {author && (
                          <p className="text-sm text-muted-foreground mt-0.5">
                            {author}
                          </p>
                        )}
                        
                        {/* Format badge and metadata row */}
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          {format && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary/20 text-primary border border-primary/30">
                              {format}
                            </span>
                          )}
                          {fileSize && (
                            <span className="text-xs text-muted-foreground">
                              {fileSize}
                            </span>
                          )}
                          {language && (
                            <span className="text-xs text-muted-foreground">
                              {language}
                            </span>
                          )}
                        </div>
                        
                        {(book.summary || book.description) && (
                          <p className="text-sm text-muted-foreground line-clamp-2 mt-2">
                            {book.summary || book.description}
                          </p>
                        )}
                      </div>

                      {/* Show buttons if we have a detail URL (in extra) or a direct url */}
                      {(book.extra?.detail_url || book.url) && (
                        <div className="flex flex-wrap gap-2 pt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              // Use detail_url from extra if available, otherwise fall back to url
                              const detailUrl = (book.extra?.detail_url as string) || book.url;
                              if (!detailUrl) return;
                              openInBrowser(detailUrl);
                            }}
                            className="gap-1.5"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            View Details
                          </Button>
                          {activePluginSourceId === 'anna-archive' && (
                            <>
                              <Button
                                variant={downloadingBooks[book.id] ? "secondary" : "default"}
                                size="sm"
                                onClick={() => handleDirectDownload(book)}
                                disabled={!!downloadingBooks[book.id]}
                                className="gap-1.5"
                              >
                                {downloadingBooks[book.id] ? (
                                  <>
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    {downloadingBooks[book.id]}
                                  </>
                                ) : (
                                  <>
                                    <Download className="w-3.5 h-3.5" />
                                    Download
                                  </>
                                )}
                              </Button>
                              {hasTorboxKey && !downloadingBooks[book.id] && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleTorboxDownload(book)}
                                  className="gap-1.5"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  Torbox
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
