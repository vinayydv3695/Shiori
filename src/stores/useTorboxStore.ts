import { create } from 'zustand';
import { api } from '@/lib/tauri';
import { parsePageUrl } from '@/lib/utils';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export type TorboxJobStatus = 'queued' | 'verifying' | 'downloading' | 'importing' | 'completed' | 'failed';
export type TorboxDownloadMethod = 'magnet' | 'torrent' | 'webdl';
export type TorboxCandidateKind = 'magnet' | 'torrent' | 'direct' | 'anna' | 'external' | 'unknown';

export interface TorboxSourceCandidate {
  url: string;
  kind?: TorboxCandidateKind;
  source?: string;
  label?: string;
  priority?: number;
}

export interface TorboxQueueItem {
  id: string;
  title: string;
  source: 'anna' | 'manga';
  sourceLink: string;
  downloadMethod: TorboxDownloadMethod;
  status: TorboxJobStatus;
  progress: number;
  size?: number;
  downloadSpeed?: number;
  torrentId?: number;
  importedPath?: string;
  error?: string;
  localDownloadedBytes?: number;
  localTotalBytes?: number;
  localProgress?: number;
  localPhase?: 'downloading' | 'importing' | 'completed';
  localFileIndex?: number;
  localFileTotal?: number;
  localFileName?: string;
  candidateKind?: TorboxCandidateKind;
  candidateSource?: string;
  candidateLabel?: string;
  candidateAttempt?: number;
  candidateTotal?: number;
  candidateTriedKinds?: TorboxCandidateKind[];
}

type TorboxLocalDownloadProgressEvent = {
  torrentId: number;
  downloadedBytes: number;
  totalBytes: number | null;
  progress: number | null;
  phase: 'downloading' | 'importing' | 'completed';
  fileIndex: number;
  fileTotal: number;
  fileName: string | null;
};

type TorboxSetState = {
  (partial: TorboxStoreState | Partial<TorboxStoreState> | ((state: TorboxStoreState) => TorboxStoreState | Partial<TorboxStoreState>), replace?: false | undefined): void;
  (state: TorboxStoreState | ((state: TorboxStoreState) => TorboxStoreState), replace: true): void;
};

let localDownloadUnlisten: UnlistenFn | null = null;
let localDownloadListenerInit: Promise<void> | null = null;

async function ensureLocalDownloadListener(set: TorboxSetState) {
  if (localDownloadUnlisten) return;
  if (localDownloadListenerInit) {
    await localDownloadListenerInit;
    return;
  }

  localDownloadListenerInit = (async () => {
    localDownloadUnlisten = await listen<TorboxLocalDownloadProgressEvent>(
      'torbox:local-download-progress',
      ({ payload }) => {
        if (!payload || typeof payload.torrentId !== 'number') return;

        set((state: TorboxStoreState) => ({
          jobs: state.jobs.map((item: TorboxQueueItem) => {
            if (item.torrentId !== payload.torrentId) return item;

            return {
              ...item,
              localDownloadedBytes:
                typeof payload.downloadedBytes === 'number' ? payload.downloadedBytes : item.localDownloadedBytes,
              localTotalBytes:
                typeof payload.totalBytes === 'number' ? payload.totalBytes : item.localTotalBytes,
              localProgress:
                typeof payload.progress === 'number'
                  ? Math.max(0, Math.min(100, payload.progress))
                  : item.localProgress,
              localPhase: payload.phase,
              localFileIndex:
                typeof payload.fileIndex === 'number' && payload.fileIndex > 0
                  ? payload.fileIndex
                  : item.localFileIndex,
              localFileTotal:
                typeof payload.fileTotal === 'number' && payload.fileTotal > 0
                  ? payload.fileTotal
                  : item.localFileTotal,
              localFileName:
                typeof payload.fileName === 'string' && payload.fileName.trim()
                  ? payload.fileName
                  : item.localFileName,
            };
          }),
        }));
      },
    );
  })();

  await localDownloadListenerInit;
}

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 15 * 60 * 1000 / POLL_INTERVAL_MS;

type TorboxInstantInfo = {
  id: number;
  name: string;
  size: number;
  progress: number;
  downloadSpeed: number;
  status: string;
  files: { id: number; name: string; size: number }[] | null;
};

function detectDownloadMethod(link: string): TorboxDownloadMethod {
  const normalized = link.trim().toLowerCase();
  if (normalized.startsWith('magnet:')) return 'magnet';
  if (normalized.includes('.torrent') || normalized.includes('/torrent')) return 'torrent';
  return 'webdl';
}

