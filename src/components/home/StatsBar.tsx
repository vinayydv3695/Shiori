import { useMemo } from 'react'
import type { Book } from '@/lib/tauri'

interface StatsBarProps {
    books: Book[]
    domain: 'books' | 'manga_comics'
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

        if (domain === 'manga_comics') {
            return [
                { value: books.length.toString(), label: 'Manga & Comics' },
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
        <div className="grid grid-cols-3 gap-2 sm:gap-3 w-full">
            {stats.map((stat) => (
                <div 
                    key={stat.label} 
                    className="stat-card p-2.5 sm:p-4 rounded-2xl border border-border/60 bg-card/85 shadow-2xs flex flex-col justify-center min-w-0" 
                    data-domain={domain}
                >
                    <div className="stat-value text-base sm:text-2xl font-extrabold text-foreground truncate leading-tight">
                        {stat.value}
                    </div>
                    <div className="stat-label text-[10px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-1 truncate">
                        {stat.label}
                    </div>
                </div>
            ))}
        </div>
    )
}
