import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Book, Shelf, api, ReadingProgress } from '../../lib/tauri';
import { 
  Star, 
  X, 
  BookOpen, 
  ArrowLeft, 
  Plus, 
  Search, 
  LayoutGrid, 
  List, 
  ArrowUpDown, 
  CheckSquare, 
  Square, 
  Trash2, 
  Play, 
  CheckCircle2, 
  Clock, 
  BookmarkCheck,
  Layers,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { cn, pageCountLabel } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useCoverImage } from '../common/hooks/useCoverImage';
import { AddBooksToShelfDialog } from './AddBooksToShelfDialog';
import { useBookOpen } from '@/hooks/useBookOpen';
import { useToast } from '@/store/toastStore';
import { useIsMobile } from '@/hooks/useIsMobile';

interface ShelfBookGridProps {
  shelf: Shelf;
  books: Book[];
  onBack: () => void;
  onRefreshBooks?: () => void;
}

export type ShelfBookSortType = 'title-asc' | 'title-desc' | 'author' | 'progress' | 'recent';

function ShelfBookCardGridItem({
  book,
  progress,
  isSelected,
  isSelectionMode,
  onToggleSelect,
  onClick,
  shelfColor,
}: {
  book: Book;
  progress?: ReadingProgress | null;
  isSelected: boolean;
  isSelectionMode: boolean;
  onToggleSelect: () => void;
  onClick: () => void;
  shelfColor: string;
}) {
  const { coverUrl } = useCoverImage(book.id, book.cover_path);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  
  const hue = (book.id || 0) * 137.508 % 360;
  const coverColor = `hsl(${hue}, 40%, 30%)`;
  const authorStr = book.authors && book.authors.length > 0 ? book.authors.map(a => a.name).join(', ') : 'Unknown Author';
  const progressPercent = progress?.progressPercent ?? 0;
  const isCompleted = book.reading_status === 'completed' || progressPercent >= 100;
  const format = book.file_format?.toUpperCase() || 'BOOK';

  return (
    <div
      onClick={() => {
        if (isSelectionMode) {
          onToggleSelect();
        } else {
          onClick();
        }
      }}
      className={cn(
        "relative aspect-[2/3] w-full rounded-2xl overflow-hidden transition-all duration-300 text-left flex flex-col group cursor-pointer bg-card border select-none",
        isSelected 
          ? "ring-2 ring-primary border-primary shadow-xl scale-[1.02] z-10"
          : "border-border/60 hover:border-primary/50 hover:shadow-xl hover:-translate-y-1"
      )}
      style={{
        boxShadow: isSelected 
          ? (shelfColor.startsWith('hsl') || shelfColor.startsWith('var') 
              ? `0 8px 30px hsl(var(--primary) / 0.35)` 
              : `0 8px 30px ${shelfColor}40`) 
          : undefined,
      }}
    >
      {/* Fallback gradient if no cover image */}
      <div 
        className="absolute inset-0 z-0 p-3.5 flex flex-col justify-between"
        style={{
          background: `linear-gradient(135deg, ${coverColor} 0%, hsl(${hue}, 50%, 18%) 100%)`,
        }}
      >
        <div className="font-serif text-white/90 font-bold text-sm sm:text-base leading-tight line-clamp-3 drop-shadow-md">
          {book.title}
        </div>
        <div className="text-[11px] text-white/70 font-semibold truncate">
          {authorStr}
        </div>
      </div>

      {coverUrl && !imgError && (
        <img
          src={coverUrl}
          alt={book.title}
          loading="lazy"
          onLoad={() => setImgLoaded(true)}
          onError={() => setImgError(true)}
          className={cn(
            'absolute inset-0 w-full h-full object-cover bg-muted z-10 transition-all duration-500 group-hover:scale-105',
            imgLoaded ? 'opacity-100' : 'opacity-0'
          )}
        />
      )}

      {/* Format Badge & Selection Checkbox */}
      <div className="absolute top-2 left-2 right-2 flex items-center justify-between z-30 pointer-events-none">
        {isSelectionMode ? (
          <div className="p-1 rounded-lg bg-background/90 backdrop-blur-md shadow-md border border-border/50 text-primary">
            {isSelected ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4 text-muted-foreground" />}
          </div>
        ) : (
          <span className="px-2 py-0.5 rounded-md text-[9px] font-extrabold uppercase tracking-wider bg-background/85 text-foreground backdrop-blur-md border border-border/50 shadow-sm">
            {format}
          </span>
        )}

        {isCompleted && !isSelectionMode && (
          <span className="p-1 rounded-full bg-emerald-500 text-white shadow-md">
            <CheckCircle2 className="w-3 h-3" />
          </span>
        )}
      </div>

      {/* Info Strip at bottom */}
      <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/60 to-transparent px-2.5 pt-8 pb-2">
        <h3 className="font-bold text-xs sm:text-sm text-white drop-shadow-sm line-clamp-1" title={book.title}>
          {book.title}
        </h3>
        <p className="text-[10px] text-white/75 font-medium truncate mt-0.5" title={authorStr}>
          {authorStr}
        </p>

        {/* Reading Progress bar if in progress */}
        {progressPercent > 0 && !isCompleted && (
          <div className="mt-1.5 flex items-center gap-1.5">
            <div className="flex-1 h-1 rounded-full bg-white/30 overflow-hidden">
              <div className="h-full bg-primary rounded-full" style={{ width: `${progressPercent}%` }} />
            </div>
            <span className="text-[9px] font-bold text-white/90 tabular-nums">{Math.round(progressPercent)}%</span>
          </div>
        )}
      </div>
    </div>
  );
}

function ShelfBookListItem({
  book,
  progress,
  isSelected,
  isSelectionMode,
  onToggleSelect,
  onClick,
  onRemove,
}: {
  book: Book;
  progress?: ReadingProgress | null;
  isSelected: boolean;
  isSelectionMode: boolean;
  onToggleSelect: () => void;
  onClick: () => void;
  onRemove: () => void;
}) {
  const { coverUrl } = useCoverImage(book.id, book.cover_path);
  const authorStr = book.authors && book.authors.length > 0 ? book.authors.map(a => a.name).join(', ') : 'Unknown Author';
  const progressPercent = progress?.progressPercent ?? 0;
  const isCompleted = book.reading_status === 'completed' || progressPercent >= 100;
  const format = book.file_format?.toUpperCase() || 'BOOK';

  return (
    <div
      onClick={() => {
        if (isSelectionMode) onToggleSelect();
        else onClick();
      }}
      className={cn(
        "group flex items-center justify-between gap-3 sm:gap-4 p-2.5 sm:p-3 rounded-2xl border bg-card/80 hover:bg-card transition-all duration-200 cursor-pointer shadow-xs",
        isSelected ? "ring-2 ring-primary border-primary" : "border-border/50 hover:border-primary/40"
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        {isSelectionMode && (
          <div className="shrink-0 p-1 text-primary">
            {isSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4 text-muted-foreground" />}
          </div>
        )}

        {/* Thumbnail */}
        <div className="w-10 h-14 sm:w-12 sm:h-16 rounded-lg overflow-hidden bg-muted shrink-0 border border-border/40 relative shadow-xs">
          {coverUrl ? (
            <img src={coverUrl} alt={book.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-primary/10 text-primary">
              <BookOpen className="w-5 h-5" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="min-w-0 pr-2">
          <div className="flex items-center gap-2">
            <h4 className="font-bold text-xs sm:text-sm text-foreground truncate group-hover:text-primary transition-colors" title={book.title}>
              {book.title}
            </h4>
            <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold uppercase bg-secondary text-muted-foreground border border-border/40 shrink-0">
              {format}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground font-medium truncate mt-0.5">
            {authorStr} {book.pubdate ? `· ${new Date(book.pubdate).getFullYear()}` : ''}
          </p>

          {progressPercent > 0 && !isCompleted && (
            <div className="flex items-center gap-2 mt-1.5 max-w-[160px]">
              <div className="flex-1 h-1 rounded-full bg-secondary overflow-hidden">
                <div className="h-full bg-primary rounded-full" style={{ width: `${progressPercent}%` }} />
              </div>
              <span className="text-[9px] font-bold text-muted-foreground tabular-nums">{Math.round(progressPercent)}%</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {!isSelectionMode && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClick();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-xs hover:bg-primary/90 transition-all cursor-pointer"
            >
              <Play className="w-3 h-3 fill-current" />
              <span className="hidden sm:inline">Read</span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="p-2 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/15 transition-all cursor-pointer"
              title="Remove from shelf"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function ShelfBookGrid({ shelf, books, onBack, onRefreshBooks }: ShelfBookGridProps) {
  const [addBooksDialogOpen, setAddBooksDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortType, setSortType] = useState<ShelfBookSortType>('title-asc');
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedBookIds, setSelectedBookIds] = useState<Set<number>>(new Set());
  const [selectedBookId, setSelectedBookId] = useState<number | null>(null);
  const [isRemovingBatch, setIsRemovingBatch] = useState(false);
  const [progressMap, setProgressMap] = useState<Record<number, ReadingProgress>>({});
  const [columns, setColumns] = useState(6);
  const containerRef = useRef<HTMLDivElement>(null);

  const { handleOpenBook } = useBookOpen();
  const toast = useToast();
  const isMobile = useIsMobile();
  const isCustomColor = Boolean(shelf.color && !['#3b82f6', '#2563eb', '#1d4ed8', '#60a5fa', '#6366f1'].includes(shelf.color.toLowerCase()));
  const shelfColor = isCustomColor ? shelf.color! : 'hsl(var(--primary))';

  // Calculate dynamic columns based on container width
  useEffect(() => {
    const updateColumns = () => {
      if (!containerRef.current) return;
      const width = containerRef.current.offsetWidth;
      if (width < 640) setColumns(2);
      else if (width < 768) setColumns(3);
      else if (width < 1024) setColumns(4);
      else if (width < 1280) setColumns(5);
      else setColumns(6);
    };

    updateColumns();
    const ro = new ResizeObserver(updateColumns);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener('resize', updateColumns);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateColumns);
    };
  }, []);

  // Load progress batch
  useEffect(() => {
    const ids = books.map(b => b.id).filter((id): id is number => id !== undefined);
    if (ids.length === 0) {
      setProgressMap({});
      return;
    }
    api.getReadingProgressBatch(ids).then(setProgressMap).catch(() => ({}));
  }, [books]);

  // Filter & Sort books
  const filteredAndSortedBooks = useMemo(() => {
    let list = [...books];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(b => 
        b.title.toLowerCase().includes(q) ||
        (b.authors && b.authors.some(a => a.name.toLowerCase().includes(q))) ||
        (b.series && b.series.toLowerCase().includes(q))
      );
    }

    list.sort((a, b) => {
      if (sortType === 'title-asc') return a.title.localeCompare(b.title);
      if (sortType === 'title-desc') return b.title.localeCompare(a.title);
      if (sortType === 'author') {
        const a1 = a.authors?.[0]?.name || '';
        const a2 = b.authors?.[0]?.name || '';
        return a1.localeCompare(a2);
      }
      if (sortType === 'progress') {
        const p1 = (a.id ? progressMap[a.id]?.progressPercent : 0) ?? 0;
        const p2 = (b.id ? progressMap[b.id]?.progressPercent : 0) ?? 0;
        return p2 - p1;
      }
      if (sortType === 'recent') {
        return (b.id ?? 0) - (a.id ?? 0);
      }
      return 0;
    });

    return list;
  }, [books, progressMap, searchQuery, sortType]);

  // Chunk books into rows based on responsive column count
  const rows = useMemo(() => {
    const r: Book[][] = [];
    for (let i = 0; i < filteredAndSortedBooks.length; i += columns) {
      r.push(filteredAndSortedBooks.slice(i, i + columns));
    }
    return r;
  }, [filteredAndSortedBooks, columns]);

  const toggleBookSelection = (id: number) => {
    setSelectedBookIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedBookIds.size === filteredAndSortedBooks.length) {
      setSelectedBookIds(new Set());
    } else {
      setSelectedBookIds(new Set(filteredAndSortedBooks.map(b => b.id).filter((id): id is number => id !== undefined)));
    }
  };

  const handleRemoveSingleBook = async (bookId: number) => {
    if (!shelf.id) return;
    try {
      await api.removeBookFromShelf(shelf.id, bookId);
      toast.success('Removed', 'Book removed from shelf.');
      onRefreshBooks?.();
    } catch (err) {
      toast.error('Error', 'Failed to remove book from shelf.');
    }
  };

  const handleBatchRemove = async () => {
    if (!shelf.id || selectedBookIds.size === 0) return;
    if (!confirm(`Remove ${selectedBookIds.size} books from this shelf?`)) return;

    setIsRemovingBatch(true);
    try {
      for (const id of selectedBookIds) {
        await api.removeBookFromShelf(shelf.id, id);
      }
      toast.success('Removed', `${selectedBookIds.size} books removed from shelf.`);
      setSelectedBookIds(new Set());
      setIsSelectionMode(false);
      onRefreshBooks?.();
    } catch (err) {
      toast.error('Error', 'Failed to remove some books.');
    } finally {
      setIsRemovingBatch(false);
    }
  };

  return (
    <div 
      className="p-4 sm:p-6 md:p-8 h-full overflow-y-auto pb-32 md:pb-12 custom-scrollbar relative"
      style={{
        paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)',
        paddingLeft: 'calc(env(safe-area-inset-left, 0px) + 16px)',
        paddingRight: 'calc(env(safe-area-inset-right, 0px) + 16px)'
      }}
    >
      <div className="max-w-[1400px] mx-auto">
        {/* Sticky Top Header Bar */}
        <div className="mb-6 relative sticky top-0 z-40 bg-background/95 backdrop-blur-xl pb-4 -mx-4 px-4 sm:-mx-6 sm:px-6 border-b border-border/50 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <button 
              onClick={onBack}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors group cursor-pointer self-start"
            >
              <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center group-hover:bg-secondary/80 transition-colors shadow-xs">
                <ArrowLeft size={16} />
              </div>
              <span className="text-xs sm:text-sm font-semibold">Back to Shelves</span>
            </button>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              {!shelf.isSmart && (
                <button
                  type="button"
                  onClick={() => {
                    setIsSelectionMode(!isSelectionMode);
                    setSelectedBookIds(new Set());
                  }}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border shadow-xs",
                    isSelectionMode
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-secondary/70 hover:bg-secondary text-foreground border-border/50"
                  )}
                >
                  {isSelectionMode ? 'Cancel' : 'Select'}
                </button>
              )}

              {!shelf.isSmart && (
                <Button
                  onClick={() => setAddBooksDialogOpen(true)}
                  className="gap-1.5 rounded-xl h-9 px-3.5 text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm shadow-primary/20 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Books
                </Button>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <div className="text-[10px] sm:text-[11px] font-extrabold tracking-[0.2em] text-muted-foreground uppercase mb-1 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: shelfColor }} />
                <span>SHELF · {books.length} {books.length === 1 ? 'BOOK' : 'BOOKS'}</span>
              </div>
              <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-foreground" style={{ fontFamily: 'var(--font-serif)' }}>
                {shelf.name}
              </h1>
              {shelf.description && (
                <p className="text-muted-foreground text-xs sm:text-sm mt-1">
                  {shelf.description}
                </p>
              )}
            </div>

            {/* Controls Toolbar: Search, Sort, Grid/List */}
            {books.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {/* Search */}
                <div className="relative w-36 sm:w-48 group">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <input
                    type="text"
                    placeholder="Search in shelf..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs font-bold bg-secondary/50 border border-border/50 focus:bg-background focus:border-primary/50 rounded-xl outline-none transition-all placeholder:text-muted-foreground/60 text-foreground"
                  />
                </div>

                {/* Sort Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-secondary/50 hover:bg-secondary border border-border/50 text-xs font-bold text-foreground transition-all cursor-pointer shadow-xs"
                    >
                      <ArrowUpDown className="w-3.5 h-3.5 text-primary" />
                      <span className="capitalize">
                        {sortType === 'title-asc' ? 'A–Z' :
                         sortType === 'title-desc' ? 'Z–A' :
                         sortType === 'author' ? 'Author' :
                         sortType === 'progress' ? 'Progress' : 'Recent'}
                      </span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40 p-1.5 rounded-2xl bg-popover text-popover-foreground border border-border shadow-2xl z-[150]">
                    <DropdownMenuItem onClick={() => setSortType('title-asc')} className="text-xs font-semibold py-1.5 rounded-xl cursor-pointer">
                      Title (A–Z)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setSortType('title-desc')} className="text-xs font-semibold py-1.5 rounded-xl cursor-pointer">
                      Title (Z–A)
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setSortType('author')} className="text-xs font-semibold py-1.5 rounded-xl cursor-pointer">
                      Author
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setSortType('progress')} className="text-xs font-semibold py-1.5 rounded-xl cursor-pointer">
                      Reading Progress
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setSortType('recent')} className="text-xs font-semibold py-1.5 rounded-xl cursor-pointer">
                      Date Added
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Grid / List Switcher */}
                <div className="flex items-center bg-secondary/50 p-0.5 rounded-xl border border-border/50">
                  <button
                    type="button"
                    onClick={() => setViewMode('grid')}
                    className={cn(
                      "p-1.5 rounded-lg transition-all cursor-pointer",
                      viewMode === 'grid' ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                    )}
                    title="Grid View"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('list')}
                    className={cn(
                      "p-1.5 rounded-lg transition-all cursor-pointer",
                      viewMode === 'list' ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                    )}
                    title="List View"
                  >
                    <List className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Books Content */}
        {books.length === 0 ? (
          /* Empty shelf state */
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-secondary/60 border border-border/50 flex items-center justify-center mb-4 text-primary shadow-inner">
              <BookOpen className="w-8 h-8 opacity-70" />
            </div>
            <h3 className="text-lg font-bold text-foreground mb-1">This shelf is empty</h3>
            <p className="text-xs text-muted-foreground max-w-xs mb-6">
              Add books from your library to keep them grouped and easily accessible.
            </p>
            {!shelf.isSmart && (
              <Button
                onClick={() => setAddBooksDialogOpen(true)}
                className="gap-2 rounded-full px-6 py-2 text-xs font-bold bg-primary text-primary-foreground shadow-md shadow-primary/20 cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Add Books to Shelf
              </Button>
            )}
          </div>
        ) : filteredAndSortedBooks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
            <Search className="w-8 h-8 opacity-40 mb-2" />
            <p className="text-sm font-semibold">No books matching &quot;{searchQuery}&quot;</p>
          </div>
        ) : viewMode === 'grid' ? (
          /* Grid View with Inline Expanded Book Details Card */
          <div ref={containerRef} className="space-y-4 sm:space-y-6">
            {rows.map((rowBooks, rowIndex) => {
              const selectedIndexInRow = rowBooks.findIndex(b => b.id === selectedBookId);
              const hasSelected = selectedIndexInRow !== -1;
              const selectedBook = hasSelected ? rowBooks[selectedIndexInRow] : null;

              return (
                <React.Fragment key={rowIndex}>
                  {/* Expanded Details Card */}
                  <AnimatePresence>
                    {hasSelected && selectedBook && (
                      <motion.div
                        initial={{ height: 0, opacity: 0, marginTop: -8 }}
                        animate={{ height: 'auto', opacity: 1, marginTop: 0 }}
                        exit={{ height: 0, opacity: 0, marginTop: -8 }}
                        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                        className="overflow-hidden relative z-20 px-4 pt-1 pb-6 -mx-4 -mb-2"
                      >
                        <div 
                          className="relative rounded-2xl p-4 sm:p-5 bg-card border border-border/70 shadow-[0_12px_32px_-4px_rgba(0,0,0,0.12),0_4px_16px_-2px_rgba(0,0,0,0.08)] dark:shadow-[0_16px_36px_-4px_rgba(0,0,0,0.6)] backdrop-blur-xl"
                          style={{ borderColor: isCustomColor ? `${shelfColor}50` : 'hsl(var(--primary) / 0.4)' }}
                        >
                          {/* Triangle Pointer pointing down to the book */}
                          <div 
                            className="absolute -bottom-3 w-6 h-6 rotate-45 border-r border-b bg-card"
                            style={{
                              left: `calc(${(selectedIndexInRow + 0.5) / columns * 100}% - 12px)`,
                              borderColor: isCustomColor ? `${shelfColor}50` : 'hsl(var(--primary) / 0.4)',
                              transition: 'left 0.3s ease-out'
                            }}
                          />

                          {/* Top glowing line accent */}
                          <div 
                            className="absolute top-0 left-0 right-0 h-[2px] rounded-t-2xl"
                            style={{ 
                              background: isCustomColor 
                                ? `linear-gradient(90deg, transparent, ${shelfColor}, transparent)`
                                : `linear-gradient(90deg, transparent, hsl(var(--primary)), transparent)`,
                              opacity: 0.7
                            }}
                          />

                          <div className="flex justify-between items-start mb-3 gap-4">
                            <div className="pr-4 min-w-0">
                              <h2 className="text-lg sm:text-xl font-bold text-foreground italic mb-1 truncate" style={{ fontFamily: 'var(--font-serif)' }}>
                                {selectedBook.title}
                              </h2>
                              <div className="text-muted-foreground text-xs flex flex-wrap items-center gap-1.5 font-medium">
                                <span>{selectedBook.authors && selectedBook.authors.length > 0 ? selectedBook.authors.map(a => a.name).join(', ') : 'Unknown Author'}</span>
                                {selectedBook.pubdate && <span>· {new Date(selectedBook.pubdate).getFullYear()}</span>}
                                {selectedBook.rating ? (
                                  <span className="flex items-center gap-0.5 text-amber-500 font-bold">
                                    · <Star className="w-3 h-3 fill-amber-500" /> {selectedBook.rating}
                                  </span>
                                ) : null}
                                {pageCountLabel(selectedBook) ? (
                                  <span>· {pageCountLabel(selectedBook)}</span>
                                ) : null}
                              </div>
                            </div>
                            
                            {/* Actions Pill: Read | X */}
                            <div className="flex bg-secondary/80 hover:bg-secondary rounded-full p-1 border border-border/60 shrink-0 items-center shadow-xs">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (selectedBook.id) void handleOpenBook(selectedBook.id);
                                }}
                                className="px-3 py-1 rounded-full text-foreground hover:bg-background/80 transition-all text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                              >
                                <BookOpen className="w-3.5 h-3.5 text-primary" />
                                <span>Read</span>
                              </button>
                              <div className="w-px h-3 bg-border/80 mx-1" />
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedBookId(null);
                                }}
                                className="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-background/80 transition-all cursor-pointer"
                                title="Close"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {selectedBook.notes || (selectedBook as any).summary ? (
                             <p className="text-foreground/85 text-xs sm:text-sm leading-relaxed max-w-4xl mb-4 line-clamp-3">
                               {selectedBook.notes || (selectedBook as any).summary}
                             </p>
                          ) : (
                             <p className="text-muted-foreground text-xs leading-relaxed max-w-4xl mb-4 italic">
                               No description or notes available.
                             </p>
                          )}
                          
                          <div className="flex flex-wrap items-center gap-4 text-xs font-semibold">
                            {selectedBook.rating !== undefined && selectedBook.rating !== null && (
                              <div className="flex items-center gap-1 text-foreground/90">
                                <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                                <span>{selectedBook.rating}</span>
                              </div>
                            )}
                            
                            {pageCountLabel(selectedBook) && (
                              <div className="text-muted-foreground">
                                {pageCountLabel(selectedBook)}
                              </div>
                            )}

                            {selectedBook.tags && selectedBook.tags.length > 0 && (
                              <div 
                                className="px-2.5 py-0.5 rounded-full border text-[10px] font-bold"
                                style={{ 
                                  borderColor: shelf.color ? `${shelf.color}50` : 'hsl(var(--primary) / 0.4)', 
                                  color: shelf.color || 'hsl(var(--primary))',
                                  backgroundColor: shelf.color ? `${shelf.color}15` : 'hsl(var(--primary) / 0.15)' 
                                }}
                              >
                                {selectedBook.tags[0].name}
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Grid Row */}
                  <div 
                    className="grid gap-3 sm:gap-4 md:gap-5 relative z-10"
                    style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
                  >
                    {rowBooks.map((book) => {
                      const isSelected = isSelectionMode 
                        ? (book.id !== undefined && selectedBookIds.has(book.id))
                        : (book.id === selectedBookId);

                      return (
                        <ShelfBookCardGridItem
                          key={book.id}
                          book={book}
                          progress={book.id !== undefined ? progressMap[book.id] : undefined}
                          isSelected={isSelected}
                          isSelectionMode={isSelectionMode}
                          onToggleSelect={() => book.id !== undefined && toggleBookSelection(book.id)}
                          onClick={() => {
                            if (book.id !== undefined) {
                              setSelectedBookId(prev => (prev === book.id ? null : book.id!));
                            }
                          }}
                          shelfColor={shelfColor}
                        />
                      );
                    })}
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        ) : (
          /* List View */
          <div className="flex flex-col gap-2.5">
            {filteredAndSortedBooks.map((book) => (
              <ShelfBookListItem
                key={book.id}
                book={book}
                progress={book.id !== undefined ? progressMap[book.id] : undefined}
                isSelected={book.id !== undefined && selectedBookIds.has(book.id)}
                isSelectionMode={isSelectionMode}
                onToggleSelect={() => book.id !== undefined && toggleBookSelection(book.id)}
                onClick={() => book.id && void handleOpenBook(book.id)}
                onRemove={() => book.id && void handleRemoveSingleBook(book.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Floating Multi-Select Action Bar */}
      <AnimatePresence>
        {isSelectionMode && selectedBookIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            className="fixed bottom-20 md:bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-full bg-card/95 backdrop-blur-2xl border border-border shadow-2xl"
          >
            <span className="text-xs font-extrabold text-foreground pr-2 border-r border-border/50">
              {selectedBookIds.size} Selected
            </span>

            <button
              type="button"
              onClick={handleSelectAll}
              className="text-xs font-bold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              {selectedBookIds.size === filteredAndSortedBooks.length ? 'Deselect All' : 'Select All'}
            </button>

            <button
              type="button"
              onClick={handleBatchRemove}
              disabled={isRemovingBatch}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-all cursor-pointer shadow-md"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Remove from Shelf</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AddBooksToShelfDialog
        open={addBooksDialogOpen}
        onOpenChange={setAddBooksDialogOpen}
        shelf={shelf}
        onBooksUpdated={() => {
          onRefreshBooks?.();
        }}
      />
    </div>
  );
}
