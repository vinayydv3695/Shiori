import { invoke } from '@tauri-apps/api/core';

export interface CompanionInstance {
  name: string;
  ip: string;
  port: number;
  os?: string;
}

export interface SyncResultSummary {
  sent_books: number;
  sent_sessions: number;
  received_books: number;
  received_sessions: number;
  message: string;
  host_device_name: string;
  timestamp: string;
}

export class SyncClient {
  /**
   * Generates or retrieves the current device's pairing token.
   * Useful when this device acts as the "Host" (Desktop).
   */
  static async getPairingToken(): Promise<string> {
    return invoke('get_sync_pairing_token');
  }

  /**
   * Rotates the pairing token on this device.
   */
  static async rotatePairingToken(): Promise<string> {
    return invoke('rotate_sync_pairing_token');
  }

  /**
   * Starts the sync server on this device.
   */
  static async startServer(): Promise<void> {
    return invoke('start_sync_server');
  }

  /**
   * Stops the sync server on this device.
   */
  static async stopServer(): Promise<void> {
    return invoke('stop_sync_server');
  }

  /**
   * Checks if the sync server is currently running.
   */
  static async getServerStatus(): Promise<boolean> {
    return invoke('get_sync_server_status');
  }

  /**
   * Scans the local network for other Shiori companion devices via mDNS.
   */
  static async scanForCompanions(): Promise<CompanionInstance[]> {
    return invoke('scan_for_companions');
  }

  /**
   * Bi-directional LocalSend-style P2P sync with another companion device.
   * Exchanges reading progress, bookmarks, and streaks/sessions in a single roundtrip.
   */
  static async syncWithCompanion(
    ip: string,
    port: number,
    token: string,
    since?: string
  ): Promise<SyncResultSummary> {
    return invoke('sync_with_companion', { ip, port, token, since });
  }

  /**
   * Pairs and syncs with the desktop (Host) using the Rust backend.
   */
  static async syncWithDesktop(ip: string, port: number, token: string): Promise<string> {
    return invoke('sync_with_desktop', { ip, port, token });
  }
}
