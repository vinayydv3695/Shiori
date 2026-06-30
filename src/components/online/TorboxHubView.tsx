import { useCallback, useEffect, useMemo, useState } from 'react';
import { useIsMobile } from '@/hooks/useIsMobile';
import { cn } from '@/lib/utils';
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
import {
  pluginApi,
  type SearchDiagnostics,
  type SearchResult as PluginSearchResult,
} from '@/lib/pluginSources';
import { useSourceHealthStore, type SourceHealthLevel } from '@/store/sourceHealthStore';
import { useTorboxStore, type TorboxJobStatus, type TorboxQueueItem } from '@/store/useTorboxStore';
import { useOnlineSearchStore } from '@/store/onlineSearchStore';
import { useSourceStore } from '@/store/sourceStore';
import { usePreferencesStore } from '@/store/preferencesStore';
import { parsePageUrl } from '@/lib/utils';

type TorboxTab = 'books' | 'manga' | 'search';
type SearchKind = 'all' | 'books' | 'manga' | 'comics';
type TorboxResultSource = 'books' | 'manga';
type SearchDomain = 'books' | 'manga';
type TorboxSearchResult = PluginSearchResult & { _source: TorboxResultSource; _sourceId?: string };
const TORBOX_MANGA_SOURCE_IDS = ['nyaa'] as const;
const TORBOX_QUEUEABLE_BOOK_FORMATS = new Set(['cbz', 'cbr', 'epub', 'pdf', 'mobi', 'azw3', 'docx']);
const TORBOX_BOOK_ONLY_FORMATS = new Set(['epub', 'pdf', 'mobi', 'azw3', 'docx', 'fb2', 'txt', 'rtf', 'djvu', 'azw']);
const TORBOX_COMIC_ONLY_FORMATS = new Set(['cbz', 'cbr']);

type BookFormatBucket = 'book' | 'comic' | 'unsupported' | 'unknown';

type SendState = 'idle' | 'sending' | 'success' | 'failed';

type SourceSearchDiagnostic = {
  sourceId: string;
  sourceName: string;
  domain: SearchDomain;
  status: 'success' | 'failed' | 'timeout';
  errorTag?: 'error' | 'timeout';
  errorMessage?: string;
  selectedMirror?: string;
  attemptedMirrors: string[];
  durationMs?: number;
  resultCount?: number;
  retriesUsed?: number;
  healthScore: number;
  healthLevel: SourceHealthLevel;
};

const SOURCE_BADGE_MAP: Record<string, { label: string; className: string }> = {
  'anna-archive': { label: "Anna's Archive", className: 'torbox-source-badge--anna' },
  'bitsearch': { label: 'Bitsearch', className: 'torbox-source-badge--generic' },
  'tpb-api': { label: 'TPB API', className: 'torbox-source-badge--generic' },
  'x1337': { label: '1337x', className: 'torbox-source-badge--generic' },
  'rutracker': { label: 'RuTracker', className: 'torbox-source-badge--generic' },
  'nyaa': { label: 'Nyaa', className: 'torbox-source-badge--nyaa' },
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
      return 'Cloud complete • importing to your library';
    case 'completed':
      return 'Downloaded and imported to library';
    case 'failed':
      return 'Transfer failed';
    default:
      return 'Processing';
  }
}

