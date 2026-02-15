import { useState } from 'react'
import { Star, MoreVertical, Download, Eye, Edit, Trash2, BookOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Book } from '@/lib/tauri'

interface BookCardProps {
  book: Book
  isSelected: boolean
  onSelect: (id: number) => void
  onOpen: (id: number) => void
  onEdit: (id: number) => void
  onDelete: (id: number) => void
  onDownload: (id: number) => void
}

export const ModernBookCard = ({
  book,
  isSelected,
  onSelect,
  onOpen,
  onEdit,
  onDelete,
  onDownload,
}: BookCardProps) => {
  const [showActions, setShowActions] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)

  const handleClick = (e: React.MouseEvent) => {
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      onSelect(book.id!)
    } else {
      onOpen(book.id!)
    }
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setShowActions(true)
  }

  return (
    <div
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      className={cn(
        'group relative',
        'bg-card rounded-lg overflow-hidden',
        'border border-border',
        'hover:border-primary/50 hover:shadow-lg',
        'transition-all duration-200',
        'cursor-pointer',
        isSelected && 'ring-2 ring-primary border-primary'
      )}
    >
      {/* Selection Checkbox */}
      <div className={cn(
        'absolute top-2 left-2 z-10',
        'opacity-0 group-hover:opacity-100 transition-opacity',
        isSelected && 'opacity-100'
      )}>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onSelect(book.id!)
          }}
          className={cn(
            'w-5 h-5 rounded-md border-2 flex items-center justify-center',
            'bg-background/80 backdrop-blur-sm',
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
        </button>
      </div>

      {/* Quick Actions */}
      <div className={cn(
        'absolute top-2 right-2 z-10',
        'opacity-0 group-hover:opacity-100 transition-opacity',
        'flex flex-col gap-1'
      )}>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onOpen(book.id!)
          }}
          className="w-7 h-7 rounded-md bg-background/80 backdrop-blur-sm border border-border hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors flex items-center justify-center"
          title="Open book"
        >
          <BookOpen className="w-4 h-4" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onEdit(book.id!)
          }}
          className="w-7 h-7 rounded-md bg-background/80 backdrop-blur-sm border border-border hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors flex items-center justify-center"
          title="Edit metadata"
        >
          <Edit className="w-4 h-4" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDownload(book.id!)
          }}
          className="w-7 h-7 rounded-md bg-background/80 backdrop-blur-sm border border-border hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors flex items-center justify-center"
          title="Download"
        >
          <Download className="w-4 h-4" />
        </button>
      </div>

      {/* Book Cover */}
      <div className="aspect-[2/3] bg-muted relative overflow-hidden">
        {book.cover_path ? (
          <>
            <img
              src={book.cover_path}
              alt={book.title}
              onLoad={() => setImageLoaded(true)}
              className={cn(
                'w-full h-full object-cover',
                'transition-all duration-300',
                imageLoaded ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
              )}
            />
            {!imageLoaded && (
              <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-muted to-muted/50" />
            )}
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted/50">
            <BookOpen className="w-12 h-12 text-muted-foreground/30" />
          </div>
        )}

        {/* Format Badge */}
        <div className="absolute bottom-2 left-2">
          <span className="px-2 py-0.5 text-xs font-medium bg-background/80 backdrop-blur-sm border border-border rounded">
            {book.file_format.toUpperCase()}
          </span>
        </div>

        {/* Rating */}
        {book.rating && book.rating > 0 && (
          <div className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-0.5 bg-background/80 backdrop-blur-sm border border-border rounded">
            <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
            <span className="text-xs font-medium">{book.rating}</span>
          </div>
        )}
      </div>

      {/* Book Info */}
      <div className="p-3 space-y-2">
        {/* Title */}
        <h3 className="font-semibold text-sm line-clamp-2 leading-tight min-h-[2.5rem]">
          {book.title}
        </h3>

        {/* Author */}
        <p className="text-xs text-muted-foreground line-clamp-1">
          {book.authors.map(a => a.name).join(', ') || 'Unknown Author'}
        </p>

        {/* Tags */}
        {book.tags && book.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {book.tags.slice(0, 2).map((tag, idx) => (
              <span
                key={idx}
                className="px-1.5 py-0.5 text-xs bg-muted text-muted-foreground rounded"
              >
                {tag.name}
              </span>
            ))}
            {book.tags.length > 2 && (
              <span className="px-1.5 py-0.5 text-xs bg-muted text-muted-foreground rounded">
                +{book.tags.length - 2}
              </span>
            )}
          </div>
        )}

        {/* Metadata Footer */}
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border">
          <span>{new Date(book.added_date).toLocaleDateString()}</span>
          {book.file_size && (
            <span>{formatFileSize(book.file_size)}</span>
          )}
        </div>
      </div>
    </div>
  )
}

// Utility function
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

// Grid Container Component
interface BookGridProps {
  books: Book[]
  selectedBooks: number[]
  onSelectBook: (id: number) => void
  onOpenBook: (id: number) => void
  onEditBook: (id: number) => void
  onDeleteBook: (id: number) => void
  onDownloadBook: (id: number) => void
}

export const ModernBookGrid = ({
  books,
  selectedBooks,
  onSelectBook,
  onOpenBook,
  onEditBook,
  onDeleteBook,
  onDownloadBook,
}: BookGridProps) => {
  return (
    <div className="p-6">
      {books.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <BookOpen className="w-16 h-16 text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-semibold mb-2">No books found</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Try adjusting your filters or import some books to get started.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
          {books.map((book) => (
            <ModernBookCard
              key={book.id}
              book={book}
              isSelected={selectedBooks.includes(book.id!)}
              onSelect={onSelectBook}
              onOpen={onOpenBook}
              onEdit={onEditBook}
              onDelete={onDeleteBook}
              onDownload={onDownloadBook}
            />
          ))}
        </div>
      )}
    </div>
  )
}
