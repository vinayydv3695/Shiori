import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { listen } from '@tauri-apps/api/event';
import { useDownloadQueueUI } from '@/components/online/DownloadQueuePanel';
import { useToastStore } from './toastStore';

export interface DownloadProgress {
  target_id: string; // url or id
  status: 'downloading' | 'completed' | 'error';
  downloaded_bytes: number;
  total_bytes: number | null;
  /** Optional human-readable title, registered by the frontend when a download starts. */
  title?: string;
  /** Measurement unit, e.g. 'bytes' (default) or 'pages' for manga */
  unit?: 'bytes' | 'pages';
}

interface OnlineDownloadStore {
  downloads: Record<string, DownloadProgress>;
  setDownload: (id: string, progress: DownloadProgress) => void;
  /** Remember the book title for a target id (merged, never clobbers progress). */
  registerDownload: (id: string, title: string, unit?: 'bytes' | 'pages') => void;
  clearDownload: (id: string) => void;
  initializeListeners: () => void;
}

let listenersInitialized = false;

export const useOnlineDownloadStore = create<OnlineDownloadStore>()(
  persist(
    (set) => ({
      downloads: {},
      setDownload: (id, progress) =>
        set((state) => ({
          downloads: {
            ...state.downloads,
            [id]: progress,
          },
        })),
      registerDownload: (id, title, unit = 'bytes') =>
        set((state) => {
          const existing = state.downloads[id];
          if (!existing || existing.status !== 'downloading') {
            setTimeout(() => {
              useToastStore.getState().addToast({
                title: `Started downloading "${title}"`,
                description: 'Track download progress in your queue.',
                variant: 'info',
                duration: 5000,
                action: {
                  label: 'View Queue',
                  onClick: () => useDownloadQueueUI.getState().setOpen(true),
                },
              });
            }, 0);
          }
          return {
            downloads: {
              ...state.downloads,
              [id]: existing
                ? { ...existing, title, unit }
                : {
                    target_id: id,
                    status: 'downloading',
                    downloaded_bytes: 0,
                    total_bytes: null,
                    title,
                    unit,
                  },
            },
          };
        }),
      clearDownload: (id) =>
        set((state) => {
          const newDownloads = { ...state.downloads };
          delete newDownloads[id];
          return { downloads: newDownloads };
        }),
      initializeListeners: () => {
        if (listenersInitialized) return;
        listenersInitialized = true;

        // Clean up any stale active downloads on app launch if the app was restarted mid-download
        set((state) => {
          let hasStale = false;
          const updated = { ...state.downloads };
          for (const [id, item] of Object.entries(updated)) {
            if (item.status === 'downloading') {
              hasStale = true;
              updated[id] = { ...item, status: 'error' };
            }
          }
          return hasStale ? { downloads: updated } : state;
        });

        listen<DownloadProgress>('online-book-download-progress', (event) => {
          const payload = event.payload;
          set((state) => ({
            downloads: {
              ...state.downloads,
              [payload.target_id]: {
                ...payload,
                title: state.downloads[payload.target_id]?.title || payload.title,
                unit: 'bytes',
              },
            },
          }));
        });

        listen<{
          chapter_id: string;
          chapter_title: string;
          pages_downloaded: number;
          total_pages: number;
        }>('online-manga-download-progress', (event) => {
          const payload = event.payload;
          const isDone = payload.pages_downloaded >= payload.total_pages && payload.total_pages > 0;
          set((state) => {
            const currentItem = state.downloads[payload.chapter_id];
            return {
              downloads: {
                ...state.downloads,
                [payload.chapter_id]: {
                  target_id: payload.chapter_id,
                  status: isDone ? 'completed' : 'downloading',
                  downloaded_bytes: payload.pages_downloaded,
                  total_bytes: payload.total_pages,
                  title: currentItem?.title || payload.chapter_title,
                  unit: 'pages',
                },
              },
            };
          });
        });
      },
    }),
    {
      name: 'shiori_online_downloads',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
