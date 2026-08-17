import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, BookOpen, FileText, Tag, Star, Globe, Loader2, BookmarkCheck, Search, Pencil, Trash2, RefreshCw, LayoutTemplate } from 'lucide-react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { api, type Book } from '../../lib/tauri';
import { logger } from '@/lib/logger';
import { useToast } from '../../store/toastStore';
import { Button } from '../ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MetadataSearchDialog } from './MetadataSearchDialog';
import { FeatureHint } from '../ui/FeatureHint';
import { pageCountLabel } from '@/lib/utils';
import { FallbackBookCover } from './FallbackBookCover';
import { useLibraryStore } from '../../store/libraryStore';
import { ConvertToEpubMenuItem } from '@/components/conversion/ConvertToEpubMenuItem';

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
    if (open && bookId) {
      loadBook();
    }
  }, [open, bookId]);

  const loadBook = async () => {
    try {
      setLoading(true);
      const bookData = await api.getBook(bookId);
      setBook(bookData);
    } catch (error) {
      logger.error('Failed to load book:', error);
    } finally {
      setLoading(false);
    }
  };

  const coverSrc = book?.cover_path ? resolveCoverSrc(book.cover_path) : null;
  const isManga = book?.file_format.toLowerCase() === 'cbz' || book?.file_format.toLowerCase() === 'cbr';

  const handleMetadataFetched = async () => {
    await loadBook();
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
    return new Date(dateStr).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  };

  if (loading || !book) {
    return (
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] transition-opacity" />
          <Dialog.Content aria-describedby={undefined} className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[210] w-[94vw] sm:w-[90vw] max-w-2xl bg-card border border-border rounded-3xl shadow-2xl flex items-center justify-center p-12 focus:outline-none">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] transition-opacity data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content 
          aria-describedby={undefined} 
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-1.5rem)] sm:w-[90vw] max-w-3xl bg-card border border-border rounded-2xl sm:rounded-3xl shadow-2xl z-[210] flex flex-col max-h-[92vh] sm:max-h-[88vh] overflow-hidden focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 duration-300"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-5 border-b border-border/50 bg-card/60 backdrop-blur-xl shrink-0">
            <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 pr-2">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-xs shrink-0">
                <BookOpen className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div className="min-w-0">
                <Dialog.Title className="text-base sm:text-lg font-extrabold text-foreground tracking-tight">
                  Book Details
                </Dialog.Title>
                <Dialog.Description className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 line-clamp-1 font-medium">
                  {book.title}
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

          {/* Scrollable Content Area */}
          <div 
            className="flex-1 overflow-y-auto p-4 sm:p-7 custom-scrollbar space-y-4 sm:space-y-6"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)' }}
          >
            <div className="flex flex-col sm:flex-row gap-5 sm:gap-8 items-start">
              
              {/* Left Column: Cover & Primary Action */}
              <div className="w-full sm:w-[220px] shrink-0 flex flex-col items-center gap-3 sm:gap-4">
                <div className="relative group w-[140px] min-[380px]:w-[160px] min-[440px]:w-[180px] sm:w-full aspect-[2/3] rounded-xl sm:rounded-2xl overflow-hidden shadow-2xl border border-border/50 bg-muted/20 hover:scale-[1.02] transition-all duration-300">
                  {coverSrc ? (
                    <img
                      src={coverSrc}
                      alt={book.title}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover transition-transform duration-500 sm:group-hover:scale-105"
                    />
                  ) : (
                    <FallbackBookCover
                      title={book.title}
                      author={book.authors?.map((a) => a.name).join(', ')}
                      format={book.file_format}
                      isRss={book.tags?.some((t: any) => t.name === 'RSS') || /rss|feed|daily reading|daily digest/i.test(book.title)}
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
                </div>
                
                {/* Primary Action Button (Read) */}
                {onRead && (
                  <Button 
                    size="lg" 
                    className="w-full rounded-full text-xs sm:text-base font-bold h-10 sm:h-12 shadow-lg shadow-primary/20 hover:shadow-primary/30 bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer" 
                    onClick={() => { onOpenChange(false); onRead(); }}
                  >
                    <BookOpen className="w-4 h-4 mr-0.5" /> 
                    <span>Read Now</span>
                  </Button>
                )}
              </div>

              {/* Right Column: Book Info */}
              <div className="flex-1 min-w-0 w-full space-y-4 sm:space-y-5">
                
                {/* Title & Author */}
                <div className="space-y-1 text-left">
                  <h2 className="text-lg min-[380px]:text-xl sm:text-2xl lg:text-3xl font-black text-foreground leading-snug sm:leading-tight tracking-tight [text-wrap:balance]">
                    {book.title}
                  </h2>
                  {book.authors && book.authors.length > 0 && (
                    <p className="text-xs sm:text-base text-muted-foreground font-semibold">
                      {book.authors.map(a => a.name).join(', ')}
                    </p>
                  )}
                  
                  {/* Badges */}
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 pt-1">
                    <span className="inline-flex items-center px-2 sm:px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold bg-muted text-muted-foreground border border-border/50 uppercase tracking-wider">
                      {book.file_format}
                    </span>
                    {book.rating && book.rating > 0 && (
                      <span className="inline-flex items-center px-2 sm:px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 backdrop-blur-md">
                        <Star className="w-3 h-3 fill-current mr-1 text-amber-500" />
                        {book.rating} / {book.metadata_source === 'anilist' ? '10' : '5'}
                      </span>
                    )}
                    {book.metadata_source && (
                      <span className="inline-flex items-center px-2 sm:px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold bg-primary/10 text-primary border border-primary/20 backdrop-blur-md">
                        <Globe className="w-3 h-3 mr-1" />
                        {book.metadata_source}
                      </span>
                    )}
                  </div>
                </div>

                {/* Quick Actions Row */}
                <div className="grid grid-cols-2 min-[440px]:grid-cols-3 sm:flex sm:flex-wrap items-center gap-2 pt-0.5">
                  <FeatureHint featureId="metadata-search" title="Find Metadata" description="Search online for covers and details.">
                    <button 
                      type="button"
                      className="w-full sm:w-auto rounded-xl bg-card/70 hover:bg-card border border-border/70 hover:border-primary/40 text-foreground text-xs font-bold h-9 px-3 flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95" 
                      onClick={() => setMetadataDialogOpen(true)}
                    >
                      <Search className="w-3.5 h-3.5 text-primary shrink-0"/>
                      <span>Find Match</span>
                    </button>
                  </FeatureHint>

                  <button 
                    type="button"
                    className="w-full sm:w-auto rounded-xl bg-card/70 hover:bg-card border border-border/70 hover:border-primary/40 text-foreground text-xs font-bold h-9 px-3 flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95 disabled:opacity-50" 
                    disabled={autoEnrichLoading} 
                    onClick={() => api.enrichBookMetadata(bookId)}
                  >
                    {autoEnrichLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0"/> : <RefreshCw className="w-3.5 h-3.5 text-primary shrink-0"/>}
                    <span>Auto-Enrich</span>
                  </button>

                  {book.file_format && !['epub', 'online-manga'].includes(book.file_format.toLowerCase()) && (
                    <ConvertToEpubMenuItem
                      bookId={bookId}
                      bookTitle={book.title}
                      format={book.file_format}
                      variant="button"
                      onDone={() => { void loadBook(); }}
                    />
                  )}
                  
                  {onEdit && (
                    <button 
                      type="button"
                      className="w-full sm:w-auto rounded-xl bg-card/70 hover:bg-card border border-border/70 hover:border-primary/40 text-foreground text-xs font-bold h-9 px-3 flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95" 
                      onClick={() => { onOpenChange(false); onEdit(); }}
                    >
                      <Pencil className="w-3.5 h-3.5 text-primary shrink-0"/>
                      <span>Edit</span>
                    </button>
                  )}
                  
                  {onDelete && (
                    <button 
                      type="button"
                      className="w-full sm:w-auto rounded-xl bg-destructive/10 hover:bg-destructive/20 border border-destructive/30 text-destructive text-xs font-bold h-9 px-3 flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95" 
                      onClick={() => { onOpenChange(false); onDelete(); }}
                    >
                      <Trash2 className="w-3.5 h-3.5 shrink-0"/>
                      <span>Delete</span>
                    </button>
                  )}
                </div>

                {/* Reading Status Selector */}
                <div className="bg-card/70 hover:bg-card rounded-xl sm:rounded-2xl p-3 sm:p-3.5 border border-border/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 transition-all shadow-xs">
                  <div className="flex items-center gap-2 text-xs font-extrabold text-foreground uppercase tracking-wider">
                    <BookmarkCheck className="w-4 h-4 text-primary shrink-0" />
                    <span>Reading Status</span>
                  </div>
                  <div className="w-full sm:w-48">
                    <Select
                      value={readingStatus}
                      onValueChange={async (newStatus) => {
                        setReadingStatus(newStatus);
                        try {
                          await api.updateReadingStatus(bookId, newStatus);
                          await useLibraryStore.getState().loadInitialBooks();
                          await loadBook();
                          toast.success("Status Updated", `Set to ${newStatus.replace('_', ' ')}`);
                        } catch (err) {
                          logger.error('Failed to update reading status:', err);
                          setReadingStatus(book?.reading_status || 'planning');
                        }
                      }}
                    >
                      <SelectTrigger className="w-full h-8 sm:h-9 rounded-lg sm:rounded-xl font-bold text-xs bg-background/90 border border-border/70 shadow-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="z-[220]">
                        <SelectItem value="planning">Planning to Read</SelectItem>
                        <SelectItem value="reading">Currently Reading</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="on_hold">On Hold</SelectItem>
                        <SelectItem value="dropped">Dropped</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Series Info */}
                {book.series && (
                  <div className="flex items-start gap-2.5 sm:gap-3 bg-primary/10 rounded-xl sm:rounded-2xl p-3 sm:p-3.5 border border-primary/20 shadow-xs">
                    <LayoutTemplate className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <div>
                      <div className="text-[10px] font-bold text-primary uppercase tracking-wider">Series</div>
                      <div className="text-xs sm:text-sm font-bold text-foreground">
                        {book.series} {book.series_index ? <span className="text-primary font-extrabold">#{book.series_index}</span> : ''}
                      </div>
                    </div>
                  </div>
                )}

                {/* Details Attributes Grid */}
                <div className="grid grid-cols-2 min-[440px]:grid-cols-3 gap-2 sm:gap-2.5">
                  {book.publisher && (
                    <div className="bg-card/70 hover:bg-card border border-border/70 rounded-xl p-2.5 sm:p-3 flex flex-col gap-0.5 shadow-xs transition-all">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Publisher</span>
                      <span className="text-xs font-semibold text-foreground truncate">{book.publisher}</span>
                    </div>
                  )}

                  {book.pubdate && (
                    <div className="bg-card/70 hover:bg-card border border-border/70 rounded-xl p-2.5 sm:p-3 flex flex-col gap-0.5 shadow-xs transition-all">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Published</span>
                      <span className="text-xs font-semibold text-foreground truncate">{formatDate(book.pubdate)}</span>
                    </div>
                  )}

                  <div className="bg-card/70 hover:bg-card border border-border/70 rounded-xl p-2.5 sm:p-3 flex flex-col gap-0.5 shadow-xs transition-all">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Language</span>
                    <span className="text-xs font-semibold text-foreground truncate">{book.language || 'Unknown'}</span>
                  </div>

                  {book.file_size && (
                    <div className="bg-card/70 hover:bg-card border border-border/70 rounded-xl p-2.5 sm:p-3 flex flex-col gap-0.5 shadow-xs transition-all">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Size</span>
                      <span className="text-xs font-semibold text-foreground truncate">{formatFileSize(book.file_size)}</span>
                    </div>
                  )}

                  {book.page_count && (
                    <div className="bg-card/70 hover:bg-card border border-border/70 rounded-xl p-2.5 sm:p-3 flex flex-col gap-0.5 shadow-xs transition-all">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Pages</span>
                      <span className="text-xs font-semibold text-foreground truncate">{pageCountLabel(book)}</span>
                    </div>
                  )}

                  {book.isbn && (
                    <div className="bg-card/70 hover:bg-card border border-border/70 rounded-xl p-2.5 sm:p-3 flex flex-col gap-0.5 shadow-xs transition-all">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">ISBN</span>
                      <span className="text-xs font-semibold text-foreground font-mono truncate">{book.isbn}</span>
                    </div>
                  )}
                </div>

                {/* Tags */}
                {book.tags && book.tags.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      <Tag className="w-3.5 h-3.5 text-primary" />
                      <span>Tags</span>
                    </div>
                    <div className="flex flex-wrap gap-1 sm:gap-1.5">
                      {book.tags.map((tag, idx) => (
                        <span
                          key={idx}
                          className="px-2.5 py-0.5 text-[10px] sm:text-[11px] font-bold bg-primary/10 border border-primary/20 text-primary rounded-full shadow-2xs"
                        >
                          {tag.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Notes & Summary */}
                {book.notes && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      <FileText className="w-3.5 h-3.5 text-primary" />
                      <span>Notes & Summary</span>
                    </div>
                    <div className="text-xs sm:text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap bg-card/70 border border-border/70 p-3.5 sm:p-4 rounded-xl sm:rounded-2xl shadow-xs">
                      {book.notes}
                    </div>
                  </div>
                )}

                {/* Added Date Timestamp */}
                <div className="pt-1 sm:pt-2 text-[10px] sm:text-[11px] text-muted-foreground/60">
                  Added to library {formatDate(book.added_date)}
                  {book.last_opened && ` • Last read ${formatDate(book.last_opened)}`}
                </div>
              </div>
            </div>
          </div>
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
