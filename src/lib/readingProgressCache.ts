/**
 * readingProgressCache.ts
 *
 * Module-level reading-progress cache + micro-batcher (mirrors coverCache.ts).
 *
 * Problem: ModernBookCard's FormatPill called invoke('get_reading_progress', { bookId })
 * per online-manga card. A ~100-book online-manga library fired 100 IPC
 * round-trips on every render, saturating the Tauri IPC bridge.
 *
 * Solution: same pattern as coverCache — collect IDs for one microtask, fire a
 * single invoke('get_reading_progress_batch', { bookIds }) that returns all
 * rows in one SQL query. Results live in a module-level Map so they survive
 * unmount/remount (no re-fetch on re-render).
 */

import { invoke } from '@tauri-apps/api/core'
import type { ReadingProgress } from '@/lib/tauri'

// ─── Module-level cache (lives for the lifetime of the app) ──────────────────
// null = no progress row exists (avoid re-requesting)
const progressCache = new Map<number, ReadingProgress | null>()

// ─── Pending batch state ──────────────────────────────────────────────────────
type Resolver = (progress: ReadingProgress | null) => void
const pending = new Map<number, Resolver[]>()
let flushScheduled = false

// Chunk size matches SQLite's per-id IN (...) placeholders (max 999 vars).
const BATCH_CHUNK = 200

async function flushChunk(
  ids: number[],
  resolvers: Map<number, Resolver[]>,
): Promise<void> {
  try {
    const raw = await invoke<Record<string, unknown>>(
      'get_reading_progress_batch',
      { bookIds: ids },
    )
    for (const id of ids) {
      const value = raw[String(id)]
      const progress = normalizeReadingProgress(value)
      progressCache.set(id, progress)
      const waiters = resolvers.get(id) ?? []
      for (const resolve of waiters) resolve(progress)
    }
  } catch {
    // On error, resolve everyone with null (pill shows no chapter text)
    for (const id of ids) {
      progressCache.set(id, null)
      const waiters = resolvers.get(id) ?? []
      for (const resolve of waiters) resolve(null)
    }
  }
}

function flushBatch() {
  flushScheduled = false
  if (pending.size === 0) return

  const resolvers = new Map(pending)
  pending.clear()

  const ids = Array.from(resolvers.keys())
  for (let i = 0; i < ids.length; i += BATCH_CHUNK) {
    void flushChunk(ids.slice(i, i + BATCH_CHUNK), resolvers)
  }
}

/**
 * Request reading progress for a book.
 * Returns immediately if cached, otherwise queues in the current batch.
 */
export function requestReadingProgress(id: number): Promise<ReadingProgress | null> {
  const cached = progressCache.get(id)
  if (cached !== undefined) {
    return Promise.resolve(cached)
  }

  return new Promise<ReadingProgress | null>((resolve) => {
    const waiters = pending.get(id) ?? []
    waiters.push(resolve)
    pending.set(id, waiters)

    if (!flushScheduled) {
      flushScheduled = true
      // Microtask flush: all cards in the same render cycle queue up first,
      // then a single batch invoke goes out before the browser paints.
      queueMicrotask(flushBatch)
    }
  })
}

/** Invalidate one book's cached progress (call after progress update) */
export function invalidateReadingProgress(id: number) {
  progressCache.delete(id)
}

// Same snake/camel normalization as tauri.ts (kept local to avoid coupling)
function normalizeReadingProgress(raw: unknown): ReadingProgress | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>

  const bookId = Number(obj.bookId ?? obj.book_id)
  const progressPercent = Number(obj.progressPercent ?? obj.progress_percent ?? 0)
  const currentLocationRaw = obj.currentLocation ?? obj.current_location
  const currentLocation = typeof currentLocationRaw === 'string' ? currentLocationRaw : ''
  const lastReadRaw = obj.lastRead ?? obj.last_read
  const lastRead = typeof lastReadRaw === 'string' ? lastReadRaw : new Date().toISOString()

  const idRaw = obj.id
  const currentPageRaw = obj.currentPage ?? obj.current_page
  const totalPagesRaw = obj.totalPages ?? obj.total_pages
  const cfiRaw = obj.cfiLocation ?? obj.cfi_location

  return {
    id: typeof idRaw === 'number' ? idRaw : undefined,
    bookId: Number.isFinite(bookId) ? bookId : 0,
    currentLocation,
    progressPercent: Number.isFinite(progressPercent) ? progressPercent : 0,
    currentPage: typeof currentPageRaw === 'number' ? currentPageRaw : undefined,
    totalPages: typeof totalPagesRaw === 'number' ? totalPagesRaw : undefined,
    cfiLocation: typeof cfiRaw === 'string' ? cfiRaw : undefined,
    lastRead,
  }
}
