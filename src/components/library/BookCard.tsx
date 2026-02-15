import { Book } from "../../lib/tauri"
import { Card } from "../ui/Card"
import { Star, StarOff, Check } from "../icons"
import { cn } from "../../lib/utils"
import { formatDate } from "../../lib/utils"
import { useLibraryStore } from "../../store/libraryStore"

interface BookCardProps {
  book: Book
  onClick?: () => void
}

export function BookCard({ book, onClick }: BookCardProps) {
  const { bulkSelectMode, selectedBookIds, toggleBookSelection } = useLibraryStore();
  const isSelected = selectedBookIds.has(book.id);

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'copy';
    
    // If in bulk select mode and there are selected books, drag all selected
    if (bulkSelectMode && selectedBookIds.size > 0) {
      const bookIds = Array.from(selectedBookIds);
      e.dataTransfer.setData('application/json', JSON.stringify({
        type: 'books',
        bookIds: bookIds,
        count: bookIds.length
      }));
    } else {
      // Single book drag
      e.dataTransfer.setData('application/json', JSON.stringify({
        type: 'book',
        bookId: book.id,
        bookTitle: book.title
      }));
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    if (bulkSelectMode) {
      e.stopPropagation();
      toggleBookSelection(book.id);
    } else if (onClick) {
      onClick();
    }
  };

  return (
    <Card
      className={cn(
        "group cursor-pointer overflow-hidden transition-all hover:shadow-lg relative",
        isSelected && "ring-2 ring-blue-500"
      )}
      onClick={handleClick}
      draggable
      onDragStart={handleDragStart}
    >
      {/* Selection checkbox */}
      {bulkSelectMode && (
        <div className="absolute top-2 right-2 z-10">
          <div
            className={cn(
              "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
              isSelected
                ? "bg-blue-500 border-blue-500"
                : "bg-white/90 border-gray-300 backdrop-blur-sm"
            )}
          >
            {isSelected && <Check className="w-4 h-4 text-white" />}
          </div>
        </div>
      )}
      {/* Cover */}
      <div className="aspect-[2/3] w-full overflow-hidden bg-muted">
        {book.cover_path ? (
          <img
            src={book.cover_path}
            alt={book.title}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
            <span className="text-6xl font-bold text-primary/30">
              {book.title[0]?.toUpperCase()}
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="line-clamp-2 font-semibold text-foreground">
          {book.title}
        </h3>
        
        {book.authors.length > 0 && (
          <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
            {book.authors.map((a) => a.name).join(", ")}
          </p>
        )}

        {/* Rating */}
        {book.rating !== undefined && book.rating > 0 && (
          <div className="mt-2 flex gap-0.5">
            {[...Array(5)].map((_, i) =>
              i < book.rating! ? (
                <Star
                  key={i}
                  className="h-4 w-4 fill-primary text-primary"
                />
              ) : (
                <StarOff key={i} className="h-4 w-4 text-muted-foreground" />
              )
            )}
          </div>
        )}

        {/* Tags */}
        {book.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {book.tags.slice(0, 3).map((tag) => (
              <span
                key={tag.id}
                className="rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
                style={tag.color ? { backgroundColor: tag.color } : {}}
              >
                {tag.name}
              </span>
            ))}
          </div>
        )}

        {/* Metadata */}
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span className="uppercase">{book.file_format}</span>
          <span>{formatDate(book.added_date)}</span>
        </div>
      </div>
    </Card>
  )
}
