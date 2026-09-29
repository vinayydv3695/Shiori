/**
 * PERF micro-benchmark — Agent B (Phase 1) + regression guard (Phase 3).
 *
 * Measures the client-side series grouping path that R1-M3 flagged:
 * groupBooksBySeries() re-sorts every series with regex-heavy natural
 * comparison on EACH library window append (infinite scroll).
 *
 * Simulates: initial 50-book load, then 40 appends of 50 books each
 * (scrolling through a 2000+ book library containing a 1100-volume series).
 *
 * Run: npx vitest run tests/perf/grouping.perf.test.ts
 * The assertion is a coarse tripwire (10s) so the suite never false-fails;
 * the reported numbers are the real signal (compare against perf/BASELINE.md).
 */
import { describe, it, expect } from 'vitest'
import { groupBooksBySeries } from '@/hooks/useGroupedLibrary'
import type { Book } from '@/lib/tauri'

function makeMangaBook(n: number): Book {
  return {
    id: n,
    uuid: `bench-manga-${n}`,
    title: `Bench Piece - Chapter ${n}`,
    series: 'Bench Piece',
    series_index: n,
    file_path: `/bench/manga/Bench Piece - Chapter ${n}.cbz`,
    file_format: 'cbz',
    added_date: `2025-${(n % 12) + 1}-15T07:00:00`,
    modified_date: `2025-${(n % 12) + 1}-15T07:00:00`,
    language: 'eng',
    is_favorite: false,
    domain: 'manga',
    reading_status: n % 3 === 0 ? 'completed' : 'reading',
    authors: [{ id: 1, name: 'Eiichiro Oda' }],
    tags: [{ id: 1, name: 'Manga' }],
  } as unknown as Book
}

function makeNovel(i: number): Book {
  return {
    id: 100000 + i,
    uuid: `bench-book-${i}`,
    title: `Bench Novel ${i} The Long Title of Book ${i}`,
    file_path: `/bench/books/Bench Novel ${i}.epub`,
    file_format: 'epub',
    added_date: `2025-${(i % 12) + 1}-15T07:00:00`,
    modified_date: `2025-${(i % 12) + 1}-15T07:00:00`,
    language: 'eng',
    is_favorite: false,
    domain: 'books',
    reading_status: 'planning',
    authors: [{ id: i, name: `Author ${i % 200}` }],
    tags: [{ id: i % 60, name: `Tag${i % 60}` }],
  } as unknown as Book
}

// Build the full library the way infinite scroll would accumulate it:
// manga chapters interleaved with novels, delivered in 50-book pages.
const CHAPTERS = 1100
const NOVELS = 950
const allBooks: Book[] = []
for (let i = 0; i < NOVELS; i++) allBooks.push(makeNovel(i))
for (let n = 1; n <= CHAPTERS; n++) allBooks.push(makeMangaBook(n))
// newest-first like added_date DESC paging
allBooks.reverse()

describe('perf: groupBooksBySeries under infinite-scroll appends', () => {
  it('reports regroup cost per append (R1-M3)', () => {
    const PAGE = 50
    const APPENDS = 40
    let loaded = allBooks.slice(0, PAGE)
    const t0 = performance.now()
    groupBooksBySeries(loaded, true)
    const firstMs = performance.now() - t0

    const appendTimes: number[] = []
    for (let a = 0; a < APPENDS; a++) {
      loaded = loaded.concat(allBooks.slice(PAGE * (a + 1), PAGE * (a + 2)))
      const t = performance.now()
      groupBooksBySeries(loaded, true)
      appendTimes.push(performance.now() - t)
    }
    const last = appendTimes[appendTimes.length - 1]
    const total = appendTimes.reduce((s, t) => s + t, 0)
    const sorted = [...appendTimes].sort((x, y) => x - y)
    const p95 = sorted[Math.floor(sorted.length * 0.95) - 1]

    // eslint-disable-next-line no-console
    console.log(`[perf:grouping] first(50 books)=${firstMs.toFixed(2)}ms | ` +
      `last(${loaded.length} books)=${last.toFixed(2)}ms | p95=${p95.toFixed(2)}ms | ` +
      `total(${APPENDS} appends)=${total.toFixed(1)}ms`)

    expect(loaded.length).toBe(PAGE * (APPENDS + 1))
    expect(total).toBeLessThan(10_000) // tripwire only
  })

  it('reports one-shot group cost at full size', () => {
    const t0 = performance.now()
    const grouped = groupBooksBySeries(allBooks, true)
    const ms = performance.now() - t0
    // eslint-disable-next-line no-console
    console.log(`[perf:grouping] one-shot(${allBooks.length} books)=${ms.toFixed(2)}ms, groups=${grouped.length}`)
    expect(grouped.length).toBeGreaterThan(0)
  })
})