function conciseFailedPhase(error?: string): string {
  if (!error || !error.trim()) return 'Transfer failed';
  const normalized = error
    .replace(/^torbox\s+(target|queue)?\s*failed\s*:\s*/i, '')
    .replace(/^error\s*:\s*/i, '')
    .trim();
  const message = normalized || error.trim();
  return message.length > 56 ? `${message.slice(0, 56)}…` : message;
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
    normalized.includes('/torrent') ||
    normalized.includes('/download/')
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

function pushUniqueFormatToken(target: string[], seen: Set<string>, token: string): void {
  const normalized = token.trim().toLowerCase().replace(/^\./, '').replace(/[^a-z0-9]/g, '');
  if (!normalized || normalized.length < 2 || normalized.length > 6) return;
  if (seen.has(normalized)) return;
  seen.add(normalized);
  target.push(normalized);
}

function collectFormatTokensFromHint(value: string, includeLooseTokens = false): string[] {
  const tokens: string[] = [];
  const seen = new Set<string>();
  const lower = value.toLowerCase();

  const extensionPattern = /\.([a-z0-9]{2,6})(?=$|\?|#|&|\s|\]|\)|-|_)/g;
  let extensionMatch = extensionPattern.exec(lower);
  while (extensionMatch !== null) {
    pushUniqueFormatToken(tokens, seen, extensionMatch[1]);
    extensionMatch = extensionPattern.exec(lower);
  }

  const bracketPattern = /(?:\[|\()([a-z0-9]{2,6})(?:\]|\))/g;
  let bracketMatch = bracketPattern.exec(lower);
  while (bracketMatch !== null) {
    pushUniqueFormatToken(tokens, seen, bracketMatch[1]);
    bracketMatch = bracketPattern.exec(lower);
  }

  if (includeLooseTokens) {
    const compactWords = lower.match(/[a-z0-9]{2,10}/g) ?? [];
    compactWords.forEach((word) => {
      if (word.length <= 6) {
        pushUniqueFormatToken(tokens, seen, word);
      }
    });
  }

  return tokens;
}

function classifyBookResultFormat(item: PluginSearchResult, candidateUrl?: string): { bucket: BookFormatBucket; format: string | null } {
  const extra = item.extra ?? {};
  const hintValues: string[] = [];
  const hintKeys = [
    'format',
    'file_name',
    'filename',
    'fileName',
    'name',
    'release_name',
    'releaseName',
    'torrent_name',
    'torrentName',
    'path',
  ];

  if (candidateUrl && candidateUrl.trim()) {
    hintValues.push(candidateUrl);
  }
  if (item.title?.trim()) {
    hintValues.push(item.title);
  }
  hintKeys.forEach((key) => {
    const value = extra[key];
    if (typeof value === 'string' && value.trim()) {
      hintValues.push(value);
    }
  });

  const seenTokens = new Set<string>();
  const tokens: string[] = [];

  hintValues.forEach((value, index) => {
    const isLikelyExplicitFormat = index > 1 && value === extra.format;
    collectFormatTokensFromHint(value, isLikelyExplicitFormat).forEach((token) => {
      if (!seenTokens.has(token)) {
        seenTokens.add(token);
        tokens.push(token);
      }
    });
  });

  for (const token of tokens) {
    if (TORBOX_BOOK_ONLY_FORMATS.has(token)) {
      return { bucket: 'book', format: token };
    }
    if (TORBOX_COMIC_ONLY_FORMATS.has(token)) {
      return { bucket: 'comic', format: token };
    }
  }

  if (tokens.length > 0) {
    return { bucket: 'unsupported', format: tokens[0] ?? null };
  }

  return { bucket: 'unknown', format: null };
}

function filterBookResultsByKind(
  items: TorboxSearchResult[],
  kind: 'all' | 'books' | 'comics'
): { items: TorboxSearchResult[]; unknownFiltered: number; unsupportedFiltered: number } {
  const filtered: TorboxSearchResult[] = [];
  let unknownFiltered = 0;
  let unsupportedFiltered = 0;

  items.forEach((item) => {
    const resultUrl = getResultUrl(item);
    const { bucket } = classifyBookResultFormat(item, resultUrl);

    if (bucket === 'unknown') {
      unknownFiltered += 1;
      return;
    }
    if (bucket === 'unsupported') {
      unsupportedFiltered += 1;
      return;
    }

    if (kind === 'books' && bucket !== 'book') return;
    if (kind === 'comics' && bucket !== 'comic') return;
    filtered.push(item);
  });

  return { items: filtered, unknownFiltered, unsupportedFiltered };
}

function formatFilterWarningText(unknownFiltered: number, unsupportedFiltered: number): string | null {
  const total = unknownFiltered + unsupportedFiltered;
  if (total <= 0) return null;
  return `Filtered out ${total} result${total === 1 ? '' : 's'} with unknown or unsupported formats.`;
}

function getCandidateBookFormat(item: PluginSearchResult, url: string): string | null {
  const classified = classifyBookResultFormat(item, url);
  if (classified.bucket === 'unknown') {
    return null;
  }
  return classified.format;
}

function isQueueableBookCandidate(item: PluginSearchResult, candidateUrl: string): { allowed: boolean; format: string | null } {
  const format = getCandidateBookFormat(item, candidateUrl);
  if (!format) {
    return { allowed: false, format: null };
  }
  return { allowed: TORBOX_QUEUEABLE_BOOK_FORMATS.has(format), format };
}

function buildResultDedupKey(item: PluginSearchResult): string {
  const url = getResultUrl(item);
  if (url) {
    return `url:${url.trim().toLowerCase()}`;
  }

  const extra = item.extra ?? {};
  const author = typeof extra.author === 'string' ? extra.author.trim().toLowerCase() : '';
  return `title:${item.title.trim().toLowerCase()}|author:${author}`;
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

function isTimeoutMessage(message: string): boolean {
  return message.toLowerCase().includes('timed out');
}

function formatDuration(durationMs?: number): string {
  if (!Number.isFinite(durationMs) || (durationMs ?? 0) < 0) {
    return '—';
  }

  const rounded = Math.round(durationMs ?? 0);
  if (rounded < 1000) {
    return `${rounded}ms`;
  }
  return `${(rounded / 1000).toFixed(2)}s`;
}

function formatSearchDiagnosticsSummary(
  diagnostics: SourceSearchDiagnostic[],
  totalResults: number
): string | null {
  if (diagnostics.length === 0) return null;

  const successCount = diagnostics.filter((item) => item.status === 'success').length;
  const totalCount = diagnostics.length;
  const failed = diagnostics.filter((item) => item.status !== 'success');

  const base = `Showing ${totalResults} result${totalResults === 1 ? '' : 's'} from ${successCount}/${totalCount} source${totalCount === 1 ? '' : 's'}.`;
  if (failed.length === 0) return base;

  const failedList = failed
    .map((item) => `${item.sourceName} (${item.status === 'timeout' ? 'timeout' : 'error'})`)
    .join(', ');

  return `${base} Failed: ${failedList}.`;
}

function parseAttemptedMirrors(diagnostics?: SearchDiagnostics): string[] {
  const attempts = diagnostics?.attemptedMirrors;
  if (!Array.isArray(attempts)) return [];

  return attempts
    .map((attempt) => {
      if (typeof attempt === 'string') {
        return attempt;
      }
      if (!attempt || typeof attempt !== 'object') {
        return null;
      }

      const rawMirror = (attempt as { mirror?: unknown }).mirror;
      const rawSuccess = (attempt as { success?: unknown }).success;
      if (typeof rawMirror !== 'string' || !rawMirror.trim()) {
        return null;
      }

      const suffix =
        typeof rawSuccess === 'boolean'
          ? rawSuccess
            ? 'ok'
            : 'fail'
          : 'attempt';

      return `${rawMirror} (${suffix})`;
    })
    .filter((value): value is string => Boolean(value));
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

function parseBookCandidate(_sourceId: string, rawValue: string): { kind: string; url: string } | null {
  const parsed = parsePageUrl(rawValue);
  if (!parsed.url) return null;

  if (parsed.kind === 'direct' && isTorboxCompatibleLink(parsed.url)) {
    const normalized = parsed.url.trim().toLowerCase();
    return {
      kind: normalized.startsWith('magnet:') ? 'magnet' : 'torrent',
      url: parsed.url,
    };
  }

  return parsed;
}

function getBookCandidatePriority(kind: string, url: string): number {
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

function mapResultWithSource(item: PluginSearchResult, source: TorboxResultSource, sourceId: string): TorboxSearchResult {
  return {
    ...item,
    _source: source,
    _sourceId: typeof item.source_id === 'string' ? item.source_id : sourceId,
  };
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
  const preferences = usePreferencesStore((state) => state.preferences);
  const baseCover = getResultCover(item);
  const cover = baseCover || asyncCover;
  
  const SourceIcon = item._source === 'books' ? BookOpen : Activity;

  useEffect(() => {
    let active = true;
    if (!baseCover && item._source === 'manga' && item.title) {
      // 500ms debounce to prevent rate-limiting on quick scrolls
      const timer = setTimeout(() => {
        invoke<MangaMetadata[]>('search_manga_metadata', { title: item.title, includeNsfw: preferences?.includeNsfw ?? false })
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
  const showLocalProgress = job.status === 'importing' || localProgress !== null;

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
      </div>

      <p className="mt-1 text-[11px] text-muted-foreground/90">
        {job.status === 'failed' ? conciseFailedPhase(job.error) : statusPhaseText(job.status)}
      </p>
      {eta && <p className="mt-0.5 text-[11px] text-muted-foreground/90">{eta}</p>}

      <div className="mt-3 space-y-2">
        <div className="torbox-progress-group">
          <div className="torbox-progress-group__header">
            <span className="torbox-progress-group__label">Cloud progress</span>
            <span className="torbox-progress-group__value">{clampedProgress.toFixed(1)}%</span>
          </div>
          <div className="torbox-progress-track">
            <div
              className={progressClass}
              style={{ width: `${clampedProgress}%` }}
            />
          </div>
        </div>

        {showLocalProgress && (
          <div className="torbox-progress-group torbox-progress-group--local">
            <div className="torbox-progress-group__header">
              <span className="torbox-progress-group__label">Local import</span>
              <span className="torbox-progress-group__value">
                {localProgress !== null ? `${localProgress.toFixed(1)}%` : 'In progress'}
              </span>
            </div>
            <div className="torbox-progress-track torbox-progress-track--local">
              <div
                className="torbox-progress-fill torbox-progress--local"
                style={{ width: `${localProgress ?? 0}%` }}
              />
            </div>
            <p className="torbox-progress-group__meta">
              {localDownloaded !== null ? formatBytes(localDownloaded) : 'Downloading locally'}
              {localDownloaded !== null && localTotal !== null ? ` / ${formatBytes(localTotal)}` : ''}
            </p>
            {(localFileIndex !== null || localFileName) && (
              <p className="torbox-progress-group__meta torbox-progress-group__meta--file">
                {localFileIndex !== null && localFileTotal !== null && localFileTotal > 1
                  ? `File ${localFileIndex} of ${localFileTotal}`
                  : 'Importing file'}
                {localFileName ? ` • ${localFileName}` : ''}
              </p>
            )}
          </div>
        )}
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
  const isMobile = useIsMobile();
  const preferences = usePreferencesStore((state) => state.preferences);
  const setCurrentView = useUIStore((state) => state.setCurrentView);
  const sources = useSourceStore((state) => state.sources);
  const jobs = useTorboxStore((state) => state.jobs);
  const removeJob = useTorboxStore((state) => state.removeJob);
  const clearCompleted = useTorboxStore((state) => state.clearCompleted);
  const enqueueFromAnna = useTorboxStore((state) => state.enqueueFromAnna);
  const enqueueFromMangadex = useTorboxStore((state) => state.enqueueFromMangadex);

  const preferredContentType = usePreferencesStore((state) => state.preferences?.preferredContentType ?? 'both');
  
  const [activeTab, setActiveTab] = useState<TorboxTab>(() => {
    if (initialTab === 'books' && preferredContentType !== 'manga') return 'books';
    if (initialTab === 'manga' && preferredContentType !== 'books') return 'manga';
    return 'search';
  });
  
  const [searchKind, setSearchKind] = useState<SearchKind>(
    preferredContentType === 'books' ? 'books' : (preferredContentType === 'manga' ? 'manga' : 'all')
  );
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<TorboxSearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchSummary, setSearchSummary] = useState<string | null>(null);
  const [searchDiagnostics, setSearchDiagnostics] = useState<SourceSearchDiagnostic[]>([]);
  const [formatFilterWarning, setFormatFilterWarning] = useState<string | null>(null);
  const [sendStates, setSendStates] = useState<Record<string, { state: SendState; error?: string }>>({});
  const searchQuery = useOnlineSearchStore((state) => state.queries.torbox);
  const setSearchQuery = useOnlineSearchStore((state) => state.setQuery);
  const recordSourceSuccess = useSourceHealthStore((state) => state.recordSuccess);
  const recordSourceFailure = useSourceHealthStore((state) => state.recordFailure);
  const getSourceScore = useSourceHealthStore((state) => state.getSourceScore);
  const getSourceHealthLevel = useSourceHealthStore((state) => state.getSourceHealthLevel);

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

  const torboxMangaSource = useMemo(() => {
    const enabledMangaSources = sources.filter((source) => source.kind === 'manga' && source.enabled && source.implemented);
    const preferred = enabledMangaSources.find((source) =>
      TORBOX_MANGA_SOURCE_IDS.some((candidateId) => source.id === candidateId)
    );
    return preferred ?? enabledMangaSources[0];
  }, [sources]);

  const torboxCompatibleBookSourceIds = useMemo(() => {
    return sources
      .filter((source) => source.kind === 'books' && source.enabled && source.implemented && source.torboxCompatible)
      .map((source) => source.id);
  }, [sources]);

  const torboxCompatibleMangaSourceIds = useMemo(() => {
    return sources
      .filter((source) => source.kind === 'manga' && source.enabled && source.implemented && source.torboxCompatible)
      .map((source) => source.id);
  }, [sources]);

  const sourceNameById = useMemo(() => {
    const entries = sources.map((source) => [source.id, source.name] as const);
    return new Map<string, string>(entries);
  }, [sources]);

  const orderSourceIdsByHealth = useCallback(
    (sourceIds: string[]) =>
      [...sourceIds].sort((a, b) => getSourceScore(b) - getSourceScore(a)),
    [getSourceScore]
  );

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
      setSearchSummary(null);
      setSearchDiagnostics([]);
      setFormatFilterWarning(null);
      return;
    }

    setSearching(true);
    setSearchError(null);
    setSearchSummary(null);
    setSearchDiagnostics([]);
    setFormatFilterWarning(null);

    const executeSourceSearch = async (
      sourceId: string,
      domain: SearchDomain,
      label: string
    ): Promise<{
      sourceId: string;
      sourceName: string;
      domain: SearchDomain;
      status: 'success' | 'failed' | 'timeout';
      response?: { items: PluginSearchResult[]; diagnostics?: SearchDiagnostics };
      errorMessage?: string;
      durationMs: number;
    }> => {
      const startedAt = performance.now();
      const sourceName = sourceNameById.get(sourceId) ?? sourceId;

      try {
        const response = await withTimeout(
          pluginApi.searchWithMeta(sourceId, q, 1, TORBOX_SEARCH_LIMIT),
          SEARCH_TIMEOUT_MS,
          label
        );
        const elapsedMs = Math.round(performance.now() - startedAt);
        const latencyMs = response.diagnostics?.durationMs ?? elapsedMs;
        recordSourceSuccess(sourceId, latencyMs);

        return {
          sourceId,
          sourceName,
          domain,
          status: 'success',
          response,
          durationMs: elapsedMs,
        };
      } catch (error) {
        const elapsedMs = Math.round(performance.now() - startedAt);
        const message = getUiErrorMessage(error, `${label} failed`);
        const timeout = isTimeoutMessage(message);
        recordSourceFailure(sourceId, timeout ? 'timeout' : 'error', elapsedMs);

        return {
          sourceId,
          sourceName,
          domain,
          status: timeout ? 'timeout' : 'failed',
          errorMessage: message,
          durationMs: elapsedMs,
        };
      }
    };

    try {
      const needsBooks = searchKind === 'all' || searchKind === 'books' || searchKind === 'comics';
      const needsManga = searchKind === 'all' || searchKind === 'manga';

      const orderedBookSourceIds = orderSourceIdsByHealth(torboxCompatibleBookSourceIds);
      const orderedMangaSourceIds = orderSourceIdsByHealth(torboxCompatibleMangaSourceIds);

      if (needsBooks && orderedBookSourceIds.length === 0) {
        throw new Error('No enabled Torbox-compatible book source found. Enable one in Settings → Online Sources.');
      }
      if (needsManga && orderedMangaSourceIds.length === 0) {
        throw new Error('No enabled Torbox-compatible manga source found. Enable one in Settings → Online Sources.');
      }

      if (searchKind === 'all') {
        const outcomes = await Promise.all([
          ...orderedBookSourceIds.map((sourceId) => executeSourceSearch(sourceId, 'books', `Book search (${sourceId})`)),
          ...orderedMangaSourceIds.map((sourceId) => executeSourceSearch(sourceId, 'manga', `Manga search (${sourceId})`)),
        ]);

        const diagnostics = outcomes.map((outcome) => {
          const sourceDiagnostics = outcome.response?.diagnostics;
          return {
            sourceId: outcome.sourceId,
            sourceName: outcome.sourceName,
            domain: outcome.domain,
            status: outcome.status,
            errorTag: outcome.status === 'success' ? undefined : outcome.status === 'timeout' ? 'timeout' : 'error',
            errorMessage: outcome.errorMessage,
            selectedMirror: sourceDiagnostics?.selectedMirror,
            attemptedMirrors: parseAttemptedMirrors(sourceDiagnostics),
            durationMs: sourceDiagnostics?.durationMs ?? outcome.durationMs,
            resultCount: sourceDiagnostics?.resultCount ?? outcome.response?.items.length ?? 0,
            retriesUsed: sourceDiagnostics?.retriesUsed,
            healthScore: getSourceScore(outcome.sourceId),
            healthLevel: getSourceHealthLevel(outcome.sourceId),
          } satisfies SourceSearchDiagnostic;
        });
        setSearchDiagnostics(diagnostics);

        const rawBookResults = outcomes.flatMap((outcome) =>
          outcome.domain === 'books' && outcome.status === 'success' && outcome.response
            ? outcome.response.items.map((item) => mapResultWithSource(item, 'books', outcome.sourceId))
            : []
        );
        const mangaResults = outcomes.flatMap((outcome) =>
          outcome.domain === 'manga' && outcome.status === 'success' && outcome.response
            ? outcome.response.items.map((item) => mapResultWithSource(item, 'manga', outcome.sourceId))
            : []
        );

        const seenBookKeys = new Set<string>();
        const dedupedBookResults = rawBookResults.filter((item) => {
          const key = buildResultDedupKey(item);
          if (seenBookKeys.has(key)) return false;
          seenBookKeys.add(key);
          return true;
        });

        const seenMangaKeys = new Set<string>();
        const dedupedMangaResults = mangaResults.filter((item) => {
          const key = buildResultDedupKey(item);
          if (seenMangaKeys.has(key)) return false;
          seenMangaKeys.add(key);
          return true;
        });

        const filteredBooks = filterBookResultsByKind(dedupedBookResults, 'all');
        setFormatFilterWarning(formatFilterWarningText(filteredBooks.unknownFiltered, filteredBooks.unsupportedFiltered));

        const merged: TorboxSearchResult[] = [
          ...filteredBooks.items,
          ...dedupedMangaResults,
        ];
        setSearchResults(merged);
        setSearchSummary(formatSearchDiagnosticsSummary(diagnostics, merged.length));

        const bookAllFailed = diagnostics.filter((item) => item.domain === 'books').every((item) => item.status !== 'success');
        const mangaAllFailed = diagnostics.filter((item) => item.domain === 'manga').every((item) => item.status !== 'success');

        if (bookAllFailed && mangaAllFailed) {
          throw new Error('Failed to search both book and manga sources.');
        }
      } else {
        if (searchKind === 'books' || searchKind === 'comics') {
          const outcomes = await Promise.all(
            orderedBookSourceIds.map((sourceId) =>
              executeSourceSearch(sourceId, 'books', `${searchKind === 'comics' ? 'Comics' : 'Book'} search (${sourceId})`)
            )
          );

          const diagnostics = outcomes.map((outcome) => {
            const sourceDiagnostics = outcome.response?.diagnostics;
            return {
              sourceId: outcome.sourceId,
              sourceName: outcome.sourceName,
              domain: outcome.domain,
              status: outcome.status,
              errorTag: outcome.status === 'success' ? undefined : outcome.status === 'timeout' ? 'timeout' : 'error',
              errorMessage: outcome.errorMessage,
              selectedMirror: sourceDiagnostics?.selectedMirror,
              attemptedMirrors: parseAttemptedMirrors(sourceDiagnostics),
              durationMs: sourceDiagnostics?.durationMs ?? outcome.durationMs,
              resultCount: sourceDiagnostics?.resultCount ?? outcome.response?.items.length ?? 0,
              retriesUsed: sourceDiagnostics?.retriesUsed,
              healthScore: getSourceScore(outcome.sourceId),
              healthLevel: getSourceHealthLevel(outcome.sourceId),
            } satisfies SourceSearchDiagnostic;
          });
          setSearchDiagnostics(diagnostics);

          const mergedBookResults = outcomes.flatMap((outcome) =>
            outcome.status === 'success' && outcome.response
              ? outcome.response.items.map((item) => mapResultWithSource(item, 'books', outcome.sourceId))
              : []
          );

          if (mergedBookResults.length === 0) {
            throw new Error('Book search failed on all Torbox-compatible sources.');
          }

          const seenBookKeys = new Set<string>();
          const dedupedBookResults = mergedBookResults.filter((item) => {
            const key = buildResultDedupKey(item);
            if (seenBookKeys.has(key)) return false;
            seenBookKeys.add(key);
            return true;
          });

          const filteredBooks = filterBookResultsByKind(dedupedBookResults, searchKind);
          setFormatFilterWarning(formatFilterWarningText(filteredBooks.unknownFiltered, filteredBooks.unsupportedFiltered));
          setSearchResults(filteredBooks.items);
          setSearchSummary(formatSearchDiagnosticsSummary(diagnostics, filteredBooks.items.length));
        } else if (searchKind === 'manga') {
          const outcomes = await Promise.all(
            orderedMangaSourceIds.map((sourceId) => executeSourceSearch(sourceId, 'manga', `Manga search (${sourceId})`))
          );

          const diagnostics = outcomes.map((outcome) => {
            const sourceDiagnostics = outcome.response?.diagnostics;
            return {
              sourceId: outcome.sourceId,
              sourceName: outcome.sourceName,
              domain: outcome.domain,
              status: outcome.status,
              errorTag: outcome.status === 'success' ? undefined : outcome.status === 'timeout' ? 'timeout' : 'error',
              errorMessage: outcome.errorMessage,
              selectedMirror: sourceDiagnostics?.selectedMirror,
              attemptedMirrors: parseAttemptedMirrors(sourceDiagnostics),
              durationMs: sourceDiagnostics?.durationMs ?? outcome.durationMs,
              resultCount: sourceDiagnostics?.resultCount ?? outcome.response?.items.length ?? 0,
              retriesUsed: sourceDiagnostics?.retriesUsed,
              healthScore: getSourceScore(outcome.sourceId),
              healthLevel: getSourceHealthLevel(outcome.sourceId),
            } satisfies SourceSearchDiagnostic;
          });
          setSearchDiagnostics(diagnostics);

          const mangaResults = outcomes.flatMap((outcome) =>
            outcome.status === 'success' && outcome.response ? outcome.response.items : []
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

          const mapped = dedupedMangaResults.map((item) =>
            mapResultWithSource(
              item,
              'manga',
              typeof item.source_id === 'string' && item.source_id.trim()
                ? item.source_id
                : orderedMangaSourceIds[0] ?? 'mangadex'
            )
          );
          setSearchResults(mapped);
          setSearchSummary(formatSearchDiagnosticsSummary(diagnostics, mapped.length));
          setFormatFilterWarning(null);
        }
      }
    } catch (error) {
      setSearchResults([]);
      setSearchError(error instanceof Error ? error.message : 'Search failed');
      setSearchSummary(null);
      setSearchDiagnostics([]);
      setFormatFilterWarning(null);
    } finally {
      setSearching(false);
    }
  }, [
    torboxCompatibleBookSourceIds,
    torboxCompatibleMangaSourceIds,
    sourceNameById,
    getSourceHealthLevel,
    getSourceScore,
    orderSourceIdsByHealth,
    recordSourceFailure,
    recordSourceSuccess,
    searchKind,
    searchQuery,
  ]);

  useEffect(() => {
    if (activeTab !== 'search') return;

    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      setSearchError(null);
      setSearchSummary(null);
      setSearchDiagnostics([]);
      setFormatFilterWarning(null);
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
      const sourceId =
        (item as TorboxSearchResult)._sourceId ??
        (typeof item.source_id === 'string' && item.source_id.trim() ? item.source_id : 'anna-archive');
      setSendState(item.id, 'sending');
      setSearchError(null);
      setSearchSummary(null);

      try {
        if (sourceId === 'anna-archive') {
          const options = await pluginApi.annaArchiveGetTorrentLinks(item.id);
          if (!options.length) {
            throw new Error('No usable links found for this Anna result.');
          }

          const isManagedDatasetTorrent = (url: string) => {
            const lower = url.toLowerCase();
            return lower.includes('/managed_by_aa/') || lower.includes('/zlib/');
          };

          const looksLikeSingleFile = (url: string) => {
            const lower = url.toLowerCase();
            return (
              lower.includes('file.php?id=') ||
              ['.epub', '.pdf', '.mobi', '.azw3', '.docx', '.cbz', '.cbr'].some((ext) =>
                lower.includes(ext)
              )
            );
          };

          const sorted = [...options].sort((a, b) => {
            const rank = (it: { downloadType: string; url: string }) => {
              const t = it.downloadType?.toLowerCase() ?? '';
              if (t === 'magnet') return 0;
              if ((t === 'direct' || t === 'external') && looksLikeSingleFile(it.url)) return 1;
              if (t === 'torrent' && !isManagedDatasetTorrent(it.url)) return 2;
              if (t === 'direct' || t === 'external') return 3;
              if (t === 'torrent') return 4;
              return 9;
            };
            return rank(a) - rank(b);
          });

          const chosen = sorted[0];
          if (!chosen) {
            throw new Error('No queueable Anna link found.');
          }

          await enqueueFromAnna({
            title: item.title,
            sourceLink: chosen.url,
          });
          setSendState(item.id, 'success');
          return;
        }

        const candidatePriority = new Map<string, { kind: string; priority: number }>();
        let firstRejectedQueueCandidateMessage: string | null = null;

        const addCandidate = (rawCandidate: string, hintedType?: string) => {
          const parsed = parseBookCandidate(sourceId, rawCandidate);
          if (!parsed) return;

          const kind = normalizeKindFromUrl(hintedType ?? parsed.kind, parsed.url);
          const url = parsed.url;
          // Accept BOTH torrent-style links AND plain HTTP URLs (for TorBox web download)
          if (!isTorboxSendableLink(url)) return;

          if (kind === 'magnet' || kind === 'torrent' || kind === 'direct') {
            const queueable = isQueueableBookCandidate(item, url);
            if (!queueable.allowed) {
              firstRejectedQueueCandidateMessage ??=
                queueable.format
                  ? `Unsupported format '${queueable.format}'. Torbox queue supports: cbz, cbr, epub, pdf, mobi, azw3, docx.`
                  : 'Unable to determine file format. Torbox queue supports: cbz, cbr, epub, pdf, mobi, azw3, docx.';
              return;
            }
          }

          const priority = getBookCandidatePriority(kind, url);
          const existing = candidatePriority.get(url);
          if (existing === undefined || priority < existing.priority) {
            candidatePriority.set(url, { kind, priority });
          }
        };

        const chapters = await pluginApi.getChapters(sourceId, item.id);
        if (chapters.length > 0) {
          const pages = await pluginApi.getPages(sourceId, chapters[0].id);
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
          if (firstRejectedQueueCandidateMessage) {
            throw new Error(firstRejectedQueueCandidateMessage);
          }
          throw new Error('No download link found. Verify Anna\'s Archive keys in Settings → Online Sources.');
        }

        if (
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
        } else if (firstCandidate.kind === 'anna' || firstCandidate.kind === 'external') {
          throw new Error('No queueable magnet/torrent link found for this result. Use View Details for manual fallback.');
        } else {
          throw new Error(`Unsupported source kind '${firstCandidate.kind}' for Torbox send.`);
        }
      } catch (error) {
        const msg = getUiErrorMessage(error, 'Failed to send book to Torbox');
        setSendState(item.id, 'failed', msg);
        setSearchError(msg);
      }
    },
    [enqueueFromAnna, setSendState]
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
      setSearchSummary(null);
      try {
        if (
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
        } else if (normalizedKind === 'anna' || normalizedKind === 'external') {
          throw new Error('No queueable magnet/torrent link found for this result. Use View Details for manual fallback.');
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
              label="Discover"
              icon={Search}
              active={activeTab === 'search'}
              onClick={() => switchTab('search')}
            />
            {(preferredContentType === 'books' || preferredContentType === 'both') && (
              <TabButton
                label="Books Queue"
                icon={BookOpen}
                count={bookJobs.length}
                active={activeTab === 'books'}
                onClick={() => switchTab('books')}
              />
            )}
            {(preferredContentType === 'manga' || preferredContentType === 'both') && (
              <TabButton
                label="Manga Queue"
                icon={Activity}
                count={mangaJobs.length}
                active={activeTab === 'manga'}
                onClick={() => switchTab('manga')}
              />
            )}
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

      <div className={cn("torbox-layer flex-1 overflow-y-auto", isMobile ? "pb-24 p-6" : "p-6")}>
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
                {preferredContentType === 'both' && (
                  <TabButton
                    icon={Sparkles}
                    label="All"
                    active={searchKind === 'all'}
                    onClick={() => setSearchKind('all')}
                  />
                )}
                {(preferredContentType === 'books' || preferredContentType === 'both') && (
                  <TabButton
                    icon={BookOpen}
                    label="Books"
                    active={searchKind === 'books'}
                    onClick={() => setSearchKind('books')}
                  />
                )}
                {(preferredContentType === 'manga' || preferredContentType === 'both') && (
                  <TabButton
                    icon={Activity}
                    label="Manga"
                    active={searchKind === 'manga'}
                    onClick={() => setSearchKind('manga')}
                  />
                )}
                {(preferredContentType === 'manga' || preferredContentType === 'both') && (
                  <TabButton
                    icon={BookOpen}
                    label="Comics"
                    active={searchKind === 'comics'}
                    onClick={() => setSearchKind('comics')}
                  />
                )}
              </div>

              {searchError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  {searchError}
                </div>
              )}

              {searchSummary && !searchError && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
                  {searchSummary}
                </div>
              )}

              {formatFilterWarning && !searchError && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">
                  {formatFilterWarning}
                </div>
              )}

              {!searching && searchResults.length === 0 && searchQuery.trim() && !searchError && (
                <div className="torbox-empty">
                  <Search className="torbox-empty__icon" />
                  <p className="text-sm text-muted-foreground">No results found for this query.</p>
                </div>
              )}

              {!searchError && searchDiagnostics.length > 0 && (
                <div className="torbox-diag-panel">
                  <p className="torbox-diag-title">Source diagnostics</p>
                  <div className="torbox-diag-list">
                    {searchDiagnostics.map((item) => (
                      <div key={`${item.domain}-${item.sourceId}`} className="torbox-diag-row">
                        <div className="torbox-diag-header">
                          <span className="torbox-diag-source">{item.sourceName}</span>
                          <span className="torbox-diag-chip">
                            {item.domain}
                          </span>
                          <span
                            className={`torbox-diag-status ${
                              item.status === 'success'
                                ? 'torbox-diag-status--success'
                                : item.status === 'timeout'
                                  ? 'torbox-diag-status--timeout'
                                  : 'torbox-diag-status--error'
                            }`}
                          >
                            {item.status === 'success' ? 'ok' : item.status}
                          </span>
                          <span className="torbox-diag-meta">{item.resultCount ?? 0} result(s)</span>
                          <span className="torbox-diag-meta">{formatDuration(item.durationMs)}</span>
                          <span className="torbox-diag-meta">
                            health {item.healthScore} ({item.healthLevel})
                          </span>
                        </div>

                        {(item.selectedMirror || item.attemptedMirrors.length > 0 || typeof item.retriesUsed === 'number' || item.errorMessage) && (
                          <div className="torbox-diag-details">
                            {item.selectedMirror && <p>Mirror: {item.selectedMirror}</p>}
                            {item.attemptedMirrors.length > 0 && (
                              <p>Attempts: {item.attemptedMirrors.join(' → ')}</p>
                            )}
                            {typeof item.retriesUsed === 'number' && <p>Retries used: {item.retriesUsed}</p>}
                            {item.errorMessage && item.status !== 'success' && (
                              <p className="torbox-diag-error-text">{item.errorMessage}</p>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid gap-3">
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
