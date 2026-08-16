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
    const allBooks = useLibraryStore((s) => s.books)
    const [progressMap, setProgressMap] = useState<Record<number, ReadingProgress>>({})

    // Filter manga only
    const mangaList = useMemo(() => {
        return allBooks.filter((b) => MANGA_FORMATS.includes(b.file_format?.toLowerCase() || ''))
    }, [allBooks])

    // Load reading progress for manga (single batch query)
    const loadProgress = useCallback(async () => {
        const openedMangaIds = mangaList
            .filter((b) => b.last_opened && b.id)
            .slice(0, 20)
            .map((b) => b.id!)

        if (openedMangaIds.length === 0) {
            setProgressMap({})
            return
        }

        try {
            const rawMap = await api.getReadingProgressBatch(openedMangaIds)
            const filteredMap: Record<number, ReadingProgress> = {}
            for (const [idStr, progress] of Object.entries(rawMap)) {
                const id = Number(idStr)
                if (progress && progress.progressPercent > 0 && progress.progressPercent < 100) {
                    filteredMap[id] = progress
                }
            }
            setProgressMap(filteredMap)
        } catch {
            // Skip on error
        }
    }, [mangaList])

    useEffect(() => {
        loadProgress()
    }, [loadProgress])

    // Manga that have been opened and have progress
    const continueReading = useMemo(() => {
        return mangaList
            .filter((b) => b.last_opened && b.id && progressMap[b.id])
            .sort((a, b) => {
                const dateA = a.last_opened ? new Date(a.last_opened).getTime() : 0
                const dateB = b.last_opened ? new Date(b.last_opened).getTime() : 0
                return dateB - dateA
            })
            .slice(0, 6)
    }, [mangaList, progressMap])

    // Recently added manga
    const recentlyAdded = useMemo(() => {
        return [...mangaList]
            .sort((a, b) => new Date(b.added_date).getTime() - new Date(a.added_date).getTime())
            .slice(0, 10)
    }, [mangaList])

    return (
        <div className="home-dashboard">
            <StatsBar books={mangaList} domain="manga_comics" />

            {continueReading.length > 0 && (
                <div className="bento-widget">
                    <div className="bento-widget-header">
                        <h2 className="bento-widget-title flex items-center gap-2"><BookOpen size={18} /> Continue Reading</h2>
                    </div>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(115px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] md:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3 md:gap-6 mt-4">
                        {continueReading.map((book) => (
                            <ContinueReadingCard
                                key={book.id}
                                book={book}
                                progress={progressMap[book.id!]!}
                                domain="manga_comics"
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
