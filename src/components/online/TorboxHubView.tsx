import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Activity,
  AlertCircle,
  BookOpen,
  CheckCircle2,
  Cloud,
  Clock3,
  Loader2,
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
import { parsePageUrl } from '@/lib/utils';

type TorboxTab = 'books' | 'manga' | 'search';
type SearchKind = 'all' | 'books' | 'manga' | 'comics';
type TorboxResultSource = 'books' | 'manga';
type TorboxSearchResult = PluginSearchResult & { _source: TorboxResultSource; _sourceId?: string };
const TORBOX_MANGA_SOURCE_IDS = ['nyaa', 'animetosho'] as const;

type SendState = 'idle' | 'sending' | 'success' | 'failed';

const SOURCE_BADGE_MAP: Record<string, { label: string; className: string }> = {
  'anna-archive': { label: "Anna's Archive", className: 'torbox-source-badge--anna' },
  'nyaa': { label: 'Nyaa', className: 'torbox-source-badge--nyaa' },
  'animetosho': { label: 'AnimeTosho', className: 'torbox-source-badge--animetosho' },
  'mangadex': { label: 'MangaDex', className: 'torbox-source-badge--mangadex' },
  'libgen': { label: 'LibGen', className: 'torbox-source-badge--libgen' },
  'openlibrary': { label: 'Open Library', className: 'torbox-source-badge--generic' },
  'toongod': { label: 'ToonGod', className: 'torbox-source-badge--generic' },
};

interface TorboxHubViewProps {
  initialTab?: 'discover' | 'books' | 'manga';
}

const statusLabel: Record<string, string> = {
  queued: 'Queued',
  verifying: 'Verifying',
  downloading: 'Downloading',
  importing: 'Importing',
  completed: 'Completed',
  failed: 'Failed',
};

function statusPhaseText(status: TorboxJobStatus): string {
  switch (status) {
    case 'queued':
      return 'Queued in Torbox';
    case 'verifying':
      return 'Preparing transfer';
    case 'downloading':
      return 'Downloading from Torbox';
    case 'importing':
      return 'Cloud complete - downloading to this device and importing';
    case 'completed':
      return 'Downloaded and imported to library';
    case 'failed':
      return 'Transfer failed';
    default:
      return 'Processing';
  }
}

function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'ETA --';

  const rounded = Math.round(seconds);
  if (rounded < 60) return `ETA ${rounded}s`;

  const minutes = Math.floor(rounded / 60);
  const secs = rounded % 60;
  if (minutes < 60) return secs === 0 ? `ETA ${minutes}m` : `ETA ${minutes}m ${secs}s`;

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins === 0 ? `ETA ${hours}h` : `ETA ${hours}h ${mins}m`;
}

function estimateEta(size: number, progressPercent: number, speed: number, status: TorboxJobStatus): string | null {
  if (status !== 'downloading') return null;
  if (!Number.isFinite(size) || size <= 0) return null;
  if (!Number.isFinite(speed) || speed <= 0) return null;

  const clampedProgress = Math.max(0, Math.min(100, progressPercent));
  if (clampedProgress >= 100) return null;

  const downloadedBytes = size * (clampedProgress / 100);
  const remainingBytes = Math.max(0, size - downloadedBytes);
  if (remainingBytes <= 0) return null;

  return formatEta(remainingBytes / speed);
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const precision = size >= 10 || unitIndex === 0 ? 0 : 1;
  return `${size.toFixed(precision)} ${units[unitIndex]}`;
}

const TORBOX_SEARCH_LIMIT = 20;
const SEARCH_TIMEOUT_MS = 20000;

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

function isTorboxSendableLink(link: string): boolean {
  // Accept both torrent-style links AND plain HTTP URLs (for web download)
  return isTorboxCompatibleLink(link) || isHttpLink(link);
}