function normalizeTorboxLink(rawLink: string): { kind: string; url: string } {
  const parsed = parsePageUrl(rawLink);
  const url = parsed.url.trim();
  const normalized = url.toLowerCase();
  let kind = parsed.kind;
  if (normalized.startsWith('magnet:')) {
    kind = 'magnet';
  } else if (normalized.includes('.torrent') || normalized.includes('/torrent')) {
    kind = 'torrent';
  }

  return { kind, url };
}

function normalizeCandidateKind(rawKind: string | undefined): TorboxCandidateKind {
  const kind = (rawKind ?? '').trim().toLowerCase();
  if (kind === 'magnet' || kind === 'torrent' || kind === 'direct' || kind === 'anna' || kind === 'external') {
    return kind;
  }
  return 'unknown';
}

function candidateExecutionRank(kind: TorboxCandidateKind | undefined): number {
  if (kind === 'magnet') return 0;
  if (kind === 'torrent') return 1;
  return 999;
}

function isTorboxRunnableAnnaCandidate(kind: TorboxCandidateKind | undefined): boolean {
  return kind === 'magnet' || kind === 'torrent';
}

function buildAnnaCandidates(input: {
  sourceLink?: string;
  sourceLinks?: TorboxSourceCandidate[];
}): TorboxSourceCandidate[] {
  const candidates: TorboxSourceCandidate[] = [];
  const seen = new Set<string>();

  const pushCandidate = (candidate: TorboxSourceCandidate, fallbackPriority: number) => {
    const url = candidate.url?.trim();
    if (!url || seen.has(url)) return;

    const parsed = normalizeTorboxLink(url);
    const parsedKind = normalizeCandidateKind(parsed.kind);
    const providedKind = normalizeCandidateKind(candidate.kind);
    const effectiveKind =
      parsedKind === 'magnet' || parsedKind === 'torrent'
        ? parsedKind
        : providedKind;

    candidates.push({
      url: parsed.url,
      kind: effectiveKind,
      source: candidate.source,
      label: candidate.label,
      priority: typeof candidate.priority === 'number' ? candidate.priority : fallbackPriority,
    });
    seen.add(parsed.url);
  };

  (input.sourceLinks ?? []).forEach((candidate, index) => {
    pushCandidate(candidate, index);
  });

  if (input.sourceLink) {
    pushCandidate({ url: input.sourceLink }, candidates.length + 1000);
  }

  return candidates
    .sort((a, b) => {
      const rankDiff = candidateExecutionRank(a.kind) - candidateExecutionRank(b.kind);
      if (rankDiff !== 0) return rankDiff;
      return (a.priority ?? 0) - (b.priority ?? 0);
    })
    .map((candidate) => ({
      url: candidate.url,
      kind: candidate.kind,
      source: candidate.source,
      label: candidate.label,
    }));
}

async function processTorboxCandidate(
  candidate: TorboxSourceCandidate,
  title: string,
  onProgress: (info: TorboxInstantInfo, torrentId: number) => void,
): Promise<{ importedPath: string; torrentId: number }> {
  const queued = await api.addToTorboxQueue(candidate.url);

  await waitForCompletionWithProgress(queued.torrentId, (info) => {
    onProgress(info, queued.torrentId);
  });

  const importedPath = await api.importExistingTorboxTarget(
    queued.torrentId,
    undefined,
    title,
  );

  return {
    importedPath,
    torrentId: queued.torrentId,
  };
}

interface TorboxStoreState {
  jobs: TorboxQueueItem[];
  activeJobId: string | null;
  enqueueFromAnna: (input: {
    title: string;
    sourceLink?: string;
    sourceLinks?: TorboxSourceCandidate[];
  }) => Promise<void>;
  enqueueFromMangadex: (input: { title: string; sourceLink: string }) => Promise<void>;
  removeJob: (id: string) => void;
  clearCompleted: () => void;
}

