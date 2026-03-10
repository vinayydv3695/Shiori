import { memo, useState, useMemo, useRef, useEffect } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import {
  X, BookOpen, Layers, Search, SortDesc, SortAsc,
  Clock, CheckCircle2, Edit2, DownloadCloud, Trash2, List, LayoutGrid, Check
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { logger } from '@/lib/logger'
import { ScrollArea } from '@/components/ui/scroll-area'
import { PremiumBookCard } from './ModernBookCard'
import { useCoverImage } from '../common/hooks/useCoverImage'
import type { SeriesViewProps } from './types'
import { SeriesManagementDialog } from './SeriesManagementDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api, type Book } from '@/lib/tauri'
import { useToast } from '@/store/toastStore'

function getBookReadStatus(book: Book) {
  return book.reading_status || 'planning';
}

const SeriesHeader = memo(function SeriesHeader({
  series,
  onEdit,
  onMarkAllRead,
  onDelete,
}: {
  series: SeriesViewProps['series']
  onEdit: () => void
  onMarkAllRead: () => void
  onDelete: () => void
}) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  if (!series) return null;
  const firstBook = series.books[0];
  const { coverUrl } = useCoverImage(firstBook?.id, null)

  const totalPages = useMemo(() => series.books.reduce((acc, b) => acc + (b.page_count || 0), 0), [series.books]);
  const readBooks = useMemo(() => series.books.filter(b => getBookReadStatus(b) === 'completed').length, [series.books]);
  const progressPercent = series.books.length > 0 ? Math.round((readBooks / series.books.length) * 100) : 0;
  
  const status = 'Ongoing';

  return (
    <div className="flex flex-col md:flex-row gap-6 p-6 border-b border-border bg-card relative shrink-0">
      <Dialog.Close asChild>
        <button className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 z-10 bg-background/50 backdrop-blur-md p-1.5 rounded-full border border-border/50 focus:outline-none focus:ring-2 focus:ring-primary" title="Close series view">
          <X className="h-5 w-5" />
        </button>
      </Dialog.Close>

      <div className="w-28 h-40 md:w-36 md:h-52 rounded-lg overflow-hidden shadow-xl border border-border/50 flex-shrink-0 bg-muted">
        {coverUrl ? (
          <img src={coverUrl} alt={series.title} className="w-full h-full object-contain bg-muted" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground/30">
            <BookOpen className="w-8 h-8 mb-2" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col justify-between pt-2">
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider bg-primary/10 text-primary uppercase border border-primary/20">
              {status}
            </span>
            <span className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" />
              {series.bookCount} {series.bookCount === 1 ? 'Volume' : 'Volumes'}
            </span>
            {totalPages > 0 && (
              <span className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5" />
                {totalPages.toLocaleString()} Pages
              </span>
            )}
          </div>
          <Dialog.Title className="text-2xl md:text-3xl font-bold text-foreground truncate tracking-tight mb-1">
            {series.title}
          </Dialog.Title>
          <p className="text-sm md:text-base text-muted-foreground truncate font-medium">
            {Array.from(series.authors).join(', ') || 'Unknown Author'}
          </p>
        </div>

        <div className="mt-6 md:mt-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reading Progress</span>
            <span className="text-xs font-bold text-primary">{progressPercent}%</span>
          </div>
          <div className="h-2 w-full bg-muted rounded-full overflow-hidden mb-4 border border-border/50">
            <div className="h-full bg-primary transition-all duration-500 ease-out" style={{ width: `${progressPercent}%` }} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onEdit} className="gap-2 font-semibold">
              <Edit2 className="w-4 h-4" /> Edit
            </Button>
            <Button variant="outline" size="sm" onClick={onMarkAllRead} className="gap-2 font-semibold">
              <CheckCircle2 className="w-4 h-4" /> Mark All Read
            </Button>
            <Button variant="outline" size="sm" disabled className="gap-2 font-semibold opacity-50 cursor-not-allowed">
              <DownloadCloud className="w-4 h-4" /> Download
            </Button>
            
            <div className="relative ml-auto md:ml-0">
              {!showDeleteConfirm ? (
                <Button variant="destructive" size="sm" onClick={() => setShowDeleteConfirm(true)} className="gap-2 font-semibold bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground border border-destructive/20 hover:border-destructive">
                  <Trash2 className="w-4 h-4" /> Delete
                </Button>
              ) : (
                <div className="flex items-center gap-2 bg-destructive/10 p-1 rounded-md border border-destructive/20 animate-in fade-in zoom-in-95 duration-200">
                  <span className="text-xs text-destructive font-medium px-2">Confirm?</span>
                  <Button variant="destructive" size="sm" onClick={() => { onDelete(); setShowDeleteConfirm(false); }} className="h-7 text-xs px-3">Yes</Button>
                  <Button variant="ghost" size="sm" onClick={() => setShowDeleteConfirm(false)} className="h-7 text-xs px-3 hover:bg-destructive/20 text-destructive">No</Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})

const ListBookCard = memo(function ListBookCard({
  book,
  isSelected,
  onSelect,
  onOpen,
}: {
  book: Book
  isSelected: boolean
  onSelect: (id: number) => void
  onOpen: (id: number) => void
}) {
  const { coverUrl } = useCoverImage(book.id, null);
  const status = getBookReadStatus(book);
  const isRead = status === 'completed';

  return (
    <div 
      className={cn(
        "flex items-center gap-4 p-3 rounded-lg border transition-all cursor-pointer group",
        isSelected ? "bg-primary/5 border-primary shadow-sm" : "bg-card border-border hover:border-primary/50 hover:bg-muted/50"
      )}
      onClick={(e) => {
        if (e.shiftKey || e.ctrlKey || e.metaKey) {
          onSelect(book.id!);
        } else {
          onOpen(book.id!);
        }
      }}
    >
      <div className="w-12 h-16 rounded overflow-hidden bg-muted flex-shrink-0 relative">
        {coverUrl ? (
          <img src={coverUrl} alt={book.title} className="w-full h-full object-contain bg-muted" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <BookOpen className="w-4 h-4 text-muted-foreground/30" />
          </div>
        )}
        {isRead && (
          <div className="absolute top-1 right-1 bg-green-500 rounded-full p-0.5 shadow-sm">
            <Check className="w-2 h-2 text-white" />
          </div>
        )}
      </div>
      
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
          {book.title}
        </h4>
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
          {book.series_index !== undefined && (
            <span className="font-medium bg-muted px-1.5 py-0.5 rounded text-foreground/80">Vol. {book.series_index}</span>
          )}
          {book.page_count !== undefined && <span>{book.page_count} pages</span>}
          {status === 'reading' && <span className="text-blue-500 font-medium">Reading</span>}
        </div>
      </div>
      
      <Button 
        variant="ghost" 
        size="sm" 
        className="opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => { e.stopPropagation(); onOpen(book.id!); }}
      >
        Read
      </Button>
    </div>
  );
});

export const SeriesView = memo(function SeriesView({
  series,
  isOpen,
  onClose,
  onSelectBook,
  onOpenBook,
  onViewDetailsBook,
  onEditBook,
  onDeleteBook,
  onConvertBook,
  onFavoriteBook,
  selectedBookIds,
  favoritedBookIds,
}: SeriesViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'read' | 'unread'>('all');
  const [sortOrder, setSortOrder] = useState<'chapter_asc' | 'chapter_desc' | 'date_added'>('chapter_asc');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [managementOpen, setManagementOpen] = useState(false);
  const [jumpInput, setJumpInput] = useState('');
  
  const toast = useToast();
  const bookRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setFilterStatus('all');
      setJumpInput('');
      bookRefs.current.clear();
    }
  }, [isOpen, series?.id]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (/^[0-9]$/.test(e.key)) {
        const jumpInputEl = document.getElementById('chapter-jump-input');
        if (jumpInputEl) jumpInputEl.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleJumpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!jumpInput) return;
    const targetChapter = parseFloat(jumpInput);
    if (isNaN(targetChapter)) return;
    
    const targetBook = series?.books.find(b => b.series_index === targetChapter);
    if (targetBook && targetBook.id) {
      const el = bookRefs.current.get(targetBook.id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ring-2', 'ring-primary', 'ring-offset-2', 'rounded-lg');
        setTimeout(() => {
          el.classList.remove('ring-2', 'ring-primary', 'ring-offset-2', 'rounded-lg');
        }, 2000);
        setJumpInput('');
      } else {
        toast.info('Not Visible', 'The chapter is filtered out.');
      }
    } else {
      toast.error('Not Found', `Volume/Chapter ${targetChapter} is not in this series.`);
    }
  };

  const processedBooks = useMemo(() => {
    if (!series) return [];
    let result = [...series.books];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(b => 
        b.title.toLowerCase().includes(q) || 
        (b.series_index !== undefined && b.series_index.toString() === q)
      );
    }
    if (filterStatus !== 'all') {
      result = result.filter(b => {
        const status = getBookReadStatus(b);
        return filterStatus === 'read' ? status === 'completed' : status !== 'completed';
      });
    }
    result.sort((a, b) => {
      if (sortOrder === 'chapter_asc') return (a.series_index ?? Infinity) - (b.series_index ?? Infinity);
      if (sortOrder === 'chapter_desc') return (b.series_index ?? -Infinity) - (a.series_index ?? -Infinity);
      if (sortOrder === 'date_added') return new Date(b.added_date).getTime() - new Date(a.added_date).getTime();
      return 0;
    });
    return result;
  }, [series, searchQuery, filterStatus, sortOrder]);

  if (!series) return null;

  const handleDeleteSeries = async () => {
    try {
      for (const book of series.books) {
        if (book.id) await api.removeBookFromSeries(book.id);
      }
      toast.success('Series Deleted', 'All volumes have been ungrouped.');
      onClose();
     } catch (err) {
       logger.error(err);
       toast.error('Error', 'Failed to delete series.');
    }
  };

  const handleMarkAllRead = async () => {
    try {
      for (const book of series.books) {
        if (book.id && getBookReadStatus(book) !== 'completed') {
          await api.updateBook({ ...book, reading_status: 'completed' });
        }
      }
      toast.success('Updated', 'All volumes marked as read. Note: Refresh required to see changes.');
     } catch (err) {
       logger.error(err);
       toast.error('Error', 'Failed to mark volumes as read.');
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
            'bg-background border border-border/50 rounded-xl shadow-2xl',
            'w-[95vw] md:w-[90vw] max-w-6xl h-[90vh]',
            'flex flex-col z-50 overflow-hidden',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95'
          )}
        >
          <SeriesHeader 
            series={series} 
            onEdit={() => setManagementOpen(true)}
            onDelete={handleDeleteSeries}
            onMarkAllRead={handleMarkAllRead}
          />

          <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 border-b border-border bg-muted/20 shrink-0">
            <div className="flex items-center gap-2 w-full md:w-auto">
              <div className="relative flex-1 md:w-64">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  placeholder="Search volumes..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9 bg-background"
                />
              </div>
              <form onSubmit={handleJumpSubmit} className="relative flex-shrink-0 w-28">
                <Input 
                  id="chapter-jump-input"
                  placeholder="Jump to..." 
                  value={jumpInput}
                  onChange={(e) => setJumpInput(e.target.value)}
                  className="h-9 bg-background"
                />
              </form>
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto justify-between md:justify-end overflow-x-auto pb-1 md:pb-0">
              <div className="flex items-center bg-background border border-border rounded-md p-0.5">
                <button onClick={() => setFilterStatus('all')} className={cn("px-3 py-1 text-xs font-medium rounded-sm transition-colors", filterStatus === 'all' ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>All</button>
                <button onClick={() => setFilterStatus('unread')} className={cn("px-3 py-1 text-xs font-medium rounded-sm transition-colors", filterStatus === 'unread' ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>Unread</button>
                <button onClick={() => setFilterStatus('read')} className={cn("px-3 py-1 text-xs font-medium rounded-sm transition-colors", filterStatus === 'read' ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>Read</button>
              </div>

              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className={cn("h-8 w-8", sortOrder === 'chapter_asc' && "bg-muted")} onClick={() => setSortOrder('chapter_asc')} title="Sort Ascending">
                  <SortAsc className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="icon" className={cn("h-8 w-8", sortOrder === 'chapter_desc' && "bg-muted")} onClick={() => setSortOrder('chapter_desc')} title="Sort Descending">
                  <SortDesc className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="icon" className={cn("h-8 w-8", sortOrder === 'date_added' && "bg-muted")} onClick={() => setSortOrder('date_added')} title="Sort by Date Added">
                  <Clock className="w-4 h-4" />
                </Button>
              </div>

              <div className="h-6 w-px bg-border mx-1 hidden md:block" />

              <div className="flex items-center bg-background border border-border rounded-md p-0.5">
                <button onClick={() => setViewMode('grid')} className={cn("p-1.5 rounded-sm transition-colors", viewMode === 'grid' ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")} title="Grid View">
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button onClick={() => setViewMode('list')} className={cn("p-1.5 rounded-sm transition-colors", viewMode === 'list' ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")} title="List View">
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <ScrollArea className="flex-1 bg-background">
            <div className="p-4 md:p-6">
              {processedBooks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground border-2 border-dashed border-border/50 rounded-xl">
                  <Search className="w-12 h-12 mb-4 opacity-20" />
                  <h3 className="text-lg font-semibold text-foreground/80 mb-1">No volumes found</h3>
                  <p className="text-sm">Try adjusting your search or filters.</p>
                  {(searchQuery || filterStatus !== 'all') && (
                    <Button variant="link" onClick={() => { setSearchQuery(''); setFilterStatus('all'); }} className="mt-4">
                      Clear Filters
                    </Button>
                  )}
                </div>
              ) : (
                viewMode === 'grid' ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4">
                    {processedBooks.map((book, index) => (
                      <div 
                        key={book.id ?? book.uuid} 
                        ref={(el) => { if (book.id && el) bookRefs.current.set(book.id, el); }}
                        className="relative group transition-all duration-300"
                      >
                        <PremiumBookCard
                          book={book}
                          isSelected={selectedBookIds?.has(book.id!) ?? false}
                          onSelect={onSelectBook}
                          onOpen={onOpenBook}
                          onViewDetails={onViewDetailsBook}
                          onEdit={onEditBook}
                          onDelete={onDeleteBook}
                          onConvert={onConvertBook}
                          isFavorited={favoritedBookIds?.has(book.id!) ?? false}
                          onFavorite={onFavoriteBook}
                          animationDelay={index * 20}
                        />
                        {getBookReadStatus(book) === 'completed' && (
                          <div className="absolute -top-2 -right-2 z-10 bg-green-500 rounded-full p-1 shadow-md shadow-green-500/20 animate-in zoom-in">
                            <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                          </div>
                        )}
                        {book.series_index !== undefined && (
                          <div className="absolute top-2 left-2 z-10 bg-background/90 backdrop-blur-md px-2 py-0.5 rounded text-[10px] font-black border border-border/50 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
                            VOL {book.series_index}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 max-w-4xl mx-auto">
                    {processedBooks.map((book) => (
                      <div 
                        key={book.id ?? book.uuid}
                        ref={(el) => { if (book.id && el) bookRefs.current.set(book.id, el); }}
                      >
                        <ListBookCard
                          book={book}
                          isSelected={selectedBookIds?.has(book.id!) ?? false}
                          onSelect={onSelectBook}
                          onOpen={onOpenBook}
                        />
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </ScrollArea>

          <SeriesManagementDialog
            open={managementOpen}
            onOpenChange={setManagementOpen}
            seriesTitle={series.title}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
})
