import { useLibraryStore } from '@/store/libraryStore'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { ArrowDownUp, Check, ChevronDown, ChevronUp } from 'lucide-react'

const SORT_OPTIONS = [
  { id: 'added_date', label: 'Date Added' },
  { id: 'title', label: 'Title' },
  { id: 'author', label: 'Author' },
  { id: 'pubdate', label: 'Release Date' },
  { id: 'rating', label: 'Rating' },
]

export function SortDropdown() {
  const sortBy = useLibraryStore((s) => s.sortBy)
  const sortOrder = useLibraryStore((s) => s.sortOrder)
  const setSort = useLibraryStore((s) => s.setSort)
  const loadInitialBooks = useLibraryStore((s) => s.loadInitialBooks)

  const handleSortChange = (newSortBy: string) => {
    if (sortBy === newSortBy) {
      // Toggle order
      const newOrder = sortOrder === 'asc' ? 'desc' : 'asc'
      setSort(newSortBy, newOrder)
    } else {
      // Set new sort with default descending (except title and author which make more sense ascending)
      const newOrder = (newSortBy === 'title' || newSortBy === 'author') ? 'asc' : 'desc'
      setSort(newSortBy, newOrder)
    }
    // Reload books
    loadInitialBooks()
  }

  const handleOrderToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    const newOrder = sortOrder === 'asc' ? 'desc' : 'asc'
    setSort(sortBy, newOrder)
    loadInitialBooks()
  }

  const currentLabel = SORT_OPTIONS.find((o) => o.id === sortBy)?.label || 'Sort'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-border',
            'text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent',
            'transition-all duration-[120ms]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
          )}
        >
          <ArrowDownUp size={14} />
          <span>{currentLabel}</span>
          {sortOrder === 'asc' ? (
            <ChevronUp size={12} className="opacity-70" />
          ) : (
            <ChevronDown size={12} className="opacity-70" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Sort By</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {SORT_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.id}
            onClick={() => handleSortChange(option.id)}
            className="flex items-center justify-between cursor-pointer"
          >
            <span>{option.label}</span>
            {sortBy === option.id && (
              <span className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground uppercase">
                  {sortOrder}
                </span>
                <Check size={14} className="text-primary" />
              </span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
