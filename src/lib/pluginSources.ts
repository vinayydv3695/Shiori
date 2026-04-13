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

export interface SearchResponse {
  items: SearchResult[];
  total?: number;
  offset?: number;
  limit?: number;
}

export interface Chapter {
  id: string;
  title: string;
  number?: number;
  volume?: string;
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

export type BrowseMode = 'popular' | 'latest' | 'recent' | 'top-rated';

export const pluginApi = {
  async listSources(): Promise<SourceMeta[]> {
    return invoke<SourceMeta[]>('list_sources');
  },

  async listByType(type: ContentType): Promise<SourceMeta[]> {
    return invoke<SourceMeta[]>('list_sources_by_type', { contentType: type });
  },

  async search(sourceId: string, query: string, page: number): Promise<SearchResult[]> {
    return invoke<SearchResult[]>('plugin_search', { sourceId, query, page });
  },

  async searchWithMeta(
    sourceId: string,
    query: string,
    page: number = 1,
    limit: number = 20
  ): Promise<SearchResponse> {
    return invoke<SearchResponse>('plugin_search_with_meta', { sourceId, query, page, limit });
  },

  async browse(sourceId: string, mode: BrowseMode, page: number = 1, limit: number = 20): Promise<SearchResult[]> {
    return invoke<SearchResult[]>('plugin_browse', { sourceId, mode, page, limit });
  },

  async getChapters(sourceId: string, contentId: string): Promise<Chapter[]> {
    return invoke<Chapter[]>('plugin_get_chapters', { sourceId, contentId });
  },

  async getPages(sourceId: string, chapterId: string): Promise<Page[]> {
    return invoke<Page[]>('plugin_get_pages', { sourceId, chapterId });
  },

  async downloadChapter(sourceId: string, chapterId: string, destDir?: string): Promise<string[]> {
    return invoke<string[]>('plugin_download_chapter', { sourceId, chapterId, destDir });
  },

  async setConfig(sourceId: string, key: string, value: string): Promise<boolean> {
    return invoke<boolean>('set_source_config', { sourceId, key, value });
  },
};
