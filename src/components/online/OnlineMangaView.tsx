import { useCallback, useMemo, useState } from 'react';
import { BookOpen, Calendar, User, Info } from 'lucide-react';
import { useMangaDex, type MangaDexManga, type MangaDexChapter } from '@/hooks/useMangaDex';
import { Button } from '@/components/ui/button';
import { logger } from '@/lib/logger';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useSourceStore } from '@/store/sourceStore';
import { useOnlineSearchStore } from '@/store/onlineSearchStore';
import { OnlineSearchHeader } from './OnlineSearchHeader';
import { pluginApi, type Chapter as PluginChapter, type SearchResult as PluginSearchResult } from '@/lib/pluginSources';
import { useUIStore } from '@/store/uiStore';
import { useOnlineMangaReaderStore } from '@/store/onlineMangaReaderStore';

let onlineMangaSearchTimeout: number | undefined;

export function OnlineMangaView() {
  const searchQuery = useOnlineSearchStore((state) => state.queries['online-manga']);
  const setSearchQuery = useOnlineSearchStore((state) => state.setQueryForKind);
  const [results, setResults] = useState<MangaDexManga[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasSearched, setHasSearched] = useState(Boolean(searchQuery.trim()));
  const [selectedManga, setSelectedManga] = useState<MangaDexManga | null>(null);
  const [chapters, setChapters] = useState<MangaDexChapter[]>([]);
  const [pluginResults, setPluginResults] = useState<PluginSearchResult[]>([]);
  const [pluginChapters, setPluginChapters] = useState<PluginChapter[]>([]);
  const [selectedPluginManga, setSelectedPluginManga] = useState<PluginSearchResult | null>(null);
  const [chaptersDialogOpen, setChaptersDialogOpen] = useState(false);
  const [chaptersLoading, setChaptersLoading] = useState(false);
  const [pluginError, setPluginError] = useState<string | null>(null);
  const setCurrentView = useUIStore((state) => state.setCurrentView);
  const setSource = useOnlineMangaReaderStore((state) => state.setSource);
  const setContent = useOnlineMangaReaderStore((state) => state.setContent);
  const setChapter = useOnlineMangaReaderStore((state) => state.setChapter);
  const sources = useSourceStore((state) => state.sources);
  const primarySourceByKind = useSourceStore((state) => state.primarySourceByKind);
  const [lastSearchedQuery, setLastSearchedQuery] = useState('');
  
  const { searchManga, getChapters, loading, error } = useMangaDex();

  const mangaSources = useMemo(
    () => sources.filter((source) => source.kind === 'manga'),
    [sources]
  );
  const enabledSources = useMemo(
    () => mangaSources.filter((source) => source.enabled && source.implemented),
    [mangaSources]
  );
  const activeSource = useMemo(() => {
    const preferredId = primarySourceByKind.manga;
    const preferred = enabledSources.find((source) => source.id === preferredId);
    return preferred ?? enabledSources[0];
  }, [enabledSources, primarySourceByKind.manga]);

  const hasEnabledMangaSource = enabledSources.length > 0;
  const isMangaDexEnabled = activeSource?.id === 'mangadex';
  const isPluginMangaSource = activeSource?.id !== 'mangadex' && activeSource?.kind === 'manga';
  const activePluginSourceId = isPluginMangaSource ? activeSource?.id : null;

  const handleSearch = useCallback(async (page: number = 1, queryOverride?: string) => {
    const query = (queryOverride ?? searchQuery).trim();
    if (!query) return;

    if (isMangaDexEnabled) {
      logger.info('Searching MangaDex:', { query, page });

      const result = await searchManga(query, page, 20);

      if (result) {
        setResults(result.data);
        setTotalResults(result.total);
        setCurrentPage(page);
        setHasSearched(true);
        setLastSearchedQuery(query);
      }

      return;
    }

    if (activePluginSourceId) {
      setPluginError(null);
      setChapters([]);
      setResults([]);
      setTotalResults(0);
      setCurrentPage(1);

      try {
        logger.info('Searching plugin manga source:', { query, sourceId: activePluginSourceId });
        const result = await pluginApi.search(activePluginSourceId, query, page);
        setPluginResults(result);
        setHasSearched(true);
        setLastSearchedQuery(query);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to search plugin source';
        logger.error('Plugin manga search failed:', err);
        setPluginError(message);
        setPluginResults([]);
      }
    }
  }, [activePluginSourceId, isMangaDexEnabled, searchManga, searchQuery]);

  const visibleResults = useMemo(() => {
    if (!isMangaDexEnabled || searchQuery.trim().length === 0) return [];
    return results;
  }, [isMangaDexEnabled, searchQuery, results]);

  const visiblePluginResults = useMemo(() => {
    if (!isPluginMangaSource || searchQuery.trim().length === 0) return [];
    return pluginResults;
  }, [isPluginMangaSource, searchQuery, pluginResults]);

  const visibleTotalResults = searchQuery.trim().length === 0 || !isMangaDexEnabled ? 0 : totalResults;
  const visibleCurrentPage = searchQuery.trim().length === 0 || !isMangaDexEnabled ? 1 : currentPage;
  const hasVisibleSearched = hasSearched && searchQuery.trim().length > 0 && (isMangaDexEnabled || isPluginMangaSource);
  const totalPages = Math.ceil(visibleTotalResults / 20);

  const scheduleSearch = useCallback(
    (value: string) => {
      setSearchQuery('manga', value);

      const trimmed = value.trim();
      if (!trimmed || (!isMangaDexEnabled && !isPluginMangaSource)) {
        setHasSearched(false);
        window.clearTimeout(onlineMangaSearchTimeout);
        return;
      }

      window.clearTimeout(onlineMangaSearchTimeout);
      onlineMangaSearchTimeout = window.setTimeout(() => {
        if (trimmed === lastSearchedQuery) return;
        void handleSearch(1, trimmed);
      }, 300);
    },
    [handleSearch, isMangaDexEnabled, isPluginMangaSource, lastSearchedQuery, setSearchQuery]
  );

  const handleViewChapters = async (manga: MangaDexManga) => {
    setSelectedManga(manga);
    setSelectedPluginManga(null);
    setChaptersDialogOpen(true);
    setChapters([]);
    setChaptersLoading(true);
    
    const chapterList = await getChapters(manga.id);
    setChapters(chapterList);
    setChaptersLoading(false);
  };

  const handleViewPluginChapters = async (manga: PluginSearchResult) => {
    if (!activePluginSourceId) return;

    setSelectedManga(null);
    setSelectedPluginManga(manga);
    setPluginChapters([]);
    setChaptersDialogOpen(true);
    setChaptersLoading(true);
    setPluginError(null);

    try {
      const chapterList = await pluginApi.getChapters(activePluginSourceId, manga.id);
      setPluginChapters(chapterList);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load plugin chapters';
      logger.error('Plugin chapters load failed:', err);
      setPluginError(message);
      setPluginChapters([]);
    } finally {
      setChaptersLoading(false);
    }
  };

  const handleReadChapter = async (sourceId: string, contentId: string, chapter: PluginChapter, allChapters: PluginChapter[]) => {
    setSource(sourceId);
    setContent(contentId, allChapters);
    await setChapter(chapter.id);
    setChaptersDialogOpen(false);
    setCurrentView('online-manga-reader');
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <OnlineSearchHeader
        kind="manga"
        title="Online Manga"
        subtitle="Search and explore manga from online providers"
        searchValue={searchQuery}
        loading={loading}
        disabled={!hasEnabledMangaSource}
        disabledMessage="No active manga source. Enable MangaDex in Settings → Online Sources."
        onSearchValueChange={scheduleSearch}
        onSubmit={() => {
          const q = searchQuery.trim();
          if (!q) return;
          void handleSearch(1, q);
        }}
      />

      <div className="px-6 pt-3 max-w-5xl mx-auto w-full">
        {!isMangaDexEnabled && hasEnabledMangaSource && (
          <div className="p-3 rounded-lg bg-muted border border-border text-sm">
            <div className="flex items-center gap-2">
              {activeSource?.description?.includes('✅') && (
                <span className="text-green-500">✅</span>
              )}
              {activeSource?.description?.includes('⚠️') && (
                <span className="text-yellow-500">⚠️</span>
              )}
              <span className="text-foreground">
                Using <span className="font-medium">{activeSource?.name}</span>
              </span>
            </div>
            <div className="text-muted-foreground mt-1">
              {activeSource?.description || 'Plugin-based manga source with in-app chapter reader.'}
            </div>
          </div>
        )}

        {error && (
          <div className="mt-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
            {error}
          </div>
        )}

        {pluginError && (
          <div className="mt-3 p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
            <div className="font-medium mb-1">Search Failed</div>
            <div className="text-sm mb-2">{pluginError}</div>
            {pluginError.includes('Cloudflare') && (
              <div className="text-sm text-muted-foreground mt-2 space-y-1">
                <p className="font-medium text-foreground">💡 Try these alternatives:</p>
                <ul className="list-disc list-inside space-y-0.5 ml-2">
                  <li>Switch to MangaDex (most reliable)</li>
                  <li>Try MangaSee123 or Mangakakalot</li>
                  <li>Wait a few minutes and retry</li>
                </ul>
              </div>
            )}
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

          {!loading && hasVisibleSearched && visibleResults.length === 0 && hasEnabledMangaSource && (
            <div className="text-center py-12">
              <BookOpen className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-lg font-medium text-muted-foreground">No manga found</p>
              <p className="text-sm text-muted-foreground mt-1">Try a different search query</p>
            </div>
          )}

          {!loading && hasVisibleSearched && isPluginMangaSource && visiblePluginResults.length === 0 && hasEnabledMangaSource && (
            <div className="text-center py-12">
              <BookOpen className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-lg font-medium text-muted-foreground">No manga found</p>
              <p className="text-sm text-muted-foreground mt-1">Try a different search query</p>
            </div>
          )}

          {!loading && !hasVisibleSearched && hasEnabledMangaSource && (
            <div className="text-center py-12">
              <BookOpen className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-lg font-medium text-muted-foreground">Search for manga</p>
              <p className="text-sm text-muted-foreground mt-1">Enter a title to get started</p>
            </div>
          )}

          {!loading && visibleResults.length > 0 && isMangaDexEnabled && (
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
                {visibleResults.map((manga) => (
                  <div
                    key={manga.id}
                    className="flex gap-4 p-4 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <div className="w-32 h-48 flex-shrink-0 bg-muted rounded overflow-hidden">
                      {manga.coverUrl ? (
                        <img
                          src={manga.coverUrl}
                          alt={manga.title}
                          className="w-full h-full object-cover"
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
                        <h3 className="font-semibold text-lg line-clamp-2">{manga.title}</h3>
                        {manga.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                            {manga.description}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                        {manga.status && (
                          <div className="px-2 py-1 rounded-full bg-primary/10 text-primary font-medium">
                            {manga.status}
                          </div>
                        )}
                        {manga.contentRating && (
                          <div className="px-2 py-1 rounded-full bg-muted">
                            {manga.contentRating}
                          </div>
                        )}
                        {manga.year && (
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            <span>{manga.year}</span>
                          </div>
                        )}
                        {manga.author && (
                          <div className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            <span>{manga.author}</span>
                          </div>
                        )}
                      </div>

                      {manga.tags && manga.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {manga.tags.slice(0, 5).map((tag) => (
                            <div
                              key={`${manga.id}-${tag}`}
                              className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
                            >
                              {tag}
                            </div>
                          ))}
                          {manga.tags.length > 5 && (
                            <div className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                              +{manga.tags.length - 5} more
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex gap-2 pt-2">
                        <Button
                          size="sm"
                          onClick={() => handleViewChapters(manga)}
                          className="gap-1.5"
                        >
                          <BookOpen className="w-3.5 h-3.5" />
                          View Chapters
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

          {!loading && visiblePluginResults.length > 0 && isPluginMangaSource && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Found <span className="font-medium text-foreground">{visiblePluginResults.length.toLocaleString()}</span> results
                </p>
              </div>

              <div className="grid gap-4">
                {visiblePluginResults.map((manga) => (
                  <div
                    key={manga.id}
                    className="flex gap-4 p-4 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors"
                  >
                    <div className="w-32 h-48 flex-shrink-0 bg-muted rounded overflow-hidden">
                      {(manga.coverUrl || manga.cover_url) ? (
                        <img
                          src={manga.coverUrl || manga.cover_url}
                          alt={manga.title}
                          className="w-full h-full object-cover"
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
                        <h3 className="font-semibold text-lg line-clamp-2">{manga.title}</h3>
                        {(manga.summary || manga.description) && (
                          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                            {manga.summary || manga.description}
                          </p>
                        )}
                      </div>

                      <div className="flex gap-2 pt-2">
                        <Button
                          size="sm"
                          onClick={() => handleViewPluginChapters(manga)}
                          className="gap-1.5"
                        >
                          <BookOpen className="w-3.5 h-3.5" />
                          View Chapters
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog.Root open={chaptersDialogOpen} onOpenChange={setChaptersDialogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background border border-border rounded-xl shadow-2xl w-[90vw] max-w-2xl max-h-[85vh] flex flex-col z-50 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <Dialog.Title className="text-lg font-semibold">
                {selectedManga?.title || selectedPluginManga?.title || 'Chapters'}
              </Dialog.Title>
              <Dialog.Close asChild>
                <button type="button" className="text-muted-foreground hover:text-foreground p-1.5 rounded-md transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </Dialog.Close>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {chaptersLoading && (
                <div className="flex items-center justify-center py-12">
                  <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              {!chaptersLoading && isMangaDexEnabled && chapters.length === 0 && (
                <div className="text-center py-12">
                  <Info className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground">No chapters available</p>
                </div>
              )}

              {!chaptersLoading && isMangaDexEnabled && chapters.length > 0 && (
                <div className="space-y-2">
                  {chapters.map((chapter) => (
                    <div
                      key={chapter.id}
                      className="flex items-center justify-between p-3 rounded-lg border border-border"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">
                          {chapter.volume && `Vol. ${chapter.volume} `}
                          {chapter.chapter && `Ch. ${chapter.chapter}`}
                          {chapter.title && ` - ${chapter.title}`}
                        </div>
                        {chapter.scanlationGroup && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {chapter.scanlationGroup}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{chapter.pages} pages</span>
                        {selectedManga && (
                          <Button
                            size="sm"
                            onClick={() => {
                              void handleReadChapter('mangadex', selectedManga.id, chapter as unknown as PluginChapter, chapters as unknown as PluginChapter[]);
                            }}
                          >
                            Read
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!chaptersLoading && isPluginMangaSource && pluginChapters.length > 0 && (
                <div className="space-y-2">
                  {pluginChapters.map((chapter) => (
                    <div
                      key={chapter.id}
                      className="flex items-center justify-between p-3 rounded-lg border border-border"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm line-clamp-2">
                          {chapter.title || `Chapter ${chapter.number ?? ''}`}
                        </div>
                      </div>
                      {selectedPluginManga && activePluginSourceId && (
                        <Button
                          size="sm"
                          onClick={() => {
                            void handleReadChapter(activePluginSourceId, selectedPluginManga.id, chapter, pluginChapters);
                          }}
                        >
                          Read
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
