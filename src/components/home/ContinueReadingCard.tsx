import { useCoverImage } from '../common/hooks/useCoverImage'
import { BookOpen } from 'lucide-react'
import type { Book } from '@/lib/tauri'

interface ContinueReadingCardProps {
    book: Book
    progress: number // 0-100
    domain: 'books' | 'manga'
    onClick: (book: Book) => void
}

export function ContinueReadingCard({ book, progress, domain, onClick }: ContinueReadingCardProps) {
    const { coverUrl: coverSrc, loading: coverLoading } = useCoverImage(book.id, null)

    const progressLabel = domain === 'manga'
        ? `Page ${Math.round((progress / 100) * (book.page_count || 0))} of ${book.page_count || '?'}`
        : `${Math.round(progress)}%`

    return (
        <div className="continue-card" onClick={() => onClick(book)}>
            {coverSrc ? (
                <img className="continue-card-cover" src={coverSrc} alt={book.title} loading="lazy" />
            ) : (
                <div className="continue-card-cover-placeholder">
                    {coverLoading ? <div className="animate-pulse bg-muted w-full h-full" /> : <BookOpen size={32} />}
                </div>
            )}
            <div className="continue-card-info">
                <div className="continue-card-title" title={book.title}>{book.title}</div>
                <div className="continue-card-progress-bar">
                    <div
                        className="continue-card-progress-fill"
                        data-domain={domain}
                        style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                    />
                </div>
                <div className="continue-card-progress-label">{progressLabel}</div>
            </div>
        </div>
    )
}

interface RecentlyAddedCardProps {
    book: Book
    onClick: (book: Book) => void
}

export function RecentlyAddedCard({ book, onClick }: RecentlyAddedCardProps) {
    const { coverUrl: coverSrc, loading: coverLoading } = useCoverImage(book.id, null)

    return (
        <div className="recent-card" onClick={() => onClick(book)}>
            {coverSrc ? (
                <img className="recent-card-cover" src={coverSrc} alt={book.title} loading="lazy" />
            ) : (
                <div className="recent-card-cover-placeholder">
                    {coverLoading ? <div className="animate-pulse bg-muted w-full h-full" /> : <span>📚</span>}
                </div>
            )}
            <div className="recent-card-title" title={book.title}>{book.title}</div>
        </div>
    )
}
