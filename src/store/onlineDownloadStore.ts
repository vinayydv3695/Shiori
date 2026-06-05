import { create } from 'zustand';
import { listen } from '@tauri-apps/api/event';

export interface DownloadProgress {
  target_id: string; // url or id
  status: 'downloading' | 'completed' | 'error';
  downloaded_bytes: number;
  total_bytes: number | null;
}

interface OnlineDownloadStore {
  downloads: Record<string, DownloadProgress>;
  setDownload: (id: string, progress: DownloadProgress) => void;
  clearDownload: (id: string) => void;
  initializeListeners: () => void;
}

let listenersInitialized = false;

export const useOnlineDownloadStore = create<OnlineDownloadStore>((set) => ({
  downloads: {},
  setDownload: (id, progress) =>
    set((state) => ({
      downloads: {
        ...state.downloads,
        [id]: progress,
      },
    })),
  clearDownload: (id) =>
    set((state) => {
      const newDownloads = { ...state.downloads };
      delete newDownloads[id];
      return { downloads: newDownloads };
    }),
  initializeListeners: () => {
    if (listenersInitialized) return;
    listenersInitialized = true;
    
    listen<DownloadProgress>('online-book-download-progress', (event) => {
      const payload = event.payload;
      set((state) => ({
        downloads: {
          ...state.downloads,
          [payload.target_id]: payload,
        },
      }));
      
      if (payload.status === 'completed' || payload.status === 'error') {
        setTimeout(() => {
          set((state) => {
            const newDownloads = { ...state.downloads };
            delete newDownloads[payload.target_id];
            return { downloads: newDownloads };
          });
        }, 3000); // clear after 3 seconds
      }
    });
  },
}));
