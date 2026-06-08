import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, Info, Download, Loader2, X, Search } from 'lucide-react';
import { useMangaDex, type MangaDexManga, type MangaDexChapter, type BrowseMode } from '@/hooks/useMangaDex';
import { Button } from '@/components/ui/button';
import { logger } from '@/lib/logger';
import * as Dialog from '@radix-ui/react-dialog';
import { useSourceStore } from '@/store/sourceStore';
import { useOnlineSearchStore } from '@/store/onlineSearchStore';
import { OnlineSearchHeader } from './OnlineSearchHeader';
import { pluginApi, type Chapter as PluginChapter, type SearchResult as PluginSearchResult } from '@/lib/pluginSources';
import { useUIStore } from '@/store/uiStore';
import { useOnlineMangaReaderStore } from '@/store/onlineMangaReaderStore';
import { HeroMangaBanner } from './HeroMangaBanner';
import { MangaRankList } from './MangaRankList';
import { OnlineResultCard } from './OnlineResultCard';
import { ModernBookCard } from './ModernBookCard';
import { SkeletonGrid } from './SkeletonLoaders';
import { type CarouselItem } from './ContentCarousel';
import { api } from '@/lib/tauri';
import { parsePageUrl } from '@/lib/utils';
import { useToast } from '@/store/toastStore';

let onlineMangaSearchTimeout: number | undefined;
const SUPPORTED_QUEUE_FORMATS = ['cbz', 'cbr', 'epub', 'pdf', 'mobi', 'azw3', 'docx'] as const;
const SUPPORTED_QUEUE_FORMATS_LABEL = SUPPORTED_QUEUE_FORMATS.join(', ');

function extractSupportedFormatToken(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;

  const regex = /(?:^|[^a-z0-9])(cbz|cbr|epub|pdf|mobi|azw3|docx)(?:[^a-z0-9]|$)/i;
  const match = normalized.match(regex);
  return match?.[1]?.toLowerCase() ?? null;
}

