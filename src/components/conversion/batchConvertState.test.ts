import { describe, it, expect } from 'vitest';
import {
  createBatchItems,
  markConverting,
  markDone,
  markFailed,
  queuedItems,
  summarize,
  isConvertibleFormat,
} from './batchConvertState';

const books = [
  { id: 1, title: 'PDF Book', file_format: 'pdf' },
  { id: 2, title: 'EPUB Book', file_format: 'epub' },
  { id: 3, title: 'Mobi Book', file_format: 'mobi' },
  { id: 4, title: 'Online Manga', file_format: 'online-manga' },
  { id: 5, title: 'No Format Book' },
];

describe('isConvertibleFormat', () => {
  it('rejects epub, online-manga, cbz, and cbr case-insensitively', () => {
    expect(isConvertibleFormat('epub')).toBe(false);
    expect(isConvertibleFormat('EPUB')).toBe(false);
    expect(isConvertibleFormat('cbz')).toBe(false);
    expect(isConvertibleFormat('CBR')).toBe(false);
    expect(isConvertibleFormat('online-manga')).toBe(false);
    expect(isConvertibleFormat('Online-Manga')).toBe(false);
  });

  it('accepts other local formats and rejects missing formats', () => {
    expect(isConvertibleFormat('pdf')).toBe(true);
    expect(isConvertibleFormat('mobi')).toBe(true);
    expect(isConvertibleFormat('fb2')).toBe(true);
    expect(isConvertibleFormat('txt')).toBe(true);
    expect(isConvertibleFormat(undefined)).toBe(false);
    expect(isConvertibleFormat('')).toBe(false);
  });
});

describe('createBatchItems', () => {
  it('marks non-convertible books as skipped and the rest queued', () => {
    const items = createBatchItems(books);
    expect(items).toHaveLength(5);
    expect(items[0]).toMatchObject({ bookId: 1, status: 'queued', format: 'pdf' });
    expect(items[1]).toMatchObject({ bookId: 2, status: 'skipped' });
    expect(items[2]).toMatchObject({ bookId: 3, status: 'queued' });
    expect(items[3]).toMatchObject({ bookId: 4, status: 'skipped' });
    // Unknown format → not convertible → skipped.
    expect(items[4]).toMatchObject({ bookId: 5, status: 'skipped' });
  });

  it('drops books without an id', () => {
    const items = createBatchItems([
      { id: 1, title: 'A', file_format: 'pdf' },
      { title: 'No id', file_format: 'pdf' },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].bookId).toBe(1);
  });
});

describe('status transitions', () => {
  it('queued → converting → done', () => {
    let items = createBatchItems(books);
    items = markConverting(items, 1);
    expect(items[0].status).toBe('converting');
    items = markDone(items, 1);
    expect(items[0].status).toBe('done');
    expect(items[0].error).toBeUndefined();
  });

  it('queued → converting → failed with error message', () => {
    let items = createBatchItems(books);
    items = markConverting(items, 3);
    items = markFailed(items, 3, 'calibre exploded');
    expect(items[2].status).toBe('failed');
    expect(items[2].error).toBe('calibre exploded');
  });

  it('transitions only touch the matching book', () => {
    let items = createBatchItems(books);
    items = markDone(items, 1);
    expect(items[1].status).toBe('skipped');
    expect(items[2].status).toBe('queued');
  });

  it('clears the error when a failed book is retried to done', () => {
    let items = createBatchItems(books);
    items = markFailed(items, 1, 'boom');
    items = markConverting(items, 1);
    items = markDone(items, 1);
    expect(items[0].status).toBe('done');
    expect(items[0].error).toBeUndefined();
  });
});

describe('queuedItems / summarize', () => {
  it('returns only queued items for the run loop', () => {
    let items = createBatchItems(books);
    items = markConverting(items, 1);
    items = markDone(items, 3);
    const queued = queuedItems(items);
    expect(queued.map((i) => i.bookId)).toEqual([]);
    // epub/online-manga/no-format are skipped, 1 converting, 1 done.
  });

  it('counts every status bucket', () => {
    let items = createBatchItems(books);
    items = markConverting(items, 1);
    items = markDone(items, 3);
    items = markFailed(items, 5, 'nope');
    const summary = summarize(items);
    expect(summary).toEqual({
      total: 5,
      queued: 0,
      converting: 1,
      done: 1,
      failed: 1,
      skipped: 2,
    });
  });

  it('handles an empty list', () => {
    expect(summarize([])).toEqual({
      total: 0,
      queued: 0,
      converting: 0,
      done: 0,
      failed: 0,
      skipped: 0,
    });
    expect(queuedItems([])).toEqual([]);
  });
});
