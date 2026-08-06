import { useState, useEffect } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { requestCoverUrl } from '@/lib/coverCache'
import { proxyExternalCover } from '@/lib/utils'

function toAssetUrl(filePath: string): string | null {
  // Empty / whitespace-only paths mean "no cover" — never emit "" (React
  // warns on <img src=""> and unguarded consumers would render a broken img).
  if (!filePath.trim()) return null
  // HTTP(S) URLs (e.g. online manga cover CDN links)
  if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
    return proxyExternalCover(filePath);
  }
  return convertFileSrc(filePath.replace(/\\/g, '/'))
}

/**
 * useCoverImage — resolves a cover URL for a book.
 *
 * If `initialCoverSrc` is provided (a raw file path from the Book object),
 * it is converted immediately with no IPC call.
 *
 * Otherwise, delegates to the module-level coverCache micro-batcher which
 * groups IDs from the same render cycle into a single batch IPC call.
 */
export function useCoverImage(bookId?: number, initialCoverSrc?: string | null) {
  const [coverUrl, setCoverUrl] = useState<string | null>(
    initialCoverSrc ? toAssetUrl(initialCoverSrc) : null
  )
  const [loading, setLoading] = useState(!initialCoverSrc && !!bookId)
  const [error, setError] = useState(false)

  useEffect(() => {
    // If an initial path was provided, use it directly — no IPC needed.
    // toAssetUrl returns null for empty/whitespace paths, so coverUrl can
    // never become "" even when a coverless book re-renders mid-import.
    if (initialCoverSrc) {
      setCoverUrl(toAssetUrl(initialCoverSrc))
      setLoading(false)
      setError(false)
      return
    }

    if (!bookId) {
      setLoading(false)
      return
    }

    let mounted = true
    setLoading(true)
    setError(false)

    requestCoverUrl(bookId).then((url) => {
      if (!mounted) return
      if (url) {
        setCoverUrl(url)
        setError(false)
      } else {
        setError(true)
      }
      setLoading(false)
    })

    return () => { mounted = false }
  }, [bookId, initialCoverSrc])

  return { coverUrl, loading, error }
}