function extractSupportedFormatFromHttpUrl(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  const regex = /\.(cbz|cbr|epub|pdf|mobi|azw3|docx)(?=($|[?#&]))/i;
  const match = normalized.match(regex);
  return match?.[1]?.toLowerCase() ?? null;
}

function getUnsupportedFormatMessage(): string {
  return `Unsupported file type for Torbox queue. Supported formats: ${SUPPORTED_QUEUE_FORMATS_LABEL}. Use a direct link ending with one of these extensions, or a magnet/torrent result with clear format metadata.`;
}

function hasStrongFormatHint(result: PluginSearchResult): boolean {
  const titleHint = extractSupportedFormatToken(result.title);
  if (titleHint) return true;

  const extraFormat = result.extra?.format;
  if (typeof extraFormat === 'string' && extractSupportedFormatToken(extraFormat)) return true;

  return false;
}

function isQueueableTorboxCandidate(kind: string, url: string, result: PluginSearchResult): boolean {
  const normalizedKind = kind === 'direct'
    ? (url.trim().toLowerCase().startsWith('magnet:')
      ? 'magnet'
      : (url.trim().toLowerCase().includes('.torrent') || url.trim().toLowerCase().includes('/torrent'))
      ? 'torrent'
      : 'direct')
    : kind;

  if (normalizedKind === 'magnet' || normalizedKind === 'torrent') {
    return hasStrongFormatHint(result);
  }

  if (normalizedKind === 'direct') {
    const normalized = url.trim().toLowerCase();
    const isHttp = normalized.startsWith('http://') || normalized.startsWith('https://');
    return isHttp && extractSupportedFormatFromHttpUrl(url) !== null;
  }

  return false;
}

function getUiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  if (error && typeof error === 'object') {
    const asObj = error as Record<string, unknown>;
    const maybeMessage = asObj.message;
    if (typeof maybeMessage === 'string' && maybeMessage.trim()) return maybeMessage;
    const maybeError = asObj.error;
    if (typeof maybeError === 'string' && maybeError.trim()) return maybeError;
    const maybeData = asObj.data;
    if (maybeData && typeof maybeData === 'object') {
      const nested = maybeData as Record<string, unknown>;
      if (typeof nested.message === 'string' && nested.message.trim()) return nested.message;
      if (typeof nested.error === 'string' && nested.error.trim()) return nested.error;
    }
  }
  return fallback;
}

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
  const [chapterSearch, setChapterSearch] = useState('');
  const [pluginError, setPluginError] = useState<string | null>(null);
  const [queueingManga, setQueueingManga] = useState<Record<string, boolean>>({});
  const [hasTorboxKey, setHasTorboxKey] = useState(false);
  const setCurrentView = useUIStore((state) => state.setCurrentView);
  const { success: showSuccessToast, error: showErrorToast, info: showInfoToast } = useToast();
  const setSource = useOnlineMangaReaderStore((state) => state.setSource);
  const setContent = useOnlineMangaReaderStore((state) => state.setContent);
  const setChapter = useOnlineMangaReaderStore((state) => state.setChapter);
  const sources = useSourceStore((state) => state.sources);
  const primarySourceByKind = useSourceStore((state) => state.primarySourceByKind);
  const [lastSearchedQuery, setLastSearchedQuery] = useState('');
  
  // Browse mode state
  const [browseData, setBrowseData] = useState<Record<BrowseMode, MangaDexManga[]>>({
    popular: [],
    latest: [],
    recent: [],
    'top-rated': [],
  });
  const [browseLoading, setBrowseLoading] = useState<Record<BrowseMode, boolean>>({
    popular: false,
    latest: false,
    recent: false,
    'top-rated': false,
  });
  const [browseInitialized, setBrowseInitialized] = useState(false);
  
  const { searchManga, browseManga, getChapters, loading, error } = useMangaDex();

  useEffect(() => {
    api
      .getTorboxKey()
      .then((key) => setHasTorboxKey(Boolean(key)))
      .catch(() => setHasTorboxKey(false));
  }, []);

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
  const sourceSupportsTorboxTorrents = Boolean(activeSource?.torboxCompatible);

  // Load browse data on mount or when active source changes
  useEffect(() => {
    if (!activeSource) return;
    
    // We want to reload if the source changes, so we reset initialized if it changed
    // But since this is simple, we can just clear and reload every time activeSource changes.
    const loadBrowseData = async (mode: BrowseMode) => {
      setBrowseLoading((prev) => ({ ...prev, [mode]: true }));
      try {
        if (activeSource.id === 'mangadex') {
          const data = await browseManga(mode, 20);
          setBrowseData((prev) => ({ ...prev, [mode]: data }));
        } else {
          const raw = await pluginApi.browse(activeSource.id, mode, 1, 20);
          const data: MangaDexManga[] = raw.map(item => ({
            id: item.id,
            title: item.title,
            description: item.summary || item.description || '',
            coverUrl: item.coverUrl || item.cover_url,
          }));
          setBrowseData((prev) => ({ ...prev, [mode]: data }));
        }
      } catch (err) {
        logger.error(`Failed to load ${mode} manga for ${activeSource.id}:`, err);
        setBrowseData((prev) => ({ ...prev, [mode]: [] }));
      } finally {
        setBrowseLoading((prev) => ({ ...prev, [mode]: false }));
      }
    };
    
    // Reset data before fetching
    setBrowseData({ popular: [], latest: [], recent: [], 'top-rated': [] });
    setBrowseInitialized(true);
    
    // Load all browse modes in parallel
    void loadBrowseData('popular');
    void loadBrowseData('latest');
    void loadBrowseData('recent');
    void loadBrowseData('top-rated');
  }, [activeSource?.id]); // Re-run when source ID changes

  // Convert MangaDexManga to CarouselItem
  const toCarouselItems = useCallback((manga: MangaDexManga[]): CarouselItem[] => {
    return manga.map((m) => ({
      id: m.id,
      title: m.title,
      coverUrl: m.coverUrl,
      subtitle: m.author || m.status,
    }));
  }, []);

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

  const handleViewChapters = useCallback(async (manga: MangaDexManga) => {
    setSelectedManga(manga);
    setSelectedPluginManga(null);
    setChaptersDialogOpen(true);
    setChapters([]);
    setChaptersLoading(true);
    setChapterSearch('');
    
    const chapterList = await getChapters(manga.id);
    setChapters(chapterList);
    setChaptersLoading(false);
  }, [getChapters]);

  const handleViewPluginChapters = async (manga: PluginSearchResult) => {
    if (!activePluginSourceId) return;

    setSelectedManga(null);
    setSelectedPluginManga(manga);
    setPluginChapters([]);
    setChaptersDialogOpen(true);
    setChaptersLoading(true);
    setPluginError(null);
    setChapterSearch('');

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

  // Handle carousel item click - find manga in browse data and show chapters
  const handleCarouselItemClick = useCallback((item: CarouselItem) => {
    // Find the full manga data from browse data
    const allBrowseManga = [
      ...browseData.popular,
      ...browseData.latest,
      ...browseData.recent,
      ...browseData['top-rated'],
    ];
    const manga = allBrowseManga.find((m) => m.id === item.id);
    if (manga) {
      if (isMangaDexEnabled) {
        void handleViewChapters(manga);
      } else {
        void handleViewPluginChapters({
          id: manga.id,
          title: manga.title,
          description: manga.description,
          coverUrl: manga.coverUrl,
        });
      }
    }
  }, [browseData, handleViewChapters, isMangaDexEnabled, handleViewPluginChapters]);

  const openInBrowser = useCallback((url: string) => {
    try {
      const openedWindow = window.open(url, '_blank', 'noopener,noreferrer');
      if (!openedWindow) {
        window.location.assign(url);
      }
    } catch {
      window.location.assign(url);
    }
  }, []);

  const extractTorboxCandidate = useCallback((manga: PluginSearchResult): { kind: string; url: string } | null => {
    const extra = manga.extra ?? {};
    const fallbackDescription = typeof manga.description === 'string'
      ? manga.description.trim()
      : typeof manga.summary === 'string'
      ? manga.summary.trim()
      : '';

    const candidates = [
      { raw: extra.magnet_url, hint: 'magnet' },
      { raw: extra.torrent_url, hint: 'torrent' },
      { raw: extra.magnet, hint: 'magnet' },
      { raw: extra.magnet_link, hint: 'magnet' },
      { raw: extra.magnetLink, hint: 'magnet' },
      { raw: extra.torrent, hint: 'torrent' },
      { raw: extra.torrent_link, hint: 'torrent' },
      { raw: extra.torrentLink, hint: 'torrent' },
      { raw: manga.url, hint: undefined },
      {
        raw: fallbackDescription.toLowerCase().startsWith('magnet:')
          || fallbackDescription.toLowerCase().startsWith('magnet|')
          ? fallbackDescription
          : undefined,
        hint: 'magnet',
      },
    ];

    for (const candidate of candidates) {
      if (typeof candidate.raw !== 'string') continue;
      const parsed = parsePageUrl(candidate.raw);
      if (!parsed.url) continue;

      let kind = parsed.kind;
      if (kind === 'direct' && candidate.hint) {
        kind = candidate.hint;
      }

      return { kind, url: parsed.url };
    }

    return null;
  }, []);

  const pluginResultWithTorboxSource = useMemo(
    () =>
      visiblePluginResults.map((item) => ({
        item,
        torboxSource: extractTorboxCandidate(item),
      })),
    [extractTorboxCandidate, visiblePluginResults]
  );

  const handleQueueInTorbox = useCallback(async (manga: PluginSearchResult) => {
    const torboxSource = extractTorboxCandidate(manga);
    if (!torboxSource) {
      const message = 'No Torbox source link found for this manga result.';
      setPluginError(message);
      showErrorToast('Torbox source missing', message);
      return;
    }

    setQueueingManga((prev) => ({ ...prev, [manga.id]: true }));
    setPluginError(null);

    try {
      const normalizedKind = (() => {
        if (torboxSource.kind !== 'direct') return torboxSource.kind;
        const normalized = torboxSource.url.trim().toLowerCase();
        if (normalized.startsWith('magnet:')) return 'magnet';
        if (normalized.includes('.torrent') || normalized.includes('/torrent')) return 'torrent';
        return 'direct';
      })();

      if (normalizedKind === 'magnet' || normalizedKind === 'torrent' || normalizedKind === 'direct') {
        if (!isQueueableTorboxCandidate(normalizedKind, torboxSource.url, manga)) {
          const message = getUnsupportedFormatMessage();
          setPluginError(message);
          showErrorToast('Cannot send to Torbox', message);
          return;
        }

        await api.addToTorboxQueue(torboxSource.url);
        showSuccessToast('Queued in Torbox', `${manga.title} was queued. Opening Torbox view now.`);
        setCurrentView('torbox-manga');
      } else if (normalizedKind === 'anna' || normalizedKind === 'external') {
        openInBrowser(torboxSource.url);
        showInfoToast('Opened source in browser', 'This result should be opened directly in your browser.');
      } else {
        const message = `Unsupported source kind '${normalizedKind}' for Torbox queue.`;
        setPluginError(message);
        showErrorToast('Cannot send to Torbox', message);
      }
    } catch (err) {
      const message = getUiErrorMessage(err, 'Failed to queue manga in Torbox');
      setPluginError(message);
      showErrorToast('Torbox queue failed', message);
    } finally {
      setQueueingManga((prev) => {
        const next = { ...prev };
        delete next[manga.id];
        return next;
      });
    }
  }, [extractTorboxCandidate, openInBrowser, setCurrentView, showErrorToast, showInfoToast, showSuccessToast]);

  const handleReadChapter = async (sourceId: string, contentId: string, chapter: PluginChapter, allChapters: PluginChapter[], contentTitle?: string) => {
    setSource(sourceId);
    setContent(contentId, allChapters, contentTitle);
    await setChapter(chapter.id);
    setChaptersDialogOpen(false);
    setCurrentView('online-manga-reader');
  };

  const mapMangaDexChapterToPlugin = useCallback((chapter: MangaDexChapter): PluginChapter => ({
    id: chapter.id,
    title: chapter.title || (chapter.chapter ? `Chapter ${chapter.chapter}` : 'Chapter'),
    number: chapter.chapter ? Number(chapter.chapter) : undefined,
  }), []);

  const mangaDexPluginChapters = useMemo(
    () => chapters.map(mapMangaDexChapterToPlugin),
    [chapters, mapMangaDexChapterToPlugin]
  );

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

        {error && (
          <div className="mt-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
            {error}
          </div>
        )}

        {pluginError && (
          <div className="mt-3 p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
            <div className="font-medium mb-1">
              {pluginError.includes('Cloudflare') ? '🔒 Blocked by Cloudflare' : 'Search Failed'}
            </div>
            {pluginError.includes('Cloudflare') ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  ToonGod has Cloudflare protection. To access it you need to configure a bypass:
                </p>
                <ol className="text-sm text-muted-foreground list-decimal list-inside space-y-1 ml-1">
                  <li>Open <strong className="text-foreground">toongod.org</strong> in your browser and solve the CAPTCHA</li>
                  <li>Open DevTools → Application → Cookies → copy <code className="bg-muted px-1 rounded text-xs">cf_clearance</code></li>
                  <li>Go to <strong className="text-foreground">Settings → Download Services → ToonGod → Cloudflare Bypass</strong></li>
                  <li>Paste the value and click Save, then retry your search</li>
                </ol>
                <p className="text-xs text-muted-foreground opacity-70 mt-1">
                  Alternative: switch to <strong>MangaDex</strong> for unrestricted access.
                </p>
              </div>
            ) : (
              <div className="text-sm">{pluginError}</div>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto">
          {loading && (
            <div className="py-8">
              <SkeletonGrid count={12} />
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
            <div className="space-y-10">
              {/* Hero Banner */}
              <HeroMangaBanner
                manga={browseData['top-rated']?.[0] ?? null}
                loading={browseLoading['top-rated']}
                onReadClick={(manga) => handleCarouselItemClick(toCarouselItems([manga])[0])}
              />

              <div className="flex flex-col xl:flex-row gap-8">
                {/* Main Content (Left) */}
                <div className="flex-1 flex flex-col gap-8 min-w-0">
                  {/* Popular Manga Carousel */}
                  <div className="bento-widget">
                    <div className="bento-widget-header">
                      <h2 className="bento-widget-title">{isMangaDexEnabled ? "Trending This Week" : "Popular"}</h2>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-8 mt-4">
                      {browseLoading.popular ? <SkeletonGrid count={5} /> : toCarouselItems(browseData.popular).slice(0, 5).map((item) => (
                        <ModernBookCard key={item.id} id={item.id} title={item.title} coverUrl={item.coverUrl} author={item.subtitle} onClick={() => handleCarouselItemClick(item)} />
                      ))}
                    </div>
                  </div>

                  {/* Latest Updates Carousel */}
                  <div className="bento-widget">
                    <div className="bento-widget-header">
                      <h2 className="bento-widget-title">Latest Updates</h2>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-8 mt-4">
                      {browseLoading.latest ? <SkeletonGrid count={5} /> : toCarouselItems(browseData.latest).slice(0, 5).map((item) => (
                        <ModernBookCard key={item.id} id={item.id} title={item.title} coverUrl={item.coverUrl} author={item.subtitle} onClick={() => handleCarouselItemClick(item)} />
                      ))}
                    </div>
                  </div>

                  {/* You Should Read (Recent) */}
                  <div className="bento-widget">
                    <div className="bento-widget-header">
                      <h2 className="bento-widget-title">{isMangaDexEnabled ? "Staff Picks / You Should Read" : "Recent"}</h2>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-4 gap-y-8 mt-4">
                      {browseLoading.recent ? <SkeletonGrid count={5} /> : toCarouselItems(browseData.recent).slice(0, 5).map((item) => (
                        <ModernBookCard key={item.id} id={item.id} title={item.title} coverUrl={item.coverUrl} author={item.subtitle} onClick={() => handleCarouselItemClick(item)} />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Sidebar (Right) */}
                <div className="w-full xl:w-80 flex-shrink-0">
                  <MangaRankList
                    title="Top Rated"
                    items={toCarouselItems(browseData['top-rated'])}
                    loading={browseLoading['top-rated']}
                    onItemClick={handleCarouselItemClick}
                  />
                </div>
              </div>
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

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
                {visibleResults.map((manga) => (
                  <OnlineResultCard
                    key={manga.id}
                    id={manga.id}
                    title={manga.title}
                    coverUrl={manga.coverUrl}
                    author={manga.author}
                    description={manga.description}
                    format={manga.status}
                    language={manga.contentRating}
                    year={manga.year}
                    onReadOnline={() => handleViewChapters(manga)}
                  />
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

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
                {pluginResultWithTorboxSource.map(({ item: manga, torboxSource }) => (
                  <OnlineResultCard
                    key={manga.id}
                    id={manga.id}
                    title={manga.title}
                    coverUrl={manga.coverUrl || manga.cover_url}
                    description={manga.summary || manga.description}
                    onReadOnline={() => handleViewPluginChapters(manga)}
                    isDownloading={queueingManga[manga.id] ? "Queueing..." : false}
                    torboxAvailable={hasTorboxKey ? sourceSupportsTorboxTorrents : undefined}
                    onTorbox={(hasTorboxKey && torboxSource && sourceSupportsTorboxTorrents) ? () => handleQueueInTorbox(manga) : undefined}
                  />
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

            {/* Chapter search/filter bar */}
            <div className="px-6 py-3 border-b border-border">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search by chapter number or title…"
                  value={chapterSearch}
                  onChange={(e) => setChapterSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-sm bg-muted border border-border rounded-md outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
                />
                {chapterSearch && (
                  <button
                    type="button"
                    onClick={() => setChapterSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {chaptersLoading && (
                <div className="flex items-center justify-center py-12">
                  <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              {!chaptersLoading && pluginError && isPluginMangaSource && (
                <div className="py-10 px-6 text-center space-y-3">
                  {pluginError.includes('Cloudflare') ? (
                    <>
                      <div className="text-2xl">🔒</div>
                      <p className="text-destructive font-medium">Blocked by Cloudflare</p>
                      <div className="text-sm text-muted-foreground text-left max-w-sm mx-auto space-y-1">
                        <p>To fix this:</p>
                        <ol className="list-decimal list-inside space-y-1">
                          <li>Visit <strong>toongod.org</strong> in your browser &amp; solve CAPTCHA</li>
                          <li>Copy the <code className="bg-muted px-1 rounded text-xs">cf_clearance</code> cookie from DevTools</li>
                          <li>Open <strong>Settings → Download Services → ToonGod → Cloudflare Bypass</strong></li>
                          <li>Paste &amp; Save, then retry</li>
                        </ol>
                      </div>
                    </>
                  ) : (
                    <>
                      <Info className="w-12 h-12 mx-auto mb-1 text-destructive opacity-50" />
                      <p className="text-destructive font-medium">Failed to load chapters</p>
                      <p className="text-sm text-muted-foreground">{pluginError}</p>
                    </>
                  )}
                </div>
              )}

              {!chaptersLoading && isMangaDexEnabled && chapters.length === 0 && (
                <div className="text-center py-12">
                  <Info className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground">No chapters available</p>
                </div>
              )}

              {!chaptersLoading && isPluginMangaSource && !pluginError && pluginChapters.length === 0 && (
                <div className="text-center py-12">
                  <Info className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground">No chapters available</p>
                </div>
              )}

              {!chaptersLoading && isMangaDexEnabled && chapters.length > 0 && (() => {
                const term = chapterSearch.trim().toLowerCase();
                const filtered = term
                  ? chapters.filter((ch) => {
                      const chNum = ch.chapter ?? '';
                      const chTitle = ch.title ?? '';
                      return chNum.includes(term) || chTitle.toLowerCase().includes(term);
                    })
                  : chapters;
                return (
                  <div className="space-y-2">
                    {term && (
                      <p className="text-xs text-muted-foreground mb-2">
                        {filtered.length} of {chapters.length} chapters
                      </p>
                    )}
                    {filtered.map((chapter) => (
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
                                const pluginChapter = mapMangaDexChapterToPlugin(chapter);
                                void handleReadChapter('mangadex', selectedManga.id, pluginChapter, mangaDexPluginChapters, selectedManga.title);
                              }}
                            >
                              Read
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                    {filtered.length === 0 && (
                      <div className="text-center py-8">
                        <p className="text-sm text-muted-foreground">No chapters match "{chapterSearch}"</p>
                      </div>
                    )}
                  </div>
                );
              })()}

              {!chaptersLoading && isPluginMangaSource && pluginChapters.length > 0 && (() => {
                const term = chapterSearch.trim().toLowerCase();
                const filtered = term
                  ? pluginChapters.filter((ch) => {
                      const chNum = ch.number !== undefined ? String(ch.number) : '';
                      const chTitle = ch.title ?? '';
                      return chNum.includes(term) || chTitle.toLowerCase().includes(term);
                    })
                  : pluginChapters;
                return (
                  <div className="space-y-2">
                    {term && (
                      <p className="text-xs text-muted-foreground mb-2">
                        {filtered.length} of {pluginChapters.length} chapters
                      </p>
                    )}
                    {filtered.map((chapter) => (
                      <div
                        key={chapter.id}
                        className="flex items-center justify-between p-3 rounded-lg border border-border"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm line-clamp-2">
                            {chapter.volume && `Vol. ${chapter.volume} `}
                            {chapter.number !== undefined && `Ch. ${chapter.number}`}
                            {chapter.title && (chapter.number !== undefined || chapter.volume ? ` - ${chapter.title}` : chapter.title)}
                            {!chapter.title && chapter.number === undefined && !chapter.volume && 'Unknown Chapter'}
                          </div>
                        </div>
                        {selectedPluginManga && activePluginSourceId && (
                          <Button
                            size="sm"
                            onClick={() => {
                              void handleReadChapter(activePluginSourceId, selectedPluginManga.id, chapter, pluginChapters, selectedPluginManga.title);
                            }}
                          >
                            Read
                          </Button>
                        )}
                      </div>
                    ))}
                    {filtered.length === 0 && (
                      <div className="text-center py-8">
                        <p className="text-sm text-muted-foreground">No chapters match "{chapterSearch}"</p>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
