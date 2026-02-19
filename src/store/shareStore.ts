import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

export interface Share {
  id: number;
  book_id: number;
  token: string;
  password_hash: string | null;
  expires_at: string;
  max_downloads: number | null;
  download_count: number;
  is_active: boolean;
  created_at: string;
}

export interface ShareResponse {
  token: string;
  url: string;
  qr_code_svg: string;
  expires_at: string;
}

interface ShareState {
  shares: Share[];
  serverRunning: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  loadShares: (bookId?: number) => Promise<void>;
  createShare: (
    bookId: number, 
    password?: string, 
    expiresInHours?: number, 
    maxDownloads?: number
  ) => Promise<ShareResponse>;
  revokeShare: (token: string) => Promise<void>;
  checkServerStatus: () => Promise<void>;
  startServer: () => Promise<void>;
  stopServer: () => Promise<void>;
  cleanupExpired: () => Promise<number>;
}

export const useShareStore = create<ShareState>((set, get) => ({
  shares: [],
  serverRunning: false,
  isLoading: false,
  error: null,

  loadShares: async (bookId?: number) => {
    try {
      set({ isLoading: true, error: null });
      const shares = await invoke<Share[]>('list_book_shares', { 
        bookId: bookId || null 
      });
      set({ shares, isLoading: false });
    } catch (error) {
      console.error('Failed to load shares:', error);
      set({ error: String(error), isLoading: false });
    }
  },

  createShare: async (
    bookId: number, 
    password?: string, 
    expiresInHours = 24, 
    maxDownloads?: number
  ) => {
    try {
      set({ isLoading: true, error: null });
      const response = await invoke<ShareResponse>('create_book_share', {
        bookId,
        password: password || null,
        expiresInHours,
        maxDownloads: maxDownloads || null,
      });
      
      // Reload shares
      await get().loadShares(bookId);
      set({ isLoading: false });
      
      return response;
    } catch (error) {
      console.error('Failed to create share:', error);
      set({ error: String(error), isLoading: false });
      throw error;
    }
  },

  revokeShare: async (token: string) => {
    try {
      await invoke('revoke_share', { token });
      
      // Remove from local state
      set(state => ({
        shares: state.shares.map(s => 
          s.token === token ? { ...s, is_active: false } : s
        )
      }));
    } catch (error) {
      console.error('Failed to revoke share:', error);
      set({ error: String(error) });
      throw error;
    }
  },

  checkServerStatus: async () => {
    try {
      const running = await invoke<boolean>('is_share_server_running');
      set({ serverRunning: running });
    } catch (error) {
      console.error('Failed to check server status:', error);
      set({ error: String(error) });
    }
  },

  startServer: async () => {
    try {
      set({ isLoading: true, error: null });
      await invoke('start_share_server');
      set({ serverRunning: true, isLoading: false });
    } catch (error) {
      console.error('Failed to start share server:', error);
      set({ error: String(error), isLoading: false });
      throw error;
    }
  },

  stopServer: async () => {
    try {
      set({ isLoading: true, error: null });
      await invoke('stop_share_server');
      set({ serverRunning: false, isLoading: false });
    } catch (error) {
      console.error('Failed to stop share server:', error);
      set({ error: String(error), isLoading: false });
      throw error;
    }
  },

  cleanupExpired: async () => {
    try {
      const count = await invoke<number>('cleanup_expired_shares');
      
      // Reload shares
      await get().loadShares();
      
      return count;
    } catch (error) {
      console.error('Failed to cleanup expired shares:', error);
      set({ error: String(error) });
      return 0;
    }
  },
}));
