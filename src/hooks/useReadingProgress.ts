import { useEffect, useRef, useCallback, useState } from 'react'
import { api, type ReadingProgress } from '@/lib/tauri'

/**
 * useReadingProgress — Shiori v3.1
 *
 * - Loads saved position on mount (for resume reading)
 * - Debounced save: fires 2s after the last position change
 * - Flushes immediately on unmount (so closing the reader never loses the page)
 * - Non-fatal: errors are logged but never thrown
 */
export const useReadingProgress = (bookId: number | null, totalPages?: number) => {
  const [progress, setProgress] = useState<ReadingProgress | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Pending flush state
  const pendingRef = useRef<{
    location: string
    pct: number
    page?: number
    total?: number
  } | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bookIdRef = useRef(bookId)
  useEffect(() => { bookIdRef.current = bookId }, [bookId])

  // ── Load progress on mount ──────────────────────────────────────────
  useEffect(() => {
    if (!bookId) return
    let cancelled = false

    const load = async () => {
      setIsLoading(true)
      try {
        const data = await api.getReadingProgress(bookId)
        if (!cancelled) setProgress(data)
      } catch {
        if (!cancelled) setProgress(null)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [bookId])

  // ── Flush helper ────────────────────────────────────────────────────
  const flush = useCallback(async () => {
    const snap = pendingRef.current
    const id = bookIdRef.current
    if (!snap || !id) return
    pendingRef.current = null

    try {
      const saved = await api.saveReadingProgress(
        id,
        snap.location,
        snap.pct,
        snap.page,
        snap.total ?? totalPages,
      )
      setProgress(saved)
    } catch (err) {
      console.warn('[useReadingProgress] Save failed:', err)
    }
  }, [totalPages])

  // Flush on unmount (catches reader close)
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      void flush()
    }
  }, [flush])

  // ── Debounced save (public API) ─────────────────────────────────────
  const saveProgress = useCallback(
    (location: string, pct: number, page?: number, total?: number) => {
      pendingRef.current = { location, pct, page, total }
      if (timerRef.current !== null) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        void flush()
      }, 2000)
    },
    [flush],
  )

  // Legacy synchronous save kept for backward compat (calls debounced version)
  const saveProgressCompat = useCallback(
    async (
      currentLocation: string,
      progressPercent: number,
      currentPage?: number,
      totalPagesArg?: number,
    ) => {
      saveProgress(currentLocation, progressPercent, currentPage, totalPagesArg)
    },
    [saveProgress],
  )

  return {
    progress,
    isLoading,
    /** Debounced save — call on every position change. */
    saveProgress: saveProgressCompat,
    reload: async () => {
      if (!bookId) return
      const data = await api.getReadingProgress(bookId)
      setProgress(data)
    },
    /** Initial position to restore (short-hand from progress object). */
    initialPosition: progress?.currentLocation ?? '',
    initialPage: progress?.currentPage ?? 0,
  }
}
