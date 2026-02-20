import { useMemo, useEffect, useState, useCallback } from 'react'
import { BookOpen, Clock, Sparkles, Rss } from 'lucide-react'
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

const MANGA_FORMATS = ['cbz', 'cbr']

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

    // Load reading progress for books that have been opened
    const loadProgress = useCallback(async () => {
        const openedBooks = books.filter((b) => b.last_opened && b.id)
        const map: Record<number, ReadingProgress> = {}

        for (const book of openedBooks.slice(0, 20)) {
            try {
                const progress = await api.getReadingProgress(book.id!)
                if (progress && progress.progressPercent > 0 && progress.progressPercent < 100) {
                    map[book.id!] = progress
                }
            } catch {
                // Skip books with no progress
            }
        }
        setProgressMap(map)
    }, [books])

    useEffect(() => {
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
                <HomeSection
                    icon={<Clock size={18} />}
                    title="Continue Reading"
                >
                    <div className="scroll-strip">
                        {continueReading.map((book) => (
                            <ContinueReadingCard
                                key={book.id}
                                book={book}
                                progress={progressMap[book.id!]?.progressPercent ?? 0}
                                domain="books"
                                onClick={onOpenBook}
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
                    {recentlyAdded.map((book) => (
                        <RecentlyAddedCard
                            key={book.id}
                            book={book}
                            onClick={onOpenBook}
                        />
                    ))}
                </div>
            </HomeSection>

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
