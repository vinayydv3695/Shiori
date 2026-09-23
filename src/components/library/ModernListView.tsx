import { BookOpen, Star, Download, Edit, Trash2, Calendar, FileType, FolderPlus } from 'lucide-react'
import { LibraryContextMenu, type LibraryMenuItem } from '@/components/ui/LibraryContextMenu'
import { cn, formatFileSize, formatDate } from '@/lib/utils'
import type { Book } from '@/lib/tauri'
import { Badge } from '@/components/ui/badge'
import { AppTooltip } from '@/components/ui/tooltip'
import { convertFileSrc } from '@tauri-apps/api/core'

function resolveCoverSrc(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  return convertFileSrc(path.replace(/\\/g, '/'))
}

interface ListViewProps {
  books: Book[]
  selectedBooks: Set<number>
  onSelectBook: (id: number) => void
  onOpenBook: (id: number) => void
  onEditBook: (id: number) => void
  onDeleteBook: (id: number) => void
  onDownloadBook: (id: number) => void
  onAddToShelf?: (id: number) => void
  onManageTags?: (id: number) => void
}

export const ModernListView = ({
  books,
  selectedBooks,
  onSelectBook,
  onOpenBook,
  onEditBook,
  onDeleteBook,
  onDownloadBook,
  onAddToShelf,
  onManageTags,
}: ListViewProps) => {
  if (books.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <BookOpen className="w-16 h-16 text-muted-foreground/30 mb-4" />
        <h3 className="text-lg font-semibold mb-2">No books found</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Try adjusting your filters or import some books to get started.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {books.map((book) => {
        const isSelected = selectedBooks.has(book.id!)

        const menuItems: LibraryMenuItem[] = [
          { label: 'Open', icon: BookOpen, onClick: () => onOpenBook(book.id!) },
          { label: 'Edit Metadata', icon: Edit, onClick: () => onEditBook(book.id!) },
          ...(onAddToShelf ? [{ label: 'Add to Shelf...', icon: FolderPlus, onClick: () => onAddToShelf(book.id!) }] : []),
          { isSeparator: true as const },
          { label: 'Delete', icon: Trash2, onClick: () => onDeleteBook(book.id!), destructive: true },
        ];

        return (
          <LibraryContextMenu key={book.id} items={menuItems}>
              <div
                onClick={() => onOpenBook(book.id!)}
                className={cn(
                  'group flex items-center gap-4 p-3 rounded-lg border',
                  'hover:bg-accent/50 hover:border-primary/50',
                  'transition-all duration-200 cursor-pointer',
                  isSelected && 'bg-accent border-primary ring-2 ring-primary/20'
                )}
              >
            {/* Selection Checkbox */}
            <div
              onClick={(e) => {
                e.stopPropagation()
                onSelectBook(book.id!)
              }}
              className="flex-shrink-0"
            >
              <div
                className={cn(
                  'w-5 h-5 rounded-md border-2 flex items-center justify-center',
                  'transition-all cursor-pointer',
                  isSelected
                    ? 'border-primary bg-primary'
                    : 'border-border hover:border-primary'
                )}
              >
                {isSelected && (
                  <svg className="w-3 h-3 text-primary-foreground" viewBox="0 0 12 12">
                    <path
                      fill="currentColor"
                      d="M10 3L4.5 8.5L2 6"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </div>
            </div>

            {/* Book Cover Thumbnail */}
            <div className="flex-shrink-0 w-12 h-16 bg-muted rounded overflow-hidden">
              {book.cover_path ? (
                <img
                  src={resolveCoverSrc(book.cover_path)}
                  alt={book.title}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover bg-muted"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted/50">
                  <BookOpen className="w-6 h-6 text-muted-foreground/30" />
                </div>
              )}
            </div>

            {/* Book Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-3">
                {/* Title & Author */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm truncate">
                    {book.title}
                  </h3>
                  <p className="text-xs text-muted-foreground truncate">
                    {book.authors?.map(a => a.name).join(', ') || 'Unknown Author'}
                  </p>
                </div>

                {/* Tags */}
                {book.tags && book.tags.length > 0 && (
                  <div className="hidden md:flex items-center gap-1 flex-shrink-0">
                    {book.tags.slice(0, 3).map((tag, idx) => (
                      <Badge key={idx} variant="secondary" className="text-xs">
                        {tag.name}
                      </Badge>
                    ))}
                    {book.tags.length > 3 && (
                      <Badge variant="outline" className="text-xs">
                        +{book.tags.length - 3}
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Metadata */}
            <div className="hidden lg:flex items-center gap-6 text-xs text-muted-foreground flex-shrink-0">
              {/* Rating */}
              {book.rating && book.rating > 0 && (
                <div className="flex items-center gap-1.5 text-xs font-semibold text-yellow-600 dark:text-yellow-500 bg-yellow-500/10 px-2 py-0.5 rounded-full ring-1 ring-yellow-500/20">
                  <Star className="w-3.5 h-3.5 fill-current" />
                  <span>{book.rating} / {book.metadata_source === 'anilist' ? '10' : '5'}</span>
                </div>
              )}

              {/* Format */}
              <div className="flex items-center gap-1.5">
                <FileType className="w-3.5 h-3.5" />
                <span className="uppercase">{book.file_format}</span>
              </div>

              {/* Size */}
              {book.file_size && (
                <span>{formatFileSize(book.file_size)}</span>
              )}

              {/* Date Added */}
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                <span>{formatDate(book.added_date)}</span>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
              <AppTooltip content="Open book" side="top">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onOpenBook(book.id!)
                  }}
                  aria-label="Open book"
                  className="p-1.5 rounded hover:bg-primary hover:text-primary-foreground transition-colors"
                >
                  <BookOpen className="w-4 h-4" />
                </button>
              </AppTooltip>
              <AppTooltip content="Edit metadata" side="top">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onEditBook(book.id!)
                  }}
                  aria-label="Edit metadata"
                  className="p-1.5 rounded hover:bg-primary hover:text-primary-foreground transition-colors"
                >
                  <Edit className="w-4 h-4" />
                </button>
              </AppTooltip>
              <AppTooltip content="Download" side="top">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onDownloadBook(book.id!)
                  }}
                  aria-label="Download"
                  className="p-1.5 rounded hover:bg-primary hover:text-primary-foreground transition-colors"
                >
                  <Download className="w-4 h-4" />
                </button>
              </AppTooltip>
              <AppTooltip content="Delete" side="top">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onDeleteBook(book.id!)
                  }}
                  aria-label="Delete"
                  className="p-1.5 rounded hover:bg-destructive hover:text-destructive-foreground transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </AppTooltip>
            </div>
            </div>
          </LibraryContextMenu>
        )
      })}
    </div>
  )
}
