import { useMemo, useEffect, useState, useCallback } from 'react'
import { BookOpen, Clock, PlusCircle } from 'lucide-react'
import { StatsBar } from './StatsBar'
import { ContinueReadingCard, RecentlyAddedCard } from './ContinueReadingCard'
import { useLibraryStore } from '@/store/libraryStore'
import type { Book, ReadingProgress } from '@/lib/tauri'
import { api } from '@/lib/tauri'

interface MangaHomeProps {
    onOpenManga: (book: Book) => void
}

const MANGA_FORMATS = ['cbz', 'cbr', 'zip', 'online-manga']

export function MangaHome({ onOpenManga }: MangaHomeProps) {
    const { books } = useLibraryStore()
    const [inProgress, setInProgress] = useState<Array<{ book: Book; progress: ReadingProgress }>>([])
    const [loading, setLoading] = useState(true)

    // Filter manga only
    const mangaList = useMemo(() => {
        return books.filter((b) => MANGA_FORMATS.includes(b.format?.toLowerCase() || ''))
    }, [books])

    // Load reading progress for manga
    const loadProgress = useCallback(async () => {
        try {
            const allProgress = await api.getAllReadingProgress()
            const bookProgressMap = new Map(allProgress.map((p) => [p.book_id, p]))

            const inProgressManga: Array<{ book: Book; progress: ReadingProgress }> = []
            for (const book of mangaList) {
                const progress = bookProgressMap.get(book.id)
                if (progress && progress.status === 'reading' && progress.progress > 0 && progress.progress < 1) {
                    inProgressManga.push({ book, progress })
                }
            }

            // Sort by last read
            inProgressManga.sort((a, b) => {
                const dateA = a.progress.last_read ? new Date(a.progress.last_read).getTime() : 0
                const dateB = b.progress.last_read ? new Date(b.progress.last_read).getTime() : 0
                return dateB - dateA
            })

            setInProgress(inProgressManga.slice(0, 6))
        } catch (e) {
            console.error('Failed to load reading progress:', e)
        } finally {
            setLoading(false)
        }
    }, [mangaList])

    useEffect(() => {
        loadProgress()
    }, [loadProgress])

    // Recently added manga
    const recentlyAdded = useMemo(() => {
        return [...mangaList]
            .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
            .slice(0, 10)
    }, [mangaList])

    return (
        <div className="home-dashboard">
            <StatsBar />

            {inProgress.length > 0 && (
                <div className="bento-widget">
                    <div className="bento-widget-header">
                        <h2 className="bento-widget-title flex items-center gap-2"><BookOpen size={18} /> Continue Reading</h2>
                    </div>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(115px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] md:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3 md:gap-6 mt-4">
                        {inProgress.map(({ book, progress }) => (
                            <ContinueReadingCard
                                key={book.id}
                                book={book}
                                progress={progress}
                                onClick={onOpenManga}
                            />
                        ))}
                    </div>
                </div>
            )}

            <div className="bento-widget">
                <div className="bento-widget-header">
                    <h2 className="bento-widget-title flex items-center gap-2"><PlusCircle size={18} /> Recently Added</h2>
                </div>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(115px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] md:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3 md:gap-6 mt-4">
                    {recentlyAdded.map((item) => (
                        <RecentlyAddedCard
                            key={item.id}
                            book={item}
                            onClick={onOpenManga}
                        />
                    ))}
                </div>
            </div>
        </div>
    )
}
