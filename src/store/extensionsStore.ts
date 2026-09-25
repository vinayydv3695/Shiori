import { create } from 'zustand';
import { extensionsApi, type ExtensionInfo, type RepoEntry } from '@/lib/extensions';
import { getErrorMessage } from '@/lib/errors';
import { logger } from '@/lib/logger';

interface ExtensionsStore {
  installed: ExtensionInfo[];
  repo: RepoEntry[];
  updates: RepoEntry[];
  isLoading: boolean;
  error: string | null;
  actionId: string | null;
  loadInstalled: () => Promise<void>;
  loadRepo: () => Promise<void>;
  installLocal: (wasmPath: string) => Promise<void>;
  installFromRepo: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setEnabled: (id: string, enabled: boolean) => Promise<void>;
  checkUpdates: () => Promise<void>;
  update: (id: string) => Promise<void>;
  clearError: () => void;
}

function toError(context: string, err: unknown): string {
  logger.error(context, err);
  return getErrorMessage(err);
}

async function refreshInstalled(set: (partial: Partial<ExtensionsStore>) => void): Promise<void> {
  const installed = await extensionsApi.list();
  set({ installed });
}

export const useExtensionsStore = create<ExtensionsStore>((set) => ({
  installed: [],
  repo: [],
  updates: [],
  isLoading: false,
  error: null,
  actionId: null,

  loadInstalled: async () => {
    try {
      set({ isLoading: true, error: null });
      await refreshInstalled(set);
      set({ isLoading: false });
    } catch (err) {
      set({ isLoading: false, error: toError('[extensions] list failed', err) });
    }
  },

  loadRepo: async () => {
    try {
      set({ isLoading: true, error: null });
      const repo = await extensionsApi.repoList();
      set({ repo, isLoading: false });
    } catch (err) {
      set({ isLoading: false, error: toError('[extensions] repo list failed', err) });
    }
  },

  installLocal: async (wasmPath) => {
    try {
      set({ actionId: '__local__', error: null });
      await extensionsApi.installLocal(wasmPath);
      await refreshInstalled(set);
      set({ actionId: null });
    } catch (err) {
      set({ actionId: null, error: toError('[extensions] local install failed', err) });
    }
  },

  installFromRepo: async (id) => {
    try {
      set({ actionId: id, error: null });
      await extensionsApi.installFromRepo(id);
      await refreshInstalled(set);
      set({ actionId: null });
    } catch (err) {
      set({ actionId: null, error: toError(`[extensions] install "${id}" failed`, err) });
    }
  },

  remove: async (id) => {
    try {
      set({ actionId: id, error: null });
      await extensionsApi.remove(id);
      await refreshInstalled(set);
      set({ actionId: null });
    } catch (err) {
      set({ actionId: null, error: toError(`[extensions] remove "${id}" failed`, err) });
    }
  },

  setEnabled: async (id, enabled) => {
    try {
      set({ actionId: id, error: null });
      await extensionsApi.setEnabled(id, enabled);
      await refreshInstalled(set);
      set({ actionId: null });
    } catch (err) {
      set({ actionId: null, error: toError(`[extensions] toggle "${id}" failed`, err) });
    }
  },

  checkUpdates: async () => {
    try {
      set({ isLoading: true, error: null });
      const updates = await extensionsApi.checkUpdates();
      set({ updates, isLoading: false });
    } catch (err) {
      set({ isLoading: false, error: toError('[extensions] update check failed', err) });
    }
  },

  update: async (id) => {
    try {
      set({ actionId: id, error: null });
      await extensionsApi.update(id);
      await refreshInstalled(set);
      set({ actionId: null });
    } catch (err) {
      set({ actionId: null, error: toError(`[extensions] update "${id}" failed`, err) });
    }
  },

  clearError: () => set({ error: null }),
}));