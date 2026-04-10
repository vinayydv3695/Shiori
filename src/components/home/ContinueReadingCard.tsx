import { useState, useEffect, useRef } from 'react'
import { useCoverImage } from '../common/hooks/useCoverImage'
import { BookOpen } from 'lucide-react'
import { usePreferencesStore } from '@/store/preferencesStore'
import type { Book } from '@/lib/tauri'

interface ContinueReadingCardProps {
    book: Book
    progress: number // 0-100
    domain: 'books' | 'manga_comics'
    onClick: (book: Book) => void
}

const getTitleInitialToken = (title: string | null | undefined): string => {
    const token = title?.trim().split(/\s+/)[0]?.[0]
    return token ? token.toUpperCase() : '?'
}

export function ContinueReadingCard({ book, progress, domain, onClick }: ContinueReadingCardProps) {
    const { coverUrl: coverSrc, loading: coverLoading } = useCoverImage(book.id, book.cover_path)
    const libraryDensity = usePreferencesStore(s => s.preferences?.libraryDensity ?? 'comfortable')
    const coverSize = usePreferencesStore(s => s.preferences?.coverSize ?? 'medium')
    const [failedCoverSrc, setFailedCoverSrc] = useState<string | null>(null)
    const [isVisible, setIsVisible] = useState(false)
    const cardRef = useRef<HTMLButtonElement>(null)

    // Animate progress bar when card enters viewport
    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsVisible(true)
                    observer.disconnect()
                }
            },
            { threshold: 0.3 }
        )

        if (cardRef.current) {
            observer.observe(cardRef.current)
        }

        return () => observer.disconnect()
    }, [])

    const progressLabel = domain === 'manga_comics'
        ? `Page ${Math.round((progress / 100) * (book.page_count || 0))} of ${book.page_count || '?'}`
        : `${Math.round(progress)}%`
    const titleInitial = getTitleInitialToken(book.title)

    const showPlaceholder = coverLoading || !coverSrc || failedCoverSrc === coverSrc

    // Get author from book metadata
    const author = book.authors?.[0]?.name

    return (
        <button
            ref={cardRef}
            type="button"
            className="continue-card"
            data-density={libraryDensity}
            data-cover-size={coverSize}
            onClick={() => onClick(book)}
        >
            <div className="continue-card-cover-frame">
                {showPlaceholder ? (
                    <div className="continue-card-cover-placeholder">
                        {coverLoading ? (
                            <div className="animate-pulse bg-muted w-full h-full" />
                        ) : (
                            <>
                                <BookOpen className="continue-card-cover-placeholder-icon" size={22} />
                                <span className="continue-card-cover-placeholder-token">{titleInitial}</span>
                            </>
                        )}
                    </div>
                ) : (
                    <img
                        className="continue-card-cover"
                        src={coverSrc}
                        alt={book.title}
                        loading="lazy"
                        decoding="async"
                        onError={() => setFailedCoverSrc(coverSrc)}
                    />
                )}
            </div>
            <div className="continue-card-info">
                <div className="continue-card-title" title={book.title}>{book.title}</div>
                {author && (
                    <div className="continue-card-author" title={author}>{author}</div>
                )}
                <div className="continue-card-progress-bar">
                    <div
                        className={`continue-card-progress-fill ${isVisible ? 'animate' : ''}`}
                        data-domain={domain}
                        style={{ 
                            width: isVisible ? `${Math.min(100, Math.max(0, progress))}%` : '0%',
                            '--target-width': `${Math.min(100, Math.max(0, progress))}%`
                        } as React.CSSProperties}
                    />
                </div>
                <div className="continue-card-progress-label">
                    <span>{progressLabel}</span>
                    {book.page_count && domain === 'books' && (
                        <span className="pages">{book.page_count} pages</span>
                    )}
                </div>
            </div>
        </button>
    )
}

interface RecentlyAddedCardProps {
    book: Book
    onClick: (book: Book) => void
}

export function RecentlyAddedCard({ book, onClick }: RecentlyAddedCardProps) {
    const { coverUrl: coverSrc, loading: coverLoading } = useCoverImage(book.id, book.cover_path)
    const libraryDensity = usePreferencesStore(s => s.preferences?.libraryDensity ?? 'comfortable')
    const coverSize = usePreferencesStore(s => s.preferences?.coverSize ?? 'medium')
    const [failedCoverSrc, setFailedCoverSrc] = useState<string | null>(null)

    const showPlaceholder = coverLoading || !coverSrc || failedCoverSrc === coverSrc
    const titleInitial = getTitleInitialToken(book.title)

    // Get author from book metadata
    const author = book.authors?.[0]?.name

    return (
        <button
            type="button"
            className="recent-card"
            data-density={libraryDensity}
            data-cover-size={coverSize}
            onClick={() => onClick(book)}
        >
            <div className="recent-card-cover-frame">
                {showPlaceholder ? (
                    <div className="recent-card-cover-placeholder">
                        {coverLoading ? (
                            <div className="animate-pulse bg-muted w-full h-full" />
                        ) : (
                            <>
                                <BookOpen className="recent-card-cover-placeholder-icon" size={22} />
                                <span className="recent-card-cover-placeholder-token">{titleInitial}</span>
                            </>
                        )}
                    </div>
                ) : (
                    <img
                        className="recent-card-cover"
                        src={coverSrc}
                        alt={book.title}
                        loading="lazy"
                        decoding="async"
                        onError={() => setFailedCoverSrc(coverSrc)}
                    />
                )}
            </div>
            <div className="recent-card-info">
                <div className="recent-card-title" title={book.title}>{book.title}</div>
                {author && (
                    <div className="recent-card-author" title={author}>{author}</div>
                )}
            </div>
        </button>
    )
}
