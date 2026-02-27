import { useEffect, useState, useMemo } from 'react';
import { api, type Book, type ReadingProgress } from '@/lib/tauri';
import { useCoverImage } from '@/components/common/hooks/useCoverImage';
import { BookOpen, Clock } from '@/components/icons';

interface ContinueReadingProps {
    onOpenBook: (bookId: number) => void;
}

interface RecentBook {
    book: Book;
    progress: ReadingProgress;
}

function ContinueReadingCard({ book, progress, onOpen }: { book: Book; progress: ReadingProgress; onOpen: () => void }) {
    const { coverUrl } = useCoverImage(book.id, book.cover_path);

    const timeAgo = useMemo(() => {
        if (!progress.lastRead) return '';
        const now = new Date();
        const lastRead = new Date(progress.lastRead);
        const diffMs = now.getTime() - lastRead.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return lastRead.toLocaleDateString();
    }, [progress.lastRead]);

    return (
        <button
            onClick={onOpen}
            className="continue-reading-card"
            title={`Continue reading ${book.title}`}
        >
            {/* Cover thumbnail */}
            <div className="continue-reading-cover">
                {coverUrl ? (
                    <img src={coverUrl} alt={book.title} className="continue-reading-cover-img" />
                ) : (
                    <div className="continue-reading-cover-placeholder">
                        <BookOpen className="continue-reading-cover-icon" />
                    </div>
                )}
                {/* Progress overlay */}
                <div className="continue-reading-progress-ring">
                    <svg viewBox="0 0 36 36" className="continue-reading-circle">
                        <path
                            className="continue-reading-circle-bg"
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                        <path
                            className="continue-reading-circle-fill"
                            strokeDasharray={`${Math.round(progress.progressPercent)}, 100`}
                            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                    </svg>
                    <span className="continue-reading-percent">{Math.round(progress.progressPercent)}%</span>
                </div>
            </div>

            {/* Book info */}
            <div className="continue-reading-info">
                <span className="continue-reading-title">{book.title}</span>
                <span className="continue-reading-author">
                    {book.authors?.map(a => a.name).join(', ') || 'Unknown'}
                </span>
                <span className="continue-reading-time">
                    <Clock className="continue-reading-time-icon" />
                    {timeAgo}
                </span>
            </div>
        </button>
    );
}

export function ContinueReading({ onOpenBook }: ContinueReadingProps) {
    const [recentBooks, setRecentBooks] = useState<RecentBook[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        loadRecentBooks();
    }, []);

    const loadRecentBooks = async () => {
        try {
            setIsLoading(true);
            const books = await api.getBooks(20, 0);

            // Get reading progress for each book and filter to those with progress
            const booksWithProgress: RecentBook[] = [];

            for (const book of books) {
                if (!book.id) continue;
                try {
                    const progress = await api.getReadingProgress(book.id);
                    if (progress && progress.progressPercent > 0 && progress.progressPercent < 100) {
                        booksWithProgress.push({ book, progress });
                    }
                } catch {
                    // Skip books where progress can't be loaded
                }
            }

            // Sort by last read time (most recent first)
            booksWithProgress.sort((a, b) => {
                const dateA = new Date(a.progress.lastRead).getTime();
                const dateB = new Date(b.progress.lastRead).getTime();
                return dateB - dateA;
            });

            // Take top 5
            setRecentBooks(booksWithProgress.slice(0, 5));
        } catch (err) {
            console.error('Failed to load recent books:', err);
        } finally {
            setIsLoading(false);
        }
    };

    if (isLoading || recentBooks.length === 0) {
        return null; // Don't render if no books to continue
    }

    return (
        <div className="continue-reading-section">
            <div className="continue-reading-header">
                <h2 className="continue-reading-heading">Continue Reading</h2>
                <span className="continue-reading-count">{recentBooks.length} book{recentBooks.length !== 1 ? 's' : ''}</span>
            </div>

            <div className="continue-reading-scroll">
                {recentBooks.map((item) => (
                    <ContinueReadingCard
                        key={item.book.id}
                        book={item.book}
                        progress={item.progress}
                        onOpen={() => item.book.id && onOpenBook(item.book.id)}
                    />
                ))}
            </div>
        </div>
    );
}
