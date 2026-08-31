import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { Profiler, type ProfilerOnRenderCallback } from 'react';
import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { useReaderStore } from '@/store/readerStore';

// PdfReader (transitively imported by ReaderLayout) pulls in pdfjs-dist, which
// touches browser-only globals (DOMMatrix) at module scope — not available in
// jsdom. Stub react-pdf so the import graph stays Node-safe. PdfReader is never
// rendered by these tests (ReaderLayout lands in its error state).
vi.mock('react-pdf', () => ({
  Document: () => null,
  Page: () => null,
  pdfjs: { GlobalWorkerOptions: {}, version: '0.0.0' },
}));

// PdfReader also instantiates the pdfjs worker directly at module scope.
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?worker', () => ({
  default: class MockPdfWorker {},
}));

import { ReaderLayout } from '@/components/reader/ReaderLayout';

/**
 * K3-008: ReaderLayout must subscribe to the reader store with fine-grained
 * selectors (like PremiumEpubReader does), so unrelated store changes do not
 * re-render the reader shell.
 *
 * The real zustand store is used — setState outside React works, and Profiler
 * onRender fires on every commit in the subtree, so a re-render of ReaderLayout
 * shows up as an extra commit.
 *
 * (.ts on purpose: JSX is avoided via createElement so the file stays `.ts`.)
 */

function trackedReaderLayout() {
  const onRender = vi.fn<ProfilerOnRenderCallback>();
  const ui = createElement(
    Profiler,
    { id: 'ReaderLayout', onRender },
    createElement(ReaderLayout, { bookId: 1, onClose: () => {} })
  );
  return { onRender, ui };
}

/** Let the mount effect settle. The global @tauri-apps/api/core mock resolves
 *  `undefined`, so ReaderLayout deterministically lands in its error state. */
async function settle() {
  await act(async () => {
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  // Pristine store state for every test (plain zustand partial setState).
  useReaderStore.setState({
    currentBookId: null,
    currentBookPath: null,
    currentBookFormat: null,
    currentContent: null,
    isReaderOpen: false,
    annotations: [],
    selectedAnnotation: null,
    showAnnotationSidebar: false,
  });
});

describe('ReaderLayout store subscription granularity', () => {
  it('does not re-render the shell when an unrelated store field changes', async () => {
    const { onRender, ui } = trackedReaderLayout();
    render(ui);
    await settle();
    onRender.mockClear();

    // `showAnnotationSidebar` is NOT selected by ReaderLayout — flipping it must
    // not commit a new render (with a whole-store `useReaderStore()` it would).
    act(() => {
      useReaderStore.getState().toggleAnnotationSidebar();
    });
    expect(useReaderStore.getState().showAnnotationSidebar).toBe(true);
    expect(onRender).not.toHaveBeenCalled();
  });

  it('does not re-render the shell when the annotations payload changes', async () => {
    const { onRender, ui } = trackedReaderLayout();
    render(ui);
    await settle();
    onRender.mockClear();

    act(() => {
      useReaderStore.getState().setAnnotations([]);
    });
    expect(onRender).not.toHaveBeenCalled();
  });

  it('still re-renders when a selected field changes (harness sanity check)', async () => {
    const { onRender, ui } = trackedReaderLayout();
    render(ui);
    await settle();
    onRender.mockClear();

    // `currentBookPath` IS selected — opening a book must re-render (proves the
    // Profiler harness detects commits instead of passing vacuously).
    act(() => {
      useReaderStore.getState().openBook(1, '/tmp/sanity.epub', 'epub');
    });
    expect(onRender).toHaveBeenCalledTimes(1);
  });

  it('never calls useReaderStore() without a selector (lint-level guard)', () => {
    // Use path.resolve to build an absolute path: new URL() uses `file://` which
    // jsdom's import.meta.url does NOT provide in a vitest/node environment.
    const __filename = fileURLToPath(import.meta.url);
    const __dirname  = dirname(__filename);
    const source = readFileSync(resolve(__dirname, '../../../src/components/reader/ReaderLayout.tsx'), 'utf-8');
    for (const line of source.split('\n')) {
      if (line.includes('useReaderStore(')) {
        // Every hook call must pass a selector argument; `.getState()` calls
        // (which contain `useReaderStore.getState()` — no `useReaderStore(`)
        // don't match and are exempt.
        expect(line, `bare hook call: ${line.trim()}`).toMatch(
          /useReaderStore\(\s*state =>/
        );
      }
    }
    // Sanity: the fine-grained pattern is actually in use for the data fields.
    expect(source).toMatch(/useReaderStore\(state => state\.currentBookPath\)/);
  });
});