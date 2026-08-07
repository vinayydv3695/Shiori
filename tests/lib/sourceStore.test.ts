import { describe, it, expect, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { useSourceStore } from '@/store/sourceStore';

const STORE_KEY = 'shiori-source-store';

// A realistic persisted state from before annas-archive existed (no AA entry).
const OLD_PERSISTED_STATE = {
  state: {
    sources: [
      { id: 'mangadex', name: 'MangaDex', kind: 'manga', enabled: false },
      { id: 'mangafire', name: 'MangaFire', kind: 'manga', enabled: true },
      { id: 'nyaa', name: 'Nyaa', kind: 'manga', enabled: true },
      { id: 'gutenberg', name: 'Project Gutenberg', kind: 'books', enabled: true },
      { id: 'libgen', name: 'LibGen', kind: 'books', enabled: true },
    ],
    primarySourceByKind: { books: 'gutenberg', manga: 'mangafire' },
    preferredDebridProvider: 'auto',
  },
  version: 8,
};

describe('sourceStore annas-archive', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useSourceStore.setState(useSourceStore.getInitialState());
  });

  it('default store includes annas-archive as a DISABLED books source', () => {
    const source = useSourceStore.getState().sources.find((s) => s.id === 'annas-archive');

    expect(source).toBeDefined();
    expect(source!.name).toBe("Anna's Archive");
    expect(source!.kind).toBe('books');
    expect(source!.enabled).toBe(false);
    expect(source!.implemented).toBe(true);
    expect(source!.torboxCompatible).toBe(true);
    expect(source!.capabilities).toEqual(expect.arrayContaining(['direct', 'torbox']));
  });

  it('merges annas-archive in as disabled for persisted state from an old user', async () => {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(OLD_PERSISTED_STATE));

    await act(async () => {
      await useSourceStore.persist.rehydrate();
    });

    const sources = useSourceStore.getState().sources;
    const aa = sources.find((s) => s.id === 'annas-archive');

    expect(aa).toBeDefined();
    expect(aa!.enabled).toBe(false);
    expect(aa!.kind).toBe('books');
    // Other persisted sources keep their stored enabled flags
    expect(sources.find((s) => s.id === 'mangadex')!.enabled).toBe(false);
    expect(sources.find((s) => s.id === 'mangafire')!.enabled).toBe(true);
    expect(sources.find((s) => s.id === 'gutenberg')!.enabled).toBe(true);
    expect(sources.find((s) => s.id === 'libgen')!.enabled).toBe(true);
  });

  it('toggleSource flips enabled and updates the books primary source when annas-archive was primary', () => {
    useSourceStore.setState({
      sources: useSourceStore.getState().sources.map((s) =>
        s.id === 'annas-archive' ? { ...s, enabled: true } : s
      ),
      primarySourceByKind: { ...useSourceStore.getState().primarySourceByKind, books: 'annas-archive' },
    });

    act(() => {
      useSourceStore.getState().toggleSource('annas-archive');
    });

    expect(useSourceStore.getState().sources.find((s) => s.id === 'annas-archive')!.enabled).toBe(false);
    expect(useSourceStore.getState().primarySourceByKind.books).toBe('gutenberg');

    act(() => {
      useSourceStore.getState().toggleSource('annas-archive');
    });

    expect(useSourceStore.getState().sources.find((s) => s.id === 'annas-archive')!.enabled).toBe(true);
    expect(useSourceStore.getState().primarySourceByKind.books).toBe('gutenberg');
  });

  it('toggleSource does not touch the primary source when annas-archive is not primary', () => {
    act(() => {
      useSourceStore.getState().toggleSource('annas-archive');
    });

    // Default is disabled now, so one toggle enables it
    expect(useSourceStore.getState().sources.find((s) => s.id === 'annas-archive')!.enabled).toBe(true);
    expect(useSourceStore.getState().primarySourceByKind.books).toBe('gutenberg');
  });
});
