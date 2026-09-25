import { invoke } from '@tauri-apps/api/core';

export type ExtensionContentType = 'manga' | 'book';

export interface ExtensionInfo {
  id: string;
  name: string;
  version: string;
  lang?: string | null;
  baseUrl?: string | null;
  contentType: ExtensionContentType;
  nsfw: boolean;
  minAppVersion?: string | null;
  enabled: boolean;
}

export interface RepoEntry {
  id: string;
  name: string;
  lang?: string | null;
  version: string;
  minAppVersion?: string | null;
  iconUrl?: string | null;
  downloadUrl: string;
  nsfw: boolean;
  sha256?: string | null;
  contentType: ExtensionContentType;
}

export const extensionsApi = {
  async list(): Promise<ExtensionInfo[]> {
    return invoke<ExtensionInfo[]>('extension_list');
  },

  async installLocal(wasmPath: string): Promise<ExtensionInfo> {
    return invoke<ExtensionInfo>('extension_install_local', { wasmPath });
  },

  async remove(id: string): Promise<void> {
    return invoke<void>('extension_remove', { id });
  },

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    return invoke<void>('extension_set_enabled', { id, enabled });
  },

  async repoList(repoUrl?: string): Promise<RepoEntry[]> {
    return invoke<RepoEntry[]>('extension_repo_list', repoUrl ? { repoUrl } : {});
  },

  async installFromRepo(id: string, repoUrl?: string): Promise<ExtensionInfo> {
    return invoke<ExtensionInfo>('extension_install_from_repo', repoUrl ? { repoUrl, id } : { id });
  },

  async checkUpdates(repoUrl?: string): Promise<RepoEntry[]> {
    return invoke<RepoEntry[]>('extension_check_updates', repoUrl ? { repoUrl } : {});
  },

  async update(id: string, repoUrl?: string): Promise<ExtensionInfo> {
    return invoke<ExtensionInfo>('extension_update', repoUrl ? { repoUrl, id } : { id });
  },
};