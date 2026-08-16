import { useMemo, useEffect, useState, useCallback } from 'react'
import { BookOpen, Clock, PlusCircle, Rss } from 'lucide-react'
import { StatsBar } from './StatsBar'
import { HomeSection } from './HomeSection'
import { ContinueReadingCard, RecentlyAddedCard } from './ContinueReadingCard'
import { useLibraryStore } from '@/store/libraryStore'
import type { Book, ReadingProgress } from '@/lib/tauri'
import { api } from '@/lib/tauri'

interface BooksHomeProps {
    onOpenBook: (book: Book) => void
    onViewRSS: () => void
}

const MANGA_FORMATS = ['cbz', 'cbr', 'zip', 'online-manga']

export function BooksHome({ onOpenBook, onViewRSS }: BooksHomeProps) {
    const allBooks = useLibraryStore((s) => s.books)
    const [progressMap, setProgressMap] = useState<Record<number, ReadingProgress>>({})

    // Filter to books only (exclude manga)
    const books = useMemo(
        () => allBooks.filter((b) => !MANGA_FORMATS.includes(b.file_format.toLowerCase())),
        [allBooks]
    )

    // Books that have been opened and have progress
    const continueReading = useMemo(() => {
        return books
            .filter((b) => b.last_opened && b.id && progressMap[b.id])
            .sort((a, b) => {
                const dateA = a.last_opened ? new Date(a.last_opened).getTime() : 0
                const dateB = b.last_opened ? new Date(b.last_opened).getTime() : 0
                return dateB - dateA
            })
            .slice(0, 10)
    }, [books, progressMap])

    // Recently added (last 12)
    const recentlyAdded = useMemo(() => {
        return [...books]
            .sort((a, b) => new Date(b.added_date).getTime() - new Date(a.added_date).getTime())
            .slice(0, 12)
    }, [books])

    // Load reading progress for books that have been opened (single batch query)
    const loadProgress = useCallback(async () => {
        const openedBookIds = books
            .filter((b) => b.last_opened && b.id)
            .slice(0, 20)
            .map((b) => b.id!)

        if (openedBookIds.length === 0) {
            setProgressMap({})
            return
        }

        try {
            const rawMap = await api.getReadingProgressBatch(openedBookIds)
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
    }, [books])

    useEffect(() => {
        // Intentional: loading data on mount/dependency change
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadProgress()
    }, [loadProgress])

    if (books.length === 0) {
        return (
            <div className="home-container">
                <div className="home-empty">
                    <BookOpen className="home-empty-icon" />
                    <div className="home-empty-title">Your book library is empty</div>
                    <div className="home-empty-desc">
                        Import your eBooks (EPUB, PDF, MOBI) to get started. Click the "Import Books" button in the toolbar.
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="home-container">
            <StatsBar books={books} domain="books" />

            {continueReading.length > 0 && (
                <div className="bento-widget">
                    <div className="bento-widget-header">
                        <h2 className="bento-widget-title flex items-center gap-2"><Clock size={18} /> Continue Reading</h2>
                    </div>
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(115px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] md:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3 md:gap-6 mt-4">
                        {continueReading.map((book) => (
                            <ContinueReadingCard
                                key={book.id}
                                book={book}
                                progress={progressMap[book.id!]!}
                                domain="books"
                                onClick={onOpenBook}
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
                    {recentlyAdded.map((book) => (
                        <RecentlyAddedCard
                            key={book.id}
                            book={book}
                            onClick={onOpenBook}
                        />
                    ))}
                </div>
            </div>

            <div className="home-divider" />

            <HomeSection
                icon={<Rss size={18} />}
                title="Latest News"
                action={{ label: 'View All', onClick: onViewRSS }}
            >
                <div className="rss-preview-list">
                    <div className="rss-preview-item" onClick={onViewRSS}>
                        <div className="rss-preview-title">Check your RSS feeds for the latest book news</div>
                    </div>
                </div>
            </HomeSection>
        </div>
    )
}
