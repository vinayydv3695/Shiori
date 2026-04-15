import { create } from 'zustand';
import { api } from '@/lib/tauri';

export type TorboxJobStatus = 'queued' | 'verifying' | 'downloading' | 'importing' | 'completed' | 'failed';

export interface TorboxQueueItem {
  id: string;
  title: string;
  source: 'anna' | 'mangadex';
  magnetLink: string;
  status: TorboxJobStatus;
  progress: number;
  torrentId?: number;
  importedPath?: string;
  error?: string;
}

interface TorboxStoreState {
  jobs: TorboxQueueItem[];
  activeJobId: string | null;
  enqueueFromAnna: (input: { title: string; magnetLink: string }) => Promise<void>;
  enqueueFromMangadex: (input: { title: string; magnetLink: string }) => Promise<void>;
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
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === 'string' && maybeMessage.trim()) {
      return maybeMessage;
    }
  }
  return fallback;
}

export const useTorboxStore = create<TorboxStoreState>((set, get) => ({
  jobs: [],
  activeJobId: null,

  enqueueFromAnna: async ({ title, magnetLink }) => {
    const id = createJobId();
    const job: TorboxQueueItem = {
      id,
      title,
      source: 'anna',
      magnetLink,
      status: 'queued',
      progress: 0,
    };

    set((state) => ({
      jobs: [job, ...state.jobs],
      activeJobId: id,
    }));

    try {
      set((state) => ({
        jobs: state.jobs.map((item) =>
          item.id === id ? { ...item, status: 'downloading', progress: 15 } : item
        ),
      }));

      const response = await api.sendToTorbox(magnetLink);

      set((state) => ({
        jobs: state.jobs.map((item) =>
          item.id === id
            ? {
                ...item,
                status: 'completed',
                progress: 100,
                importedPath: response.importedPath,
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

  enqueueFromMangadex: async ({ title, magnetLink }) => {
    const id = createJobId();
    const job: TorboxQueueItem = {
      id,
      title,
      source: 'mangadex',
      magnetLink,
      status: 'queued',
      progress: 0,
    };

    set((state) => ({
      jobs: [job, ...state.jobs],
      activeJobId: id,
    }));

    try {
      set((state) => ({
        jobs: state.jobs.map((item) =>
          item.id === id ? { ...item, status: 'verifying', progress: 10 } : item
        ),
      }));

      set((state) => ({
        jobs: state.jobs.map((item) =>
          item.id === id
            ? {
                ...item,
                status: 'downloading',
                progress: 35,
              }
            : item
        ),
      }));

      const response = await api.sendToTorbox(magnetLink);

      set((state) => ({
        jobs: state.jobs.map((item) =>
          item.id === id
            ? {
                ...item,
                status: 'completed',
                progress: 100,
                importedPath: response.importedPath,
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
