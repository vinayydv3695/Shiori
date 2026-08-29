import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { 
  X, BookOpen, FileText, Tag, Star, Globe, Loader2, 
  Search, Pencil, Trash2, RefreshCw, LayoutTemplate, 
  CheckCircle2, Clock, PauseCircle, XCircle, Building2, 
  Calendar, HardDrive, Hash, Layers, BookmarkCheck
} from 'lucide-react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { api, type Book } from '../../lib/tauri';
import { logger } from '@/lib/logger';
import { useToast } from '../../store/toastStore';
import { Button } from '../ui/button';
import { MetadataSearchDialog } from './MetadataSearchDialog';
import { FeatureHint } from '../ui/FeatureHint';
import { pageCountLabel } from '@/lib/utils';
import { FallbackBookCover } from './FallbackBookCover';
import { useLibraryStore } from '../../store/libraryStore';
import { ConvertToEpubMenuItem } from '@/components/conversion/ConvertToEpubMenuItem';
import { useBottomSheetDrag } from '@/hooks/useBottomSheetDrag';

function resolveCoverSrc(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return convertFileSrc(path.replace(/\\/g, '/'));
}

interface BookDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookId: number;
  onEdit?: () => void;
  onDelete?: () => void;
  onRead?: () => void;
}

const READING_STATUSES = [
  { value: 'reading', label: 'Reading', icon: BookOpen },
  { value: 'completed', label: 'Completed', icon: CheckCircle2 },
  { value: 'planning', label: 'Plan to Read', icon: Clock },
  { value: 'on_hold', label: 'On Hold', icon: PauseCircle },
  { value: 'dropped', label: 'Dropped', icon: XCircle },
] as const;

