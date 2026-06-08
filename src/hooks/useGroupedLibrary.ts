function tryExtractSeries(title: string): string | null {
  if (!title) return null;
  // Matches titles like "Harry Potter 1 - Harry Potter and the Sorcerer's Stone"
  // Mirroring the backend Rust MANGA_VOLUME_REGEX
  const seriesRegex = /^(?:\[[^\]]+\]\s*)?(.*?)\s*[-_#]?\s*(?:Vol\.?|Volume|v|Bk\.?|Book|Ch\.?|Chapter|Ep\.?|Episode|#)?\s*(\d+(?:\.\d+)?)\s*(?:\((?:Digital|Scan|Web)?\s*\)?\s*)?(?:\((?:\d{4})\))?.*$/i;
  
  const match = title.match(seriesRegex);
  if (match && match[1].trim()) return match[1].trim();
  
  return null;
}

/**
 * useGroupedLibrary — Shiori v3.0
 *
 * Implements series grouping logic for manga_comics domain.
 * Groups books by `series` field, sorts volumes by `series_index`,
 * and returns mixed array of book and series group items.
 */

import { useMemo } from 'react'
import type { Book } from '@/lib/tauri'

export interface SeriesGroup {
  id: string
  title: string
  books: Book[]
  bookCount: number
  firstCover?: string
  authors: Set<string>
  rating?: number
  tags: Set<string>
  publishedDate?: string
  publisher?: string
}

export type GroupedItem =
  | { type: 'book'; data: Book }
  | { type: 'series'; data: SeriesGroup }

/**
 * Groups books by series when in manga_comics domain.
 * Books with series are grouped, standalone books remain as individual items.
 *
 * @param books - Array of books to group
 * @param enableGrouping - Whether to enable grouping (typically manga_comics domain)
 * @returns Mixed array of standalone books and series groups
 */
export function useGroupedLibrary(
  books: Book[],
  enableGrouping: boolean = false
): GroupedItem[] {
  return useMemo(() => {
    if (!enableGrouping || books.length === 0) {
      return books.map((book) => ({ type: 'book' as const, data: book }))
    }

    const seriesMap = new Map<string, Book[]>()
    const standaloneBooks: Book[] = []

    for (let i = 0; i < books.length; i++) {
      const book = books[i]
      const series = book.series?.trim() || tryExtractSeries(book.title)
      if (series) {
        let list = seriesMap.get(series)
        if (!list) {
          list = []
          seriesMap.set(series, list)
        }
        list.push(book)
      } else {
        standaloneBooks.push(book)
      }
    }

    const groupedItems: GroupedItem[] = []

    const sortedSeries = Array.from(seriesMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))
    for (let i = 0; i < sortedSeries.length; i++) {
      const [seriesTitle, seriesBooks] = sortedSeries[i]
      
      seriesBooks.sort((a, b) => {
        let indexA = a.series_index;
        if (indexA == null || isNaN(indexA)) {
            const m = a.title.match(/\d+/g);
            if (m) indexA = parseFloat(m[m.length - 1]);
        }
        let indexB = b.series_index;
        if (indexB == null || isNaN(indexB)) {
            const m = b.title.match(/\d+/g);
            if (m) indexB = parseFloat(m[m.length - 1]);
        }
        
        const numA = indexA ?? Infinity;
        const numB = indexB ?? Infinity;
        return numA - numB;
      })

      const authorsSet = new Set<string>()
      const tagsSet = new Set<string>()
      let maxRating = 0

      for (let j = 0; j < seriesBooks.length; j++) {
        const b = seriesBooks[j]
        if (b.authors) {
          for (let k = 0; k < b.authors.length; k++) {
            authorsSet.add(b.authors[k].name)
          }
        }
        if (b.tags) {
          for (let k = 0; k < b.tags.length; k++) {
            tagsSet.add(b.tags[k].name)
          }
        }
        if (b.rating && b.rating > maxRating) {
          maxRating = b.rating
        }
      }

      const firstBook = seriesBooks[0]

      groupedItems.push({
        type: 'series',
        data: {
          id: seriesTitle.toLowerCase().replace(/\s+/g, '-'),
          title: seriesTitle,
          books: seriesBooks,
          bookCount: seriesBooks.length,
          firstCover: firstBook?.cover_path,
          authors: authorsSet,
          rating: maxRating || undefined,
          tags: tagsSet,
          publishedDate: firstBook?.pubdate,
          publisher: firstBook?.publisher,
        }
      })
    }

    for (let i = 0; i < standaloneBooks.length; i++) {
      groupedItems.push({ type: 'book', data: standaloneBooks[i] })
    }

    return groupedItems
  }, [books, enableGrouping])
}
