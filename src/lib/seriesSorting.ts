/**
 * seriesSorting.ts
 *
 * Provides robust natural numeric sorting and volume/chapter number
 * extraction for books and manga in series view and reader headers.
 */

import type { Book } from '@/lib/tauri';

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/**
 * Extracts a numeric volume or chapter number from a Book's metadata, title, or filename.
 * Handles decimals (e.g. 1.1, 1.5, 105.5), prefixes (Vol, Ch, Episode, Book, #),
 * and avoids misinterpreting 4-digit release years like (2023).
 */
export function parseVolumeOrChapterNumber(
  book: { title?: string; series_index?: number | null; sort_title?: string; file_path?: string } | null | undefined
): number | null {
  if (!book) return null;

  // 1. Direct series_index if present and valid
  if (typeof book.series_index === 'number' && Number.isFinite(book.series_index)) {
    return book.series_index;
  }

  const rawTitle = (book.title || book.sort_title || '').trim();
  if (!rawTitle) {
    // Try filename without extension
    if (book.file_path) {
      const filename = book.file_path.split('/').pop()?.split('\\').pop()?.replace(/\.[^/.]+$/, '') || '';
      return extractNumberFromString(filename);
    }
    return null;
  }

  return extractNumberFromString(rawTitle);
}

/**
 * Helper to parse volume/chapter number from a title string.
 */
export function extractNumberFromString(text: string): number | null {
  if (!text) return null;

  // Strip common noise like 4-digit release years "(2020)" or "[2021]" and tags like "(Digital)" or "[Scan]"
  const clean = text
    .replace(/\b(?:19|20)\d{2}\b/g, '')
    .replace(/\((?:digital|scan|web|raw|official|translated|v\d+)\)/gi, '')
    .replace(/\[(?:digital|scan|web|raw|official|translated|v\d+)\]/gi, '');

  // Pattern 1: Explicit keywords (Volume, Vol, Chapter, Ch, Bk, Book, Episode, Ep, Act, Prologue, Extra, Part, #)
  // followed by a number (integer or decimal like 1.1, 10.5)
  const keywordRegex = /(?:vol(?:ume)?|v|ch(?:apter)?|bk|book|ep(?:isode)?|act|prologue|part|#)\s*[\.\-:#]?\s*(\d+(?:\.\d+)?)/i;
  const keywordMatch = clean.match(keywordRegex);
  if (keywordMatch && keywordMatch[1]) {
    const parsed = parseFloat(keywordMatch[1]);
    if (Number.isFinite(parsed)) return parsed;
  }

  // Pattern 2: Trailing number after delimiter or whitespace: e.g. "Berserk - 09", "One Piece 105"
  const trailingRegex = /(?:^|[\s\-_#v])(\d+(?:\.\d+)?)(?:\s*(?:\.cbz|\.cbr|\.epub|\.pdf|\.zip)?)$/i;
  const trailingMatch = clean.match(trailingRegex);
  if (trailingMatch && trailingMatch[1]) {
    const parsed = parseFloat(trailingMatch[1]);
    if (Number.isFinite(parsed)) return parsed;
  }

  // Pattern 3: Look for all numeric tokens, pick the one most likely to be the chapter/volume number
  const numbers = clean.match(/\d+(?:\.\d+)?/g);
  if (numbers && numbers.length > 0) {
    // Pick the last numeric sequence (standard naming puts volume/chapter near the end)
    const candidate = parseFloat(numbers[numbers.length - 1]);
    if (Number.isFinite(candidate)) return candidate;
  }

  return null;
}

/**
 * Compares two books naturally based on volume/chapter number, then natural title collation.
 * Guarantees correct ordering: 1, 1.1, 2, 3, ... 9, 10, 11 (never 1, 10, 11, 2, 9).
 */
export function compareBooksNatural(
  a: Book,
  b: Book,
  order: 'chapter_asc' | 'chapter_desc' | 'asc' | 'desc' = 'chapter_asc'
): number {
  const isAsc = order === 'chapter_asc' || order === 'asc';

  const numA = parseVolumeOrChapterNumber(a);
  const numB = parseVolumeOrChapterNumber(b);

  // Both have valid volume numbers
  if (numA !== null && numB !== null) {
    if (numA !== numB) {
      return isAsc ? numA - numB : numB - numA;
    }
  } else if (numA !== null && numB === null) {
    // Numbered volumes come before unnumbered special chapters in asc
    return isAsc ? -1 : 1;
  } else if (numA === null && numB !== null) {
    return isAsc ? 1 : -1;
  }

  // Fallback to natural string comparison on title
  const titleA = a.title || a.sort_title || '';
  const titleB = b.title || b.sort_title || '';
  const stringCmp = collator.compare(titleA, titleB);
  if (stringCmp !== 0) {
    return isAsc ? stringCmp : -stringCmp;
  }

  // Deterministic tie breaker by ID or added date
  const idA = a.id ?? 0;
  const idB = b.id ?? 0;
  return isAsc ? idA - idB : idB - idA;
}
