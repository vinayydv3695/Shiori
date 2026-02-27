import { useState } from 'react'
import { BookOpen, Star, ArrowUp, ArrowDown, MoreVertical, Edit, Trash2, Download, RefreshCw, Share2 } from 'lucide-react'
import { cn, formatFileSize, formatDate } from '@/lib/utils'
import type { Book } from '@/lib/tauri'
import { Badge } from '@/components/ui/badge'
import { convertFileSrc } from '@tauri-apps/api/core'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type SortField = 'title' | 'author' | 'rating' | 'date' | 'size' | 'format'
type SortDirection = 'asc' | 'desc'

interface TableViewProps {
  books: Book[]
  selectedBooks: Set<number>
  onSelectBook: (id: number) => void
  onOpenBook: (id: number) => void
  onEditBook: (id: number) => void
  onDeleteBook: (id: number) => void
  onDownloadBook: (id: number) => void
  onConvertBook?: (id: number) => void
  onShareBook?: (id: number) => void
}

export const ModernTableView = ({
  books,
  selectedBooks,
  onSelectBook,
  onOpenBook,
  onEditBook,
  onDeleteBook,
  onDownloadBook,
  onConvertBook,
  onShareBook,
}: TableViewProps) => {
  const [sortField, setSortField] = useState<SortField>('title')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const sortedBooks = [...books].sort((a, b) => {
    let comparison = 0

    switch (sortField) {
      case 'title':
        comparison = a.title.localeCompare(b.title)
        break
      case 'author':
        const aAuthor = a.authors?.[0]?.name || ''
        const bAuthor = b.authors?.[0]?.name || ''
        comparison = aAuthor.localeCompare(bAuthor)
        break
      case 'rating':
        comparison = (a.rating || 0) - (b.rating || 0)
        break
      case 'date':
        comparison = new Date(a.added_date).getTime() - new Date(b.added_date).getTime()
        break
      case 'size':
        comparison = (a.file_size || 0) - (b.file_size || 0)
        break
      case 'format':
        comparison = a.file_format.localeCompare(b.file_format)
        break
    }

    return sortDirection === 'asc' ? comparison : -comparison
  })

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5" />
    )
  }

  const handleSelectAll = () => {
    if (selectedBooks.size === books.length) {
      books.forEach(book => onSelectBook(book.id!))
    } else {
      books.forEach(book => {
        if (!selectedBooks.has(book.id!)) {
          onSelectBook(book.id!)
        }
      })
    }
  }

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
    <div className="border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-muted/50 border-b">
            <tr>
              {/* Select All Checkbox */}
              <th className="w-12 p-3">
                <div
                  onClick={handleSelectAll}
                  className={cn(
                    'w-5 h-5 rounded-md border-2 flex items-center justify-center mx-auto',
                    'transition-all cursor-pointer',
                    selectedBooks.size === books.length && books.length > 0
                      ? 'border-primary bg-primary'
                      : 'border-border hover:border-primary'
                  )}
                >
                  {selectedBooks.size === books.length && books.length > 0 && (
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
              </th>

              {/* Cover */}
              <th className="w-16 p-3"></th>

              {/* Title */}
              <th className="text-left p-3">
                <button
                  onClick={() => handleSort('title')}
                  className="flex items-center gap-2 font-semibold text-sm hover:text-primary transition-colors"
                >
                  Title
                  <SortIcon field="title" />
                </button>
              </th>

              {/* Author */}
              <th className="text-left p-3">
                <button
                  onClick={() => handleSort('author')}
                  className="flex items-center gap-2 font-semibold text-sm hover:text-primary transition-colors"
                >
                  Author
                  <SortIcon field="author" />
                </button>
              </th>

              {/* Series */}
              <th className="text-left p-3 hidden xl:table-cell">
                <span className="font-semibold text-sm">Series</span>
              </th>

              {/* Rating */}
              <th className="text-left p-3 hidden lg:table-cell">
                <button
                  onClick={() => handleSort('rating')}
                  className="flex items-center gap-2 font-semibold text-sm hover:text-primary transition-colors"
                >
                  Rating
                  <SortIcon field="rating" />
                </button>
              </th>

              {/* Format */}
              <th className="text-left p-3 hidden md:table-cell">
                <button
                  onClick={() => handleSort('format')}
                  className="flex items-center gap-2 font-semibold text-sm hover:text-primary transition-colors"
                >
                  Format
                  <SortIcon field="format" />
                </button>
              </th>

              {/* Size */}
              <th className="text-left p-3 hidden lg:table-cell">
                <button
                  onClick={() => handleSort('size')}
                  className="flex items-center gap-2 font-semibold text-sm hover:text-primary transition-colors"
                >
                  Size
                  <SortIcon field="size" />
                </button>
              </th>

              {/* Date Added */}
              <th className="text-left p-3 hidden xl:table-cell">
                <button
                  onClick={() => handleSort('date')}
                  className="flex items-center gap-2 font-semibold text-sm hover:text-primary transition-colors"
                >
                  Added
                  <SortIcon field="date" />
                </button>
              </th>

              {/* Actions */}
              <th className="w-12 p-3"></th>
            </tr>
          </thead>

          <tbody>
            {sortedBooks.map((book) => {
              const isSelected = selectedBooks.has(book.id!)

              return (
                <tr
                  key={book.id}
                  onClick={() => onOpenBook(book.id!)}
                  className={cn(
                    'group border-b hover:bg-accent/50 transition-colors cursor-pointer',
                    isSelected && 'bg-accent'
                  )}
                >
                  {/* Checkbox */}
                  <td className="p-3">
                    <div
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelectBook(book.id!)
                      }}
                      className={cn(
                        'w-5 h-5 rounded-md border-2 flex items-center justify-center mx-auto',
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
                  </td>

                  {/* Cover */}
                  <td className="p-3">
                    <div className="w-10 h-14 bg-muted rounded overflow-hidden">
                      {book.cover_path ? (
                        <img
                          src={convertFileSrc(book.cover_path)}
                          alt={book.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-muted to-muted/50">
                          <BookOpen className="w-5 h-5 text-muted-foreground/30" />
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Title */}
                  <td className="p-3">
                    <div className="max-w-xs">
                      <p className="font-medium text-sm truncate">{book.title}</p>
                      {book.tags && book.tags.length > 0 && (
                        <div className="flex gap-1 mt-1">
                          {book.tags.slice(0, 2).map((tag, idx) => (
                            <Badge key={idx} variant="secondary" className="text-xs">
                              {tag.name}
                            </Badge>
                          ))}
                          {book.tags.length > 2 && (
                            <Badge variant="outline" className="text-xs">
                              +{book.tags.length - 2}
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Author */}
                  <td className="p-3">
                    <p className="text-sm text-muted-foreground truncate max-w-xs">
                      {book.authors?.map(a => a.name).join(', ') || 'Unknown'}
                    </p>
                  </td>

                  {/* Series */}
                  <td className="p-3 hidden xl:table-cell">
                    <p className="text-sm text-muted-foreground truncate max-w-xs">
                      {book.series || '—'}
                    </p>
                  </td>

                  {/* Rating */}
                  <td className="p-3 hidden lg:table-cell">
                    {book.rating && book.rating > 0 ? (
                      <div className="flex items-center gap-1">
                        <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                        <span className="text-sm">{book.rating}</span>
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </td>

                  {/* Format */}
                  <td className="p-3 hidden md:table-cell">
                    <Badge variant="outline" className="text-xs uppercase">
                      {book.file_format}
                    </Badge>
                  </td>

                  {/* Size */}
                  <td className="p-3 hidden lg:table-cell">
                    <span className="text-sm text-muted-foreground">
                      {book.file_size ? formatFileSize(book.file_size) : '—'}
                    </span>
                  </td>

                  {/* Date Added */}
                  <td className="p-3 hidden xl:table-cell">
                    <span className="text-sm text-muted-foreground">
                      {formatDate(book.added_date)}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="p-3">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        onClick={(e) => e.stopPropagation()}
                        className="p-1.5 rounded hover:bg-accent transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation()
                            onOpenBook(book.id!)
                          }}
                        >
                          <BookOpen className="w-4 h-4 mr-2" />
                          Open
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation()
                            onEditBook(book.id!)
                          }}
                        >
                          <Edit className="w-4 h-4 mr-2" />
                          Edit Metadata
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation()
                            onDownloadBook(book.id!)
                          }}
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Download
                        </DropdownMenuItem>
                        {onConvertBook && (
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation()
                              onConvertBook(book.id!)
                            }}
                          >
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Convert Format
                          </DropdownMenuItem>
                        )}
                        {onShareBook && (
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation()
                              onShareBook(book.id!)
                            }}
                          >
                            <Share2 className="w-4 h-4 mr-2" />
                            Share Book
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation()
                            onDeleteBook(book.id!)
                          }}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
