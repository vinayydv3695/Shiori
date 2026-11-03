import { create } from 'zustand';
import { api, type OfflineDictionary, type DictionaryResponse } from '@/lib/tauri';
import { useToastStore } from './toastStore';

interface DictionaryState {
  dictionaries: OfflineDictionary[];
  loading: boolean;
  error: string | null;

  loadDictionaries: () => Promise<void>;
  toggleDictionary: (id: number, enabled: boolean) => Promise<void>;
  deleteDictionary: (id: number) => Promise<void>;
  importDictionary: (filePath: string) => Promise<OfflineDictionary | null>;
  testLookup: (word: string, lang?: string) => Promise<DictionaryResponse | null>;
}

export const useDictionaryStore = create<DictionaryState>((set, get) => ({
  dictionaries: [],
  loading: false,
  error: null,

  loadDictionaries: async () => {
    set({ loading: true, error: null });
    try {
      const list = await api.getOfflineDictionaries();
      set({ dictionaries: list, loading: false });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg, loading: false });
    }
  },

  toggleDictionary: async (id: number, enabled: boolean) => {
    // Optimistic update
    set((state) => ({
      dictionaries: state.dictionaries.map((d) =>
        d.id === id ? { ...d, is_enabled: enabled } : d
      ),
    }));

    try {
      await api.toggleOfflineDictionary(id, enabled);
    } catch (err: unknown) {
      // Rollback on failure
      set((state) => ({
        dictionaries: state.dictionaries.map((d) =>
          d.id === id ? { ...d, is_enabled: !enabled } : d
        ),
      }));
      useToastStore.getState().addToast({
        title: 'Failed to update dictionary status',
        description: err instanceof Error ? err.message : String(err),
        variant: 'error',
      });
    }
  },

  deleteDictionary: async (id: number) => {
    const prev = get().dictionaries;
    set((state) => ({
      dictionaries: state.dictionaries.filter((d) => d.id !== id),
    }));

    try {
      await api.deleteOfflineDictionary(id);
      useToastStore.getState().addToast({
        title: 'Dictionary deleted',
        variant: 'success',
      });
    } catch (err: unknown) {
      set({ dictionaries: prev });
      useToastStore.getState().addToast({
        title: 'Failed to delete dictionary',
        description: err instanceof Error ? err.message : String(err),
        variant: 'error',
      });
    }
  },

  importDictionary: async (filePath: string) => {
    set({ loading: true, error: null });
    try {
      const imported = await api.importDictionary(filePath);
      set((state) => ({
        dictionaries: [...state.dictionaries.filter((d) => d.id !== imported.id), imported],
        loading: false,
      }));
      useToastStore.getState().addToast({
        title: `Imported "${imported.name}"`,
        description: `Successfully indexed ${imported.entry_count.toLocaleString()} entries`,
        variant: 'success',
      });
      return imported;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ error: msg, loading: false });
      useToastStore.getState().addToast({
        title: 'Failed to import dictionary',
        description: msg,
        variant: 'error',
      });
      return null;
    }
  },

  testLookup: async (word: string, lang = 'en') => {
    try {
      return await api.dictionaryLookup(word, lang);
    } catch {
      return null;
    }
  },
}));
