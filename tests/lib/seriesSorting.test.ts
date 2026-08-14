import { describe, it, expect } from 'vitest';
import { parseVolumeOrChapterNumber, extractNumberFromString, compareBooksNatural } from '@/lib/seriesSorting';
import type { Book } from '@/lib/tauri';

function makeBook(id: number, title: string, series_index?: number): Book {
  return {
    id,
    title,
    series_index,
    file_path: `/path/to/${title}.cbz`,
    file_format: 'cbz',
    file_size: 1000,
    page_count: 50,
    reading_status: 'unread',
    added_date: '2026-01-01T00:00:00Z',
    authors: [],
    tags: [],
    domain: 'manga_comics',
  };
}

describe('seriesSorting', () => {
  describe('extractNumberFromString', () => {
    it('extracts volume numbers from standard keywords', () => {
      expect(extractNumberFromString('Berserk Vol. 1')).toBe(1);
      expect(extractNumberFromString('Berserk Vol. 09')).toBe(9);
      expect(extractNumberFromString('Berserk Volume 10')).toBe(10);
      expect(extractNumberFromString('Berserk Chapter 105.5')).toBe(105.5);
      expect(extractNumberFromString('Berserk Ch. 1.1')).toBe(1.1);
      expect(extractNumberFromString('Berserk Prologue 1')).toBe(1);
      expect(extractNumberFromString('Berserk Prologue 9')).toBe(9);
      expect(extractNumberFromString('Berserk Prologue 10')).toBe(10);
      expect(extractNumberFromString('Berserk Prologue 11')).toBe(11);
    });

    it('ignores 4-digit release years and scan tags', () => {
      expect(extractNumberFromString('Berserk Vol 1 (2020)')).toBe(1);
      expect(extractNumberFromString('Berserk 09 (Digital) (2019)')).toBe(9);
    });

    it('extracts trailing numbers', () => {
      expect(extractNumberFromString('Berserk - 01')).toBe(1);
      expect(extractNumberFromString('Berserk - 10')).toBe(10);
      expect(extractNumberFromString('Berserk 11.cbz')).toBe(11);
    });
  });

  describe('parseVolumeOrChapterNumber', () => {
    it('prefers explicit series_index if present', () => {
      const book = makeBook(1, 'Berserk Chapter 100', 5);
      expect(parseVolumeOrChapterNumber(book)).toBe(5);
    });

    it('falls back to extracting from title if series_index is undefined', () => {
      const book = makeBook(1, 'Prologue 9');
      expect(parseVolumeOrChapterNumber(book)).toBe(9);
    });
  });

  describe('compareBooksNatural', () => {
    it('sorts volumes naturally: 1, 1.1, 2, ... 9, 10, 11 (fixes user bug)', () => {
      const books = [
        makeBook(9, 'Prologue 9'),
        makeBook(10, 'Prologue 10'),
        makeBook(1, 'Prologue 1'),
        makeBook(101, 'Prologue 1.1'),
        makeBook(11, 'Prologue 11'),
        makeBook(3, 'Prologue 3'),
        makeBook(4, 'Prologue 4'),
        makeBook(5, 'Prologue 5'),
        makeBook(6, 'Prologue 6'),
        makeBook(7, 'Prologue 7'),
        makeBook(8, 'Prologue 8'),
        makeBook(2, 'Prologue 2'),
      ];

      const sorted = [...books].sort((a, b) => compareBooksNatural(a, b, 'chapter_asc'));
      const titles = sorted.map(b => b.title);

      expect(titles).toEqual([
        'Prologue 1',
        'Prologue 1.1',
        'Prologue 2',
        'Prologue 3',
        'Prologue 4',
        'Prologue 5',
        'Prologue 6',
        'Prologue 7',
        'Prologue 8',
        'Prologue 9',
        'Prologue 10',
        'Prologue 11',
      ]);
    });

    it('sorts descending correctly', () => {
      const books = [
        makeBook(1, 'Prologue 1'),
        makeBook(11, 'Prologue 11'),
        makeBook(2, 'Prologue 2'),
      ];

      const sorted = [...books].sort((a, b) => compareBooksNatural(a, b, 'chapter_desc'));
      const titles = sorted.map(b => b.title);

      expect(titles).toEqual([
        'Prologue 11',
        'Prologue 2',
        'Prologue 1',
      ]);
    });
  });
});
