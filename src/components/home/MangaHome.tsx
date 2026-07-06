import { useMemo, useEffect, useState, useCallback } from 'react'
import { BookOpen, Clock, Sparkles } from 'lucide-react'
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

    // Filter to manga only
    const manga = useMemo(
        () => allBooks.filter((b) => MANGA_FORMATS.includes(b.file_format.toLowerCase())),
        [allBooks]
    )

    // Manga with reading progress
    const continueReading = useMemo(() => {
        return manga
            .filter((b) => b.last_opened && b.id && progressMap[b.id])
            .sort((a, b) => {
                const dateA = a.last_opened ? new Date(a.last_opened).getTime() : 0
                const dateB = b.last_opened ? new Date(b.last_opened).getTime() : 0
                return dateB - dateA
            })
            .slice(0, 10)
    }, [manga, progressMap])

    // Recently added manga
    const recentlyAdded = useMemo(() => {
        return [...manga]
            .sort((a, b) => new Date(b.added_date).getTime() - new Date(a.added_date).getTime())
            .slice(0, 12)
    }, [manga])

    // Load reading progress
    const loadProgress = useCallback(async () => {
        const openedManga = manga.filter((b) => b.last_opened && b.id)
        const map: Record<number, ReadingProgress> = {}

        for (const item of openedManga.slice(0, 20)) {
            try {
                const progress = await api.getReadingProgress(item.id!)
                if (progress && progress.progressPercent > 0 && progress.progressPercent < 100) {
                    map[item.id!] = progress
                }
            } catch {
                // Skip items with no progress
            }
        }
        setProgressMap(map)
    }, [manga])

    useEffect(() => {
        // Intentional: loading data on mount/dependency change
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadProgress()
    }, [loadProgress])

    if (manga.length === 0) {
        return (
            <div className="home-container">
                <div className="home-empty">
                    <BookOpen className="home-empty-icon" />
                    <div className="home-empty-title">No manga in your library</div>
                    <div className="home-empty-desc">
                        Import your manga archives (CBZ, CBR) to get started. Click the "Import Manga" button in the toolbar.
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="home-container">
            <StatsBar books={manga} domain="manga_comics" />

            {continueReading.length > 0 && (
                <div className="bento-widget">
                    <div className="bento-widget-header">
                        <h2 className="bento-widget-title flex items-center gap-2"><Clock size={18} /> Continue Reading</h2>
                    </div>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(115px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] md:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3 md:gap-6 mt-4">
                        {continueReading.map((item) => (
                            <ContinueReadingCard
                                key={item.id}
                                book={item}
                                progress={progressMap[item.id!]!}
                                domain="manga_comics"
                                onClick={onOpenManga}
                            />
                        ))}
                    </div>
                </div>
            )}

            <div className="bento-widget">
                <div className="bento-widget-header">
                    <h2 className="bento-widget-title flex items-center gap-2"><Sparkles size={18} /> Recently Added</h2>
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
