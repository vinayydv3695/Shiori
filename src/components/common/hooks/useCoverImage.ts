import { useState, useEffect } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { requestCoverUrl } from '@/lib/coverCache'

/** Normalize Windows backslash paths for the asset:// protocol */
function toAssetUrl(filePath: string): string {
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
    // If an initial path was provided, use it directly — no IPC needed
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
