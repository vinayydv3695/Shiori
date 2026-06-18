import { create } from 'zustand';
import { api } from '@/lib/tauri';
import { invoke } from '@tauri-apps/api/core';
import { parsePageUrl } from '@/lib/utils';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export type TorboxJobStatus = 'queued' | 'verifying' | 'downloading' | 'importing' | 'completed' | 'failed';
export type TorboxDownloadMethod = 'magnet' | 'torrent' | 'webdl';

export interface TorboxQueueItem {
  id: string;
  title: string;
  source: 'anna' | 'manga' | 'torbox' | 'manual';
  sourceLink: string;
  downloadMethod: TorboxDownloadMethod;
  status: TorboxJobStatus;
  progress: number;
  size?: number;
  downloadSpeed?: number;
  torrentId?: number;
  importedPath?: string;
  resolvedLink?: string;
  resolving?: boolean;
  error?: string;
  localDownloadedBytes?: number;
  localTotalBytes?: number;
  localProgress?: number;
  localPhase?: 'downloading' | 'importing' | 'completed';
  localFileIndex?: number;
  localFileTotal?: number;
  localFileName?: string;
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
  let kind = parsed.kind;

  if (kind === 'direct') {
    const normalized = url.toLowerCase();
    if (normalized.startsWith('magnet:')) {
      kind = 'magnet';
    } else if (normalized.includes('.torrent') || normalized.includes('/torrent')) {
      kind = 'torrent';
    }
  }

  return { kind, url };
}

interface TorboxStoreState {
  jobs: TorboxQueueItem[];
  activeJobId: string | null;
  enqueueFromAnna: (input: { title: string; sourceLink: string }) => Promise<void>;
  enqueueFromMangadex: (input: { title: string; sourceLink: string }) => Promise<void>;
  enqueueJob: (input: { title: string; sourceLink: string; kind?: 'books' | 'manga' }) => Promise<void>;
  resolveJob: (id: string) => Promise<void>;
  importJob: (id: string) => Promise<void>;
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

function getTorboxQueueId(result: { torrentId?: unknown; torrent_id?: unknown }): number {
  const candidates = [result.torrentId, result.torrent_id];

  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate;
    }

    if (typeof candidate === 'string' && candidate.trim()) {
      const parsed = Number(candidate);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  throw new Error('Torbox queue response did not include a valid torrent id');
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

  enqueueJob: async ({ title, sourceLink, kind }) => {
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
      source: kind === 'books' ? 'anna' : kind === 'manga' ? 'manga' : 'torbox',
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
      const torrentId = getTorboxQueueId(queued);

      set((state) => ({
        jobs: state.jobs.map((item) =>
          item.id === id
            ? {
                ...item,
                torrentId,
                status: 'downloading',
                progress: 10,
              }
            : item
        ),
      }));

      void (async () => {
        try {
          await waitForCompletionWithProgress(torrentId, (info) => {
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

          // Wait until completion, then attempt auto-import
          const importedPath = await api.importExistingTorboxTarget(torrentId, undefined, title);

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
        }
      })();
    } catch (error) {
      const message = getErrorMessage(error, 'Torbox queue failed');
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

  enqueueFromAnna: async (input) => {
    return get().enqueueJob({ ...input, kind: 'books' });
  },

  enqueueFromMangadex: async (input) => {
    return get().enqueueJob({ ...input, kind: 'manga' });
  },

  resolveJob: async (id: string) => {
    const job = get().jobs.find((j) => j.id === id);
    if (!job || !job.torrentId) return;

    set((state) => ({
      jobs: state.jobs.map((item) =>
        item.id === id ? { ...item, resolving: true, error: undefined } : item
      ),
    }));

    try {
      // NOTE: getTorboxDownloadLink maps to 'torbox_get_download_link' or 'resolve_torbox_download'
      const link = await invoke<string>('resolve_torbox_download', {
        torrentId: job.torrentId,
      });

      set((state) => ({
        jobs: state.jobs.map((item) =>
          item.id === id ? { ...item, resolvedLink: link, resolving: false } : item
        ),
      }));
    } catch (error) {
      const message = getErrorMessage(error, 'Failed to resolve Torbox download link.');
      set((state) => ({
        jobs: state.jobs.map((item) =>
          item.id === id ? { ...item, resolving: false, error: message } : item
        ),
      }));
      throw new Error(message);
    }
  },

  importJob: async (id: string) => {
    const job = get().jobs.find((j) => j.id === id);
    if (!job || !job.torrentId) return;

    set((state) => ({
      jobs: state.jobs.map((item) =>
        item.id === id ? { ...item, localPhase: 'importing', error: undefined } : item
      ),
    }));

    try {
      const importedPath = await api.importExistingTorboxTarget(job.torrentId, undefined, job.title);
      set((state) => ({
        jobs: state.jobs.map((item) =>
          item.id === id ? { ...item, importedPath, localPhase: 'completed', localProgress: 100 } : item
        ),
      }));
    } catch (error) {
      const message = getErrorMessage(error, 'Failed to import completed Torbox target.');
      set((state) => ({
        jobs: state.jobs.map((item) =>
          item.id === id ? { ...item, error: message, localPhase: 'completed' } : item
        ),
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
