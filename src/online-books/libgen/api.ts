import { pluginApi, SearchResponse } from '@/lib/pluginSources';

export async function fetchLibgenBooks(query: string, page: number = 1, limit: number = 75): Promise<SearchResponse> {
  return pluginApi.searchWithMeta('libgen', query, page, limit);
}
