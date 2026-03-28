import { invoke } from '@tauri-apps/api/core';

export type ContentType = 'Manga' | 'Book';

export interface SourceMeta {
  id: string;
  name: string;
  base_url: string;
  version: string;
  content_type: ContentType;
  supports_search: boolean;
  supports_download: boolean;
  requires_api_key: boolean;
  nsfw: boolean;
}

export interface SearchResult {
  id: string;
  title: string;
  cover_url?: string;
  coverUrl?: string;
  description?: string;
  summary?: string;
  source_id?: string;
  extra?: Record<string, unknown>;
  url?: string;
}

export interface Chapter {
  id: string;
  title: string;
  number?: number;
  url?: string;
  uploaded_at?: string;
  source_id?: string;
  content_id?: string;
}

export interface Page {
  index: number;
  url: string;
  imageUrl?: string;
  image_url?: string;
}

export const pluginApi = {
  async listSources(): Promise<SourceMeta[]> {
    return invoke<SourceMeta[]>('list_sources');
  },

  async listByType(type: ContentType): Promise<SourceMeta[]> {
    return invoke<SourceMeta[]>('list_sources_by_type', { content_type: type });
  },

  async search(source_id: string, query: string, page: number): Promise<SearchResult[]> {
    return invoke<SearchResult[]>('plugin_search', { source_id, query, page });
  },

  async getChapters(source_id: string, content_id: string): Promise<Chapter[]> {
    return invoke<Chapter[]>('plugin_get_chapters', { source_id, content_id });
  },

  async getPages(source_id: string, content_id: string, chapter_id: string): Promise<Page[]> {
    return invoke<Page[]>('plugin_get_pages', { source_id, content_id, chapter_id });
  },

  async downloadChapter(source_id: string, chapter_id: string, dest_dir?: string): Promise<string[]> {
    return invoke<string[]>('plugin_download_chapter', { source_id, chapter_id, dest_dir });
  },

  async setConfig(source_id: string, key: string, value: string): Promise<boolean> {
    return invoke<boolean>('set_source_config', { source_id, key, value });
  },
};
