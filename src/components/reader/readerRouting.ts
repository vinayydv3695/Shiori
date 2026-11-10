/**
 * readerRouting.ts
 *
 * Native format → reader routing map. Every supported file format opens
 * natively — conversion is NEVER automatic. The backend's
 * `open_book_for_reading` returns the ORIGINAL file path for every format;
 * this map decides which reader component renders it.
 *
 *   epub                        → PremiumEpubReader
 *   pdf                         → PdfReader
 *   cbz / cbr / zip / rar       → MangaReader
 *   mobi/azw/azw3/docx/fb2/txt → GenericHtmlReader
 *   html / htm / md / markdown  → GenericHtmlReader
 */
export type ReaderKind = 'epub' | 'pdf' | 'manga' | 'html' | 'audiobook';

export const NATIVE_READER_FORMATS: Record<string, ReaderKind> = {
  epub: 'epub',
  pdf: 'pdf',
  // Comic archives → MangaReader
  cbz: 'manga',
  cbr: 'manga',
  zip: 'manga',
  rar: 'manga',
  // Audio formats → AudiobookPlayer
  mp3: 'audiobook',
  m4a: 'audiobook',
  m4b: 'audiobook',
  ogg: 'audiobook',
  flac: 'audiobook',
  wav: 'audiobook',
  audio: 'audiobook',
  audiobook: 'audiobook',
  // HTML-rendered text formats → GenericHtmlReader
  mobi: 'html',
  azw: 'html',
  azw3: 'html',
  docx: 'html',
  fb2: 'html',
  txt: 'html',
  html: 'html',
  htm: 'html',
  md: 'html',
  markdown: 'html',
};

/**
 * Resolve a file format to its reader kind. Unknown formats return undefined
 * so callers can fall back to the GenericHtmlReader (best-effort).
 */
export function getReaderKind(format: string | null | undefined): ReaderKind | undefined {
  if (!format) return undefined;
  return NATIVE_READER_FORMATS[format.toLowerCase()];
}
