import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  BookOpen,
  CheckCircle2,
  Cloud,
  Clock3,
  Compass,
  Loader2,
  ArrowUpRight,
  Search,
  Sparkles,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useUIStore } from '@/store/uiStore';
import { pluginApi, type SearchResult as PluginSearchResult } from '@/lib/pluginSources';
import { useTorboxStore, type TorboxJobStatus, type TorboxQueueItem } from '@/stores/useTorboxStore';
import { useOnlineSearchStore } from '@/store/onlineSearchStore';
import { useSourceStore } from '@/store/sourceStore';

type TorboxTab = 'discover' | 'books' | 'manga' | 'search';
type SearchKind = 'all' | 'books' | 'manga';
type TorboxResultSource = 'books' | 'manga';
type TorboxSearchResult = PluginSearchResult & { _source: TorboxResultSource };
const TORBOX_MANGA_SOURCE_IDS = ['nyaa', 'animetosho'] as const;

interface TorboxHubViewProps {
  initialTab?: Exclude<TorboxTab, 'search'>;
}

const statusLabel: Record<string, string> = {
  queued: 'Queued',
  verifying: 'Verifying',
  downloading: 'Downloading',
  importing: 'Importing',
  completed: 'Completed',
  failed: 'Failed',
};

const TORBOX_SEARCH_LIMIT = 20;
const SEARCH_TIMEOUT_MS = 8000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(`${label} timed out`));
    }, timeoutMs);

    promise
      .then((value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      });
  });
}

function getResultCover(item: PluginSearchResult): string | undefined {
  const direct = item.coverUrl ?? item.cover_url;
  if (direct && direct.trim()) {
    return direct;
  }

  const extra = item.extra ?? {};
  const keys = ['cover', 'cover_url', 'thumbnail', 'thumb', 'image', 'img'];

  for (const key of keys) {
    const value = extra[key];
    if (typeof value === 'string' && value.trim() && !value.startsWith('data:image')) {
      return value;
    }
  }

  return undefined;
}

function getResultUrl(item: PluginSearchResult): string | undefined {
  const url = item.url;
  if (typeof url === 'string' && url.trim()) {
    return url;
  }

  const extra = item.extra ?? {};
  const keys = ['url', 'detail_url', 'link', 'href'];

  for (const key of keys) {
    const value = extra[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }

  return undefined;
}

function isTorboxCompatibleLink(link: string): boolean {
  const normalized = link.trim().toLowerCase();
  return (
    normalized.startsWith('magnet:') ||
    normalized.includes('.torrent') ||
    normalized.includes('/torrent')
  );
}

function isHttpLink(link: string): boolean {
  const normalized = link.trim().toLowerCase();
  return normalized.startsWith('http://') || normalized.startsWith('https://');
}

function isTorboxBookLink(link: string): boolean {
  return isTorboxCompatibleLink(link) || isHttpLink(link);
}

function parseAnnaCandidate(rawValue: string): { type: string; url: string } | null {
  const raw = rawValue.trim();
  if (!raw) return null;

  const splitIndex = raw.indexOf('|');
  if (splitIndex > 0) {
    const type = raw.slice(0, splitIndex).trim().toLowerCase();
    const url = raw.slice(splitIndex + 1).trim();
    if (url) {
      return { type, url };
    }
  }

  return { type: 'unknown', url: raw };
}

function getAnnaCandidatePriority(type: string, url: string): number {
  if (type === 'anna') return 0;
  if (type === 'magnet') return 0;
  if (type === 'torrent') return 1;
  if (type === 'direct') return 2;
  if (type === 'external') return 3;
  if (isTorboxCompatibleLink(url)) return 4;
  return 5;
}

function extractMagnetFromResult(item: PluginSearchResult): string | null {
  const extra = item.extra ?? {};
  const candidates = [
    extra.magnet,
    extra.magnet_link,
    extra.magnetLink,
    extra.torrent,
    extra.torrent_link,
    extra.torrentLink,
    item.url,
  ];

  for (const value of candidates) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (isTorboxCompatibleLink(trimmed)) {
      return trimmed;
    }
  }

  return null;
}

