import { create } from 'zustand';
import type { SourceKind } from './sourceStore';

type OnlineView = 'online-books' | 'online-manga' | 'torbox';

interface OnlineSearchStore {
  queries: Record<OnlineView, string>;
  setQuery: (view: OnlineView, query: string) => void;
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
  setQuery: (view, query) =>
    set((state) => ({
      queries: {
        ...state.queries,
        [view]: query,
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
