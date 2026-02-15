import { create } from 'zustand';

export interface SmartRule {
  field: string; // "author", "tag", "format", "rating", "series", "added_date"
  operator: string; // "equals", "contains", "greater_than", "less_than", "in_last"
  value: string;
  matchType: string; // "all" or "any"
}

export interface Collection {
  id?: number;
  name: string;
  description?: string;
  parentId?: number;
  isSmart: boolean;
  smartRules?: string; // JSON string of SmartRule[]
  icon?: string;
  color?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  bookCount?: number;
  children: Collection[];
}

interface CollectionState {
  collections: Collection[];
  selectedCollection: Collection | null;
  isLoading: boolean;
  
  // Actions
  setCollections: (collections: Collection[]) => void;
  addCollection: (collection: Collection) => void;
  updateCollection: (id: number, collection: Partial<Collection>) => void;
  removeCollection: (id: number) => void;
  selectCollection: (collection: Collection | null) => void;
  setLoading: (isLoading: boolean) => void;
}

export const useCollectionStore = create<CollectionState>((set) => ({
  collections: [],
  selectedCollection: null,
  isLoading: false,

  setCollections: (collections) => set({ collections }),

  addCollection: (collection) =>
    set((state) => ({
      collections: [...state.collections, collection],
    })),

  updateCollection: (id, updatedCollection) =>
    set((state) => ({
      collections: state.collections.map((c) =>
        c.id === id ? { ...c, ...updatedCollection } : c
      ),
    })),

  removeCollection: (id) =>
    set((state) => ({
      collections: state.collections.filter((c) => c.id !== id),
      selectedCollection:
        state.selectedCollection?.id === id ? null : state.selectedCollection,
    })),

  selectCollection: (collection) => set({ selectedCollection: collection }),

  setLoading: (isLoading) => set({ isLoading }),
}));
