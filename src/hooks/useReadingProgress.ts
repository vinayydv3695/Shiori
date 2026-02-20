import { useEffect, useState } from 'react'
import { api, type ReadingProgress } from '@/lib/tauri'

/**
 * Hook to manage reading progress for a book
 * Automatically saves progress and can resume from last position
 */
export const useReadingProgress = (bookId: number | null) => {
  const [progress, setProgress] = useState<ReadingProgress | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Load progress when bookId changes
  useEffect(() => {
    if (bookId) {
      loadProgress()
    }
  }, [bookId])

  const loadProgress = async () => {
    if (!bookId) return

    try {
      setIsLoading(true)
      const data = await api.getReadingProgress(bookId)
      setProgress(data)
    } catch (error) {
      console.log('No previous reading progress found')
      setProgress(null)
    } finally {
      setIsLoading(false)
    }
  }

  const saveProgress = async (
    currentLocation: string,
    progressPercent: number,
    currentPage?: number,
    totalPages?: number
  ) => {
    if (!bookId) return

    try {
      const savedProgress = await api.saveReadingProgress(
        bookId,
        currentLocation,
        progressPercent,
        currentPage,
        totalPages
      )
      setProgress(savedProgress)
    } catch (error) {
      console.error('Failed to save reading progress:', error)
    }
  }

  return {
    progress,
    isLoading,
    saveProgress,
    reload: loadProgress,
  }
}