function TabButton({
  label,
  icon: Icon,
  count,
  active,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-active={active ? 'true' : 'false'}
      className="torbox-tab px-3 py-1.5 text-sm border transition-colors"
    >
      <span className="inline-flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5" />
        {label}
        {typeof count === 'number' && (
          <span className="rounded-full border border-border/60 bg-muted px-1.5 py-0 text-[10px] leading-4 text-muted-foreground">
            {count}
          </span>
        )}
      </span>
    </button>
  );
}

function SearchResultSourceBadge({ source }: { source: TorboxResultSource }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border/70 bg-muted/60 px-2 py-0.5 text-[11px] text-muted-foreground">
      {source === 'books' ? 'Books' : 'Manga'}
    </span>
  );
}

function StatusBadge({ status }: { status: TorboxJobStatus }) {
  const statusClass = `torbox-status torbox-status--${status}`;
  return (
    <span className={statusClass}>
      {statusLabel[status]}
    </span>
  );
}

function ResultCover({ item }: { item: TorboxSearchResult }) {
  const [hasImageError, setHasImageError] = useState(false);
  const cover = getResultCover(item);
  const SourceIcon = item._source === 'books' ? BookOpen : Activity;

  return (
    <div className="torbox-cover-shell">
      {cover && !hasImageError ? (
        <img
          src={cover}
          alt={item.title}
          className="w-full h-full object-cover"
          loading="lazy"
          onError={() => setHasImageError(true)}
        />
      ) : (
        <div className="torbox-cover-fallback">
          <SourceIcon className="h-5 w-5" />
          <span className="torbox-cover-fallback__label">{item._source === 'books' ? 'Book' : 'Manga'}</span>
        </div>
      )}
    </div>
  );
}

