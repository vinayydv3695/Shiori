import { create } from 'zustand';
import { SyncClient, CompanionInstance, SyncResultSummary } from '@/lib/sync';
import { useLibraryStore } from '@/store/libraryStore';
import { toast } from '@/store/toastStore';

interface SavedHost {
  ip: string;
  port: number;
  token: string;
  name?: string;
}

interface PeerSyncState {
  discoveredDevices: CompanionInstance[];
  isScanning: boolean;
  isSyncing: boolean;
  savedHost: SavedHost | null;
  lastSyncedAt: string | null;
  lastSyncSummary: SyncResultSummary | null;
  autoSyncEnabled: boolean;
  isHostServerRunning: boolean;

  // Actions
  initStore: () => Promise<void>;
  scanDevices: () => Promise<CompanionInstance[]>;
  syncWithDevice: (ip: string, port: number, token: string, name?: string) => Promise<SyncResultSummary>;
  syncWithSavedHost: () => Promise<SyncResultSummary | null>;
  setAutoSyncEnabled: (enabled: boolean) => void;
  autoResumeSync: () => Promise<void>;
  checkServerStatus: () => Promise<boolean>;
}

export const usePeerSyncStore = create<PeerSyncState>((set, get) => ({
  discoveredDevices: [],
  isScanning: false,
  isSyncing: false,
  savedHost: null,
  lastSyncedAt: null,
  lastSyncSummary: null,
  autoSyncEnabled: true,
  isHostServerRunning: false,

  initStore: async () => {
    try {
      const ip = localStorage.getItem('sync_host_ip');
      const portStr = localStorage.getItem('sync_host_port');
      const token = localStorage.getItem('sync_host_token');
      const name = localStorage.getItem('sync_host_name') || undefined;
      const lastSync = localStorage.getItem('sync_last_synced_at');
      const autoSyncPref = localStorage.getItem('shiori_peer_auto_sync');

      const savedHost = ip && token ? { ip, port: portStr ? parseInt(portStr, 10) : 8081, token, name } : null;
      const autoSyncEnabled = autoSyncPref !== null ? autoSyncPref === 'true' : true;

      set({
        savedHost,
        lastSyncedAt: lastSync,
        autoSyncEnabled,
      });

      // Check host server status
      try {
        const running = await SyncClient.getServerStatus();
        set({ isHostServerRunning: running });
      } catch {
        // Ignored on platforms without managed server
      }
    } catch (e) {
      console.warn('Failed to initialize peer sync store:', e);
    }
  },

  checkServerStatus: async () => {
    try {
      const running = await SyncClient.getServerStatus();
      set({ isHostServerRunning: running });
      return running;
    } catch {
      return false;
    }
  },

  scanDevices: async () => {
    set({ isScanning: true });
    try {
      const devices = await SyncClient.scanForCompanions();
      set({ discoveredDevices: devices });
      return devices;
    } catch (e) {
      console.error('Failed to scan for companion devices:', e);
      return [];
    } finally {
      set({ isScanning: false });
    }
  },

  syncWithDevice: async (ip: string, port: number, token: string, name?: string) => {
    if (!token) {
      throw new Error('Pairing token is required');
    }

    set({ isSyncing: true });
    try {
      const summary = await SyncClient.syncWithCompanion(ip, port, token);

      // Persist paired host info
      const hostInfo: SavedHost = { ip, port, token, name: summary.host_device_name || name };
      localStorage.setItem('sync_host_ip', ip);
      localStorage.setItem('sync_host_port', port.toString());
      localStorage.setItem('sync_host_token', token);
      if (hostInfo.name) {
        localStorage.setItem('sync_host_name', hostInfo.name);
      }
      localStorage.setItem('sync_last_synced_at', summary.timestamp);

      set({
        savedHost: hostInfo,
        lastSyncedAt: summary.timestamp,
        lastSyncSummary: summary,
      });

      // Refresh library to instantly reflect updated reading progress and streaks
      void useLibraryStore.getState().refreshLibrary();

      toast.success(
        `Synced with ${summary.host_device_name || 'companion'}! ${summary.received_books} books & ${summary.received_sessions} sessions updated.`
      );

      return summary;
    } catch (e: any) {
      const msg = typeof e === 'string' ? e : e?.message || 'Sync failed';
      toast.error(msg);
      throw e;
    } finally {
      set({ isSyncing: false });
    }
  },

  syncWithSavedHost: async () => {
    const { savedHost, syncWithDevice } = get();
    if (!savedHost) {
      toast.error('No paired companion device configured.');
      return null;
    }
    return syncWithDevice(savedHost.ip, savedHost.port, savedHost.token, savedHost.name);
  },

  setAutoSyncEnabled: (enabled: boolean) => {
    localStorage.setItem('shiori_peer_auto_sync', String(enabled));
    set({ autoSyncEnabled: enabled });
  },

  autoResumeSync: async () => {
    const { autoSyncEnabled, savedHost, isSyncing } = get();
    if (!autoSyncEnabled || !savedHost || isSyncing) {
      return;
    }

    try {
      const summary = await SyncClient.syncWithCompanion(savedHost.ip, savedHost.port, savedHost.token);
      localStorage.setItem('sync_last_synced_at', summary.timestamp);
      set({
        lastSyncedAt: summary.timestamp,
        lastSyncSummary: summary,
      });

      void useLibraryStore.getState().refreshLibrary();

      if (summary.received_books > 0 || summary.received_sessions > 0) {
        toast.info(`Auto-resume synced with ${summary.host_device_name}: reading progress updated.`);
      }
    } catch (e) {
      // Background auto-sync fails quietly when device is not on the same Wi-Fi
      console.debug('Background auto-resume sync not reachable right now');
    }
  },
}));