export const BookDetailsDialog = ({
  open,
  onOpenChange,
  bookId,
  onEdit,
  onDelete,
  onRead
}: BookDetailsDialogProps) => {
  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);
  const [metadataDialogOpen, setMetadataDialogOpen] = useState(false);
  const [autoEnrichLoading, setAutoEnrichLoading] = useState(false);
  const [readingStatus, setReadingStatus] = useState(book?.reading_status || 'planning');
  const toast = useToast();

  useEffect(() => {
    if (book?.reading_status) {
      setReadingStatus(book.reading_status);
    }
  }, [book?.reading_status]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      unlisten = await listen<{ bookId: number; status: string; provider?: string; error?: string }>("metadata-update", (event) => {
        const payload = event.payload;
        if (payload.bookId === bookId) {
          if (payload.status === "loading") {
            setAutoEnrichLoading(true);
          } else if (payload.status === "success") {
            setAutoEnrichLoading(false);
            toast.success("Metadata Enriched", `Successfully updated metadata from ${payload.provider}`);
            loadBook(); // Reload data
          } else if (payload.status === "not_found") {
            setAutoEnrichLoading(false);
            toast.info("No Metadata Found", `Could not find relevant metadata on ${payload.provider}`);
          } else if (payload.status === "error") {
            setAutoEnrichLoading(false);
            toast.error("Metadata Sync Error", payload.error || "Failed to sync metadata");
          }
        }
      });
    };

    if (open) {
      setupListener();
    }

    return () => {
      if (unlisten) unlisten();
    };
  }, [open, bookId, toast]);

  useEffect(() => {
    let canceled = false;

    if (open && bookId) {
      // Synchronously sync from libraryStore to eliminate loading delay & state flashes
      const cached = useLibraryStore.getState().books.find(b => b.id === bookId);
      if (cached) {
        setBook(cached);
        setReadingStatus(cached.reading_status || 'planning');
        setLoading(false);
      } else {
        setBook(null);
        setLoading(true);
      }

      // Fetch fresh / complete metadata from API
      api.getBook(bookId)
        .then(bookData => {
          if (!canceled) {
            setBook(bookData);
            if (bookData.reading_status) setReadingStatus(bookData.reading_status);
            setLoading(false);
          }
        })
        .catch(error => {
          logger.error('Failed to load book:', error);
          if (!canceled) setLoading(false);
        });
    } else if (!open) {
      // Clear book state when closed so stale metadata is discarded
      setBook(null);
      setLoading(false);
    }

    return () => {
      canceled = true;
    };
  }, [open, bookId]);

  const loadBook = async () => {
    try {
      const bookData = await api.getBook(bookId);
      setBook(bookData);
      if (bookData.reading_status) setReadingStatus(bookData.reading_status);
    } catch (error) {
      logger.error('Failed to load book:', error);
    }
  };

  const coverSrc = book?.cover_path ? resolveCoverSrc(book.cover_path) : null;
  const isManga = book?.file_format ? ['cbz', 'cbr', 'zip', 'rar', 'online-manga'].includes(book.file_format.toLowerCase()) : false;

  const handleMetadataFetched = async () => {
    await loadBook();
  };

  const handleStatusChange = async (newStatus: string) => {
    if (readingStatus === newStatus) return;
    const prevStatus = readingStatus;
    setReadingStatus(newStatus);
    try {
      await api.updateReadingStatus(bookId, newStatus);
      await useLibraryStore.getState().loadInitialBooks();
      await loadBook();
      const statusObj = READING_STATUSES.find(s => s.value === newStatus);
      toast.success("Status Updated", `Set to ${statusObj?.label || newStatus}`);
    } catch (err) {
      logger.error('Failed to update reading status:', err);
      setReadingStatus(prevStatus);
      toast.error("Failed to update status", "Could not change reading status");
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'Unknown';
    return new Date(dateStr).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 bg-black/60 backdrop-blur-xl z-[200] transition-all data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-200" />
        <Dialog.Content 
          aria-describedby={undefined} 
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-28px)] sm:w-[90vw] max-w-2xl max-h-[85vh] bg-popover dark:bg-card/98 backdrop-blur-3xl border border-border/80 rounded-3xl shadow-2xl z-[210] flex flex-col overflow-hidden focus:outline-none transition-all duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 sm:px-6 py-2.5 sm:py-4 border-b border-border/50 bg-muted/20 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0 pr-2">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary shadow-2xs shrink-0">
                <BookOpen className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <Dialog.Title className="text-sm sm:text-base font-extrabold text-foreground tracking-tight">
                  Book Details
                </Dialog.Title>
                <Dialog.Description className="text-[11px] sm:text-xs text-muted-foreground line-clamp-1 font-medium">
                  {book?.title || 'Loading...'}
                </Dialog.Description>
              </div>
            </div>
            
            <button
              onClick={() => onOpenChange(false)}
              className="p-1.5 sm:p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer shrink-0"
              title="Close"
            >
              <X className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
            </button>
          </div>

          {/* Body Content */}
          {loading && !book ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 min-h-[300px]">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
            </div>
          ) : !book ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 min-h-[300px] text-muted-foreground text-sm font-medium">
              Book details unavailable.
            </div>
          ) : (
            /* Scrollable Content Area */
            <div 
              className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar space-y-4 sm:space-y-5"
              style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)' }}
            >
              {/* Top Hero Section: Side-by-Side Cover & Book Identity */}
              <div className="flex items-start gap-3.5 sm:gap-5">
                {/* Book Cover Thumbnail */}
                <div className="relative group w-24 min-[360px]:w-28 sm:w-36 aspect-[2/3] rounded-2xl overflow-hidden shadow-lg border border-border/50 bg-muted/20 shrink-0">
                  {coverSrc ? (
                    <img
                      src={coverSrc}
                      alt={book.title}
                      loading="eager"
                      decoding="async"
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <FallbackBookCover
                      title={book.title}
                      author={book.authors?.map((a) => a.name).join(', ')}
                      format={book.file_format}
                      isRss={book.tags?.some((t: any) => t.name === 'RSS') || /rss|feed|daily reading|daily digest/i.test(book.title)}
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent pointer-events-none" />
                </div>

                {/* Book Info Column */}
                <div className="flex-1 min-w-0 space-y-1.5 sm:space-y-2 text-left">
                  <h2 className="text-base min-[380px]:text-lg sm:text-2xl font-black text-foreground leading-snug sm:leading-tight tracking-tight line-clamp-3">
                    {book.title}
                  </h2>
                  
                  {book.authors && book.authors.length > 0 && (
                    <p className="text-xs sm:text-sm text-muted-foreground font-semibold line-clamp-2">
                      {book.authors.map(a => a.name).join(', ')}
                    </p>
                  )}

                  {/* Format & Rating Badges */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    {book.file_format && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold bg-muted text-muted-foreground border border-border/50 uppercase tracking-wider">
                        {book.file_format}
                      </span>
                    )}
                    {book.rating && book.rating > 0 ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                        <Star className="w-3 h-3 fill-current mr-1 text-amber-500" />
                        {book.rating} / {book.metadata_source === 'anilist' ? '10' : '5'}
                      </span>
                    ) : null}
                    {book.metadata_source && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold bg-primary/10 text-primary border border-primary/20">
                        <Globe className="w-3 h-3 mr-1" />
                        {book.metadata_source}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions Section: Primary Read CTA + Material 3 Action Row */}
              <div className="space-y-2 pt-1">
                {onRead && (
                  <Button 
                    size="lg" 
                    className="w-full rounded-2xl text-xs sm:text-base font-bold h-11 sm:h-12 shadow-lg shadow-primary/25 bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center gap-2 active:scale-[0.98] transition-all cursor-pointer" 
                    onClick={() => { onOpenChange(false); onRead(); }}
                  >
                    <BookOpen className="w-4 h-4 sm:w-5 sm:h-5 mr-0.5" /> 
                    <span>Read Now</span>
                  </Button>
                )}

                {/* Horizontal Action Row */}
                <div className="grid grid-cols-4 gap-1.5 sm:gap-2 w-full">
                  <FeatureHint featureId="metadata-search" title="Find Metadata" description="Search online for covers and details.">
                    <button 
                      type="button"
                      className="w-full flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-2xl bg-muted/40 hover:bg-muted active:bg-muted/80 border border-border/50 text-foreground transition-all cursor-pointer active:scale-95 text-center" 
                      onClick={() => setMetadataDialogOpen(true)}
                    >
                      <Search className="w-4 h-4 text-primary shrink-0"/>
                      <span className="text-[10px] sm:text-xs font-bold leading-tight">Match</span>
                    </button>
                  </FeatureHint>

                  <button 
                    type="button"
                    className="w-full flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-2xl bg-muted/40 hover:bg-muted active:bg-muted/80 border border-border/50 text-foreground transition-all cursor-pointer active:scale-95 text-center disabled:opacity-50" 
                    disabled={autoEnrichLoading} 
                    onClick={() => api.enrichBookMetadata(bookId)}
                  >
                    {autoEnrichLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0"/>
                    ) : (
                      <RefreshCw className="w-4 h-4 text-primary shrink-0"/>
                    )}
                    <span className="text-[10px] sm:text-xs font-bold leading-tight">Enrich</span>
                  </button>

                  {onEdit && (
                    <button 
                      type="button"
                      className="w-full flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-2xl bg-muted/40 hover:bg-muted active:bg-muted/80 border border-border/50 text-foreground transition-all cursor-pointer active:scale-95 text-center" 
                      onClick={() => { onOpenChange(false); onEdit(); }}
                    >
                      <Pencil className="w-4 h-4 text-primary shrink-0"/>
                      <span className="text-[10px] sm:text-xs font-bold leading-tight">Edit</span>
                    </button>
                  )}

                  {onDelete && (
                    <button 
                      type="button"
                      className="w-full flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-2xl bg-destructive/10 hover:bg-destructive/20 border border-destructive/30 text-destructive transition-all cursor-pointer active:scale-95 text-center" 
                      onClick={() => { onOpenChange(false); onDelete(); }}
                    >
                      <Trash2 className="w-4 h-4 shrink-0"/>
                      <span className="text-[10px] sm:text-xs font-bold leading-tight">Delete</span>
                    </button>
                  )}
                </div>

                {/* Convert to EPUB (if not already EPUB/manga) */}
                {book.file_format && !['epub', 'online-manga', 'cbz', 'cbr'].includes(book.file_format.toLowerCase()) && (
                  <div className="pt-1">
                    <ConvertToEpubMenuItem
                      bookId={bookId}
                      bookTitle={book.title}
                      format={book.file_format}
                      variant="button"
                      onDone={() => { void loadBook(); }}
                    />
                  </div>
                )}
              </div>

              {/* Reading Status: Interactive 1-Tap Chip Group */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-extrabold text-foreground uppercase tracking-wider">
                  <BookmarkCheck className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span>Reading Status</span>
                </div>
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar sm:flex-wrap">
                  {READING_STATUSES.map((status) => {
                    const Icon = status.icon;
                    const isActive = readingStatus === status.value;
                    return (
                      <button
                        key={status.value}
                        type="button"
                        onClick={() => handleStatusChange(status.value)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer active:scale-95 shrink-0 select-none ${
                          isActive
                            ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/25 ring-1 ring-primary/40'
                            : 'bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/60'
                        }`}
                      >
                        <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-primary-foreground' : 'text-muted-foreground'}`} />
                        <span>{status.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Series Banner (if part of a series) */}
              {book.series && (
                <div className="flex items-center gap-3 bg-primary/10 rounded-2xl p-3 border border-primary/20 shadow-2xs">
                  <div className="w-8 h-8 rounded-xl bg-primary/15 flex items-center justify-center text-primary shrink-0">
                    <LayoutTemplate className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold text-primary uppercase tracking-wider">Series</div>
                    <div className="text-xs sm:text-sm font-bold text-foreground truncate">
                      {book.series} {book.series_index ? <span className="text-primary font-black ml-1">#{book.series_index}</span> : ''}
                    </div>
                  </div>
                </div>
              )}

              {/* Book Specs / Metadata Tiles */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-extrabold text-foreground uppercase tracking-wider">
                  <Layers className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span>Information</span>
                </div>
                
                <div className="grid grid-cols-2 min-[440px]:grid-cols-3 gap-2">
                  {book.publisher && (
                    <div className="bg-muted/30 hover:bg-muted/50 border border-border/60 rounded-2xl p-2.5 flex flex-col gap-0.5 transition-all">
                      <div className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        <Building2 className="w-3 h-3 text-primary/70" />
                        <span>Publisher</span>
                      </div>
                      <span className="text-xs font-semibold text-foreground truncate">{book.publisher}</span>
                    </div>
                  )}

                  {book.pubdate && (
                    <div className="bg-muted/30 hover:bg-muted/50 border border-border/60 rounded-2xl p-2.5 flex flex-col gap-0.5 transition-all">
                      <div className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        <Calendar className="w-3 h-3 text-primary/70" />
                        <span>Published</span>
                      </div>
                      <span className="text-xs font-semibold text-foreground truncate">{formatDate(book.pubdate)}</span>
                    </div>
                  )}

                  <div className="bg-muted/30 hover:bg-muted/50 border border-border/60 rounded-2xl p-2.5 flex flex-col gap-0.5 transition-all">
                    <div className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      <Globe className="w-3 h-3 text-primary/70" />
                      <span>Language</span>
                    </div>
                    <span className="text-xs font-semibold text-foreground truncate uppercase">{book.language || 'EN'}</span>
                  </div>

                  {book.file_size ? (
                    <div className="bg-muted/30 hover:bg-muted/50 border border-border/60 rounded-2xl p-2.5 flex flex-col gap-0.5 transition-all">
                      <div className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        <HardDrive className="w-3 h-3 text-primary/70" />
                        <span>Size</span>
                      </div>
                      <span className="text-xs font-semibold text-foreground truncate">{formatFileSize(book.file_size)}</span>
                    </div>
                  ) : null}

                  {book.page_count ? (
                    <div className="bg-muted/30 hover:bg-muted/50 border border-border/60 rounded-2xl p-2.5 flex flex-col gap-0.5 transition-all">
                      <div className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        <BookOpen className="w-3 h-3 text-primary/70" />
                        <span>Pages</span>
                      </div>
                      <span className="text-xs font-semibold text-foreground truncate">{pageCountLabel(book)}</span>
                    </div>
                  ) : null}

                  {book.isbn ? (
                    <div className="bg-muted/30 hover:bg-muted/50 border border-border/60 rounded-2xl p-2.5 flex flex-col gap-0.5 transition-all">
                      <div className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        <Hash className="w-3 h-3 text-primary/70" />
                        <span>ISBN</span>
                      </div>
                      <span className="text-xs font-semibold text-foreground font-mono truncate">{book.isbn}</span>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Tags Cloud */}
              {book.tags && book.tags.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-extrabold text-foreground uppercase tracking-wider">
                    <Tag className="w-3.5 h-3.5 text-primary" />
                    <span>Tags</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {book.tags.map((tag, idx) => (
                      <span
                        key={idx}
                        className="px-2.5 py-1 text-[11px] font-bold bg-primary/10 border border-primary/20 text-primary rounded-full shadow-2xs"
                      >
                        {tag.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes & Summary */}
              {book.notes && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-extrabold text-foreground uppercase tracking-wider">
                    <FileText className="w-3.5 h-3.5 text-primary" />
                    <span>Notes & Summary</span>
                  </div>
                  <div className="text-xs sm:text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap bg-muted/30 border border-border/60 p-3.5 sm:p-4 rounded-2xl">
                    {book.notes}
                  </div>
                </div>
              )}

              {/* Timestamp Footer */}
              <div className="pt-2 text-[10px] sm:text-[11px] text-muted-foreground/70 font-medium">
                Added {formatDate(book.added_date)}
                {book.last_opened && ` • Last opened ${formatDate(book.last_opened)}`}
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>

      {/* Metadata Search Dialog */}
      {book && (
        <MetadataSearchDialog
          open={metadataDialogOpen}
          onOpenChange={setMetadataDialogOpen}
          bookIds={[bookId]}
          bookTitle={book.title}
          isManga={isManga}
          isbn={book.isbn || book.isbn13}
          onMetadataSelected={handleMetadataFetched}
        />
      )}
    </Dialog.Root>
  );
};
