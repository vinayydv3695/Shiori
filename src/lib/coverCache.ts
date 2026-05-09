/**
 * coverCache.ts
 *
 * Module-level cover path cache + micro-batcher.
 *
 * Problem: each PremiumBookCard called invoke('get_cover_path_by_id', { id })
 * independently. With 200 cards visible, that fires 200 IPC round-trips
 * simultaneously, saturating the Tauri IPC bridge and making the grid
 * appear sluggish for ~1-2 seconds on scroll.
 *
 * Solution: a micro-batcher that collects IDs for one animation frame, then
 * fires a single invoke('get_cover_paths_batch', { ids }) that returns all
 * paths in one SQL query. Results are stored in a module-level Map so they
 * survive component unmount/remount (no re-fetch on re-render).
 */

import { invoke, convertFileSrc } from '@tauri-apps/api/core'

// ─── Module-level cache (lives for the lifetime of the app) ──────────────────
const pathCache = new Map<number, string | null>()  // null = no cover exists

// ─── Pending batch state ──────────────────────────────────────────────────────
type Resolver = (url: string | null) => void
const pending = new Map<number, Resolver[]>()
let rafScheduled = false

function flushBatch() {
  rafScheduled = false
  if (pending.size === 0) return

  const ids = Array.from(pending.keys())
  const resolvers = new Map(pending)
  pending.clear()

  invoke<Record<string, string>>('get_cover_paths_batch', { ids })
    .then((result) => {
      for (const id of ids) {
        const path = result[String(id)] ?? null
        pathCache.set(id, path)
        const url = path ? convertFileSrc(path) : null
        const waiters = resolvers.get(id) ?? []
        for (const resolve of waiters) resolve(url)
      }
    })
    .catch(() => {
      // On error, resolve everyone with null (card shows placeholder)
      for (const [id, waiters] of resolvers) {
        pathCache.set(id, null)
        for (const resolve of waiters) resolve(null)
      }
    })
}

/**
 * Request the cover URL for a book.
 * Returns immediately if cached, otherwise queues in the current batch.
 */
export function requestCoverUrl(id: number): Promise<string | null> {
  // Cache hit
  if (pathCache.has(id)) {
    const path = pathCache.get(id)!
    return Promise.resolve(path ? convertFileSrc(path) : null)
  }

  // Queue into the current batch
  return new Promise<string | null>((resolve) => {
    const waiters = pending.get(id) ?? []
    waiters.push(resolve)
    pending.set(id, waiters)

    if (!rafScheduled) {
      rafScheduled = true
      // Use microtask (queueMicrotask) so the batch flushes after the
      // current synchronous render completes but before the browser paints.
      // This gives time for all cards in the same render cycle to queue up.
      queueMicrotask(flushBatch)
    }
  })
}

/** Pre-warm the cache for a list of IDs (called by LibraryGrid after data loads) */
export async function prefetchCovers(ids: number[]): Promise<void> {
  const missing = ids.filter(id => !pathCache.has(id))
  if (missing.length === 0) return

  // Chunk into 200-ID batches (matches Rust cap)
  for (let i = 0; i < missing.length; i += 200) {
    const chunk = missing.slice(i, i + 200)
    try {
      const result = await invoke<Record<string, string>>('get_cover_paths_batch', { ids: chunk })
      for (const id of chunk) {
        pathCache.set(id, result[String(id)] ?? null)
      }
    } catch {
      // Non-fatal: individual cards will retry via requestCoverUrl
    }
  }
}

/** Invalidate a single book's cached cover (call after cover update) */
export function invalidateCover(id: number) {
  pathCache.delete(id)
}
