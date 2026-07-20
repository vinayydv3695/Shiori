import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { updateMediaListEntry } from '@/lib/anilist';

export interface OfflineSyncAction {
  id: string;
  mediaId: number;
  chapterNum: number;
  status: string;
  score?: number;
  notes?: string;
  timestamp: number;
}

interface OfflineSyncState {
  syncQueue: OfflineSyncAction[];
  isSyncing: boolean;
  addSyncAction: (action: Omit<OfflineSyncAction, 'id' | 'timestamp'>) => void;
  removeSyncAction: (id: string) => void;
  processQueue: (token: string) => Promise<void>;
}

export const useOfflineSyncStore = create<OfflineSyncState>()(
  persist(
    (set, get) => ({
      syncQueue: [],
      isSyncing: false,
      
      addSyncAction: (action) => {
        const newAction: OfflineSyncAction = {
          ...action,
          id: Math.random().toString(36).substring(2, 9) + Date.now().toString(36),
          timestamp: Date.now(),
        };
        
        // Remove any existing actions for this same mediaId to only keep the latest
        set((state) => ({
          syncQueue: [
            ...state.syncQueue.filter(a => a.mediaId !== action.mediaId),
            newAction
          ]
        }));
      },
      
      removeSyncAction: (id) => {
        set((state) => ({
          syncQueue: state.syncQueue.filter(a => a.id !== id)
        }));
      },
      
      processQueue: async (token: string) => {
        const { syncQueue, isSyncing, removeSyncAction } = get();
        if (isSyncing || syncQueue.length === 0 || !token) return;
        
        set({ isSyncing: true });
        
        // Sort by timestamp so older actions are processed first, but we already deduped by mediaId so it should be fine.
        const queue = [...syncQueue].sort((a, b) => a.timestamp - b.timestamp);
        
        try {
          for (const action of queue) {
            try {
              await updateMediaListEntry(
                action.mediaId, 
                action.chapterNum, 
                action.status, 
                token, 
                action.score, 
                action.notes
              );
              // Success! Remove from queue
              removeSyncAction(action.id);
            } catch (err) {
              console.warn(`Failed to process offline sync action for mediaId ${action.mediaId}:`, err);
              // Break early on network errors to avoid spamming failed requests
              break; 
            }
          }
        } finally {
          set({ isSyncing: false });
        }
      }
    }),
    {
      name: 'shiori-offline-sync',
    }
  )
);
