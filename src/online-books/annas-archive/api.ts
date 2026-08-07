import { pluginApi, SearchResponse } from '@/lib/pluginSources';

export async function fetchAnnasArchiveBooks(query: string, page: number = 1, limit: number = 20): Promise<SearchResponse> {
  return pluginApi.searchWithMeta('annas-archive', query, page, limit);
}
