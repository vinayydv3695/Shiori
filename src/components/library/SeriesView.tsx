import { memo, useState, useMemo, useRef, useEffect } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  X, BookOpen, Layers, Search, SortDesc, SortAsc,
  Clock, CheckCircle2, Edit2, DownloadCloud, Trash2, List, LayoutGrid, Check, Play, MoreVertical
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { logger } from '@/lib/logger'
import { ScrollArea } from '@/components/ui/scroll-area'
import { PremiumBookCard } from './ModernBookCard'
import { useCoverImage } from '../common/hooks/useCoverImage'
import type { SeriesViewProps } from './types'
import { MetadataSearchDialog } from './MetadataSearchDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api, type Book } from '@/lib/tauri'
import { useToast } from '@/store/toastStore'

function getBookReadStatus(book: Book) {
  return book.reading_status || 'planning';
}

const SeriesHeader = memo(function SeriesHeader({
  series,
  onFindMetadata,
  onMarkAllRead,
  onDelete,
  onOpenBook,
}: {
  series: SeriesViewProps['series']
  onFindMetadata: () => void
  onMarkAllRead: () => void
  onDelete: () => void
  onOpenBook: (id: number) => void
}) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  if (!series) return null;
  const firstBook = series.books[0];
  const { coverUrl } = useCoverImage(firstBook?.id, firstBook?.cover_path)

  const totalPages = useMemo(() => series.books.reduce((acc, b) => acc + (b.page_count || 0), 0), [series.books]);
  
  // Find next unread book
  const sortedBooks = useMemo(() => [...series.books].sort((a, b) => (a.series_index ?? 0) - (b.series_index ?? 0)), [series.books]);
  const nextUnreadBook = useMemo(() => sortedBooks.find(b => getBookReadStatus(b) !== 'completed'), [sortedBooks]);
  const readBooks = series.books.length - sortedBooks.filter(b => getBookReadStatus(b) !== 'completed').length;
  const progressPercent = series.books.length > 0 ? Math.round((readBooks / series.books.length) * 100) : 0;
  
  const status = 'Ongoing';

  return (
    <div className="relative overflow-hidden shrink-0 border-b border-border bg-card">
      {/* Blurred Hero Background */}
      {coverUrl && (
        <>
          <div 
            className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-30 blur-3xl scale-110 saturate-150 transform-gpu dark:opacity-40"
            style={{ backgroundImage: `url(${coverUrl})` }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/40 to-transparent" />
        </>
      )}

      <div className="relative z-10 p-4 pt-12 md:p-8 flex flex-col gap-6 md:gap-8">
        
        {/* Top Section: Cover & Info */}
        <div className="flex flex-row gap-4 md:gap-8 items-start md:items-end w-full">
          {/* Cover */}
          <div className="w-28 h-40 md:w-48 md:h-72 rounded-lg overflow-hidden shadow-2xl border border-white/10 flex-shrink-0 bg-muted/50 transform transition-transform hover:scale-105 duration-300">
            {coverUrl ? (
              <img src={coverUrl} alt={series.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground/30 bg-muted">
                <BookOpen className="w-8 h-8 md:w-12 md:h-12 mb-2" />
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0 flex flex-col justify-start md:justify-end py-1 md:py-2 w-full text-left">
            <div className="flex flex-wrap items-center gap-2 mb-2 md:mb-3">
              <span className="px-2 py-0.5 md:px-2.5 md:py-1 rounded text-[10px] md:text-xs font-bold tracking-wider bg-primary text-primary-foreground shadow-sm uppercase">
                {status}
              </span>
              <span className="text-xs md:text-sm text-foreground/90 font-medium flex items-center gap-1 backdrop-blur-md bg-background/30 px-2 py-0.5 md:px-2.5 md:py-1 rounded border border-border/20">
                <Layers className="w-3 h-3 md:w-4 md:h-4" />
                {series.bookCount} {series.bookCount === 1 ? 'Vol' : 'Vols'}
              </span>
              {totalPages > 0 && (
                <span className="hidden md:flex text-sm text-foreground/90 font-medium items-center gap-1 backdrop-blur-md bg-background/30 px-2.5 py-1 rounded border border-border/20">
                  <BookOpen className="w-4 h-4" />
                  {totalPages.toLocaleString()} Pages
                </span>
              )}
            </div>
            
            <Dialog.Title className="text-2xl sm:text-3xl md:text-5xl font-black text-foreground line-clamp-3 md:truncate tracking-tight mb-1 md:mb-2 drop-shadow-md leading-tight">
              {series.title}
            </Dialog.Title>
            <p className="text-sm md:text-xl text-foreground/80 truncate font-medium drop-shadow-sm">
              {Array.from(series.authors).join(', ') || 'Unknown Author'}
            </p>
          </div>
        </div>

        {/* Actions Section */}
        <div className="flex flex-col md:flex-row items-center gap-5 md:gap-6 w-full">
          {/* Primary Action */}
          <div className="w-full md:w-auto md:flex-none">
            <Button 
              size="lg" 
              onClick={() => {
                if (nextUnreadBook?.id) onOpenBook(nextUnreadBook.id);
                else if (sortedBooks[0]?.id) onOpenBook(sortedBooks[0].id);
              }} 
              className="w-full gap-2.5 font-bold text-base shadow-lg shadow-primary/20 transition-all hover:scale-105"
            >
              <Play className="w-5 h-5 fill-current" /> 
              {nextUnreadBook ? `Continue Vol. ${nextUnreadBook.series_index || ''}` : 'Read Again'}
            </Button>
          </div>

          {/* Reading Progress */}
          <div className="flex-1 flex flex-col justify-center w-full max-w-sm md:mx-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] md:text-xs font-bold text-foreground/80 uppercase tracking-wider drop-shadow-sm">Reading Progress</span>
              <span className="text-[10px] md:text-xs font-black text-primary drop-shadow-sm">{progressPercent}%</span>
            </div>
            <div className="h-1.5 md:h-2 w-full bg-background/40 backdrop-blur-sm rounded-full overflow-hidden border border-border/30 shadow-inner">
              <div className="h-full bg-primary transition-all duration-1000 ease-out" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>

          {/* Secondary Actions (Dropdown) */}
          <div className="flex items-center gap-2 justify-center w-full md:w-auto md:justify-end mt-2 md:mt-0">
            <Button variant="secondary" size="icon" onClick={onMarkAllRead} className="h-10 w-10 bg-background/30 hover:bg-background/50 text-foreground border-border/20 backdrop-blur-md transition-colors shadow-sm" title="Mark All Read">
              <CheckCircle2 className="w-4 h-4" />
            </Button>
            <Button variant="secondary" size="icon" disabled className="h-10 w-10 bg-background/30 hover:bg-background/50 text-foreground border-border/20 backdrop-blur-md opacity-50 cursor-not-allowed shadow-sm" title="Download">
              <DownloadCloud className="w-4 h-4" />
            </Button>
            
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <Button variant="secondary" size="icon" className="h-10 w-10 bg-background/30 hover:bg-background/50 text-foreground border-border/20 backdrop-blur-md transition-colors shadow-sm">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content align="end" className="w-48 bg-card border border-border/50 rounded-lg shadow-xl p-1 z-[100] animate-in fade-in zoom-in-95 data-[side=bottom]:slide-in-from-top-2">
                  <DropdownMenu.Item onSelect={onFindMetadata} className="flex items-center gap-2 px-3 py-2 text-sm text-foreground cursor-pointer outline-none hover:bg-accent hover:text-accent-foreground rounded-md transition-colors">
                    <Edit2 className="w-4 h-4" /> Edit Metadata
                  </DropdownMenu.Item>
                  <DropdownMenu.Separator className="h-px bg-border/50 my-1" />
                  {!showDeleteConfirm ? (
                    <DropdownMenu.Item onSelect={(e) => { e.preventDefault(); setShowDeleteConfirm(true); }} className="flex items-center gap-2 px-3 py-2 text-sm text-destructive cursor-pointer outline-none hover:bg-destructive/10 rounded-md transition-colors font-medium">
                      <Trash2 className="w-4 h-4" /> Ungroup Series
                    </DropdownMenu.Item>
                  ) : (
                    <div className="flex items-center justify-between p-2 bg-destructive/10 rounded-md">
                      <span className="text-xs text-destructive font-bold px-1">Sure?</span>
                      <div className="flex gap-1">
                        <Button variant="destructive" size="sm" onClick={onDelete} className="h-6 text-[10px] px-2 py-0">Yes</Button>
                        <Button variant="ghost" size="sm" onClick={() => setShowDeleteConfirm(false)} className="h-6 text-[10px] px-2 py-0 hover:bg-destructive/20 text-destructive">No</Button>
                      </div>
                    </div>
                  )}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
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
  const { coverUrl } = useCoverImage(book.id, book.cover_path);
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
          <img src={coverUrl} alt={book.title} className="w-full h-full object-cover bg-muted" />
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
  onFavoriteBook,
  selectedBookIds,
  favoritedBookIds,
}: SeriesViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'read' | 'unread'>('all');
  const [sortOrder, setSortOrder] = useState<'chapter_asc' | 'chapter_desc' | 'date_added'>('chapter_asc');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [metadataDialogOpen, setMetadataDialogOpen] = useState(false);
  const [metadataSeriesId, setMetadataSeriesId] = useState<number | null>(null);
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
    
    const targetBook = series?.books.find(b => {
      let idx = b.series_index;
      if (idx == null || isNaN(idx)) {
          const m = b.title.match(/\d+/g);
          if (m) idx = parseFloat(m[m.length - 1]);
      }
      return idx === targetChapter;
    });
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

  const getErrorMessage = (err: unknown) => {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    if (err && typeof err === 'object') {
      const maybe = err as { userMessage?: string; message?: string; technicalDetails?: string };
      return maybe.userMessage || maybe.message || maybe.technicalDetails || JSON.stringify(err);
    }
    return String(err);
  };

  const handleFindSeriesMetadata = async () => {
    if (!series) return;
    try {
      const list = await api.getMangaSeriesList(1000, 0);
      const match = list.find(s => s.title.toLowerCase() === series.title.toLowerCase());
      if (!match?.id) {
        toast.error('Series not found', 'Could not resolve this series in database.');
        return;
      }
      setMetadataSeriesId(match.id);
      setMetadataDialogOpen(true);
    } catch (err) {
      logger.error('Failed to resolve series ID for metadata:', err);
      toast.error('Metadata error', getErrorMessage(err));
    }
  };

  const handleDeleteSeries = async () => {
    try {
      const list = await api.getMangaSeriesList(1000, 0);
      const targetSeries = list.find(s => s.title.toLowerCase() === series.title.toLowerCase());
      
      if (targetSeries && targetSeries.id !== undefined) {
          await api.deleteMangaSeries(targetSeries.id);
      }

      const bookIds = series.books.map(b => b.id).filter((id): id is number => id !== undefined);
      if (bookIds.length > 0) {
          await api.deleteBooks(bookIds);
      }
      
      toast.success('Series Deleted', 'Series and all volumes have been deleted.');
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
        <Dialog.Content aria-describedby={undefined}
          className={cn(
            'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2',
            'bg-background border border-border/50 rounded-xl shadow-2xl',
            'w-[95vw] md:w-[90vw] max-w-6xl h-[90vh]',
            'flex flex-col z-50 overflow-hidden',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95'
          )}
        >
          <Dialog.Close asChild>
            <button className="absolute top-4 right-4 text-foreground/70 hover:text-foreground transition-colors flex-shrink-0 z-[60] bg-background/20 hover:bg-background/40 backdrop-blur-md p-2 rounded-full focus:outline-none focus:ring-2 focus:ring-primary border border-border/10" title="Close series view">
              <X className="h-5 w-5" />
            </button>
          </Dialog.Close>
          
          <ScrollArea className="flex-1 bg-background/50">
            <SeriesHeader 
              series={series} 
              onFindMetadata={handleFindSeriesMetadata}
              onDelete={handleDeleteSeries}
              onMarkAllRead={handleMarkAllRead}
              onOpenBook={onOpenBook}
            />

          <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 border-b border-border bg-card/80 backdrop-blur-md shrink-0 sticky top-0 z-20 shadow-sm">
            <div className="flex items-center gap-2 w-full md:w-auto">
              <div className="relative flex-1 md:w-64 group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                <Input 
                  placeholder="Search volumes..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-10 bg-background/50 border-border/50 focus-visible:ring-primary/20 rounded-full transition-all"
                />
              </div>
              <form onSubmit={handleJumpSubmit} className="relative flex-shrink-0 w-28 group">
                <Input 
                  id="chapter-jump-input"
                  placeholder="Jump to..." 
                  value={jumpInput}
                  onChange={(e) => setJumpInput(e.target.value)}
                  className="h-10 bg-background/50 border-border/50 focus-visible:ring-primary/20 rounded-full text-center transition-all"
                />
              </form>
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto justify-between md:justify-end overflow-x-auto pb-1 md:pb-0 scrollbar-none">
              <div className="flex items-center bg-background/50 border border-border/50 rounded-full p-1 shadow-inner">
                <button onClick={() => setFilterStatus('all')} className={cn("px-4 py-1.5 text-xs font-bold rounded-full transition-all duration-200", filterStatus === 'all' ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:text-foreground hover:bg-muted/50")}>All</button>
                <button onClick={() => setFilterStatus('unread')} className={cn("px-4 py-1.5 text-xs font-bold rounded-full transition-all duration-200", filterStatus === 'unread' ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:text-foreground hover:bg-muted/50")}>Unread</button>
                <button onClick={() => setFilterStatus('read')} className={cn("px-4 py-1.5 text-xs font-bold rounded-full transition-all duration-200", filterStatus === 'read' ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground hover:text-foreground hover:bg-muted/50")}>Read</button>
              </div>

              <div className="flex items-center gap-1 bg-background/50 border border-border/50 rounded-full p-1 shadow-inner">
                <Button variant="ghost" size="icon" className={cn("h-8 w-8 rounded-full hover:bg-muted", sortOrder === 'chapter_asc' && "bg-muted text-foreground")} onClick={() => setSortOrder('chapter_asc')} title="Sort Ascending">
                  <SortAsc className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className={cn("h-8 w-8 rounded-full hover:bg-muted", sortOrder === 'chapter_desc' && "bg-muted text-foreground")} onClick={() => setSortOrder('chapter_desc')} title="Sort Descending">
                  <SortDesc className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className={cn("h-8 w-8 rounded-full hover:bg-muted", sortOrder === 'date_added' && "bg-muted text-foreground")} onClick={() => setSortOrder('date_added')} title="Sort by Date Added">
                  <Clock className="w-4 h-4" />
                </Button>
              </div>

              <div className="h-6 w-px bg-border/50 mx-1 hidden md:block" />

              <div className="flex items-center bg-background/50 border border-border/50 rounded-full p-1 shadow-inner">
                <button onClick={() => setViewMode('grid')} className={cn("p-2 rounded-full transition-all duration-200", viewMode === 'grid' ? "bg-muted text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")} title="Grid View">
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button onClick={() => setViewMode('list')} className={cn("p-2 rounded-full transition-all duration-200", viewMode === 'list' ? "bg-muted text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")} title="List View">
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="p-4 md:p-6 animate-in slide-in-from-bottom-4 fade-in duration-500 ease-out fill-mode-both">
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
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] md:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3 md:gap-4">
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

          {metadataSeriesId && (
            <MetadataSearchDialog
              open={metadataDialogOpen}
              onOpenChange={setMetadataDialogOpen}
              bookIds={series.books.map((b) => b.id!).filter(Boolean)}
              bookTitle={series.title}
              isManga={true}
              isbn={null}
              seriesId={metadataSeriesId}
              onMetadataSelected={async () => {
                setMetadataDialogOpen(false);
              }}
            />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
})
