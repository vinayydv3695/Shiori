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

  setSelectedManga: (manga) => set({ selectedManga: manga, selectedPluginManga: null }),
  setSelectedPluginManga: (manga) => set({ selectedPluginManga: manga, selectedManga: null }),
  clearSelection: () => set({ selectedManga: null, selectedPluginManga: null }),
}));
