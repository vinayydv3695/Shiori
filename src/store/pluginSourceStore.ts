import { create } from 'zustand';
import type { Chapter, SearchResult, SourceMeta } from '@/lib/pluginSources';

interface PluginSourceStore {
  sources: SourceMeta[];
  selectedSourceId: string | null;
  searchResults: SearchResult[];
  chapters: Chapter[];
  isLoading: boolean;
  error: string | null;
  apiKeys: Record<string, string>;
  setSources: (sources: SourceMeta[]) => void;
  selectSource: (sourceId: string | null) => void;
  setSearchResults: (results: SearchResult[]) => void;
  setChapters: (chapters: Chapter[]) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  setApiKey: (sourceId: string, apiKey: string) => void;
}

export const usePluginSourceStore = create<PluginSourceStore>((set) => ({
  sources: [],
  selectedSourceId: null,
  searchResults: [],
  chapters: [],
  isLoading: false,
  error: null,
  apiKeys: {},
  setSources: (sources) => set({ sources }),
  selectSource: (selectedSourceId) => set({ selectedSourceId }),
  setSearchResults: (searchResults) => set({ searchResults }),
  setChapters: (chapters) => set({ chapters }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  setApiKey: (sourceId, apiKey) =>
    set((state) => ({
      apiKeys: {
        ...state.apiKeys,
        [sourceId]: apiKey,
      },
    })),
}));
