import { invoke } from '@tauri-apps/api/core';

export interface SyncDevice {
  ip: string;
  port: number;
  name: string;
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
   * Pairs and syncs with the desktop (Host) using the Rust backend.
   * This device acts as the "Client" (Android).
   */
  static async syncWithDesktop(ip: string, port: number, token: string): Promise<string> {
    return invoke('sync_with_desktop', { ip, port, token });
  }
}