function createJobId() {
  return `torbox_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (typeof error === 'string' && error.trim()) {
    return error;
  }
  if (error && typeof error === 'object') {
    const asObj = error as Record<string, unknown>;
    const maybeMessage = asObj.message;
    if (typeof maybeMessage === 'string' && maybeMessage.trim()) {
      return maybeMessage;
    }

    const maybeError = asObj.error;
    if (typeof maybeError === 'string' && maybeError.trim()) {
      return maybeError;
    }

    const maybeData = asObj.data;
    if (maybeData && typeof maybeData === 'object') {
      const nestedMessage = (maybeData as { message?: unknown }).message;
      if (typeof nestedMessage === 'string' && nestedMessage.trim()) {
        return nestedMessage;
      }
      const nestedError = (maybeData as { error?: unknown }).error;
      if (typeof nestedError === 'string' && nestedError.trim()) {
        return nestedError;
      }
    }
  }
  return fallback;
}

function normalizeTorboxProgress(progress: number): number {
  const scaled = progress <= 1 ? progress * 100 : progress;
  return Math.max(0, Math.min(100, scaled));
}

function isCompletedStatus(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  return (
    normalized.includes('completed') ||
    normalized.includes('complete') ||
    normalized.includes('cached') ||
    normalized.includes('finished') ||
    normalized.includes('done') ||
    normalized.includes('ready') ||
    normalized.includes('downloaded') ||
    normalized.includes('seeding')
  );
}

function isFailedStatus(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  return normalized.includes('error') || normalized.includes('failed');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function waitForCompletionWithProgress(
  torrentId: number,
  onProgress: (info: TorboxInstantInfo) => void,
): Promise<TorboxInstantInfo> {
  let lastInfo: TorboxInstantInfo | null = null;

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    const info = await api.getTorboxInstant(torrentId);
    lastInfo = info;
    onProgress(info);

    if (isFailedStatus(info.status)) {
      throw new Error(`Torbox target failed: ${info.status}`);
    }

    if (isCompletedStatus(info.status) || normalizeTorboxProgress(info.progress) >= 100) {
      return info;
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(
    lastInfo
      ? `Torbox download timed out after 15 minutes. Current progress: ${normalizeTorboxProgress(lastInfo.progress).toFixed(1)}%`
      : 'Torbox download timed out after 15 minutes.',
  );
}

export const useTorboxStore = create<TorboxStoreState>((set, get) => ({
  jobs: [],
  activeJobId: null,

  enqueueFromAnna: async ({ title, sourceLink, sourceLinks }) => {
    await ensureLocalDownloadListener(set);
    const allCandidates = buildAnnaCandidates({ sourceLink, sourceLinks });

    const candidates = allCandidates.filter((candidate) => isTorboxRunnableAnnaCandidate(candidate.kind));

    if (allCandidates.length === 0) {
      throw new Error('No Anna candidates available for Torbox queueing.');
    }

    if (candidates.length === 0) {
      throw new Error('No Torbox-compatible magnet/torrent candidate from source response.');
    }

    const primary = candidates[0];

    const id = createJobId();
    const method = detectDownloadMethod(primary.url);
    const job: TorboxQueueItem = {
      id,
      title,
      source: 'anna',
      sourceLink: primary.url,
      downloadMethod: method,
      status: 'queued',
      progress: 0,
      size: 0,
      downloadSpeed: 0,
      candidateKind: primary.kind,
      candidateSource: primary.source,
      candidateLabel: primary.label,
      candidateAttempt: 1,
      candidateTotal: candidates.length,
    };

    set((state) => ({
      jobs: [job, ...state.jobs],
      activeJobId: id,
    }));

    try {
      let importedPath: string | null = null;
      const errors: string[] = [];

      for (let attempt = 0; attempt < candidates.length; attempt += 1) {
        const candidate = candidates[attempt];

        set((state) => ({
          jobs: state.jobs.map((item) =>
            item.id === id
              ? {
                ...item,
                status: 'verifying',
                progress: 5,
                candidateKind: candidate.kind,
                candidateSource: candidate.source,
                candidateLabel: candidate.label,
                candidateAttempt: attempt + 1,
                candidateTotal: candidates.length,
                candidateTriedKinds: Array.from(
                  new Set([...(item.candidateTriedKinds ?? []), candidate.kind ?? 'unknown']),
                ),
                error: undefined,
              }
            : item
          ),
        }));

        try {
          const result = await processTorboxCandidate(candidate, title, (info, torrentId) => {
            set((state) => ({
              jobs: state.jobs.map((item) =>
                item.id === id
                  ? {
                      ...item,
                      torrentId,
                      status: isCompletedStatus(info.status) ? 'importing' : 'downloading',
                      progress: normalizeTorboxProgress(info.progress),
                      size: info.size,
                      downloadSpeed: info.downloadSpeed,
                    }
                  : item
              ),
            }));
          });

          importedPath = result.importedPath;
          break;
        } catch (candidateError) {
          const message = getErrorMessage(
            candidateError,
            `Candidate ${attempt + 1} failed (${candidate.kind ?? 'unknown'})`,
          );
          errors.push(message);

          set((state) => ({
            jobs: state.jobs.map((item) =>
              item.id === id
                ? {
                    ...item,
                    status: 'verifying',
                    error: message,
                  }
                : item
            ),
          }));
        }
      }

      if (!importedPath) {
        const summary =
          errors.length > 0
            ? Array.from(new Set(errors)).join(' | ')
            : 'All Anna Torbox candidates failed.';
        throw new Error(summary);
      }

      set((state) => ({
        jobs: state.jobs.map((item) =>
          item.id === id
            ? {
                ...item,
                status: 'completed',
                progress: 100,
                importedPath,
                localPhase: 'completed',
                localProgress: 100,
              }
            : item
        ),
        activeJobId: state.activeJobId === id ? null : state.activeJobId,
      }));
    } catch (error) {
      const message = getErrorMessage(error, 'Torbox import failed');
      set((state) => ({
        jobs: state.jobs.map((item) =>
          item.id === id
            ? {
                ...item,
                status: 'failed',
                error: message,
              }
            : item
        ),
        activeJobId: state.activeJobId === id ? null : state.activeJobId,
      }));
      throw new Error(message);
    }
  },

  enqueueFromMangadex: async ({ title, sourceLink }) => {
    await ensureLocalDownloadListener(set);
    const parsedSource = normalizeTorboxLink(sourceLink);
    const resolvedSourceLink = parsedSource.url;

    if (parsedSource.kind === 'anna' || parsedSource.kind === 'external') {
      throw new Error('This source should be opened in browser instead of sending to Torbox.');
    }

    const id = createJobId();
    const method = detectDownloadMethod(resolvedSourceLink);
    const job: TorboxQueueItem = {
      id,
      title,
      source: 'manga',
      sourceLink: resolvedSourceLink,
      downloadMethod: method,
      status: 'queued',
      progress: 0,
      size: 0,
      downloadSpeed: 0,
    };

    set((state) => ({
      jobs: [job, ...state.jobs],
      activeJobId: id,
    }));

    try {
      set((state) => ({
        jobs: state.jobs.map((item) =>
          item.id === id ? { ...item, status: 'verifying', progress: 5 } : item
        ),
      }));

      const queued = await api.addToTorboxQueue(resolvedSourceLink);

      set((state) => ({
        jobs: state.jobs.map((item) =>
          item.id === id
            ? {
                ...item,
                torrentId: queued.torrentId,
                status: 'downloading',
                progress: 10,
              }
            : item
        ),
      }));

      const completedInfo = await waitForCompletionWithProgress(queued.torrentId, (info) => {
        set((state) => ({
          jobs: state.jobs.map((item) =>
            item.id === id
              ? {
                  ...item,
                  torrentId: queued.torrentId,
                  status: isCompletedStatus(info.status) ? 'importing' : 'downloading',
                  progress: normalizeTorboxProgress(info.progress),
                  size: info.size,
                  downloadSpeed: info.downloadSpeed,
                }
              : item
          ),
        }));
      });

      const importedPath = await api.importExistingTorboxTarget(
        queued.torrentId,
        completedInfo.files?.[0]?.id,
        title,
      );

      set((state) => ({
        jobs: state.jobs.map((item) =>
          item.id === id
            ? {
                ...item,
                status: 'completed',
                progress: 100,
                importedPath,
                localPhase: 'completed',
                localProgress: 100,
              }
            : item
        ),
        activeJobId: state.activeJobId === id ? null : state.activeJobId,
      }));
    } catch (error) {
      const message = getErrorMessage(error, 'Torbox queue import failed');
      set((state) => ({
        jobs: state.jobs.map((item) =>
          item.id === id
            ? {
                ...item,
                status: 'failed',
                error: message,
              }
            : item
        ),
        activeJobId: state.activeJobId === id ? null : state.activeJobId,
      }));
      throw new Error(message);
    }
  },

  removeJob: (id) => {
    set((state) => ({
      jobs: state.jobs.filter((item) => item.id !== id),
      activeJobId: state.activeJobId === id ? null : state.activeJobId,
    }));
  },

  clearCompleted: () => {
    const activeJobId = get().activeJobId;
    set((state) => ({
      jobs: state.jobs.filter((item) => item.status !== 'completed'),
      activeJobId,
    }));
  },
}));
