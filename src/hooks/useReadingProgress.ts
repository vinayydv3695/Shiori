import { logger } from '@/lib/logger';
import { useEffect, useRef, useCallback, useState } from 'react'
import { api, type ReadingProgress } from '@/lib/tauri'

/**
 * Validate that a string looks like an EPUB CFI.
 * CFIs start with `epubcfi(` and end with `)`.
 */
function isValidCfi(cfi: string | undefined | null): cfi is string {
  if (!cfi) return false
  return cfi.startsWith('epubcfi(') && cfi.endsWith(')')
}

/**
 * useReadingProgress — Shiori v3.2
 *
 * - Loads saved position on mount (for resume reading)
 * - Debounced save: fires 2s after the last position change
 * - Flushes immediately on unmount (so closing the reader never loses the page)
 * - Supports CFI (Canonical Fragment Identifier) for precise EPUB positioning
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
    cfi?: string
  } | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bookIdRef = useRef(bookId)
  const isMountedRef = useRef(true)
  
  useEffect(() => { 
    bookIdRef.current = bookId 
  }, [bookId])

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

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
        snap.cfi,
      )
      if (isMountedRef.current) {
        setProgress(saved)
      }
    } catch (err) {
      logger.warn('[useReadingProgress] Save failed:', err)
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
    (location: string, pct: number, page?: number, total?: number, cfi?: string) => {
      pendingRef.current = { location, pct, page, total, cfi }
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
      cfiLocation?: string,
    ) => {
      saveProgress(currentLocation, progressPercent, currentPage, totalPagesArg, cfiLocation)
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
    /** CFI location for precise EPUB restore. Null for legacy/non-EPUB books. */
    initialCfi: progress?.cfiLocation ?? null,
    /** Whether the saved progress has a valid CFI for precise restore. */
    hasCfi: isValidCfi(progress?.cfiLocation),
  }
}