function detectLinkMethod(link: string): 'magnet' | 'torrent' | 'webdl' {
  const normalized = link.trim().toLowerCase();
  if (normalized.startsWith('magnet:')) return 'magnet';
  if (normalized.includes('.torrent') || normalized.includes('/torrent')) return 'torrent';
  return 'webdl';
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

function normalizeKindFromUrl(kind: string, url: string): string {
  if (kind === 'direct') {
    const normalized = url.trim().toLowerCase();
    if (normalized.startsWith('magnet:')) return 'magnet';
    if (normalized.includes('.torrent') || normalized.includes('/torrent')) return 'torrent';
  }
  return kind;
}

function getSourceBadgeInfo(sourceId?: string, fallbackSource?: TorboxResultSource): { label: string; className: string } {
  if (sourceId && SOURCE_BADGE_MAP[sourceId]) {
    return SOURCE_BADGE_MAP[sourceId];
  }
  if (fallbackSource === 'books') {
    return SOURCE_BADGE_MAP['anna-archive'];
  }
  return { label: fallbackSource === 'manga' ? 'Manga' : 'Unknown', className: 'torbox-source-badge--generic' };
}

function parseAnnaCandidate(rawValue: string): { kind: string; url: string } | null {
  const parsed = parsePageUrl(rawValue);
  if (!parsed.url) return null;

  if (parsed.kind === 'direct' && isTorboxCompatibleLink(parsed.url)) {
    const normalized = parsed.url.trim().toLowerCase();
    return {
      kind: normalized.startsWith('magnet:') ? 'magnet' : 'torrent',
      url: parsed.url,
    };
  }

  if (parsed.kind === 'anna' && parsed.url.toLowerCase().includes('/md5/')) {
    const md5Index = parsed.url.toLowerCase().indexOf('/md5/');
    const sliced = parsed.url.slice(md5Index);
    const hashMatch = sliced.match(/^\/md5\/([a-fA-F0-9]{32})/);
    if (hashMatch) {
      return { kind: 'anna', url: `https://annas-archive.org/md5/${hashMatch[1]}` };
    }
    return { kind: 'anna', url: 'https://annas-archive.org' + sliced.split('?')[0] };
  }

  return parsed;
}

function getAnnaCandidatePriority(kind: string, url: string): number {
  // 1. Highest priority: Actual torrents/magnets if they miraculously exist 
  if (kind === 'magnet') return 0;
  if (kind === 'torrent') return 1;
  
  // 2. Medium priority: Anna's Archive detail page (TorBox has a native webDL python scraper exclusively for this)
  if (kind === 'anna') return 2;
  
  // 3. Low priority: External direct mirrors (like libgen direct pdfs)
  if (kind === 'external') return 3;
  
  // 4. Excluded priority: RapidAPI direct HTTP download links 
  // (TorBox cannot use these because it lacks the 'x-rapidapi-key' headers required!)
  if (kind === 'direct') return 100;
  
  if (isTorboxCompatibleLink(url)) return 5;
  return 101;
}

function extractTorboxSourceFromResult(item: PluginSearchResult): { kind: string; url: string } | null {
  const extra = item.extra ?? {};
  const candidates = [
    extra.magnet_url,
    extra.torrent_url,
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
    const parsed = parsePageUrl(value);
    if (!parsed.url) continue;

    if (parsed.kind === 'direct' && isTorboxCompatibleLink(parsed.url)) {
      const normalized = parsed.url.trim().toLowerCase();
      return {
        kind: normalized.startsWith('magnet:') ? 'magnet' : 'torrent',
        url: parsed.url,
      };
    }

    return parsed;
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

function SearchResultSourceBadge({ sourceId, fallbackSource }: { sourceId?: string; fallbackSource: TorboxResultSource }) {
  const info = getSourceBadgeInfo(sourceId, fallbackSource);
  return (
    <span className={`torbox-source-badge ${info.className}`}>
      {info.label}
    </span>
  );
}

function MetadataRow({ item }: { item: TorboxSearchResult }) {
  const extra = item.extra ?? {};
  const format = typeof extra.format === 'string' ? extra.format : undefined;
  const fileSize = typeof extra.file_size === 'string' ? extra.file_size : undefined;
  const author = typeof extra.author === 'string' ? extra.author : undefined;
  const seeders = typeof extra.seeders === 'string' || typeof extra.seeders === 'number'
    ? Number(extra.seeders)
    : undefined;

  const hasMeta = format || fileSize || author || (seeders !== undefined && !isNaN(seeders));
  if (!hasMeta) return null;

  const seedPercent = seeders !== undefined && !isNaN(seeders)
    ? Math.min(100, Math.round((seeders / 100) * 100))
    : 0;

  return (
    <div className="torbox-meta-row">
      {author && <span>{author}</span>}
      {author && (format || fileSize) && <span className="torbox-meta-dot" />}
      {format && <span className="torbox-meta-pill torbox-meta-pill--format">{format}</span>}
      {fileSize && <span className="torbox-meta-pill">{fileSize}</span>}
      {seeders !== undefined && !isNaN(seeders) && seeders > 0 && (
        <span className="torbox-seed-bar">
          <span className="torbox-seed-bar__track">
            <span className="torbox-seed-bar__fill" style={{ width: `${seedPercent}%` }} />
          </span>
          <span className="torbox-seed-bar__label">S: {seeders}</span>
        </span>
      )}
    </div>
  );
}

function SendButton({
  sendState,
  errorMsg,
  disabled,
  onClick,
  variant,
  label,
}: {
  sendState: SendState;
  errorMsg?: string;
  disabled: boolean;
  onClick: () => void;
  variant?: 'default' | 'outline';
  label: string;
}) {
  const stateClass =
    sendState === 'success'
      ? 'torbox-send-btn torbox-send-btn--success'
      : sendState === 'failed'
      ? 'torbox-send-btn torbox-send-btn--failed'
      : 'torbox-send-btn';

  return (
    <Button
      size="sm"
      className={`gap-1.5 ${stateClass}`}
      onClick={onClick}
      disabled={disabled || sendState === 'success'}
      variant={variant ?? 'default'}
    >
      {sendState === 'sending' ? (
        <>
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Sending...
        </>
      ) : sendState === 'success' ? (
        <>
          <CheckCircle2 className="w-3.5 h-3.5" />
          Added to TorBox
        </>
      ) : sendState === 'failed' ? (
        <>
          <AlertCircle className="w-3.5 h-3.5" />
          {errorMsg ? `Failed — ${errorMsg.slice(0, 40)}` : 'Failed — retry'}
        </>
      ) : (
        label
      )}
    </Button>
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
  type MangaMetadata = { cover_url_large?: string };

  const [hasImageError, setHasImageError] = useState(false);
  const [asyncCover, setAsyncCover] = useState<string | null>(null);
  const baseCover = getResultCover(item);
  const cover = baseCover || asyncCover;
  
  const SourceIcon = item._source === 'books' ? BookOpen : Activity;

  useEffect(() => {
    let active = true;
    if (!baseCover && item._source === 'manga' && item.title) {
      // 500ms debounce to prevent rate-limiting on quick scrolls
      const timer = setTimeout(() => {
        invoke<MangaMetadata[]>('search_manga_metadata', { title: item.title })
          .then((results) => {
            if (active && results && results.length > 0 && results[0].cover_url_large) {
              setAsyncCover(results[0].cover_url_large);
            }
          })
          .catch((err) => console.warn('Failed to fetch anilist cover:', err));
      }, 500);
      return () => {
        active = false;
        clearTimeout(timer);
      };
    }
  }, [baseCover, item._source, item.title]);

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
  const clampedProgress = Math.max(0, Math.min(100, job.progress));
  const eta = estimateEta(Number(job.size || 0), clampedProgress, job.status === 'downloading' ? Number(job.downloadSpeed || 0) : 0, job.status);
  const localProgress = typeof job.localProgress === 'number' ? Math.max(0, Math.min(100, job.localProgress)) : null;
  const localDownloaded = typeof job.localDownloadedBytes === 'number' ? job.localDownloadedBytes : null;
  const localTotal = typeof job.localTotalBytes === 'number' ? job.localTotalBytes : null;
  const localFileIndex = typeof job.localFileIndex === 'number' ? job.localFileIndex : null;
  const localFileTotal = typeof job.localFileTotal === 'number' ? job.localFileTotal : null;
  const localFileName = typeof job.localFileName === 'string' ? job.localFileName : null;

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
        <span className="text-xs text-muted-foreground">{clampedProgress.toFixed(1)}%</span>
      </div>

      <p className="mt-1 text-[11px] text-muted-foreground/90">{statusPhaseText(job.status)}</p>
      {eta && <p className="mt-0.5 text-[11px] text-muted-foreground/90">{eta}</p>}

      <div className="torbox-progress-track mt-3">
        <div
          className={progressClass}
          style={{ width: `${clampedProgress}%` }}
        />
      </div>

      <div className="mt-3 space-y-1 text-xs text-muted-foreground">
        {job.torrentId && <p>Torrent ID: {job.torrentId}</p>}
        {job.status === 'importing' && (
          <p className="space-y-0.5">
            <span className="block">
              Local download:{' '}
            {localProgress !== null ? `${localProgress.toFixed(1)}%` : 'in progress'}
            {localDownloaded !== null ? ` (${formatBytes(localDownloaded)}` : ''}
            {localDownloaded !== null && localTotal !== null ? ` / ${formatBytes(localTotal)})` : localDownloaded !== null ? ')' : ''}
            </span>
            {localFileIndex !== null && localFileTotal !== null && localFileTotal > 1 && (
              <span className="block text-[11px] text-muted-foreground/90">
                Volume {localFileIndex} of {localFileTotal}
                {localFileName ? ` - ${localFileName}` : ''}
              </span>
            )}
          </p>
        )}
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

  const [activeTab, setActiveTab] = useState<TorboxTab>(
    initialTab === 'books' || initialTab === 'manga' ? initialTab : 'search'
  );
  const [searchKind, setSearchKind] = useState<SearchKind>('all');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<TorboxSearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [partialSearchWarning, setPartialSearchWarning] = useState<string | null>(null);
  const [sendStates, setSendStates] = useState<Record<string, { state: SendState; error?: string }>>({});
  const searchQuery = useOnlineSearchStore((state) => state.queries.torbox);
  const setSearchQuery = useOnlineSearchStore((state) => state.setQuery);

  const setSendState = useCallback((itemId: string, state: SendState, error?: string) => {
    setSendStates((prev) => ({ ...prev, [itemId]: { state, error } }));
    if (state === 'success') {
      window.setTimeout(() => {
        setSendStates((prev) => {
          const current = prev[itemId];
          if (current?.state === 'success') {
            const next = { ...prev };
            delete next[itemId];
            return next;
          }
          return prev;
        });
      }, 3000);
    }
  }, []);

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
    setActiveTab(initialTab === 'books' || initialTab === 'manga' ? initialTab : 'search');
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
        if (searchKind === 'books' || searchKind === 'comics') {
          const results = await withTimeout(
            pluginApi.searchWithMeta('anna-archive', q, 1, TORBOX_SEARCH_LIMIT),
            SEARCH_TIMEOUT_MS,
            searchKind === 'comics' ? 'Comics search' : 'Book search'
          );
          setSearchResults(results.items.map((item) => ({ ...item, _source: 'books' as const })));
        } else if (searchKind === 'manga') {
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
      setSendState(item.id, 'sending');
      setSearchError(null);
      setPartialSearchWarning(null);

      try {
        const candidatePriority = new Map<string, { kind: string; priority: number }>();

        const addCandidate = (rawCandidate: string, hintedType?: string) => {
          const parsed = parseAnnaCandidate(rawCandidate);
          if (!parsed) return;

          const kind = normalizeKindFromUrl(hintedType ?? parsed.kind, parsed.url);
          const url = parsed.url;
          // Accept BOTH torrent-style links AND plain HTTP URLs (for TorBox web download)
          if (!isTorboxSendableLink(url)) return;

          const priority = getAnnaCandidatePriority(kind, url);
          const existing = candidatePriority.get(url);
          if (existing === undefined || priority < existing.priority) {
            candidatePriority.set(url, { kind, priority });
          }
        };

        const chapters = await pluginApi.getChapters('anna-archive', item.id);
        if (chapters.length > 0) {
          const pages = await pluginApi.getPages('anna-archive', chapters[0].id);
          console.log('[TorBox] Anna pages response:', JSON.stringify(pages, null, 2));
          pages.forEach((page) => {
            addCandidate(page.url);
          });
        }

        // Also accept plain HTTP URLs as fallback (web download)
        const fallbackUrl = getResultUrl(item);
        if (fallbackUrl && isTorboxSendableLink(fallbackUrl)) {
          const hintType = isTorboxCompatibleLink(fallbackUrl) ? 'torrent' : 'direct';
          addCandidate(fallbackUrl, hintType);
        }

        const firstCandidate = Array.from(candidatePriority.entries())
          .map(([url, meta]) => ({ url, kind: meta.kind, priority: meta.priority }))
          .sort((a, b) => a.priority - b.priority)[0];

        if (!firstCandidate) {
          throw new Error('No download link found. Verify Anna\'s Archive keys in Settings → Online Sources.');
        }

        if (firstCandidate.kind === 'anna' || firstCandidate.kind === 'external') {
          openInBrowser(firstCandidate.url);
          setSendState(item.id, 'success');
        } else if (
          firstCandidate.kind === 'magnet' ||
          firstCandidate.kind === 'torrent' ||
          firstCandidate.kind === 'direct'
        ) {
          const method = detectLinkMethod(firstCandidate.url);
          console.log(`[TorBox] Sending book via ${method}:`, firstCandidate.url.slice(0, 80));

          await enqueueFromAnna({
            title: item.title,
            sourceLink: firstCandidate.url,
          });
          setSendState(item.id, 'success');
        } else {
          throw new Error(`Unsupported source kind '${firstCandidate.kind}' for Torbox send.`);
        }
      } catch (error) {
        const msg = getUiErrorMessage(error, 'Failed to send book to Torbox');
        setSendState(item.id, 'failed', msg);
        setSearchError(msg);
      }
    },
    [enqueueFromAnna, openInBrowser, setSendState]
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
      const torboxSource = extractTorboxSourceFromResult(item);
      if (!torboxSource) {
        setSearchError('This manga result does not expose a magnet/torrent link.');
        return;
      }

      const normalizedKind = normalizeKindFromUrl(torboxSource.kind, torboxSource.url);

      setSendState(item.id, 'sending');
      setSearchError(null);
      setPartialSearchWarning(null);
      try {
        if (normalizedKind === 'anna' || normalizedKind === 'external') {
          openInBrowser(torboxSource.url);
          setSendState(item.id, 'success');
        } else if (
          normalizedKind === 'magnet' ||
          normalizedKind === 'torrent' ||
          normalizedKind === 'direct'
        ) {
          console.log(`[TorBox] Sending manga via ${detectLinkMethod(torboxSource.url)}:`, torboxSource.url.slice(0, 80));
          await enqueueFromMangadex({
            title: item.title,
            sourceLink: torboxSource.url,
          });
          setSendState(item.id, 'success');
        } else {
          throw new Error(`Unsupported source kind '${normalizedKind}' for Torbox send.`);
        }
      } catch (error) {
        const msg = getUiErrorMessage(error, 'Failed to send manga to Torbox');
        setSendState(item.id, 'failed', msg);
        setSearchError(msg);
      }
    },
    [
      enqueueFromMangadex,
      mangaSourceHasTorboxLinks,
      openInBrowser,
      setSendState,
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
              label="Search"
              icon={Search}
              active={activeTab === 'search'}
              onClick={() => switchTab('search')}
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
                  label="Books"
                  active={searchKind === 'books'}
                  onClick={() => setSearchKind('books')}
                />
                <TabButton
                  icon={Activity}
                  label="Manga"
                  active={searchKind === 'manga'}
                  onClick={() => setSearchKind('manga')}
                />
                <TabButton
                  icon={BookOpen}
                  label="Comics"
                  active={searchKind === 'comics'}
                  onClick={() => setSearchKind('comics')}
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
                  const canSendManga = Boolean(extractTorboxSourceFromResult(item));
                  const isBookResult = item._source === 'books';
                  const itemSendState = sendStates[item.id];
                  const currentSendState: SendState = itemSendState?.state ?? 'idle';
                  const sendError = itemSendState?.error;
                  const sourceId = item._sourceId ?? (typeof item.source_id === 'string' ? item.source_id : undefined);

                  return (
                    <div
                      key={item.id}
                      className="torbox-result-card torbox-animate-in p-4"
                      style={{ animationDelay: `${index * 36}ms` }}
                    >
                      <div className="flex gap-4">
                        <ResultCover item={item} />

                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-base line-clamp-2">{item.title}</h3>
                            <SearchResultSourceBadge sourceId={sourceId} fallbackSource={item._source} />
                          </div>

                          <MetadataRow item={item} />

                          {(item.summary || item.description) && (
                            <p className="text-sm text-muted-foreground line-clamp-2">{item.summary || item.description}</p>
                          )}

                          <div className="flex items-center gap-2 flex-wrap">
                            {isBookResult ? (
                              <SendButton
                                sendState={currentSendState}
                                errorMsg={sendError}
                                disabled={false}
                                onClick={() => { void handleSendBookResult(item); }}
                                label="Send to TorBox"
                              />
                            ) : (
                              <SendButton
                                sendState={currentSendState}
                                errorMsg={sendError}
                                disabled={!canSendManga || !mangaSourceHasTorboxLinks}
                                onClick={() => { void handleSendMangaResult(item); }}
                                variant={canSendManga ? 'default' : 'outline'}
                                label={!mangaSourceHasTorboxLinks ? 'Enable torrent source' : canSendManga ? 'Send to TorBox' : 'No torrent link'}
                              />
                            )}

                            {currentSendState === 'success' && (
                              <span className="torbox-method-hint">
                                ✓ Sent via {isBookResult ? 'web download' : 'magnet'}
                              </span>
                            )}
                          </div>

                          {!isBookResult && !mangaSourceHasTorboxLinks && (
                            <p className="text-[11px] text-muted-foreground">
                              Active manga source (<span className="font-medium">{torboxMangaSource?.name ?? 'unknown'}</span>) is not Torbox-compatible. Switch to {torboxRecommendedMangaSourceLabel} in source selector.
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
