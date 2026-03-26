import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type SourceKind = 'manga' | 'books';
export type SourceStatus = 'active' | 'planned';

export interface SourceConfig {
  id: string;
  name: string;
  kind: SourceKind;
  enabled: boolean;
  description: string;
  status: SourceStatus;
  implemented: boolean;
  website?: string;
}

const DEFAULT_SOURCES: SourceConfig[] = [
  {
    id: 'mangadex',
    name: 'MangaDex',
    kind: 'manga',
    enabled: true,
    description: 'Community manga catalog with chapter feeds.',
    status: 'active',
    implemented: true,
    website: 'https://mangadex.org',
  },
  {
    id: 'openlibrary',
    name: 'Open Library',
    kind: 'books',
    enabled: true,
    description: 'Public book metadata and lending links.',
    status: 'active',
    implemented: true,
    website: 'https://openlibrary.org',
  },
  {
    id: 'anna-archive',
    name: 'Anna’s Archive',
    kind: 'books',
    enabled: false,
    description: 'Planned integration for broader book discovery.',
    status: 'planned',
    implemented: false,
    website: 'https://annas-archive.org',
  },
  {
    id: 'mangapark',
    name: 'MangaPark (Planned)',
    kind: 'manga',
    enabled: false,
    description: 'Plugin-based source planned in next phase.',
    status: 'planned',
    implemented: false,
  },
  {
    id: 'toongod',
    name: 'ToonGod (Planned)',
    kind: 'manga',
    enabled: false,
    description: 'Plugin-based source planned in next phase.',
    status: 'planned',
    implemented: false,
  },
  {
    id: 'mangareader',
    name: 'MangaReader (Planned)',
    kind: 'manga',
    enabled: false,
    description: 'Plugin-based source planned in next phase.',
    status: 'planned',
    implemented: false,
  },
  {
    id: 'mangafire',
    name: 'MangaFire (Planned)',
    kind: 'manga',
    enabled: false,
    description: 'Plugin-based source planned in next phase.',
    status: 'planned',
    implemented: false,
  },
];

const DEFAULT_PRIMARY_SOURCE_BY_KIND: Record<SourceKind, string> = {
  books: 'openlibrary',
  manga: 'mangadex',
};

function mergeSources(persistedSources?: Partial<SourceConfig>[]): SourceConfig[] {
  if (!persistedSources || persistedSources.length === 0) {
    return DEFAULT_SOURCES;
  }

  return DEFAULT_SOURCES.map((source) => {
    const stored = persistedSources.find((item) => item.id === source.id);
    if (!stored) return source;

    return {
      ...source,
      enabled: source.implemented ? Boolean(stored.enabled ?? source.enabled) : false,
    };
  });
}

function normalizePrimarySource(
  kind: SourceKind,
  sources: SourceConfig[],
  primaryByKind: Record<SourceKind, string>
): string {
  const preferred = sources.find(
    (source) =>
      source.kind === kind &&
      source.id === primaryByKind[kind] &&
      source.enabled &&
      source.implemented
  );

  if (preferred) return preferred.id;

  return (
    sources.find((source) => source.kind === kind && source.enabled && source.implemented)?.id ??
    DEFAULT_PRIMARY_SOURCE_BY_KIND[kind]
  );
}

interface SourceStore {
  sources: SourceConfig[];
  primarySourceByKind: Record<SourceKind, string>;
  getSourcesByKind: (kind: SourceKind) => SourceConfig[];
  getEnabledSourcesByKind: (kind: SourceKind) => SourceConfig[];
  getPrimarySource: (kind: SourceKind) => SourceConfig | undefined;
  isSourceEnabled: (id: string) => boolean;
  toggleSource: (id: string) => void;
  setPrimarySource: (kind: SourceKind, id: string) => void;
}

export const useSourceStore = create<SourceStore>()(
  persist(
    (set, get) => ({
      sources: DEFAULT_SOURCES,
      primarySourceByKind: DEFAULT_PRIMARY_SOURCE_BY_KIND,
      getSourcesByKind: (kind) => get().sources.filter((source) => source.kind === kind),
      getEnabledSourcesByKind: (kind) =>
        get().sources.filter((source) => source.kind === kind && source.enabled && source.implemented),
      getPrimarySource: (kind) => {
        const state = get();
        const preferredId = state.primarySourceByKind[kind];
        const preferredSource = state.sources.find(
          (source) =>
            source.kind === kind &&
            source.id === preferredId &&
            source.enabled &&
            source.implemented
        );

        if (preferredSource) return preferredSource;

        return state.sources.find(
          (source) => source.kind === kind && source.enabled && source.implemented
        );
      },
      isSourceEnabled: (id) => get().sources.find((source) => source.id === id)?.enabled ?? false,
      toggleSource: (id) =>
        set((state) => {
          const target = state.sources.find((source) => source.id === id);
          if (!target || !target.implemented) return state;

          const nextSources = state.sources.map((source) =>
            source.id === id ? { ...source, enabled: !source.enabled } : source
          );

          const nextPrimary = { ...state.primarySourceByKind };
          const updatedTarget = nextSources.find((source) => source.id === id);

          if (!updatedTarget) {
            return { sources: nextSources, primarySourceByKind: nextPrimary };
          }

          const currentPrimary = nextPrimary[target.kind];
          const currentPrimaryIsValid = nextSources.some(
            (source) =>
              source.kind === target.kind &&
              source.id === currentPrimary &&
              source.enabled &&
              source.implemented
          );

          if (!currentPrimaryIsValid || (currentPrimary === updatedTarget.id && !updatedTarget.enabled)) {
            nextPrimary[target.kind] = normalizePrimarySource(target.kind, nextSources, nextPrimary);
          }

          return {
            sources: nextSources,
            primarySourceByKind: nextPrimary,
          };
        }),
      setPrimarySource: (kind, id) =>
        set((state) => {
          const candidate = state.sources.find(
            (source) =>
              source.kind === kind &&
              source.id === id &&
              source.enabled &&
              source.implemented
          );

          if (!candidate) return state;

          return {
            primarySourceByKind: {
              ...state.primarySourceByKind,
              [kind]: id,
            },
          };
        }),
    }),
    {
      name: 'shiori-source-store',
      version: 2,
      merge: (persistedState, currentState) => {
        const typedPersisted = (persistedState ?? {}) as Partial<SourceStore>;
        const mergedSources = mergeSources(typedPersisted.sources as Partial<SourceConfig>[] | undefined);
        const mergedPrimary = {
          ...DEFAULT_PRIMARY_SOURCE_BY_KIND,
          ...(typedPersisted.primarySourceByKind ?? {}),
        } as Record<SourceKind, string>;

        return {
          ...currentState,
          ...typedPersisted,
          sources: mergedSources,
          primarySourceByKind: {
            books: normalizePrimarySource('books', mergedSources, mergedPrimary),
            manga: normalizePrimarySource('manga', mergedSources, mergedPrimary),
          },
        } as SourceStore;
      },
    }
  )
);
