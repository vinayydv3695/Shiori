import { create } from 'zustand';
import type { SourceKind } from './sourceStore';

type OnlineView = 'online-books' | 'online-manga' | 'torbox';

export interface OnlineAdvancedFilters {
  title?: string;
  author?: string;
  series?: string;
  yearStart?: number;
  yearEnd?: number;
  publisher?: string;
  language?: string;
  format?: 'epub' | 'pdf' | 'mobi' | 'azw3' | 'any';
  category?: 'fiction' | 'non-fiction' | 'any';
}

interface OnlineSearchStore {
  queries: Record<OnlineView, string>;
  filters: Record<OnlineView, OnlineAdvancedFilters>;
  setQuery: (view: OnlineView, query: string) => void;
  setFilters: (view: OnlineView, filters: OnlineAdvancedFilters) => void;
  setQueryForKind: (kind: SourceKind, query: string) => void;
  getQueryForKind: (kind: SourceKind) => string;
}

const VIEW_BY_KIND: Record<SourceKind, OnlineView> = {
  books: 'online-books',
  manga: 'online-manga',
};

export const useOnlineSearchStore = create<OnlineSearchStore>((set, get) => ({
  queries: {
    'online-books': '',
    'online-manga': '',
    'torbox': '',
  },
  filters: {
    'online-books': {},
    'online-manga': {},
    'torbox': {},
  },
  setQuery: (view, query) =>
    set((state) => ({
      queries: {
        ...state.queries,
        [view]: query,
      },
    })),
  setFilters: (view, filters) =>
    set((state) => ({
      filters: {
        ...state.filters,
        [view]: filters,
      },
    })),
  setQueryForKind: (kind, query) => {
    const view = VIEW_BY_KIND[kind];
    get().setQuery(view, query);
  },
  getQueryForKind: (kind) => {
    const view = VIEW_BY_KIND[kind];
    return get().queries[view] ?? '';
  },
}));
