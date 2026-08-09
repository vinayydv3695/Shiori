/**
 * batchConvertState.ts
 *
 * Pure state machine for the batch "Convert to EPUB" flow (BatchConvertDialog).
 * Kept free of React/Tauri so it can be unit-tested in isolation.
 *
 * Lifecycle of an item: queued → converting → done | failed.
 * Books that are already EPUB (or online manga) are marked `skipped` up front.
 */

export type BatchItemStatus = 'queued' | 'converting' | 'done' | 'failed' | 'skipped'

export interface BatchConvertItem {
  bookId: number
  title: string
  format: string
  status: BatchItemStatus
  /** Error message, only set when status === 'failed' */
  error?: string
}

export interface BatchConvertSummary {
  total: number
  queued: number
  converting: number
  done: number
  failed: number
  skipped: number
}

/** Formats that are already EPUB (or manga/comics/non-local) — no conversion offered. */
export const NON_CONVERTIBLE_FORMATS = new Set(['epub', 'online-manga', 'cbz', 'cbr'])

export function isConvertibleFormat(format?: string): boolean {
  if (!format) return false
  return !NON_CONVERTIBLE_FORMATS.has(format.toLowerCase())
}

export interface BatchCandidate {
  id?: number
  title: string
  file_format?: string
}

/** Build the initial per-book status list from the selected books. */
export function createBatchItems(books: BatchCandidate[]): BatchConvertItem[] {
  const items: BatchConvertItem[] = []
  for (const book of books) {
    if (book.id == null) continue
    const format = book.file_format ?? ''
    items.push({
      bookId: book.id,
      title: book.title || `Book #${book.id}`,
      format,
      status: isConvertibleFormat(format) ? 'queued' : 'skipped',
    })
  }
  return items
}

function updateItem(
  items: BatchConvertItem[],
  bookId: number,
  patch: Partial<BatchConvertItem>,
): BatchConvertItem[] {
  return items.map((item) =>
    item.bookId === bookId ? { ...item, ...patch } : item,
  )
}

export function markConverting(items: BatchConvertItem[], bookId: number): BatchConvertItem[] {
  return updateItem(items, bookId, { status: 'converting', error: undefined })
}

export function markDone(items: BatchConvertItem[], bookId: number): BatchConvertItem[] {
  return updateItem(items, bookId, { status: 'done', error: undefined })
}

export function markFailed(
  items: BatchConvertItem[],
  bookId: number,
  error: string,
): BatchConvertItem[] {
  return updateItem(items, bookId, { status: 'failed', error })
}

/** Items that still need to be converted. */
export function queuedItems(items: BatchConvertItem[]): BatchConvertItem[] {
  return items.filter((item) => item.status === 'queued')
}

export function summarize(items: BatchConvertItem[]): BatchConvertSummary {
  const summary: BatchConvertSummary = {
    total: items.length,
    queued: 0,
    converting: 0,
    done: 0,
    failed: 0,
    skipped: 0,
  }
  for (const item of items) {
    summary[item.status] += 1
  }
  return summary
}
