import { useMemo } from 'react'
import type { Book } from '@/lib/tauri'

interface StatsBarProps {
    books: Book[]
    domain: 'books' | 'manga'
}

function formatSize(bytes: number): string {
    if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
    if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`
    return `${(bytes / 1e3).toFixed(0)} KB`
}

export function StatsBar({ books, domain }: StatsBarProps) {
    const stats = useMemo(() => {
        const totalSize = books.reduce((sum, b) => sum + (b.file_size || 0), 0)
        const formats = new Set(books.map(b => b.file_format.toUpperCase()))
        const totalPages = books.reduce((sum, b) => sum + (b.page_count || 0), 0)

        if (domain === 'manga') {
            return [
                { value: books.length.toString(), label: 'Manga' },
                { value: totalPages.toLocaleString(), label: 'Total Pages' },
                { value: formatSize(totalSize), label: 'Library Size' },
            ]
        }

        return [
            { value: books.length.toString(), label: 'Books' },
            { value: formats.size.toString(), label: 'Formats' },
            { value: formatSize(totalSize), label: 'Library Size' },
        ]
    }, [books, domain])

    return (
        <div className="stats-bar">
            {stats.map((stat) => (
                <div key={stat.label} className="stat-card" data-domain={domain}>
                    <div className="stat-value">{stat.value}</div>
                    <div className="stat-label">{stat.label}</div>
                </div>
            ))}
        </div>
    )
}