function TorboxJobCard({
  job,
  index,
  onRemove,
}: {
  job: TorboxQueueItem;
  index: number;
  onRemove: (id: string) => void;
}) {
  const progressClass = `torbox-progress-fill torbox-progress--${job.status}`;

  return (
    <div className="torbox-job-card torbox-animate-in p-4" style={{ animationDelay: `${index * 45}ms` }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 className="truncate text-base font-semibold">{job.title}</h3>
          <p className="truncate text-[11px] text-muted-foreground">{job.id}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => onRemove(job.id)} aria-label="Remove job">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        {job.status === 'completed' && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
        {job.status === 'failed' && <AlertCircle className="h-4 w-4 text-destructive" />}
        {(job.status === 'queued' || job.status === 'verifying') && (
          <Clock3 className="h-4 w-4 text-muted-foreground" />
        )}
        {(job.status === 'downloading' || job.status === 'importing') && (
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        )}
        <StatusBadge status={job.status} />
        <span className="text-xs text-muted-foreground">{job.progress}%</span>
      </div>

      <div className="torbox-progress-track mt-3">
        <div
          className={progressClass}
          style={{ width: `${Math.max(0, Math.min(100, job.progress))}%` }}
        />
      </div>

      <div className="mt-3 space-y-1 text-xs text-muted-foreground">
        {job.torrentId && <p>Torrent ID: {job.torrentId}</p>}
        {job.importedPath && <p className="truncate">Imported: {job.importedPath}</p>}
        {job.error && <p className="text-destructive">{job.error}</p>}
      </div>
    </div>
  );
}

export function TorboxHubView({ initialTab = 'discover' }: TorboxHubViewProps) {
  const setCurrentView = useUIStore((state) => state.setCurrentView);
  const sources = useSourceStore((state) => state.sources);
  const jobs = useTorboxStore((state) => state.jobs);
  const removeJob = useTorboxStore((state) => state.removeJob);
  const clearCompleted = useTorboxStore((state) => state.clearCompleted);
  const enqueueFromAnna = useTorboxStore((state) => state.enqueueFromAnna);
  const enqueueFromMangadex = useTorboxStore((state) => state.enqueueFromMangadex);

  const [activeTab, setActiveTab] = useState<TorboxTab>(initialTab);
  const [searchKind, setSearchKind] = useState<SearchKind>('all');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<TorboxSearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [partialSearchWarning, setPartialSearchWarning] = useState<string | null>(null);
  const [queueing, setQueueing] = useState<Record<string, boolean>>({});
  const searchQuery = useOnlineSearchStore((state) => state.queries.torbox);
  const setSearchQuery = useOnlineSearchStore((state) => state.setQuery);

  const torboxMangaSource = useMemo(() => {
    const enabledMangaSources = sources.filter((source) => source.kind === 'manga' && source.enabled && source.implemented);
    const preferred = enabledMangaSources.find((source) =>
      TORBOX_MANGA_SOURCE_IDS.some((candidateId) => source.id === candidateId)
    );
    return preferred ?? enabledMangaSources[0];
  }, [sources]);

  const torboxCompatibleMangaSourceIds = useMemo(() => {
    const enabledIds = sources
      .filter((source) => source.kind === 'manga' && source.enabled && source.implemented && source.torboxCompatible)
      .map((source) => source.id);

    if (enabledIds.length > 0) {
      return enabledIds;
    }

    return TORBOX_MANGA_SOURCE_IDS.filter((id) =>
      sources.some((source) => source.id === id && source.kind === 'manga')
    );
  }, [sources]);

  const torboxRecommendedMangaSourceLabel = useMemo(() => {
    const available = sources
      .filter((source) => source.kind === 'manga' && source.torboxCompatible)
      .map((source) => source.name);
    return available.length > 0 ? available.join(' or ') : 'a Torbox-compatible manga source';
  }, [sources]);

  const mangaSourceHasTorboxLinks = torboxMangaSource?.torboxCompatible === true;

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const bookJobs = useMemo(() => jobs.filter((job) => job.source === 'anna'), [jobs]);
  const mangaJobs = useMemo(() => jobs.filter((job) => job.source === 'manga'), [jobs]);

  const filteredBookJobs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return bookJobs;
    return bookJobs.filter((job) => job.title.toLowerCase().includes(q));
  }, [bookJobs, searchQuery]);

  const filteredMangaJobs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return mangaJobs;
    return mangaJobs.filter((job) => job.title.toLowerCase().includes(q));
  }, [mangaJobs, searchQuery]);

  const queueStats = useMemo(() => {
    const total = jobs.length;
    const active = jobs.filter((job) =>
      job.status === 'queued' ||
      job.status === 'verifying' ||
      job.status === 'downloading' ||
      job.status === 'importing'
    ).length;
    const completed = jobs.filter((job) => job.status === 'completed').length;
    const failed = jobs.filter((job) => job.status === 'failed').length;
    return { total, active, completed, failed };
  }, [jobs]);

  const switchTab = useCallback(
    (tab: TorboxTab) => {
      setActiveTab(tab);
      if (tab === 'books') {
        setCurrentView('torbox-books');
      } else if (tab === 'manga') {
        setCurrentView('torbox-manga');
      } else {
        setCurrentView('torbox-discover');
      }
    },
    [setCurrentView]
  );

  const runSearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      setSearchError(null);
      setPartialSearchWarning(null);
      return;
    }

    setSearching(true);
    setSearchError(null);
    setPartialSearchWarning(null);
    try {
      if (searchKind === 'all') {
        const mangaSourceIds = torboxCompatibleMangaSourceIds.length > 0
          ? torboxCompatibleMangaSourceIds
          : [mangaSourceHasTorboxLinks ? torboxMangaSource?.id ?? 'mangadex' : 'mangadex'];

        const [bookSearch, ...mangaSearches] = await Promise.allSettled([
          withTimeout(
            pluginApi.searchWithMeta('anna-archive', q, 1, TORBOX_SEARCH_LIMIT),
            SEARCH_TIMEOUT_MS,
            'Book search'
          ),
          ...mangaSourceIds.map((sourceId) =>
            withTimeout(
              pluginApi.searchWithMeta(sourceId, q, 1, TORBOX_SEARCH_LIMIT),
              SEARCH_TIMEOUT_MS,
              `Manga search (${sourceId})`
            )
          ),
        ]);

        const bookResults = bookSearch.status === 'fulfilled' ? bookSearch.value.items : [];
        const mangaResults = mangaSearches.flatMap((search) =>
          search.status === 'fulfilled' ? search.value.items : []
        );

        const seenMangaIds = new Set<string>();
        const dedupedMangaResults = mangaResults.filter((item) => {
          const key = item.id;
          if (seenMangaIds.has(key)) return false;
          seenMangaIds.add(key);
          return true;
        });

        const merged: TorboxSearchResult[] = [
          ...bookResults.map((item) => ({ ...item, _source: 'books' as const })),
          ...dedupedMangaResults.map((item) => ({ ...item, _source: 'manga' as const })),
        ];
        setSearchResults(merged);

        const mangaAllFailed = mangaSearches.length > 0 && mangaSearches.every((search) => search.status === 'rejected');
        const mangaAnyFailed = mangaSearches.some((search) => search.status === 'rejected');

        if (bookSearch.status === 'rejected' && mangaAllFailed) {
          throw new Error('Failed to search both book and manga sources.');
        }

        if (bookSearch.status === 'rejected' || mangaAnyFailed) {
          setPartialSearchWarning('One source failed to search; showing partial results.');
        }
      } else {
        if (searchKind === 'books') {
          const results = await withTimeout(
            pluginApi.searchWithMeta('anna-archive', q, 1, TORBOX_SEARCH_LIMIT),
            SEARCH_TIMEOUT_MS,
            'Book search'
          );
          setSearchResults(results.items.map((item) => ({ ...item, _source: 'books' as const })));
        } else {
          const candidateIds = torboxCompatibleMangaSourceIds.length > 0
            ? torboxCompatibleMangaSourceIds
            : [mangaSourceHasTorboxLinks ? torboxMangaSource?.id ?? 'mangadex' : 'mangadex'];

          const mangaSearches = await Promise.allSettled(
            candidateIds.map((sourceId) =>
              withTimeout(
                pluginApi.searchWithMeta(sourceId, q, 1, TORBOX_SEARCH_LIMIT),
                SEARCH_TIMEOUT_MS,
                `Manga search (${sourceId})`
              )
            )
          );

          const mangaResults = mangaSearches.flatMap((search) =>
            search.status === 'fulfilled' ? search.value.items : []
          );

          if (mangaResults.length === 0) {
            throw new Error('Manga search failed on all torrent-compatible sources.');
          }

          const seenMangaIds = new Set<string>();
          const dedupedMangaResults = mangaResults.filter((item) => {
            const key = item.id;
            if (seenMangaIds.has(key)) return false;
            seenMangaIds.add(key);
            return true;
          });

          const anyFailed = mangaSearches.some((search) => search.status === 'rejected');
          if (anyFailed) {
            setPartialSearchWarning('Some manga sources failed; showing results from available torrent sources.');
          }

          setSearchResults(dedupedMangaResults.map((item) => ({ ...item, _source: 'manga' as const })));
        }
      }
    } catch (error) {
      setSearchResults([]);
      setSearchError(error instanceof Error ? error.message : 'Search failed');
      setPartialSearchWarning(null);
    } finally {
      setSearching(false);
    }
  }, [
    torboxCompatibleMangaSourceIds,
    torboxMangaSource?.id,
    mangaSourceHasTorboxLinks,
    searchKind,
    searchQuery,
  ]);

  useEffect(() => {
    if (activeTab !== 'search') return;

    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      setSearchError(null);
      return;
    }

    const timer = window.setTimeout(() => {
      void runSearch();
    }, 300);

    return () => {
      window.clearTimeout(timer);
    };
  }, [activeTab, runSearch, searchQuery]);

  const triggerSearch = useCallback(() => {
    void runSearch();
  }, [runSearch]);

  const handleSendBookResult = useCallback(
    async (item: PluginSearchResult) => {
      if (!item.id) return;
      setQueueing((prev) => ({ ...prev, [item.id]: true }));
      setSearchError(null);
      setPartialSearchWarning(null);

      try {
        const candidatePriority = new Map<string, number>();

        const addCandidate = (rawCandidate: string, hintedType?: string) => {
          const parsed = parseAnnaCandidate(rawCandidate);
          if (!parsed) return;

          const type = hintedType ?? parsed.type;
          const url = parsed.url;
          if (!isTorboxBookLink(url)) return;

          const priority = getAnnaCandidatePriority(type, url);
          const existing = candidatePriority.get(url);
          if (existing === undefined || priority < existing) {
            candidatePriority.set(url, priority);
          }
        };

        const chapters = await pluginApi.getChapters('anna-archive', item.id);
        if (chapters.length > 0) {
          const pages = await pluginApi.getPages('anna-archive', chapters[0].id);
          pages.forEach((page) => {
            addCandidate(page.url);
          });
        }

        const fallbackUrl = getResultUrl(item);
        if (fallbackUrl && isTorboxCompatibleLink(fallbackUrl)) {
          addCandidate(fallbackUrl, 'torrent');
        }

        const firstCandidate = Array.from(candidatePriority.entries())
          .sort((a, b) => a[1] - b[1])
          .map(([url]) => url)[0];

        if (!firstCandidate) {
          throw new Error('No Torbox-compatible download link available for this result.');
        }

        await enqueueFromAnna({
          title: item.title,
          magnetLink: firstCandidate,
        });
        switchTab('books');
      } catch (error) {
        setSearchError(error instanceof Error ? error.message : 'Failed to send book to Torbox');
      } finally {
        setQueueing((prev) => {
          const next = { ...prev };
          delete next[item.id];
          return next;
        });
      }
    },
    [enqueueFromAnna, switchTab]
  );

  const handleSendMangaResult = useCallback(
    async (item: PluginSearchResult) => {
      if (!item.id) return;
      if (!mangaSourceHasTorboxLinks) {
        setSearchError(
          `Active manga source (${torboxMangaSource?.name ?? 'unknown'}) does not expose torrent/magnet links. Switch to ${torboxRecommendedMangaSourceLabel}.`
        );
        return;
      }
      const magnet = extractMagnetFromResult(item);
      if (!magnet) {
        setSearchError('This manga result does not expose a magnet/torrent link.');
        return;
      }

      setQueueing((prev) => ({ ...prev, [item.id]: true }));
      setSearchError(null);
      setPartialSearchWarning(null);
      try {
        await enqueueFromMangadex({
          title: item.title,
          magnetLink: magnet,
        });
        switchTab('manga');
      } catch (error) {
        setSearchError(error instanceof Error ? error.message : 'Failed to send manga to Torbox');
      } finally {
        setQueueing((prev) => {
          const next = { ...prev };
          delete next[item.id];
          return next;
        });
      }
    },
    [
      enqueueFromMangadex,
      mangaSourceHasTorboxLinks,
      switchTab,
      torboxMangaSource,
      torboxRecommendedMangaSourceLabel,
    ]
  );

  return (
    <div className="torbox-cloud flex h-full flex-col bg-background">
      <div className="torbox-layer p-6">
        <div className="torbox-hero-panel max-w-5xl mx-auto space-y-4 rounded-2xl p-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="torbox-kicker">
                <Cloud className="h-3.5 w-3.5" />
                Torbox Cloud Workspace
              </div>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">Torbox Control Center</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Discover, search, and manage Torbox book/manga jobs in one section.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={clearCompleted}>
                Clear Completed
              </Button>
            </div>
          </div>

          <div className="torbox-stat-grid">
            <div className="torbox-stat-card torbox-animate-in">
              <p className="torbox-stat-label">Total Jobs</p>
              <p className="torbox-stat-value">{queueStats.total}</p>
            </div>
            <div className="torbox-stat-card torbox-animate-in">
              <p className="torbox-stat-label">Active</p>
              <p className="torbox-stat-value torbox-stat-value--accent">{queueStats.active}</p>
            </div>
            <div className="torbox-stat-card torbox-animate-in">
              <p className="torbox-stat-label">Completed</p>
              <p className="torbox-stat-value torbox-stat-value--success">{queueStats.completed}</p>
            </div>
            <div className="torbox-stat-card torbox-animate-in">
              <p className="torbox-stat-label">Failed</p>
              <p className="torbox-stat-value torbox-stat-value--danger">{queueStats.failed}</p>
            </div>
          </div>

          <div className="torbox-toolbar torbox-mobile-stack flex items-center gap-2 flex-wrap">
            <TabButton
              label="Discover"
              icon={Sparkles}
              active={activeTab === 'discover'}
              onClick={() => switchTab('discover')}
            />
            <TabButton
              label="Books Queue"
              icon={BookOpen}
              count={bookJobs.length}
              active={activeTab === 'books'}
              onClick={() => switchTab('books')}
            />
            <TabButton
              label="Manga Queue"
              icon={Activity}
              count={mangaJobs.length}
              active={activeTab === 'manga'}
              onClick={() => switchTab('manga')}
            />
            <TabButton
              label="Search"
              icon={Search}
              active={activeTab === 'search'}
              onClick={() => switchTab('search')}
            />
          </div>

          {(activeTab === 'search' || activeTab === 'books' || activeTab === 'manga') && (
            <div className="torbox-mobile-stack flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery('torbox', e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && activeTab === 'search') {
                      triggerSearch();
                    }
                  }}
                  placeholder={
                    activeTab === 'search'
                      ? searchKind === 'all'
                        ? 'Search books and manga content for Torbox...'
                        : searchKind === 'books'
                        ? 'Search Anna Archive content for Torbox...'
                        : 'Search manga content for Torbox...'
                      : 'Filter queue by title...'
                  }
                  className="pl-9"
                />
              </div>
              {activeTab === 'search' && (
                <Button onClick={triggerSearch} disabled={searching || !searchQuery.trim()}>
                  {searching ? 'Searching...' : 'Search'}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="torbox-layer flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto space-y-4 torbox-animate-in">
          {activeTab === 'discover' && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="torbox-discover-card p-5">
                <div className="flex items-center gap-2 text-foreground">
                  <Compass className="w-4 h-4" />
                  <h2 className="font-semibold">Books Workflow</h2>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Search Anna results and send torrents/magnets to Torbox, then track progress in Books Queue.
                </p>
                <Button variant="outline" size="sm" className="mt-3 gap-1" onClick={() => switchTab('search')}>
                  Search Books
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Button>
              </div>

              <div className="torbox-discover-card p-5">
                <div className="flex items-center gap-2 text-foreground">
                  <BookOpen className="w-4 h-4" />
                  <h2 className="font-semibold">Manga Workflow</h2>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Manage manga jobs in one place and inspect status, progress, and imported paths.
                </p>
                {!mangaSourceHasTorboxLinks && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Current manga source is <span className="font-medium">{torboxMangaSource?.name ?? 'unknown'}</span>, which does not expose torrent/magnet links. Switch manga source to <span className="font-medium">{torboxRecommendedMangaSourceLabel}</span> for Torbox queueing.
                  </p>
                )}
                <Button variant="outline" size="sm" className="mt-3 gap-1" onClick={() => switchTab('manga')}>
                  Open Manga Queue
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}

          {activeTab === 'books' && (
            <>
              {filteredBookJobs.length === 0 && (
                <div className="torbox-empty">
                  <Cloud className="torbox-empty__icon" />
                  <p className="text-sm text-muted-foreground">No matching Torbox book jobs.</p>
                </div>
              )}

              {filteredBookJobs.map((job, index) => (
                <TorboxJobCard key={job.id} job={job} index={index} onRemove={removeJob} />
              ))}
            </>
          )}

          {activeTab === 'manga' && (
            <>
              {filteredMangaJobs.length === 0 && (
                <div className="torbox-empty">
                  <Activity className="torbox-empty__icon" />
                  <p className="text-sm text-muted-foreground">No matching Torbox manga jobs.</p>
                </div>
              )}

              {filteredMangaJobs.map((job, index) => (
                <TorboxJobCard key={job.id} job={job} index={index} onRemove={removeJob} />
              ))}
            </>
          )}

          {activeTab === 'search' && (
            <>
              <div className="flex items-center gap-2">
                <TabButton
                  icon={Sparkles}
                  label="All"
                  active={searchKind === 'all'}
                  onClick={() => setSearchKind('all')}
                />
                <TabButton
                  icon={BookOpen}
                  label="Books (Anna)"
                  active={searchKind === 'books'}
                  onClick={() => setSearchKind('books')}
                />
                <TabButton
                  icon={Activity}
                  label="Manga"
                  active={searchKind === 'manga'}
                  onClick={() => setSearchKind('manga')}
                />
              </div>

              {searchError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  {searchError}
                </div>
              )}

              {partialSearchWarning && !searchError && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
                  {partialSearchWarning}
                </div>
              )}

              {!searching && searchResults.length === 0 && searchQuery.trim() && !searchError && (
                <div className="torbox-empty">
                  <Search className="torbox-empty__icon" />
                  <p className="text-sm text-muted-foreground">No results found for this query.</p>
                </div>
              )}

              <div className="grid gap-4">
                {searchResults.map((item, index) => {
                  const canSendManga = Boolean(extractMagnetFromResult(item));
                  const queueingItem = queueing[item.id] ?? false;
                  const isBookResult = item._source === 'books';

                  return (
                    <div
                      key={item.id}
                      className="torbox-result-card torbox-animate-in p-4"
                      style={{ animationDelay: `${index * 36}ms` }}
                    >
                      <div className="flex gap-4">
                        <ResultCover item={item} />

                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-base line-clamp-2">{item.title}</h3>
                            <SearchResultSourceBadge source={item._source} />
                          </div>
                          {(item.summary || item.description) && (
                            <p className="text-sm text-muted-foreground line-clamp-2">{item.summary || item.description}</p>
                          )}

                          {isBookResult ? (
                            <Button
                              size="sm"
                              className="gap-1.5"
                              onClick={() => {
                                void handleSendBookResult(item);
                              }}
                              disabled={queueingItem}
                            >
                              {queueingItem ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  Sending...
                                </>
                              ) : (
                                'Send to Torbox'
                              )}
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              className="gap-1.5"
                              onClick={() => {
                                void handleSendMangaResult(item);
                              }}
                              disabled={queueingItem || !canSendManga || !mangaSourceHasTorboxLinks}
                              variant={canSendManga ? 'default' : 'outline'}
                            >
                              {queueingItem ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  Sending...
                                </>
                              ) : !mangaSourceHasTorboxLinks ? (
                                'Enable torrent source'
                              ) : canSendManga ? (
                                'Send to Torbox'
                              ) : (
                                'No torrent link'
                              )}
                            </Button>
                          )}

                          {!isBookResult && !mangaSourceHasTorboxLinks && (
                            <p className="text-[11px] text-muted-foreground">
                              Active manga source (<span className="font-medium">{torboxMangaSource?.name ?? 'unknown'}</span>) is not Torbox-compatible. Switch to {torboxRecommendedMangaSourceLabel} in source selector.
                            </p>
                          )}

                          {isBookResult && !isTorboxCompatibleLink(getResultUrl(item) ?? '') && (
                            <p className="text-[11px] text-muted-foreground">
                              This entry may require opening the detail page to locate a download link.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
