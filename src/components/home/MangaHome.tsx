import { useMemo, useEffect, useState, useCallback } from 'react'
import { BookOpen, Clock, Sparkles } from 'lucide-react'
import { StatsBar } from './StatsBar'
import { HomeSection } from './HomeSection'
import { ContinueReadingCard, RecentlyAddedCard } from './ContinueReadingCard'
import { useLibraryStore } from '@/store/libraryStore'
import type { Book, ReadingProgress } from '@/lib/tauri'
import { api } from '@/lib/tauri'

interface MangaHomeProps {
    onOpenManga: (book: Book) => void
}

const MANGA_FORMATS = ['cbz', 'cbr']

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
            <StatsBar books={manga} domain="manga" />

            {continueReading.length > 0 && (
                <HomeSection
                    icon={<Clock size={18} />}
                    title="Continue Reading"
                >
                    <div className="scroll-strip">
                        {continueReading.map((item) => (
                            <ContinueReadingCard
                                key={item.id}
                                book={item}
                                progress={progressMap[item.id!]?.progressPercent ?? 0}
                                domain="manga"
                                onClick={onOpenManga}
                            />
                        ))}
                    </div>
                </HomeSection>
            )}

            <HomeSection
                icon={<Sparkles size={18} />}
                title="Recently Added"
            >
                <div className="scroll-strip">
                    {recentlyAdded.map((item) => (
                        <RecentlyAddedCard
                            key={item.id}
                            book={item}
                            onClick={onOpenManga}
                        />
                    ))}
                </div>
            </HomeSection>
        </div>
    )
}
