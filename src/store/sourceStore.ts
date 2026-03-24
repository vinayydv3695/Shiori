import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type SourceKind = 'manga' | 'books';

export interface SourceConfig {
  id: string;
  name: string;
  kind: SourceKind;
  enabled: boolean;
  description: string;
}

const DEFAULT_SOURCES: SourceConfig[] = [
  {
    id: 'mangadex',
    name: 'MangaDex',
    kind: 'manga',
    enabled: true,
    description: 'Community manga catalog with chapter feeds.',
  },
  {
    id: 'openlibrary',
    name: 'Open Library',
    kind: 'books',
    enabled: true,
    description: 'Public book metadata and lending links.',
  },
  {
    id: 'anna-archive',
    name: 'Anna’s Archive',
    kind: 'books',
    enabled: false,
    description: 'Planned integration for broader book discovery.',
  },
  {
    id: 'mangapark',
    name: 'MangaPark (Planned)',
    kind: 'manga',
    enabled: false,
    description: 'Plugin-based source planned in next phase.',
  },
  {
    id: 'toongod',
    name: 'ToonGod (Planned)',
    kind: 'manga',
    enabled: false,
    description: 'Plugin-based source planned in next phase.',
  },
  {
    id: 'mangareader',
    name: 'MangaReader (Planned)',
    kind: 'manga',
    enabled: false,
    description: 'Plugin-based source planned in next phase.',
  },
  {
    id: 'mangafire',
    name: 'MangaFire (Planned)',
    kind: 'manga',
    enabled: false,
    description: 'Plugin-based source planned in next phase.',
  },
];

interface SourceStore {
  sources: SourceConfig[];
  isSourceEnabled: (id: string) => boolean;
  toggleSource: (id: string) => void;
}

export const useSourceStore = create<SourceStore>()(
  persist(
    (set, get) => ({
      sources: DEFAULT_SOURCES,
      isSourceEnabled: (id) => get().sources.find((source) => source.id === id)?.enabled ?? false,
      toggleSource: (id) =>
        set((state) => ({
          sources: state.sources.map((source) =>
            source.id === id ? { ...source, enabled: !source.enabled } : source
          ),
        })),
    }),
    {
      name: 'shiori-source-store',
      version: 1,
    }
  )
);
