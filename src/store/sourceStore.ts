import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type SourceKind = 'manga' | 'books';
export type SourceStatus = 'active' | 'planned';
export type DebridProviderPreference = 'auto' | 'torbox';

export interface SourceConfig {
  id: string;
  name: string;
  kind: SourceKind;
  enabled: boolean;
  description: string;
  status: SourceStatus;
  implemented: boolean;
  torboxCompatible?: boolean;
  capabilities?: ('torbox' | 'direct' | 'metadata')[];
  website?: string;
}

const SOURCE_STORE_VERSION = 7;

const MANDATORY_SOURCE_IDS = new Set<string>();

function isMandatorySource(sourceId: string): boolean {
  return MANDATORY_SOURCE_IDS.has(sourceId);
}

const DEFAULT_SOURCES: SourceConfig[] = [
  {
    id: 'mangadex',
    name: 'MangaDex',
    kind: 'manga',
    enabled: false,
    description: 'Official API with huge catalog - Most reliable manga source.',
    status: 'active',
    implemented: true,
    torboxCompatible: false,
    capabilities: ['direct'],
    website: 'https://mangadex.org',
  },
  {
    id: 'toongod',
    name: 'ToonGod',
    kind: 'manga',
    enabled: false,
    description: 'Manhwa/Webtoons focus with large collection.',
    status: 'active',
    implemented: true,
    torboxCompatible: false,
    capabilities: ['direct'],
    website: 'https://www.toongod.org',
  },
  {
    id: 'manhwahub',
    name: 'ManhwaHub',
    kind: 'manga',
    enabled: false,
    description: 'Large library of manhwa titles.',
    status: 'active',
    implemented: true,
    torboxCompatible: false,
    capabilities: ['direct'],
    website: 'https://manhwahub.io',
  },
  {
    id: 'weebrook',
    name: 'Weebrook',
    kind: 'manga',
    enabled: false,
    description: 'Manhwa and webtoons from freeonlinek.top.',
    status: 'active',
    implemented: true,
    torboxCompatible: false,
    capabilities: ['direct'],
    website: 'https://freeonlinek.top',
  },
  {
    id: 'nyaa',
    name: 'Nyaa',
    kind: 'manga',
    enabled: false,
    description: 'Largest anime and manga torrent tracker. Recommended for Torbox users.',
    status: 'active',
    implemented: true,
    torboxCompatible: true,
    capabilities: ['torbox'],
    website: 'https://nyaa.si',
  },

  {
    id: 'gutenberg',
    name: 'Project Gutenberg',
    kind: 'books',
    enabled: false,
    description: 'Public domain library offering thousands of free EPUB books.',
    status: 'active',
    implemented: true,
    torboxCompatible: false,
    capabilities: ['direct', 'metadata'],
    website: 'https://gutenberg.org',
  },
  {
    id: 'libgen',
    name: 'LibGen',
    kind: 'books',
    enabled: false,
    description: 'Online library offering access to millions of books.',
    status: 'active',
    implemented: true,
    torboxCompatible: false,
    capabilities: ['direct', 'metadata'],
    website: 'https://libgen.li',
  },
  {
    id: 'torrent_csv',
    name: 'TorrentCSV',
    kind: 'books',
    enabled: false,
    description: 'A collaborative, open source torrent search engine.',
    status: 'active',
    implemented: true,
    torboxCompatible: true,
    capabilities: ['torbox'],
    website: 'https://torrentcsv.com',
  },
];

const DEFAULT_PRIMARY_SOURCE_BY_KIND: Record<SourceKind, string> = {
  books: 'gutenberg',
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
      enabled: source.implemented
        ? (isMandatorySource(source.id) ? true : Boolean(stored.enabled ?? source.enabled))
        : false,
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
  preferredDebridProvider: DebridProviderPreference;
  getSourcesByKind: (kind: SourceKind) => SourceConfig[];
  getEnabledSourcesByKind: (kind: SourceKind) => SourceConfig[];
  getPrimarySource: (kind: SourceKind) => SourceConfig | undefined;
  isSourceEnabled: (id: string) => boolean;
  toggleSource: (id: string) => void;
  setPrimarySource: (kind: SourceKind, id: string) => void;
  setPreferredDebridProvider: (provider: DebridProviderPreference) => void;
}

export const useSourceStore = create<SourceStore>()(
  persist(
    (set, get) => ({
      sources: DEFAULT_SOURCES,
      primarySourceByKind: DEFAULT_PRIMARY_SOURCE_BY_KIND,
      preferredDebridProvider: 'auto',
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
          if (!target || !target.implemented || isMandatorySource(id)) return state;

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
      setPreferredDebridProvider: (provider) =>
        set(() => ({
          preferredDebridProvider: provider,
        })),

    }),
    {
      name: 'shiori-source-store',
      version: SOURCE_STORE_VERSION,
      migrate: (persistedState) => {
        const typedPersisted = (persistedState ?? {}) as Partial<SourceStore>;
        const mergedSources = mergeSources(typedPersisted.sources as Partial<SourceConfig>[] | undefined);
        const mergedPrimary = {
          ...DEFAULT_PRIMARY_SOURCE_BY_KIND,
          ...(typedPersisted.primarySourceByKind ?? {}),
        } as Record<SourceKind, string>;

        return {
          ...typedPersisted,
          sources: mergedSources,
          primarySourceByKind: {
            books: normalizePrimarySource('books', mergedSources, mergedPrimary),
            manga: normalizePrimarySource('manga', mergedSources, mergedPrimary),
          },
          preferredDebridProvider: typedPersisted.preferredDebridProvider ?? 'auto',
        } as Partial<SourceStore>;
      },
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
