import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  Cloud,
  Clock3,
  HardDriveDownload,
  Loader2,
  Search,
  Sparkles,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useUIStore } from '@/store/uiStore';
import { pluginApi, type SearchResponse, type SearchResult as PluginSearchResult } from '@/lib/pluginSources';
import { useTorboxStore, type TorboxJobStatus, type TorboxQueueItem } from '@/stores/useTorboxStore';
import { useOnlineSearchStore } from '@/store/onlineSearchStore';
import { useSourceStore } from '@/store/sourceStore';
import { parsePageUrl } from '@/lib/utils';

type BookMirrorCandidate = {
  id: string;
  url: string;
  kind: 'magnet' | 'torrent';
  priority: number;
  tracker?: string;
  seeders?: number;
  fileSize?: string;
  format?: string;
  language?: string;
  sourceLabel: string;
  sourceId: string;
  isRuTracker: boolean;
};

type MirrorSourceStatus = 'ok' | 'no-results' | 'blocked-auth' | 'parse-failed' | 'timeout' | 'error';

type MirrorSourceDiagnostic = {
  sourceId: string;
  label: string;
  status: MirrorSourceStatus;
  detail?: string;
  mirrorCount: number;
};

type BookMirrorBuildResult = {
  mirrors: BookMirrorCandidate[];
  diagnostics: MirrorSourceDiagnostic[];
};

type TorboxTab = 'books' | 'manga' | 'search';
type SearchKind = 'all' | 'books' | 'manga' | 'comics';
type TorboxResultSource = 'books' | 'manga';
type TorboxSearchResult = PluginSearchResult & { _source: TorboxResultSource; _sourceId?: string };
const TORBOX_MANGA_SOURCE_IDS = ['nyaa', 'animetosho'] as const;
const TORBOX_BOOK_SOURCE_PRIORITY = ['rutracker', 'bitsearch', 'x1337', 'tpb-api', 'anna-archive'] as const;

type SendState = 'idle' | 'sending' | 'success' | 'failed';
type MirrorFilter = 'all' | 'rutracker' | 'anna-archive' | 'bitsearch' | 'x1337' | 'tpb-api';
type MirrorSort = 'best' | 'seeders' | 'size';

