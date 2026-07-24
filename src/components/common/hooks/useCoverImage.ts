import { useState, useEffect } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { requestCoverUrl } from '@/lib/coverCache'

/** Normalize Windows backslash paths for the asset:// protocol */
function toAssetUrl(filePath: string): string {
  // HTTP(S) URLs (e.g. online manga cover CDN links)
  if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
    const isAndroid = typeof window !== 'undefined' && /android/i.test(navigator.userAgent);
    
    const needsProxy = filePath.includes('libgen') || 
                       filePath.includes('toontop') || 
                       filePath.includes('toonily') || 
                       filePath.includes('manhwaread') || 
                       filePath.includes('toongod') || 
                       filePath.includes('weebrook') || 
                       filePath.includes('manhwahub') || 
                       filePath.includes('mangafire');
                       
    if (needsProxy) {
      let sourceId = 'generic';
      if (filePath.includes('libgen')) sourceId = 'libgen';
      else if (filePath.includes('toontop')) sourceId = 'toontop';
      else if (filePath.includes('toonily')) sourceId = 'toonily';
      else if (filePath.includes('manhwaread')) sourceId = 'manhwaread';
      else if (filePath.includes('toongod')) sourceId = 'toongod';
      else if (filePath.includes('weebrook')) sourceId = 'weebrook';
      else if (filePath.includes('manhwahub')) sourceId = 'manhwahub';
      else if (filePath.includes('mangafire')) sourceId = 'mangafire';

      return isAndroid 
        ? `http://shiori-proxy.localhost?source=${sourceId}&url=${encodeURIComponent(filePath)}`
        : `shiori-proxy://localhost?source=${sourceId}&url=${encodeURIComponent(filePath)}`;
    }
    
    if (isAndroid) {
      return `http://shiori-proxy.localhost?source=generic&url=${encodeURIComponent(filePath)}`;
    }
    
    return filePath;
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
