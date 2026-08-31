import { describe, it, expect } from 'vitest';
import { NATIVE_READER_FORMATS, getReaderKind, type ReaderKind } from '@/components/reader/readerRouting';
import { getReaderCapabilities, type ReaderCapabilities } from '@/components/reader/readerCapabilities';

/** Every file format the app can hold in the library. */
const ALL_FILE_FORMATS = [
  'epub',
  'pdf',
  'cbz',
  'cbr',
  'zip',
  'rar',
  'mobi',
  'azw',
  'azw3',
  'docx',
  'fb2',
  'txt',
  'html',
  'htm',
  'md',
  'markdown',
] as const;

const READER_KINDS: ReaderKind[] = ['epub', 'pdf', 'manga', 'html'];

describe('NATIVE_READER_FORMATS (native routing map)', () => {
  it('routes every supported file format to a reader — nothing falls through', () => {
    for (const format of ALL_FILE_FORMATS) {
      expect(NATIVE_READER_FORMATS[format], `missing route for "${format}"`).toBeDefined();
      expect(READER_KINDS).toContain(NATIVE_READER_FORMATS[format]);
    }
  });

  it('maps formats to their intended readers', () => {
    expect(NATIVE_READER_FORMATS.epub).toBe('epub');
    expect(NATIVE_READER_FORMATS.pdf).toBe('pdf');
    for (const comic of ['cbz', 'cbr', 'zip', 'rar']) {
      expect(NATIVE_READER_FORMATS[comic]).toBe('manga');
    }
    for (const text of ['mobi', 'azw', 'azw3', 'docx', 'fb2', 'txt', 'html', 'htm', 'md', 'markdown']) {
      expect(NATIVE_READER_FORMATS[text]).toBe('html');
    }
  });

  it('contains no keys that resolve to an unknown reader kind', () => {
    for (const key of Object.keys(NATIVE_READER_FORMATS)) {
      expect(READER_KINDS, `key "${key}"`).toContain(NATIVE_READER_FORMATS[key]);
    }
  });

  it('getReaderKind is case-insensitive and tolerates null/unknown input', () => {
    expect(getReaderKind('PDF')).toBe('pdf');
    expect(getReaderKind('Mobi')).toBe('html');
    expect(getReaderKind(null)).toBeUndefined();
    expect(getReaderKind(undefined)).toBeUndefined();
    expect(getReaderKind('unknown-format')).toBeUndefined();
  });
});

describe('getReaderCapabilities (settings capability map)', () => {
  it('gives epub the full premium set (typography + layout + page transitions)', () => {
    expect(getReaderCapabilities('epub')).toEqual({
      typography: true,
      layout: true,
      pageTransition: true,
      pdfZoom: false,
    });
  });

  it('gives pdf typography + pdfZoom, but no layout or page transitions', () => {
    const caps = getReaderCapabilities('pdf');
    expect(caps.typography).toBe(true);
    expect(caps.pdfZoom).toBe(true);
    expect(caps.layout).toBe(false);
    expect(caps.pageTransition).toBe(false);
  });

  it('gives html-rendered text formats typography + layout (no page transitions)', () => {
    for (const format of ['mobi', 'azw', 'azw3', 'docx', 'fb2', 'txt', 'html', 'htm', 'md', 'markdown'] as const) {
      const caps = getReaderCapabilities(format);
      expect(caps, format).toEqual<ReaderCapabilities>({
        typography: true,
        layout: true,
        pageTransition: false,
        pdfZoom: false,
      });
    }
  });

  it('gives manga no typography settings at all', () => {
    expect(getReaderCapabilities('manga')).toEqual({
      typography: false,
      layout: false,
      pageTransition: false,
      pdfZoom: false,
    });
  });
});