const SOURCE_BADGE_MAP: Record<string, { label: string; className: string }> = {
  'anna-archive': { label: "Anna's Archive", className: 'torbox-source-badge--anna' },
  'nyaa': { label: 'Nyaa', className: 'torbox-source-badge--nyaa' },
  'animetosho': { label: 'AnimeTosho', className: 'torbox-source-badge--animetosho' },
  'rutracker': { label: 'RuTracker', className: 'torbox-source-badge--rutracker' },
  'bitsearch': { label: 'Bitsearch', className: 'torbox-source-badge--generic' },
  'x1337': { label: '1337x', className: 'torbox-source-badge--generic' },
  'tpb-api': { label: 'TPB API', className: 'torbox-source-badge--generic' },
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
const BOOK_SEARCH_TIMEOUT_MS = 60000;
const BOOK_ENRICH_TIMEOUT_MS = 35000;

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

function isTimeoutLikeError(error: unknown): boolean {
  const text = getUiErrorMessage(error, '').toLowerCase();
  return text.includes('timed out') || text.includes('timeout');
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

function getDisplayTitle(item: PluginSearchResult | null | undefined): string {
  if (!item) return 'Unknown title';

  const extra = item.extra ?? {};
  const candidates: unknown[] = [
    item.title,
    extra.title,
    extra.name,
    extra.filename,
    extra.file_name,
    item.description,
    item.summary,
  ];

  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  const fallbackUrl = getResultUrl(item);
  if (fallbackUrl) return fallbackUrl;
  return 'Unknown title';
}

function parseSizeToBytes(value?: string): number {
  if (!value) return -1;
  const trimmed = value.trim();
  if (!trimmed) return -1;

  if (/^\d+$/.test(trimmed)) {
    const raw = Number(trimmed);
    return Number.isFinite(raw) ? raw : -1;
  }

  const match = trimmed.match(/(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)/i);
  if (!match) return -1;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return -1;

  const unit = match[2].toUpperCase();
  const multipliers: Record<string, number> = {
    B: 1,
    KB: 1024,
    MB: 1024 ** 2,
    GB: 1024 ** 3,
    TB: 1024 ** 4,
  };

  return Math.round(amount * (multipliers[unit] ?? 1));
}

const SUPPORTED_BOOK_FORMATS = ['cbz', 'cbr', 'epub', 'pdf', 'mobi', 'azw3', 'docx'] as const;

function detectSupportedBookFormat(value?: string): string | undefined {
  if (!value) return undefined;
  const lower = value.toLowerCase();

  for (const format of SUPPORTED_BOOK_FORMATS) {
    const pattern = new RegExp(`(?:\\.|\\b|_|-|\\[|\\()${format}(?:\\b|\\]|\\))`, 'i');
    if (pattern.test(lower)) {
      return format.toUpperCase();
    }
  }

  return undefined;
}

function extractMagnetDisplayName(link: string): string | undefined {
  if (!link.toLowerCase().startsWith('magnet:?')) return undefined;
  const query = link.slice('magnet:?'.length);
  const params = new URLSearchParams(query);
  const dn = params.get('dn');
  if (!dn) return undefined;

  try {
    return decodeURIComponent(dn);
  } catch {
    return dn;
  }
}

function inferMirrorBookFormat(input: {
  url: string;
  rawCandidate?: string;
  title?: string;
  format?: string;
  fileName?: string;
  label?: string;
}): string | undefined {
  const values = [
    input.format,
    input.fileName,
    input.title,
    input.label,
    extractMagnetDisplayName(input.url),
    input.url,
    input.rawCandidate,
  ];

  for (const value of values) {
    const detected = detectSupportedBookFormat(value);
    if (detected) return detected;
  }

  return undefined;
}

function getResultSourceId(item: PluginSearchResult): string {
  const candidate = (item.source_id ?? item.extra?.source_id) as string | undefined;
  if (typeof candidate === 'string' && candidate.trim()) {
    return candidate.trim();
  }
  return 'anna-archive';
}

function isTorboxCompatibleLink(link: string): boolean {
  const normalized = link.trim().toLowerCase();
  return (
    normalized.startsWith('magnet:') ||
    normalized.includes('.torrent') ||
    normalized.includes('/torrent')
  );
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

function getErrorText(error: unknown): string {
  return getUiErrorMessage(error, 'Unknown error');
}

function mapDiagnosticStatus(errorText: string): MirrorSourceStatus {
  const lower = errorText.toLowerCase();
  if (lower.includes('timed out') || lower.includes('timeout')) return 'timeout';
  if (lower.includes('auth') || lower.includes('cookie') || lower.includes('blocked')) return 'blocked-auth';
  if (lower.includes('parse')) return 'parse-failed';
  return 'error';
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

function parseOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function parseOptionalNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function isRuTrackerValue(value?: string): boolean {
  if (!value) return false;
  return value.toLowerCase().includes('rutracker');
}

function sourcePriorityIndex(sourceId: string): number {
  const index = TORBOX_BOOK_SOURCE_PRIORITY.indexOf(sourceId as (typeof TORBOX_BOOK_SOURCE_PRIORITY)[number]);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function sourceLabelById(sourceId: string): string {
  return SOURCE_BADGE_MAP[sourceId]?.label ?? sourceId;
}

function extractMagnetOrTorrentLinks(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  const matches = value.match(/magnet:\?[^\s"'<>]+|https?:\/\/[^\s"'<>]+(?:\.torrent[^\s"'<>]*)?/gi);
  if (!matches) return [];
  return matches.map((entry) => entry.trim());
}

function bestMirrorBucket(mirror: BookMirrorCandidate): number {
  if (mirror.isRuTracker && mirror.kind === 'magnet') return 0;
  if (mirror.isRuTracker && mirror.kind === 'torrent') return 1;
  if (mirror.kind === 'magnet') return 2;
  return 3;
}

function pickBestMirror(mirrors: BookMirrorCandidate[]): BookMirrorCandidate | null {
  if (mirrors.length === 0) return null;

  return [...mirrors].sort((a, b) => {
    const bucketDelta = bestMirrorBucket(a) - bestMirrorBucket(b);
    if (bucketDelta !== 0) return bucketDelta;

    const aSeeders = typeof a.seeders === 'number' ? a.seeders : -1;
    const bSeeders = typeof b.seeders === 'number' ? b.seeders : -1;
    if (aSeeders !== bSeeders) return bSeeders - aSeeders;

    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.url.localeCompare(b.url);
  })[0];
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

function BookMirrorsDialog({
  open,
  item,
  displayTitle,
  loading,
  mirrors,
  diagnostics,
  filter,
  sort,
  sendStates,
  onOpenChange,
  onFilterChange,
  onSortChange,
  onAdd,
}: {
  open: boolean;
  item: TorboxSearchResult | null;
  displayTitle: string;
  loading: boolean;
  mirrors: BookMirrorCandidate[];
  diagnostics: MirrorSourceDiagnostic[];
  filter: MirrorFilter;
  sort: MirrorSort;
  sendStates: Record<string, { state: SendState; error?: string }>;
  onOpenChange: (open: boolean) => void;
  onFilterChange: (filter: MirrorFilter) => void;
  onSortChange: (sort: MirrorSort) => void;
  onAdd: (mirror: BookMirrorCandidate) => void;
}) {
  const filteredMirrors = useMemo(() => {
    if (filter === 'all') return mirrors;
    if (filter === 'rutracker') {
      return mirrors.filter((mirror) => mirror.isRuTracker || mirror.sourceId === 'rutracker');
    }
    return mirrors.filter((mirror) => mirror.sourceId === filter);
  }, [filter, mirrors]);

  const sortedMirrors = useMemo(() => {
    const next = [...filteredMirrors];
    if (sort === 'seeders') {
      next.sort((a, b) => {
        const aSeeders = typeof a.seeders === 'number' ? a.seeders : -1;
        const bSeeders = typeof b.seeders === 'number' ? b.seeders : -1;
        if (aSeeders !== bSeeders) return bSeeders - aSeeders;
        return a.priority - b.priority;
      });
      return next;
    }

    if (sort === 'size') {
      next.sort((a, b) => {
        const aSize = parseSizeToBytes(a.fileSize);
        const bSize = parseSizeToBytes(b.fileSize);
        if (aSize !== bSize) return bSize - aSize;
        return a.priority - b.priority;
      });
      return next;
    }

    return next.sort((a, b) => a.priority - b.priority);
  }, [filteredMirrors, sort]);

  const countByFilter: Record<MirrorFilter, number> = useMemo(
    () => ({
      all: mirrors.length,
      rutracker: mirrors.filter((mirror) => mirror.isRuTracker || mirror.sourceId === 'rutracker').length,
      'anna-archive': mirrors.filter((mirror) => mirror.sourceId === 'anna-archive').length,
      bitsearch: mirrors.filter((mirror) => mirror.sourceId === 'bitsearch').length,
      x1337: mirrors.filter((mirror) => mirror.sourceId === 'x1337').length,
      'tpb-api': mirrors.filter((mirror) => mirror.sourceId === 'tpb-api').length,
    }),
    [mirrors]
  );

  const diagBySource = useMemo(() => {
    const map = new Map<string, MirrorSourceDiagnostic>();
    diagnostics.forEach((diag) => {
      map.set(diag.sourceId, diag);
    });
    return map;
  }, [diagnostics]);

  const bestMirror = useMemo(() => pickBestMirror(sortedMirrors), [sortedMirrors]);
  const bestRuTrackerMirror = sortedMirrors.find(
    (mirror) => mirror.isRuTracker || mirror.sourceId === 'rutracker'
  ) ?? null;
  const bestMirrorState = bestMirror ? sendStates[bestMirror.id]?.state ?? 'idle' : 'idle';
  const addBestDisabled = !bestMirror || bestMirrorState === 'sending' || bestMirrorState === 'success';

  const filterButtons: Array<{ key: MirrorFilter; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'rutracker', label: 'RuTracker' },
    { key: 'bitsearch', label: 'Bitsearch' },
    { key: 'x1337', label: '1337x' },
    { key: 'tpb-api', label: 'TPB API' },
    { key: 'anna-archive', label: 'Anna' },
  ];

  const sortButtons: Array<{ key: MirrorSort; label: string }> = [
    { key: 'best', label: 'Best' },
    { key: 'seeders', label: 'Seeders' },
    { key: 'size', label: 'Size' },
  ];

  if (!item) return null;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" />
        <Dialog.Content
          className="torbox-mirrors-dialog fixed inset-0 z-50 flex h-[100dvh] w-screen flex-col overflow-hidden border-0 bg-background/95 shadow-2xl"
          aria-labelledby="torbox-mirrors-title"
        >
          <div className="torbox-mirrors-header">
            <div className="torbox-mirrors-inner torbox-mirrors-header__inner">
              <div className="flex min-w-0 items-start gap-3">
                <ResultCover item={item} />
                <div className="min-w-0 space-y-1">
                  <Dialog.Title id="torbox-mirrors-title" className="line-clamp-2 text-xl font-semibold tracking-tight text-foreground md:text-2xl">
                    {displayTitle}
                  </Dialog.Title>
                  <p className="text-xs text-muted-foreground md:text-sm">
                    Found {mirrors.length} mirror{mirrors.length === 1 ? '' : 's'}
                  </p>
                </div>
              </div>
              <Dialog.Close asChild>
                <Button variant="ghost" size="icon" aria-label="Close mirror dialog">
                  <X className="h-4 w-4" />
                </Button>
              </Dialog.Close>
            </div>
          </div>

          <div className="torbox-mirrors-list">
            <div className="torbox-mirrors-inner torbox-mirrors-list__inner">
              {loading && (
                <div className="torbox-empty">
                  <Loader2 className="torbox-empty__icon animate-spin" />
                  <p className="text-sm text-muted-foreground">Loading mirrors...</p>
                </div>
              )}

              {!loading && mirrors.length > 0 && (
                <>
                  {diagnostics.some((diag) => diag.status !== 'ok' && diag.sourceId !== 'anna-archive') && (
                    <div className="mb-2 rounded-md border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                      Some external sources are blocked/unreachable. Anna mirrors are shown as fallback; check source diagnostics below.
                    </div>
                  )}
                  <div className="torbox-mirrors-help mb-2 rounded-md border border-border/60 bg-muted/25 px-3 py-2 text-xs text-muted-foreground">
                    Click <span className="font-medium text-foreground">Add to Cloud</span> to queue a mirror in Torbox.
                  </div>
                  <div className="torbox-mirrors-filters mb-2 flex flex-wrap gap-1.5">
                    {filterButtons.map((entry) => {
                      const shouldShow = entry.key === 'all' || countByFilter[entry.key] > 0;
                      if (!shouldShow) return null;
                      const diag = entry.key === 'all' ? null : diagBySource.get(entry.key);
                      const hasIssue = Boolean(diag && diag.status !== 'ok');
                      const isTimeout = diag?.status === 'timeout';
                      const isBlocked = diag?.status === 'blocked-auth';

                      return (
                      <button
                        key={entry.key}
                        type="button"
                        className={`torbox-filter-chip ${filter === entry.key ? 'torbox-filter-chip--active' : ''} ${hasIssue ? 'torbox-filter-chip--warning' : ''} ${isTimeout ? 'torbox-filter-chip--timeout' : ''} ${isBlocked ? 'torbox-filter-chip--blocked' : ''}`}
                        onClick={() => onFilterChange(entry.key)}
                        title={diag?.detail || diag?.status || ''}
                      >
                        {entry.label}
                        <span className="torbox-filter-chip__count">{countByFilter[entry.key]}</span>
                      </button>
                      );
                    })}
                  </div>
                  <div className="torbox-mirrors-sort mb-2 flex flex-wrap gap-1.5">
                    {sortButtons.map((entry) => (
                      <button
                        key={entry.key}
                        type="button"
                        className={`torbox-filter-chip ${sort === entry.key ? 'torbox-filter-chip--active' : ''}`}
                        onClick={() => onSortChange(entry.key)}
                      >
                        {entry.label}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {!loading && sortedMirrors.map((mirror) => {
                const mirrorState = sendStates[mirror.id]?.state ?? 'idle';
                const mirrorError = sendStates[mirror.id]?.error;
                const disabled = mirrorState === 'sending' || mirrorState === 'success';
                const isFeatured = bestRuTrackerMirror?.id === mirror.id;

                return (
                  <div
                    key={mirror.id}
                    className={`torbox-mirror-row group ${isFeatured ? 'torbox-mirror-row--featured' : ''}`}
                  >
                    <div className="min-w-0 flex-1 space-y-1 pr-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {isFeatured && <span className="torbox-meta-pill torbox-meta-pill--best">Best Match</span>}
                        <span className={`torbox-meta-pill ${mirror.kind === 'magnet' ? 'torbox-meta-pill--format' : ''}`}>
                          {mirror.kind.toUpperCase()}
                        </span>
                        {mirror.isRuTracker && <span className="torbox-source-badge torbox-source-badge--rutracker">RuTracker</span>}
                        <span className="torbox-source-badge torbox-source-badge--generic">{mirror.sourceLabel}</span>
                        {typeof mirror.seeders === 'number' && mirror.seeders > 0 && (
                          <span className="torbox-meta-pill">{mirror.seeders} seeders</span>
                        )}
                        {mirror.fileSize && <span className="torbox-meta-pill">{mirror.fileSize}</span>}
                        {mirror.format && <span className="torbox-meta-pill">{mirror.format}</span>}
                        {mirror.language && <span className="torbox-meta-pill">{mirror.language}</span>}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {mirror.tracker ? `${mirror.tracker} - ` : ''}
                        {mirror.url}
                      </p>
                      {mirrorError && <p className="text-xs text-destructive">{mirrorError}</p>}
                    </div>

                    <div className="torbox-mirror-actions flex shrink-0 items-center gap-1.5">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => window.open(mirror.url, '_blank', 'noopener,noreferrer')}
                        title="Open mirror in browser"
                        aria-label="Open mirror in browser"
                      >
                        <ArrowUpRight className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="torbox-add-cloud-btn h-8 gap-1.5"
                        disabled={disabled}
                        onClick={() => onAdd(mirror)}
                        aria-label={mirrorState === 'success' ? 'Mirror added to cloud' : 'Add mirror to cloud'}
                      >
                        {mirrorState === 'sending' ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Adding...
                          </>
                        ) : mirrorState === 'success' ? (
                          <>
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Added
                          </>
                        ) : mirrorState === 'failed' ? (
                          <>
                            <AlertCircle className="h-3.5 w-3.5" />
                            Retry
                          </>
                        ) : (
                          <>
                            <HardDriveDownload className="h-3.5 w-3.5" />
                            <span>Add to Cloud</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}

              {!loading && sortedMirrors.length === 0 && (
                <div className="torbox-empty">
                  <AlertCircle className="torbox-empty__icon" />
                  <p className="text-sm text-muted-foreground">No magnet/torrent mirrors found for this result.</p>
                </div>
              )}

              {!loading && diagnostics.length > 0 && (
                <div className="rounded-md border border-border/60 bg-muted/20 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Source diagnostics</p>
                  <div className="space-y-1.5">
                    {diagnostics.map((diag) => (
                      <div key={diag.sourceId} className="flex items-start justify-between gap-2 text-xs">
                        <span className="font-medium text-foreground">{diag.label}</span>
                        <span className="text-muted-foreground">
                          {diag.status}
                          {diag.mirrorCount > 0 ? ` (${diag.mirrorCount})` : ''}
                          {diag.detail ? ` - ${diag.detail.slice(0, 180)}` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {!loading && (
            <div className="torbox-mirrors-footer">
              <div className="torbox-mirrors-inner torbox-mirrors-footer__inner">
                <p className="text-xs text-muted-foreground md:text-sm">
                  Showing {sortedMirrors.length} mirror{sortedMirrors.length === 1 ? '' : 's'}
                </p>
                <div className="flex items-center gap-2">
                  <Dialog.Close asChild>
                    <Button type="button" variant="ghost" size="sm">Close</Button>
                  </Dialog.Close>
                  <Button
                    type="button"
                    size="sm"
                    className="torbox-add-cloud-btn gap-1.5"
                    disabled={addBestDisabled}
                    onClick={() => {
                      if (!bestMirror) return;
                      onAdd(bestMirror);
                    }}
                    aria-label="Add best mirror to cloud"
                  >
                    {bestMirrorState === 'sending' ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Adding Best...
                      </>
                    ) : bestMirrorState === 'success' ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Best Added
                      </>
                    ) : (
                      <>
                        <HardDriveDownload className="h-3.5 w-3.5" />
                        Add Best {bestMirror?.isRuTracker ? 'RuTracker' : 'Mirror'}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ResultCover({ item }: { item: TorboxSearchResult }) {
  type MangaMetadata = { cover_url_large?: string };

  const [hasImageError, setHasImageError] = useState(false);
  const [asyncCover, setAsyncCover] = useState<string | null>(null);
  const baseCover = getResultCover(item);
  const cover = baseCover || asyncCover;
  const displayTitle = getDisplayTitle(item);
  
  const SourceIcon = item._source === 'books' ? BookOpen : Activity;

  useEffect(() => {
    let active = true;
    if (!baseCover && item._source === 'manga' && displayTitle) {
      // 500ms debounce to prevent rate-limiting on quick scrolls
      const timer = setTimeout(() => {
        invoke<MangaMetadata[]>('search_manga_metadata', { title: displayTitle })
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
  }, [baseCover, displayTitle, item._source]);

  return (
    <div className="torbox-cover-shell">
      {cover && !hasImageError ? (
        <img
          src={cover}
          alt={displayTitle}
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
        {job.candidateAttempt && job.candidateTotal && job.candidateTotal > 1 && (
          <p>
            Candidate {job.candidateAttempt} / {job.candidateTotal}
            {job.candidateKind ? ` (${job.candidateKind})` : ''}
          </p>
        )}
        {job.candidateTriedKinds && job.candidateTriedKinds.length > 0 && (
          <p>
            Attempted candidate kinds: {job.candidateTriedKinds.join(' -> ')}
          </p>
        )}
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
  const [mirrorDialogOpen, setMirrorDialogOpen] = useState(false);
  const [mirrorDialogItem, setMirrorDialogItem] = useState<TorboxSearchResult | null>(null);
  const [mirrorDialogTitle, setMirrorDialogTitle] = useState('');
  const [bookMirrorCandidates, setBookMirrorCandidates] = useState<BookMirrorCandidate[]>([]);
  const [mirrorDiagnostics, setMirrorDiagnostics] = useState<MirrorSourceDiagnostic[]>([]);
  const [mirrorLoading, setMirrorLoading] = useState(false);
  const [mirrorFilter, setMirrorFilter] = useState<MirrorFilter>('all');
  const [mirrorSort, setMirrorSort] = useState<MirrorSort>('best');
  const [mirrorSendStates, setMirrorSendStates] = useState<Record<string, { state: SendState; error?: string }>>({});
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

  const setMirrorSendState = useCallback((mirrorId: string, state: SendState, error?: string) => {
    setMirrorSendStates((prev) => ({ ...prev, [mirrorId]: { state, error } }));
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

  const torboxBookSourceIds = useMemo(() => {
    const enabledIds = sources
      .filter((source) => source.kind === 'books' && source.id !== 'jackett' && source.enabled && source.implemented && source.torboxCompatible)
      .map((source) => source.id);

    if (enabledIds.length > 0) {
      const priorityIndex = (id: string) => {
        const index = TORBOX_BOOK_SOURCE_PRIORITY.indexOf(id as (typeof TORBOX_BOOK_SOURCE_PRIORITY)[number]);
        return index === -1 ? Number.MAX_SAFE_INTEGER : index;
      };

      return [...enabledIds].sort((a, b) => priorityIndex(a) - priorityIndex(b));
    }

    return TORBOX_BOOK_SOURCE_PRIORITY.filter((id) =>
      sources.some((source) => source.id === id && source.kind === 'books')
    );
  }, [sources]);

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

  const searchBookListings = useCallback(async (query: string) => {
    const bookSourceIds = torboxBookSourceIds.length > 0 ? torboxBookSourceIds : ['anna-archive'];
    const prioritizedBookSourceIds = [
      ...bookSourceIds.filter((id) => id === 'anna-archive'),
      ...bookSourceIds.filter((id) => id !== 'anna-archive'),
    ];

    const primarySourceId = prioritizedBookSourceIds[0] ?? 'anna-archive';
    const remainingSourceIds = prioritizedBookSourceIds.slice(1);

    const primaryResult = await withTimeout(
      pluginApi.searchWithMeta(primarySourceId, query, 1, TORBOX_SEARCH_LIMIT),
      primarySourceId === 'anna-archive' ? BOOK_SEARCH_TIMEOUT_MS : BOOK_ENRICH_TIMEOUT_MS,
      `Book source (${primarySourceId})`
    )
      .then((value) => ({ status: 'fulfilled', value } as PromiseFulfilledResult<SearchResponse>))
      .catch((reason) => ({ status: 'rejected', reason } as PromiseRejectedResult));

    let settledResults: PromiseSettledResult<SearchResponse>[] = [primaryResult];
    let items = primaryResult.status === 'fulfilled' ? primaryResult.value.items : [];

    if (items.length === 0 && remainingSourceIds.length > 0) {
      const fallbackResults = await Promise.allSettled(
        remainingSourceIds.map((sourceId) =>
          withTimeout(
            pluginApi.searchWithMeta(sourceId, query, 1, TORBOX_SEARCH_LIMIT),
            BOOK_ENRICH_TIMEOUT_MS,
            `Book source (${sourceId})`
          )
        )
      );

      settledResults = [...settledResults, ...fallbackResults];
      items = fallbackResults.flatMap((result) => (result.status === 'fulfilled' ? result.value.items : []));
    }

    const sourceOrder = [primarySourceId, ...remainingSourceIds];
    const failures = settledResults.filter((result) => result.status === 'rejected');
    const failureMessages = settledResults
      .map((result, index) => {
        if (result.status === 'fulfilled') return null;
        return `${sourceOrder[index]}: ${getErrorText(result.reason)}`;
      })
      .filter((value): value is string => Boolean(value));

    return {
      items,
      sourceOrder,
      failures,
      failureMessages,
      usedFallbackSources: items.length > 0 && primaryResult.status === 'rejected',
      usedPrimarySource: primarySourceId,
    };
  }, [torboxBookSourceIds]);

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

        const bookSearch = await searchBookListings(q);

        const mangaSearches = await Promise.allSettled(
          mangaSourceIds.map((sourceId) =>
            withTimeout(
              pluginApi.searchWithMeta(sourceId, q, 1, TORBOX_SEARCH_LIMIT),
              SEARCH_TIMEOUT_MS,
              `Manga search (${sourceId})`
            )
          )
        );

        const bookResults = bookSearch.items;
        const bookFailures = bookSearch.failures.length;
        const failedBookSourceMessages = bookSearch.failureMessages;
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
          ...bookResults.map((item) => ({ ...item, _source: 'books' as const, _sourceId: item.source_id })),
          ...dedupedMangaResults.map((item) => ({ ...item, _source: 'manga' as const })),
        ];
        setSearchResults(merged);

        const mangaAllFailed = mangaSearches.length > 0 && mangaSearches.every((search) => search.status === 'rejected');
        const mangaAnyFailed = mangaSearches.some((search) => search.status === 'rejected');

        if (bookFailures === bookSearch.sourceOrder.length && mangaAllFailed) {
          const reason = failedBookSourceMessages[0] ?? 'All book sources failed.';
          throw new Error(`Failed to search both book and manga sources. ${reason}`);
        }

        if (bookFailures > 0 || mangaAnyFailed) {
          const hasTimeout = bookSearch.failures.some((result) => isTimeoutLikeError(result.reason));
          if (hasTimeout) {
            setPartialSearchWarning('Some external book sources timed out on this network. Showing available results (Anna fallback active).');
          } else if (bookSearch.items.length > 0 && bookSearch.usedPrimarySource === 'anna-archive') {
            setPartialSearchWarning('Search results are prioritized from Anna for speed. Open a book to load mirrors from all sources.');
          } else {
            setPartialSearchWarning('One source failed to search; showing partial results.');
          }
        }
      } else {
        if (searchKind === 'books' || searchKind === 'comics') {
          const bookSearch = await searchBookListings(q);
          const merged = bookSearch.items;
          const failures = bookSearch.failures;
          const failureMessages = bookSearch.failureMessages;

          if (merged.length === 0 && failures.length === bookSearch.sourceOrder.length && failures.length > 0) {
            const message = failureMessages[0] ?? 'Book search failed on all enabled sources.';
            throw new Error(message);
          }

          if (failures.length > 0) {
            const hasTimeout = failures.some((result) => result.status === 'rejected' && isTimeoutLikeError(result.reason));
            setPartialSearchWarning(
              hasTimeout
                ? 'Some external book sources timed out on this network. Showing available results (Anna fallback active).'
                : bookSearch.usedPrimarySource === 'anna-archive' && merged.length > 0
                ? 'Search results are prioritized from Anna for speed. Open a book to load mirrors from all sources.'
                : 'Some book sources failed; showing partial results.'
            );
          }

          setSearchResults(merged.map((item) => ({ ...item, _source: 'books' as const, _sourceId: item.source_id })));
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
    searchBookListings,
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

  const buildBookMirrorCandidates = useCallback(
    async (item: PluginSearchResult): Promise<BookMirrorBuildResult> => {
      const candidateByUrl = new Map<string, BookMirrorCandidate>();
      const diagnostics = new Map<string, MirrorSourceDiagnostic>();
      const sourceId = getResultSourceId(item);
      const sourceLabel = sourceLabelById(sourceId);
      const extra = item.extra ?? {};
      const searchTitle = getDisplayTitle(item);

      const includeRutracker = sources.some((source) => source.id === 'rutracker' && source.enabled && source.implemented);
      const includeBitsearch = sources.some((source) => source.id === 'bitsearch' && source.enabled && source.implemented);
      const includeX1337 = sources.some((source) => source.id === 'x1337' && source.enabled && source.implemented);
      const includeTpbApi = sources.some((source) => source.id === 'tpb-api' && source.enabled && source.implemented);

      const tracker = parseOptionalString(extra.tracker) ?? parseOptionalString(extra.indexer);
      const seeders = parseOptionalNumber(extra.seeders);
      const fileSize = parseOptionalString(extra.file_size) ?? parseOptionalString(extra.size);
      const format = parseOptionalString(extra.format);
      const language = parseOptionalString(extra.language);

      const addCandidate = (
        rawCandidate: string,
        hintedType?: string,
        context?: {
          sourceId?: string;
          sourceLabel?: string;
          tracker?: string;
          seeders?: number;
          fileSize?: string;
          format?: string;
          language?: string;
          title?: string;
          fileName?: string;
        }
      ) => {
        const parsed = parseAnnaCandidate(rawCandidate);
        if (!parsed) return;

        const kind = normalizeKindFromUrl(hintedType ?? parsed.kind, parsed.url);
        if (kind !== 'magnet' && kind !== 'torrent') return;

        const url = parsed.url.trim();
        if (!url || !isTorboxCompatibleLink(url)) return;

        const inferredFormat = inferMirrorBookFormat({
          url,
          rawCandidate,
          title: context?.title,
          format: context?.format ?? format,
          fileName: context?.fileName,
          label: context?.sourceLabel,
        });
        if (!inferredFormat) return;

        const effectiveSourceId = context?.sourceId ?? sourceId;
        const effectiveSourceLabel = context?.sourceLabel ?? sourceLabel;
        const effectiveTracker = context?.tracker ?? tracker;
        const isRuTracker = isRuTrackerValue(effectiveTracker) || isRuTrackerValue(url);
        const sourceRank = sourcePriorityIndex(effectiveSourceId);
        const basePriority = kind === 'magnet' ? 0 : 1;
        const priority = sourceRank * 100 + basePriority + (isRuTracker ? -20 : 0);

        const next: BookMirrorCandidate = {
          id: `${effectiveSourceId}:${candidateByUrl.size}:${url}`,
          url,
          kind,
          priority,
          tracker: effectiveTracker,
          seeders: context?.seeders ?? seeders,
          fileSize: context?.fileSize ?? fileSize,
          format: inferredFormat,
          language: context?.language ?? language,
          sourceLabel: effectiveSourceLabel,
          sourceId: effectiveSourceId,
          isRuTracker,
        };

        const existing = candidateByUrl.get(url);
        if (!existing || next.priority < existing.priority) {
          candidateByUrl.set(url, next);
        }
      };

      const collectFromResult = async (result: PluginSearchResult, resultSourceId: string) => {
        const resultExtra = result.extra ?? {};
        const resultTracker = parseOptionalString(resultExtra.tracker) ?? parseOptionalString(resultExtra.indexer);
        const resultSeeders = parseOptionalNumber(resultExtra.seeders);
        const resultFileSize = parseOptionalString(resultExtra.file_size) ?? parseOptionalString(resultExtra.size);
        const resultFormat = parseOptionalString(resultExtra.format);
        const resultLanguage = parseOptionalString(resultExtra.language);
        const resultFileName =
          parseOptionalString(resultExtra.filename) ??
          parseOptionalString(resultExtra.file_name) ??
          parseOptionalString(resultExtra.name);
        const resultTitle = getDisplayTitle(result);

        const context = {
          sourceId: resultSourceId,
          sourceLabel: sourceLabelById(resultSourceId),
          tracker: resultTracker,
          seeders: resultSeeders,
          fileSize: resultFileSize,
          format: resultFormat,
          language: resultLanguage,
          title: resultTitle,
          fileName: resultFileName ?? resultTitle,
        };

        const directKeys = [
          'magnet',
          'magnet_link',
          'magnetLink',
          'magnet_url',
          'torrent',
          'torrent_link',
          'torrentLink',
          'torrent_url',
          'link',
          'url',
          'details',
          'links',
        ] as const;

        directKeys.forEach((key) => {
          const value = resultExtra[key as keyof typeof resultExtra];
          const entries = Array.isArray(value) ? value : [value];
          entries.forEach((entry) => {
            if (typeof entry !== 'string') return;
            addCandidate(entry, undefined, context);
            extractMagnetOrTorrentLinks(entry).forEach((match) => {
              addCandidate(match, undefined, context);
            });
          });
        });

        const fallback = getResultUrl(result);
        if (fallback) {
          addCandidate(fallback, undefined, context);
        }

        if (!result.id) return;
        const chapters = await pluginApi.getChapters(resultSourceId, result.id);
        if (chapters.length === 0) return;
        const pages = await pluginApi.getPages(resultSourceId, chapters[0].id);
        pages.forEach((page) => {
          addCandidate(page.url, undefined, context);
          extractMagnetOrTorrentLinks(page.url).forEach((entry) => {
            addCandidate(entry, undefined, context);
          });
        });

      };

      const sourceMirrorCounts = new Map<string, number>();
      const updateSourceDiagnostic = (source: string, beforeCount: number) => {
        const gained = candidateByUrl.size - beforeCount;
        const previous = sourceMirrorCounts.get(source) ?? 0;
        const nextCount = previous + Math.max(gained, 0);
        sourceMirrorCounts.set(source, nextCount);
        diagnostics.set(source, {
          sourceId: source,
          label: sourceLabelById(source),
          status: nextCount > 0 ? 'ok' : 'no-results',
          mirrorCount: nextCount,
        });
      };

      try {
        const beforeCount = candidateByUrl.size;
        await collectFromResult(item, sourceId);
        updateSourceDiagnostic(sourceId, beforeCount);
      } catch (error) {
        const message = getErrorText(error);
        diagnostics.set(sourceId, {
          sourceId,
          label: sourceLabelById(sourceId),
          status: mapDiagnosticStatus(message),
          detail: message,
          mirrorCount: 0,
        });
      }

      if (includeRutracker && sourceId !== 'rutracker') {
        try {
          const rutrackerSearch = await pluginApi.searchWithMeta('rutracker', searchTitle, 1, 30);
          if (rutrackerSearch.items.length > 0) {
            const rutrackerCandidates = rutrackerSearch.items.slice(0, 10);
            const beforeCount = candidateByUrl.size;
            await Promise.allSettled(
              rutrackerCandidates.map((result) => collectFromResult(result, 'rutracker'))
            );
            updateSourceDiagnostic('rutracker', beforeCount);
          } else {
            diagnostics.set('rutracker', {
              sourceId: 'rutracker',
              label: sourceLabelById('rutracker'),
              status: 'no-results',
              mirrorCount: 0,
            });
          }
        } catch (error) {
          const message = getErrorText(error);
          diagnostics.set('rutracker', {
            sourceId: 'rutracker',
            label: sourceLabelById('rutracker'),
            status: mapDiagnosticStatus(message),
            detail: message,
            mirrorCount: 0,
          });
        }
      }

      if (includeBitsearch && sourceId !== 'bitsearch') {
        try {
          const bitsearchSearch = await pluginApi.searchWithMeta('bitsearch', searchTitle, 1, 30);
          if (bitsearchSearch.items.length > 0) {
            const beforeCount = candidateByUrl.size;
            await Promise.allSettled(
              bitsearchSearch.items.slice(0, 10).map((result) => collectFromResult(result, 'bitsearch'))
            );
            updateSourceDiagnostic('bitsearch', beforeCount);
          } else {
            diagnostics.set('bitsearch', {
              sourceId: 'bitsearch',
              label: sourceLabelById('bitsearch'),
              status: 'no-results',
              mirrorCount: 0,
            });
          }
        } catch (error) {
          const message = getErrorText(error);
          diagnostics.set('bitsearch', {
            sourceId: 'bitsearch',
            label: sourceLabelById('bitsearch'),
            status: mapDiagnosticStatus(message),
            detail: message,
            mirrorCount: 0,
          });
        }
      }

      if (includeX1337 && sourceId !== 'x1337') {
        try {
          const x1337Search = await pluginApi.searchWithMeta('x1337', searchTitle, 1, 20);
          if (x1337Search.items.length > 0) {
            const beforeCount = candidateByUrl.size;
            await Promise.allSettled(
              x1337Search.items.slice(0, 6).map((result) => collectFromResult(result, 'x1337'))
            );
            updateSourceDiagnostic('x1337', beforeCount);
          } else {
            diagnostics.set('x1337', {
              sourceId: 'x1337',
              label: sourceLabelById('x1337'),
              status: 'no-results',
              mirrorCount: 0,
            });
          }
        } catch (error) {
          const message = getErrorText(error);
          diagnostics.set('x1337', {
            sourceId: 'x1337',
            label: sourceLabelById('x1337'),
            status: mapDiagnosticStatus(message),
            detail: message,
            mirrorCount: 0,
          });
        }
      }

      if (includeTpbApi && sourceId !== 'tpb-api') {
        try {
          const tpbSearch = await pluginApi.searchWithMeta('tpb-api', searchTitle, 1, 20);
          if (tpbSearch.items.length > 0) {
            const beforeCount = candidateByUrl.size;
            await Promise.allSettled(
              tpbSearch.items.slice(0, 8).map((result) => collectFromResult(result, 'tpb-api'))
            );
            updateSourceDiagnostic('tpb-api', beforeCount);
          } else {
            diagnostics.set('tpb-api', {
              sourceId: 'tpb-api',
              label: sourceLabelById('tpb-api'),
              status: 'no-results',
              mirrorCount: 0,
            });
          }
        } catch (error) {
          const message = getErrorText(error);
          diagnostics.set('tpb-api', {
            sourceId: 'tpb-api',
            label: sourceLabelById('tpb-api'),
            status: mapDiagnosticStatus(message),
            detail: message,
            mirrorCount: 0,
          });
        }
      }

      const mirrors = Array.from(candidateByUrl.values()).sort((a, b) => {
        if (a.isRuTracker !== b.isRuTracker) return a.isRuTracker ? -1 : 1;
        if (a.priority !== b.priority) return a.priority - b.priority;
        const aSeeders = typeof a.seeders === 'number' ? a.seeders : -1;
        const bSeeders = typeof b.seeders === 'number' ? b.seeders : -1;
        if (aSeeders !== bSeeders) return bSeeders - aSeeders;
        return a.url.localeCompare(b.url);
      });

      return {
        mirrors,
        diagnostics: Array.from(diagnostics.values()).sort((a, b) => a.label.localeCompare(b.label)),
      };
    },
    [sources]
  );

  const openBookMirrorsDialog = useCallback(
    async (item: TorboxSearchResult) => {
      if (!item.id) return;
      setSearchError(null);
      setPartialSearchWarning(null);
      setMirrorLoading(true);
      setMirrorDialogItem(item);
      setMirrorDialogTitle(getDisplayTitle(item));
      setMirrorDialogOpen(true);
      setBookMirrorCandidates([]);
      setMirrorDiagnostics([]);
      setMirrorFilter('all');
      setMirrorSort('best');
      setMirrorSendStates({});

      try {
        const { mirrors, diagnostics } = await buildBookMirrorCandidates(item);
        setBookMirrorCandidates(mirrors);
        setMirrorDiagnostics(diagnostics);
        if (mirrors.some((mirror) => mirror.isRuTracker || mirror.sourceId === 'rutracker')) {
          setMirrorFilter('rutracker');
        } else if (mirrors.some((mirror) => mirror.sourceId === 'bitsearch')) {
          setMirrorFilter('bitsearch');
        } else if (mirrors.some((mirror) => mirror.sourceId === 'x1337')) {
          setMirrorFilter('x1337');
        } else if (mirrors.some((mirror) => mirror.sourceId === 'tpb-api')) {
          setMirrorFilter('tpb-api');
        }
        if (mirrors.length === 0) {
          setSearchError('No magnet/torrent mirrors found for this result.');
        }
      } catch (error) {
        const msg = getUiErrorMessage(error, 'Failed to load mirrors for this result.');
        setSearchError(msg);
      } finally {
        setMirrorLoading(false);
      }
    },
    [buildBookMirrorCandidates]
  );

  const handleAddMirrorToCloud = useCallback(
    async (item: TorboxSearchResult, mirror: BookMirrorCandidate) => {
      setMirrorSendState(mirror.id, 'sending');
      setSearchError(null);
      setPartialSearchWarning(null);
      try {
        await enqueueFromAnna({
          title: getDisplayTitle(item),
          sourceLinks: [
            {
              url: mirror.url,
              kind: mirror.kind,
              source: mirror.sourceId,
              label: mirror.tracker ?? mirror.sourceLabel,
              priority: mirror.priority,
            },
          ],
        });
        setMirrorSendState(mirror.id, 'success');
      } catch (error) {
        const msg = getUiErrorMessage(error, 'Failed to send mirror to Torbox');
        setMirrorSendState(mirror.id, 'failed', msg);
        setSearchError(msg);
      }
    },
    [enqueueFromAnna, setMirrorSendState]
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
            title: getDisplayTitle(item),
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
      <BookMirrorsDialog
        open={mirrorDialogOpen}
        item={mirrorDialogItem}
        displayTitle={mirrorDialogTitle}
        loading={mirrorLoading}
        mirrors={bookMirrorCandidates}
        diagnostics={mirrorDiagnostics}
        filter={mirrorFilter}
        sort={mirrorSort}
        sendStates={mirrorSendStates}
        onOpenChange={(open) => {
          setMirrorDialogOpen(open);
          if (!open) {
            setMirrorDialogItem(null);
            setMirrorDialogTitle('');
            setBookMirrorCandidates([]);
            setMirrorDiagnostics([]);
            setMirrorFilter('all');
            setMirrorSort('best');
            setMirrorSendStates({});
            setMirrorLoading(false);
          }
        }}
        onFilterChange={setMirrorFilter}
        onSortChange={setMirrorSort}
        onAdd={(mirror) => {
          if (!mirrorDialogItem) return;
          void handleAddMirrorToCloud(mirrorDialogItem, mirror);
        }}
      />

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
                        ? 'Search book torrent sources for Torbox...'
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
                  const displayTitle = getDisplayTitle(item);
                  const itemSendState = isBookResult ? undefined : sendStates[item.id];
                  const currentSendState: SendState = itemSendState?.state ?? 'idle';
                  const sendError = itemSendState?.error;
                  const sourceId = item._sourceId ?? (typeof item.source_id === 'string' ? item.source_id : undefined);

                  if (isBookResult) {
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className="torbox-result-card torbox-result-card--book torbox-animate-in w-full p-4 text-left"
                        style={{ animationDelay: `${index * 36}ms` }}
                        onClick={() => {
                          void openBookMirrorsDialog(item);
                        }}
                        aria-label={`View mirrors for ${displayTitle}`}
                      >
                        <div className="flex gap-4">
                          <ResultCover item={item} />

                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-semibold text-base line-clamp-2">{displayTitle}</h3>
                              <SearchResultSourceBadge sourceId={sourceId} fallbackSource={item._source} />
                            </div>

                            <MetadataRow item={item} />

                            {(item.summary || item.description) && (
                              <p className="text-sm text-muted-foreground line-clamp-2">{item.summary || item.description}</p>
                            )}

                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="torbox-method-hint">
                                {mirrorLoading && mirrorDialogItem?.id === item.id
                                  ? 'Loading mirrors...'
                                  : 'Open mirrors and choose Add to Cloud'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  }

                  return (
                    <article
                      key={item.id}
                      className="torbox-result-card torbox-animate-in p-4"
                      style={{ animationDelay: `${index * 36}ms` }}
                    >
                      <div className="flex gap-4">
                        <ResultCover item={item} />

                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-base line-clamp-2">{displayTitle}</h3>
                            <SearchResultSourceBadge sourceId={sourceId} fallbackSource={item._source} />
                          </div>

                          <MetadataRow item={item} />

                          {(item.summary || item.description) && (
                            <p className="text-sm text-muted-foreground line-clamp-2">{item.summary || item.description}</p>
                          )}

                          <div className="flex items-center gap-2 flex-wrap">
                            <SendButton
                              sendState={currentSendState}
                              errorMsg={sendError}
                              disabled={!canSendManga || !mangaSourceHasTorboxLinks}
                              onClick={() => {
                                void handleSendMangaResult(item);
                              }}
                              variant={canSendManga ? 'default' : 'outline'}
                              label={!mangaSourceHasTorboxLinks ? 'Enable torrent source' : canSendManga ? 'Send to TorBox' : 'No torrent link'}
                            />

                            {currentSendState === 'success' && (
                              <span className="torbox-method-hint">
                                ✓ Sent to Torbox queue
                              </span>
                            )}
                          </div>

                          {!mangaSourceHasTorboxLinks && (
                            <p className="text-[11px] text-muted-foreground">
                              Active manga source (<span className="font-medium">{torboxMangaSource?.name ?? 'unknown'}</span>) is not Torbox-compatible. Switch to {torboxRecommendedMangaSourceLabel} in source selector.
                            </p>
                          )}
                        </div>
                      </div>
                    </article>
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
