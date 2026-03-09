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
    if (!enableGrouping) {
      // Return books as-is when grouping disabled
      return books.map((book) => ({ type: 'book' as const, data: book }))
    }

    const seriesMap = new Map<string, Book[]>()
    const standaloneBooks: Book[] = []

    // Separate books into series groups and standalone
    for (const book of books) {
      if (book.series && book.series.trim()) {
        if (!seriesMap.has(book.series)) {
          seriesMap.set(book.series, [])
        }
        seriesMap.get(book.series)!.push(book)
      } else {
        standaloneBooks.push(book)
      }
    }

    // Build grouped items
    const groupedItems: GroupedItem[] = []

    // Process series groups (sorted by series name)
    for (const [seriesTitle, seriesBooks] of Array.from(seriesMap.entries()).sort()) {
      // Sort volumes within series by series_index
      const sortedVolumes = seriesBooks.sort((a, b) => {
        const indexA = a.series_index ?? Infinity
        const indexB = b.series_index ?? Infinity
        return indexA - indexB
      })

      // Build SeriesGroup with aggregated metadata
      const seriesGroup: SeriesGroup = {
        id: seriesTitle.toLowerCase().replace(/\s+/g, '-'),
        title: seriesTitle,
        books: sortedVolumes,
        bookCount: sortedVolumes.length,
        firstCover: sortedVolumes[0]?.cover_path,
        authors: new Set(sortedVolumes.flatMap((b) => b.authors?.map((a) => a.name) ?? [])),
        rating: Math.max(...sortedVolumes.map((b) => b.rating ?? 0)) || undefined,
        tags: new Set(sortedVolumes.flatMap((b) => b.tags?.map((t) => t.name) ?? [])),
        publishedDate: sortedVolumes[0]?.pubdate,
        publisher: sortedVolumes[0]?.publisher,
      }

      groupedItems.push({ type: 'series', data: seriesGroup })
    }

    // Add standalone books as individual items
    for (const book of standaloneBooks) {
      groupedItems.push({ type: 'book', data: book })
    }

    return groupedItems
  }, [books, enableGrouping])
}
