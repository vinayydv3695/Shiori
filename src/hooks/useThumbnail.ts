import { useState, useEffect } from 'react'
import { api } from '@/lib/tauri'
import { convertFileSrc } from '@tauri-apps/api/core'
import { lruGet, lruSet } from '@/lib/lruCache'

// Module-level thumbnail cache (like coverCache): thumbnails survive
// component unmount/remount, so scrolling back to a book skips the
// getThumbnail IPC round-trip. Size-guarded; only successful thumbs cached.
const THUMB_CACHE_MAX = 2_000
const thumbCache = new Map<number, string>()

export function useThumbnail(bookId: number | undefined, originalCoverPath?: string | null) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    async function fetchThumbnail() {
      if (!bookId) return

      // Cache hit — skip the IPC call entirely
      const cached = lruGet(thumbCache, bookId)
      if (cached !== undefined) {
        if (isMounted) setThumbUrl(cached)
        return
      }

      // Try fetching thumbnail
      try {
        const thumbPath = await api.getThumbnail(bookId)
        if (isMounted && thumbPath) {
          const url = convertFileSrc(thumbPath)
          lruSet(thumbCache, bookId, url, THUMB_CACHE_MAX)
          setThumbUrl(url)
          return
        }
      } catch (err) {
        // ignore
      }

      // Fallback to original
      if (isMounted && originalCoverPath) {
        setThumbUrl(convertFileSrc(originalCoverPath))
      }
    }

    fetchThumbnail()

    return () => {
      isMounted = false
    }
  }, [bookId, originalCoverPath])

  return thumbUrl
}
