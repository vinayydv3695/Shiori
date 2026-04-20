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
  website?: string;
}

const SOURCE_STORE_VERSION = 5;

const MANDATORY_SOURCE_IDS = new Set(['mangadex', 'anna-archive']);

function isMandatorySource(sourceId: string): boolean {
  return MANDATORY_SOURCE_IDS.has(sourceId);
}

const DEFAULT_SOURCES: SourceConfig[] = [
  {
    id: 'mangadex',
    name: 'MangaDex',
    kind: 'manga',
    enabled: true,
    description: 'Official API with huge catalog - Most reliable manga source.',
    status: 'active',
    implemented: true,
    torboxCompatible: false,
    website: 'https://mangadex.org',
  },
  {
    id: 'toongod',
    name: 'ToonGod',
    kind: 'manga',
    enabled: true,
    description: 'Manhwa/Webtoons focus with large collection.',
    status: 'active',
    implemented: true,
    torboxCompatible: false,
    website: 'https://www.toongod.org',
  },
  {
    id: 'nyaa',
    name: 'Nyaa (Torrents)',
    kind: 'manga',
    enabled: true,
    description: 'Torrent-first manga/anime source for SHIORI x Torbox workflows.',
    status: 'active',
    implemented: true,
    torboxCompatible: true,
    website: 'https://nyaa.si',
  },
  {
    id: 'animetosho',
    name: 'AnimeTosho (Torrents)',
    kind: 'manga',
    enabled: true,
    description: 'Alternative anime/manga torrent index with magnet + torrent links for Torbox.',
    status: 'active',
    implemented: true,
    torboxCompatible: true,
    website: 'https://animetosho.org',
  },
  {
    id: 'rutracker',
    name: 'RuTracker (Direct)',
    kind: 'books',
    enabled: true,
    description: 'Direct torrent search via RuTracker. Works without cookie when anonymous search is available; optional cookie improves access.',
    status: 'active',
    implemented: true,
    torboxCompatible: true,
    website: 'https://rutracker.org',
  },
  {
    id: 'bitsearch',
    name: 'Bitsearch (Torrents)',
    kind: 'books',
    enabled: true,
    description: 'Anonymous torrent index with magnet-first links for Torbox Add to Cloud.',
    status: 'active',
    implemented: true,
    torboxCompatible: true,
    website: 'https://bitsearch.to',
  },
  {
    id: 'x1337',
    name: '1337x (Torrents)',
    kind: 'books',
    enabled: true,
    description: 'Anonymous torrent index used for fallback mirrors when other sources have no links.',
    status: 'active',
    implemented: true,
    torboxCompatible: true,
    website: 'https://1337x.to',
  },
  {
    id: 'tpb-api',
    name: 'TPB API (Torrents)',
    kind: 'books',
    enabled: true,
    description: 'Anonymous API fallback that returns info-hash results for magnet and torrent generation.',
    status: 'active',
    implemented: true,
    torboxCompatible: true,
    website: 'https://apibay.org',
  },
  {
    id: 'openlibrary',
    name: 'Open Library',
    kind: 'books',
    enabled: true,
    description: 'Book metadata provider - covers, descriptions, and author info.',
    status: 'active',
    implemented: true,
    torboxCompatible: false,
    website: 'https://openlibrary.org',
  },
  {
    id: 'anna-archive',
    name: "Anna's Archive",
    kind: 'books',
    enabled: true,
    description: '⚠️ Community Plugin - Search and download books via Torbox. Users are responsible for compliance with local laws.',
    status: 'active',
    implemented: true,
    torboxCompatible: true,
    website: 'https://annas-archive.org',
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
