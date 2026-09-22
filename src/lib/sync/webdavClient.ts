/**
 * WebDAV Sync Client for Shiori
 * Synchronizes reading progress, bookmarks, and annotations across desktop and Android.
 */

import { logger } from '../logger';

export interface WebDAVConfig {
  url: string; // e.g. https://my-nextcloud.com/remote.php/dav/files/user/
  username: string;
  password?: string;
  syncFolder?: string; // e.g. /ShioriSync/
}

export interface ShioriSyncPayload {
  version: number;
  timestamp: number;
  deviceId: string;
  progressList: Array<{
    bookId: number;
    currentPage: number;
    progressPercent: number;
    lastRead: string;
  }>;
  bookmarks: Array<{
    bookId: number;
    location: string;
    chapterTitle?: string;
    createdAt: string;
  }>;
  shelves?: Array<{
    id: number;
    name: string;
    bookIds: number[];
  }>;
}

function getAuthHeader(config: WebDAVConfig): string {
  const creds = `${config.username}:${config.password || ''}`;
  return `Basic ${btoa(creds)}`;
}

function normalizeUrl(url: string, path: string): string {
  const base = url.replace(/\/$/, '');
  const cleanPath = path.replace(/^\//, '');
  return `${base}/${cleanPath}`;
}

export class WebDAVClient {
  /**
   * Tests connection to the remote WebDAV endpoint using a PROPFIND request.
   */
  static async testConnection(config: WebDAVConfig): Promise<{ ok: boolean; status: number; message: string }> {
    try {
      const url = normalizeUrl(config.url, config.syncFolder || '/');
      const response = await fetch(url, {
        method: 'PROPFIND',
        headers: {
          Authorization: getAuthHeader(config),
          Depth: '0',
        },
      });

      if (response.ok || response.status === 207 || response.status === 404) {
        return { ok: true, status: response.status, message: 'WebDAV connection verified successfully.' };
      }
      return { ok: false, status: response.status, message: `Server returned HTTP ${response.status}: ${response.statusText}` };
    } catch (err: any) {
      return { ok: false, status: 0, message: err?.message || 'Network error reaching WebDAV server' };
    }
  }

  /**
   * Ensures the target directory exists on the WebDAV server (MKCOL).
   */
  static async ensureFolder(config: WebDAVConfig): Promise<void> {
    if (!config.syncFolder || config.syncFolder === '/') return;
    try {
      const folderUrl = normalizeUrl(config.url, config.syncFolder);
      await fetch(folderUrl, {
        method: 'MKCOL',
        headers: {
          Authorization: getAuthHeader(config),
        },
      });
    } catch {
      // Ignore if folder already exists
    }
  }

  /**
   * Uploads sync state to WebDAV as `shiori-sync.json`.
   */
  static async uploadPayload(config: WebDAVConfig, payload: ShioriSyncPayload): Promise<void> {
    await this.ensureFolder(config);

    const folder = config.syncFolder ? config.syncFolder.replace(/\/$/, '') : '';
    const fileUrl = normalizeUrl(config.url, `${folder}/shiori-sync.json`);

    const jsonStr = JSON.stringify(payload, null, 2);

    const response = await fetch(fileUrl, {
      method: 'PUT',
      headers: {
        Authorization: getAuthHeader(config),
        'Content-Type': 'application/json',
      },
      body: jsonStr,
    });

    if (!response.ok && response.status !== 201 && response.status !== 204) {
      throw new Error(`Failed to upload sync file to WebDAV (${response.status}): ${response.statusText}`);
    }
  }

  /**
   * Downloads remote `shiori-sync.json` from WebDAV.
   */
  static async downloadPayload(config: WebDAVConfig): Promise<ShioriSyncPayload | null> {
    const folder = config.syncFolder ? config.syncFolder.replace(/\/$/, '') : '';
    const fileUrl = normalizeUrl(config.url, `${folder}/shiori-sync.json`);

    const response = await fetch(fileUrl, {
      method: 'GET',
      headers: {
        Authorization: getAuthHeader(config),
      },
    });

    if (response.status === 404) {
      return null; // File does not exist yet
    }

    if (!response.ok) {
      throw new Error(`Failed to download sync file from WebDAV (${response.status}): ${response.statusText}`);
    }

    return (await response.json()) as ShioriSyncPayload;
  }
}
