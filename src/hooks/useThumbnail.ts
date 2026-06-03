import { useState, useEffect } from 'react'
import { api } from '@/lib/tauri'
import { convertFileSrc } from '@tauri-apps/api/core'

export function useThumbnail(bookId: number | undefined, originalCoverPath?: string | null) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    async function fetchThumbnail() {
      if (!bookId) return

      // Try fetching thumbnail
      try {
        const thumbPath = await api.getThumbnail(bookId)
        if (isMounted && thumbPath) {
          setThumbUrl(convertFileSrc(thumbPath))
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
