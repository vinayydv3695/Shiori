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
import { cn, pageCountLabel } from '@/lib/utils';
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
          <Dialog.Overlay className="dialog-overlay fixed inset-0 bg-background/80 backdrop-blur-sm z-50" />
          <Dialog.Content aria-describedby={undefined} className="dialog-content fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] bg-transparent outline-none border-none shadow-none z-50 flex items-center justify-center">
             <Loader2 className="w-12 h-12 animate-spin text-primary" />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-background/80 backdrop-blur-md z-50 transition-all duration-300 data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:animate-in data-[state=open]:fade-in" />
        <Dialog.Content 
          aria-describedby={undefined} 
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-3xl -translate-x-1/2 -translate-y-1/2 h-[90vh] sm:h-auto sm:max-h-[85vh] bg-card/85 sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-border/50 backdrop-blur-3xl transition-all duration-300 data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95 sm:data-[state=closed]:slide-out-to-top-[48%] sm:data-[state=open]:slide-in-from-top-[48%] duration-300"
        >
          
          {/* Blurred Background Header Art (Mobile Only) */}
          <div className="absolute top-0 left-0 right-0 h-72 overflow-hidden pointer-events-none select-none -z-10 bg-background sm:hidden">
            {coverSrc && (
              <img src={coverSrc} className="w-full h-full object-cover blur-[60px] opacity-40 scale-125 saturate-150 transform-gpu" alt="" />
            )}
            <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-card/60 to-card" />
          </div>

          {/* Floating Close Button */}
          <div className="absolute top-4 right-4 z-50">
             <Dialog.Close asChild>
               <button className="bg-secondary/80 hover:bg-secondary border border-border/50 text-muted-foreground hover:text-foreground p-2.5 rounded-full backdrop-blur-xl transition-all duration-200 shadow-md hover:scale-105 active:scale-95" title="Close">
                 <X className="h-5 w-5" />
               </button>
             </Dialog.Close>
          </div>

          {/* Scrollable Content Area */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
            <div className="flex flex-col sm:flex-row gap-8 sm:gap-12 p-6 sm:p-10 min-h-full">
              
              {/* Left Column: Cover & Primary Action */}
              <div className="w-full sm:w-[260px] shrink-0 flex flex-col items-center gap-6 mt-6 sm:mt-0">
                <div className="relative group w-[200px] sm:w-full aspect-[2/3] rounded-xl overflow-hidden shadow-2xl ring-1 ring-border/30 bg-muted/20">
                   {coverSrc ? (
                     <img
                       src={coverSrc}
                       alt={book.title}
                       loading="lazy"
                       decoding="async"
                       className="w-full h-full object-cover transition-transform duration-500 sm:group-hover:scale-105"
                     />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-4 text-muted-foreground/30">
                      <BookOpen className="w-16 h-16" />
                      <span className="text-sm font-medium tracking-widest uppercase">No Cover</span>
                    </div>
                  )}
                  {/* Subtle glass reflection overlay */}
                  <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/10 pointer-events-none" />
                </div>
                
                {/* Primary Action Button (Read) */}
                {onRead && (
                  <Button 
                    size="lg" 
                    className="w-full sm:w-full rounded-full text-lg font-bold h-14 shadow-xl shadow-primary/25 hover:shadow-primary/40 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]" 
                    onClick={() => { onOpenChange(false); onRead(); }}
                  >
                    <BookOpen className="w-5 h-5 mr-2.5" /> 
                    Read Now
                  </Button>
                )}
              </div>

              {/* Right Column: Book Info */}
              <div className="flex-1 flex flex-col pt-2 sm:pt-4">
                
                {/* Header Info */}
                <div className="space-y-3 text-center sm:text-left">
                  <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-foreground leading-tight tracking-tight drop-shadow-sm [text-wrap:balance]">
                    {book.title}
                  </h2>
                  {book.authors && book.authors.length > 0 && (
                    <p className="text-lg sm:text-xl text-muted-foreground/80 font-medium tracking-wide">
                      {book.authors.map(a => a.name).join(', ')}
                    </p>
                  )}
                  
                  {/* Badges */}
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-2">
                    {book.metadata_source && (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20 backdrop-blur-md">
                        <Globe className="w-3 h-3 mr-1.5" />
                        Source: {book.metadata_source}
                      </span>
                    )}
                    {book.rating && book.rating > 0 && (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 backdrop-blur-md">
                        <Star className="w-3.5 h-3.5 fill-current mr-1" />
                        {book.rating} / {book.metadata_source === 'anilist' ? '10' : '5'}
                      </span>
                    )}
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-secondary text-secondary-foreground border border-border backdrop-blur-md uppercase tracking-wider">
                      {book.file_format}
                    </span>
                  </div>
                </div>

                {/* Quick Actions Row */}
                <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center sm:justify-start gap-3 mt-8 sm:mt-10">
                  <FeatureHint featureId="metadata-search" title="Find Metadata" description="Search online for covers and details.">
                    <Button variant="secondary" size="sm" className="w-full sm:w-auto rounded-full bg-secondary/50 hover:bg-secondary border border-border/50 shadow-sm" onClick={() => setMetadataDialogOpen(true)}>
                      <Search className="w-4 h-4 mr-2"/> Find Match
                    </Button>
                  </FeatureHint>

                  {!['epub', 'online-manga'].includes(book.file_format.toLowerCase()) && (
                    <ConvertToEpubMenuItem
                      bookId={bookId}
                      bookTitle={book.title}
                      format={book.file_format}
                      variant="button"
                      onDone={() => { void loadBook(); }}
                    />
                  )}
                  
                  <Button variant="secondary" size="sm" className="w-full sm:w-auto rounded-full bg-secondary/50 hover:bg-secondary border border-border/50 shadow-sm" disabled={autoEnrichLoading} onClick={() => api.enrichBookMetadata(bookId)}>
                    {autoEnrichLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin"/> : <RefreshCw className="w-4 h-4 mr-2"/>}
                    Auto-Enrich
                  </Button>
                  
                  {onEdit && (
                    <Button variant="secondary" size="sm" className="w-full sm:w-auto rounded-full bg-secondary/50 hover:bg-secondary border border-border/50 shadow-sm" onClick={() => { onOpenChange(false); onEdit(); }}>
                      <Pencil className="w-4 h-4 mr-2"/> Edit
                    </Button>
                  )}
                  
                  {onDelete && (
                    <Button variant="ghost" size="sm" className="w-full sm:w-auto rounded-full text-destructive hover:text-destructive hover:bg-destructive/10 transition-colors" onClick={() => { onOpenChange(false); onDelete(); }}>
                      <Trash2 className="w-4 h-4 mr-2 sm:mr-0"/> <span className="sm:hidden">Delete</span>
                    </Button>
                  )}
                </div>

                <div className="my-8 h-px w-full bg-gradient-to-r from-transparent via-border to-transparent opacity-50" />

                {/* Details Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-y-6 gap-x-4 mb-8">
                  {/* Reading Status Selector */}
                  <div className="col-span-2 lg:col-span-3 bg-muted/30 rounded-xl p-4 border border-border/50 flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex items-center gap-3 text-foreground font-medium">
                      <BookmarkCheck className="w-5 h-5 text-primary" />
                      Status
                    </div>
                    <div className="flex-1">
                      <Select
                        value={readingStatus}
                        onValueChange={async (newStatus) => {
                          setReadingStatus(newStatus)
                          try {
                            await api.updateReadingStatus(bookId, newStatus)
                            await loadBook()
                          } catch (err) {
                            logger.error('Failed to update reading status:', err)
                            setReadingStatus(book?.reading_status || 'planning')
                          }
                        }}
                      >
                        <SelectTrigger className="w-full h-10 rounded-xl font-semibold">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="planning">Planning to Read</SelectItem>
                          <SelectItem value="reading">Currently Reading</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="on_hold">On Hold</SelectItem>
                          <SelectItem value="dropped">Dropped</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {book.series && (
                    <div className="col-span-2 lg:col-span-3 flex items-start gap-3 bg-primary/5 rounded-xl p-4 border border-primary/10">
                      <LayoutTemplate className="w-5 h-5 text-primary mt-0.5" />
                      <div>
                        <div className="text-xs font-semibold text-primary/80 uppercase tracking-wider mb-1">Series</div>
                        <div className="text-base font-bold text-foreground">
                          {book.series} {book.series_index ? <span className="text-primary opacity-80">#{book.series_index}</span> : ''}
                        </div>
                      </div>
                    </div>
                  )}

                  {book.publisher && (
                    <div className="flex flex-col gap-1">
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Publisher</div>
                      <div className="text-sm font-medium">{book.publisher}</div>
                    </div>
                  )}

                  {book.pubdate && (
                    <div className="flex flex-col gap-1">
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Published</div>
                      <div className="text-sm font-medium">{formatDate(book.pubdate)}</div>
                    </div>
                  )}

                  <div className="flex flex-col gap-1">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Language</div>
                    <div className="text-sm font-medium">{book.language || 'Unknown'}</div>
                  </div>

                  {book.file_size && (
                    <div className="flex flex-col gap-1">
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Size</div>
                      <div className="text-sm font-medium">{formatFileSize(book.file_size)}</div>
                    </div>
                  )}

                  {book.page_count && (
                    <div className="flex flex-col gap-1">
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Pages</div>
                      <div className="text-sm font-medium">{pageCountLabel(book)}</div>
                    </div>
                  )}

                  {book.isbn && (
                    <div className="flex flex-col gap-1">
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">ISBN</div>
                      <div className="text-sm font-medium font-mono bg-muted px-2 py-0.5 rounded w-fit">{book.isbn}</div>
                    </div>
                  )}
                </div>

                {/* Tags */}
                {book.tags && book.tags.length > 0 && (
                  <div className="mb-8">
                    <div className="flex items-center gap-2 mb-3">
                      <Tag className="w-4 h-4 text-muted-foreground" />
                      <div className="text-sm font-bold text-foreground">Tags</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {book.tags.map((tag, idx) => (
                        <span
                          key={idx}
                          className="px-3 py-1 text-xs font-medium bg-secondary/40 border border-border text-secondary-foreground rounded-full"
                        >
                          {tag.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Notes */}
                {book.notes && (
                  <div className="mb-8">
                    <div className="flex items-center gap-2 mb-3">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      <div className="text-sm font-bold text-foreground">Notes & Summary</div>
                    </div>
                    <div className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap bg-muted/20 border border-border/50 p-4 rounded-xl">
                      {book.notes}
                    </div>
                  </div>
                )}

                {/* Added Date */}
                <div className="mt-auto text-xs text-muted-foreground/60 text-center sm:text-left pt-6 pb-2">
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
