import { StrictMode } from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useOpenedFiles } from './useOpenedFiles';

const mocks = vi.hoisted(() => ({
  takeOpenedUrls: vi.fn(), onOpened: vi.fn(), ingestOpenedFile: vi.fn(),
  clearTombstone: vi.fn(), addToast: vi.fn(), loadInitialBooks: vi.fn(),
  confirmTombstones: vi.fn(),
}));
vi.mock('../lib/tauri', () => ({ api: mocks }));
vi.mock('../store/toastStore', () => ({ useToastStore: (select: Function) => select(mocks) }));
vi.mock('../store/libraryStore', () => ({ useLibraryStore: (select: Function) => select(mocks) }));
vi.mock('./useTombstoneConfirm', () => ({ useTombstoneConfirm: () => ({
  confirmTombstones: mocks.confirmTombstones, tombstoneDialog: null,
}) }));

let queue: string[];
let wake: (urls: string[]) => void;
function Harness() { useOpenedFiles(); return null; }
beforeEach(() => {
  vi.resetAllMocks();
  queue = [];
  mocks.takeOpenedUrls.mockImplementation(async () => queue.splice(0));
  mocks.onOpened.mockImplementation(async (listener) => { wake = listener; return vi.fn(); });
  mocks.ingestOpenedFile.mockResolvedValue({ status: 'imported', bookId: 1, path: 'book.epub' });
  mocks.loadInitialBooks.mockResolvedValue(undefined);
});
afterEach(cleanup);

it('drains cold files intact, opens the reader, and handles warm batches without payload imports', async () => {
  const open = vi.fn();
  window.addEventListener('open-book', open);
  queue.push('file:///tmp/a b 日本.epub');
  render(<Harness />);
  await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
  expect(mocks.ingestOpenedFile).toHaveBeenNthCalledWith(1, 'file:///tmp/a b 日本.epub');
  act(() => { queue.push('two.epub', 'three.pdf'); wake(['ignored.epub']); wake(['ignored.epub']); });
  await waitFor(() => expect(open).toHaveBeenCalledTimes(3));
  expect(mocks.ingestOpenedFile.mock.calls.map(args => args[0])).toEqual([
    'file:///tmp/a b 日本.epub', 'two.epub', 'three.pdf',
  ]);
  window.removeEventListener('open-book', open);
});

it('drains events during registration only once', async () => {
  mocks.onOpened.mockImplementation(async listener => {
    queue.push('cold.epub'); listener(['cold.epub']); return vi.fn();
  });
  render(<Harness />);
 await waitFor(() => expect(mocks.ingestOpenedFile).toHaveBeenCalledTimes(1));
});

it('preserves Android content URIs and opens imported or existing books on cold and warm delivery', async () => {
 const cold = 'content://com.android.providers.downloads.documents/document/msf%3A123';
 const warm = 'content://com.android.externalstorage.documents/document/primary%3ABooks%2F日本%20book.pdf';
 const open = vi.fn();
 window.addEventListener('open-book', open);
 try {
  mocks.ingestOpenedFile
   .mockResolvedValueOnce({ status: 'imported', bookId: 7, path: 'book.pdf' })
   .mockResolvedValueOnce({ status: 'duplicate', bookId: 7, path: 'book.pdf' });
  queue.push(cold);
  render(<StrictMode><Harness /></StrictMode>);
  await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
  act(() => { queue.push(warm); wake([warm]); });
  await waitFor(() => expect(open).toHaveBeenCalledTimes(2));
  expect(mocks.ingestOpenedFile.mock.calls.map(args => args[0])).toEqual([cold, warm]);
  for (const [event] of open.mock.calls) expect(event.detail).toEqual({ bookId: 7 });
 } finally {
  window.removeEventListener('open-book', open);
 }
});

it('unlistens a subscription resolving after unmount without consuming the queue', async () => {
  let resolve!: (unlisten: () => void) => void;
  mocks.onOpened.mockReturnValue(new Promise(r => { resolve = r; }));
  const view = render(<Harness />);
  view.unmount();
  const unlisten = vi.fn();
  await act(async () => { resolve(unlisten); });
  expect(unlisten).toHaveBeenCalledOnce();
  expect(mocks.takeOpenedUrls).not.toHaveBeenCalled();
});

it('keeps cold files across StrictMode replay', async () => {
  queue.push('cold.epub');
  render(<StrictMode><Harness /></StrictMode>);
  await waitFor(() => expect(mocks.ingestOpenedFile).toHaveBeenCalledExactlyOnceWith('cold.epub'));
});

it('continues after an ingest error and drains requests arriving during processing', async () => {
  let reject!: (error: Error) => void;
  mocks.ingestOpenedFile.mockImplementationOnce(() => new Promise((_, r) => { reject = r; }));
  queue.push('bad.epub', 'next.epub');
  render(<Harness />);
  await waitFor(() => expect(mocks.ingestOpenedFile).toHaveBeenCalledTimes(1));
  await act(async () => { queue.push('warm.epub'); wake([]); reject(new Error('bad file')); });
  await waitFor(() => expect(mocks.ingestOpenedFile).toHaveBeenCalledTimes(3));
  expect(mocks.addToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'error' }));
});
