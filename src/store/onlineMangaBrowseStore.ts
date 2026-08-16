import { create } from 'zustand';
import { MangaDexManga } from '@/hooks/useMangaDex';
import { SearchResult as PluginSearchResult } from '@/lib/pluginSources';

interface OnlineMangaBrowseState {
  selectedManga: MangaDexManga | null;
  selectedPluginManga: PluginSearchResult | null;
  
  setSelectedManga: (manga: MangaDexManga | null) => void;
  setSelectedPluginManga: (manga: PluginSearchResult | null) => void;
  clearSelection: () => void;
}

export const useOnlineMangaBrowseStore = create<OnlineMangaBrowseState>((set) => ({
  selectedManga: null,
  selectedPluginManga: null,

  setSelectedManga: (manga) =>
    set(
      manga
        ? { selectedManga: manga, selectedPluginManga: null }
        : { selectedManga: null },
    ),
  setSelectedPluginManga: (manga) =>
    set(
      manga
        ? { selectedPluginManga: manga, selectedManga: null }
        : { selectedPluginManga: null },
    ),
  clearSelection: () => set({ selectedManga: null, selectedPluginManga: null }),
}));
