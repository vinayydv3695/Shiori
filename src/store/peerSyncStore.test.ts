import { describe, it, expect, beforeEach, vi } from 'vitest';
import { usePeerSyncStore } from './peerSyncStore';
import { SyncClient } from '@/lib/sync';

vi.mock('@/lib/sync', () => ({
  SyncClient: {
    getServerStatus: vi.fn(),
    scanForCompanions: vi.fn(),
    syncWithCompanion: vi.fn(),
  },
}));

describe('usePeerSyncStore', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    usePeerSyncStore.setState({
      discoveredDevices: [],
      isScanning: false,
      isSyncing: false,
      savedHost: null,
      lastSyncedAt: null,
      lastSyncSummary: null,
      autoSyncEnabled: true,
      isHostServerRunning: false,
    });
  });

  it('initializes from localStorage with saved host', async () => {
    localStorage.setItem('sync_host_ip', '192.168.1.10');
    localStorage.setItem('sync_host_port', '8081');
    localStorage.setItem('sync_host_token', 'token-abc');
    localStorage.setItem('sync_host_name', 'My PC');
    localStorage.setItem('sync_last_synced_at', '2026-11-03T10:00:00Z');
    localStorage.setItem('shiori_peer_auto_sync', 'true');

    vi.mocked(SyncClient.getServerStatus).mockResolvedValue(true);

    await usePeerSyncStore.getState().initStore();

    const state = usePeerSyncStore.getState();
    expect(state.savedHost).toEqual({
      ip: '192.168.1.10',
      port: 8081,
      token: 'token-abc',
      name: 'My PC',
    });
    expect(state.lastSyncedAt).toBe('2026-11-03T10:00:00Z');
    expect(state.autoSyncEnabled).toBe(true);
    expect(state.isHostServerRunning).toBe(true);
  });

  it('scans for companion devices', async () => {
    const mockDevices = [
      { name: 'Living Room PC', ip: '192.168.1.105', port: 8081, os: 'linux' },
    ];
    vi.mocked(SyncClient.scanForCompanions).mockResolvedValue(mockDevices);

    const devices = await usePeerSyncStore.getState().scanDevices();

    expect(devices).toEqual(mockDevices);
    expect(usePeerSyncStore.getState().discoveredDevices).toEqual(mockDevices);
    expect(usePeerSyncStore.getState().isScanning).toBe(false);
  });

  it('performs sync and persists host info', async () => {
    const mockSummary = {
      sent_books: 2,
      sent_sessions: 4,
      received_books: 3,
      received_sessions: 6,
      message: 'Synced successfully',
      host_device_name: 'Desktop Server',
      timestamp: '2026-11-03T12:00:00Z',
    };
    vi.mocked(SyncClient.syncWithCompanion).mockResolvedValue(mockSummary);

    const result = await usePeerSyncStore
      .getState()
      .syncWithDevice('192.168.1.105', 8081, 'token-123', 'Desktop Server');

    expect(result).toEqual(mockSummary);
    expect(usePeerSyncStore.getState().lastSyncSummary).toEqual(mockSummary);
    expect(usePeerSyncStore.getState().lastSyncedAt).toBe('2026-11-03T12:00:00Z');
    expect(localStorage.getItem('sync_host_ip')).toBe('192.168.1.105');
    expect(localStorage.getItem('sync_host_token')).toBe('token-123');
  });

  it('toggles auto sync preference', () => {
    usePeerSyncStore.getState().setAutoSyncEnabled(false);
    expect(usePeerSyncStore.getState().autoSyncEnabled).toBe(false);
    expect(localStorage.getItem('shiori_peer_auto_sync')).toBe('false');

    usePeerSyncStore.getState().setAutoSyncEnabled(true);
    expect(usePeerSyncStore.getState().autoSyncEnabled).toBe(true);
    expect(localStorage.getItem('shiori_peer_auto_sync')).toBe('true');
  });
});
