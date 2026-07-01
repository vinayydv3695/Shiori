import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, BookOpen, Calendar, FileText, Tag, Star, Globe, Hash, Download, Loader2, BookmarkCheck, Search } from 'lucide-react';
import { convertFileSrc } from '@tauri-apps/api/core';

function resolveCoverSrc(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return convertFileSrc(path.replace(/\\/g, '/'));
}
import { listen } from '@tauri-apps/api/event';
import { api, type Book } from '../../lib/tauri';
import { logger } from '@/lib/logger';
import { useToast } from '../../store/toastStore';
import { Button } from '../ui/button';
import { MetadataSearchDialog } from './MetadataSearchDialog';
import { FeatureHint } from '../ui/FeatureHint';

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
    // loadBook is defined below and recreated each render - would cause infinite loop if added
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, bookId, toast]);

  useEffect(() => {
    if (open && bookId) {
      loadBook();
    }
    // loadBook is defined below and recreated each render - would cause infinite loop if added
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // Reload book data after metadata update
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
    return new Date(dateStr).toLocaleDateString();
  };

  if (loading || !book) {
    return (
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
          <Dialog.Content aria-describedby={undefined} className="dialog-content fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] bg-background border border-border shadow-2xl rounded-xl w-[90vw] max-w-xl max-h-[90vh] overflow-y-auto z-50 flex flex-col data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 duration-300">
            <div className="flex items-center justify-center flex-1 py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
        <Dialog.Content aria-describedby={undefined} className="dialog-content fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] bg-background border border-border shadow-2xl rounded-xl w-[90vw] max-w-2xl max-h-[90vh] overflow-y-auto z-50 flex flex-col data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 duration-300">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-border sticky top-0 bg-background/80 backdrop-blur-md z-10">
            <Dialog.Title className="text-xl font-semibold text-foreground tracking-tight">
              Book Details
            </Dialog.Title>
             <Dialog.Close asChild>
               <button className="text-muted-foreground hover:bg-muted p-2 rounded-full transition-colors" title="Close">
                 <X className="h-5 w-5" />
               </button>
             </Dialog.Close>
          </div>

          {/* Content */}
          <div className="flex-1 p-6 overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-[250px_1fr] gap-8">
              {/* Cover Image */}
              <div className="w-full shrink-0">
                <div className="aspect-[2/3] w-[200px] md:w-full mx-auto bg-muted rounded-xl overflow-hidden border border-border/50 shadow-lg sticky top-6">
                   {coverSrc ? (
                     <img
                       src={coverSrc}
                       alt={book.title}
                       loading="lazy"
                       decoding="async"
                        className="w-full h-full object-cover"
                     />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <BookOpen className="w-20 h-20 text-muted-foreground/30" />
                    </div>
                  )}
                </div>
              </div>

              {/* Book Information */}
              <div className="flex-1 space-y-8">
                {/* Title and Authors */}
                <div className="space-y-2">
                  <h2 className="text-3xl font-bold text-foreground leading-tight tracking-tight">{book.title}</h2>
                  {book.authors && book.authors.length > 0 && (
                    <p className="text-lg text-muted-foreground">
                      by {book.authors.map(a => a.name).join(', ')}
                    </p>
                  )}
                  {book.metadata_source && (
                    <div className="mt-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
                      <Globe className="w-3 h-3 mr-1" />
                      Metadata from {book.metadata_source}
                    </div>
                  )}
                </div>

                {/* Rating */}
                {book.rating && book.rating > 0 && (
                  <div className="flex items-center gap-2">
                    <Star className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                    <span className="text-lg font-semibold">{book.rating}</span>
                    <span className="text-muted-foreground">/ 5</span>
                  </div>
                )}

                {/* Reading Status */}
                <div className="flex items-center gap-3">
                  <BookmarkCheck className="w-5 h-5 text-muted-foreground" />
                  <div className="flex-1">
                    <div className="text-xs text-muted-foreground mb-1">Reading Status</div>
                    <select
                      value={readingStatus}
                      onChange={async (e) => {
                        const newStatus = e.target.value
                        setReadingStatus(newStatus)
                        try {
                          await api.updateReadingStatus(bookId, newStatus)
                          await loadBook()
                        } catch (err) {
                          logger.error('Failed to update reading status:', err)
                          setReadingStatus(book?.reading_status || 'planning')
                        }
                      }}
                      className="w-full px-3 py-1.5 text-sm bg-muted border border-border rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 dark:[color-scheme:dark] [&>option]:bg-popover [&>option]:text-popover-foreground"
                    >
                      <option value="planning">Planning to Read</option>
                      <option value="reading">Currently Reading</option>
                      <option value="completed">Completed</option>
                      <option value="on_hold">On Hold</option>
                      <option value="dropped">Dropped</option>
                    </select>
                  </div>
                </div>

                {/* Metadata Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {book.publisher && (
                    <div className="flex items-start gap-2">
                      <FileText className="w-4 h-4 text-muted-foreground mt-0.5" />
                      <div>
                        <div className="text-xs text-muted-foreground">Publisher</div>
                        <div className="text-sm font-medium">{book.publisher}</div>
                      </div>
                    </div>
                  )}

                  {book.pubdate && (
                    <div className="flex items-start gap-2">
                      <Calendar className="w-4 h-4 text-muted-foreground mt-0.5" />
                      <div>
                        <div className="text-xs text-muted-foreground">Published</div>
                        <div className="text-sm font-medium">{book.pubdate}</div>
                      </div>
                    </div>
                  )}

                  <div className="flex items-start gap-2">
                    <Globe className="w-4 h-4 text-muted-foreground mt-0.5" />
                    <div>
                      <div className="text-xs text-muted-foreground">Language</div>
                      <div className="text-sm font-medium">{book.language || 'Unknown'}</div>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <FileText className="w-4 h-4 text-muted-foreground mt-0.5" />
                    <div>
                      <div className="text-xs text-muted-foreground">Format</div>
                      <div className="text-sm font-medium">{book.file_format.toUpperCase()}</div>
                    </div>
                  </div>

                  {book.file_size && (
                    <div className="flex items-start gap-2">
                      <Hash className="w-4 h-4 text-muted-foreground mt-0.5" />
                      <div>
                        <div className="text-xs text-muted-foreground">File Size</div>
                        <div className="text-sm font-medium">{formatFileSize(book.file_size)}</div>
                      </div>
                    </div>
                  )}

                  {book.page_count && (
                    <div className="flex items-start gap-2">
                      <BookOpen className="w-4 h-4 text-muted-foreground mt-0.5" />
                      <div>
                        <div className="text-xs text-muted-foreground">Pages</div>
                        <div className="text-sm font-medium">{book.page_count}</div>
                      </div>
                    </div>
                  )}

                  {book.series && (
                    <div className="flex items-start gap-2 col-span-2">
                      <Tag className="w-4 h-4 text-muted-foreground mt-0.5" />
                      <div>
                        <div className="text-xs text-muted-foreground">Series</div>
                        <div className="text-sm font-medium">
                          {book.series}{book.series_index ? ` #${book.series_index}` : ''}
                        </div>
                      </div>
                    </div>
                  )}

                  {book.isbn && (
                    <div className="flex items-start gap-2 col-span-2">
                      <Hash className="w-4 h-4 text-muted-foreground mt-0.5" />
                      <div>
                        <div className="text-xs text-muted-foreground">ISBN</div>
                        <div className="text-sm font-medium font-mono">{book.isbn}</div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Tags */}
                {book.tags && book.tags.length > 0 && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-2">Tags</div>
                    <div className="flex flex-wrap gap-2">
                      {book.tags.map((tag, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-1 text-xs bg-muted text-muted-foreground rounded"
                        >
                          {tag.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Notes */}
                {book.notes && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-2">Notes</div>
                    <div className="text-sm text-foreground whitespace-pre-wrap bg-muted p-3 rounded-lg">
                      {book.notes}
                    </div>
                  </div>
                )}

                {/* Added Date */}
                <div className="text-xs text-muted-foreground pt-4 border-t border-border">
                  Added {formatDate(book.added_date)}
                  {book.last_opened && ` • Last opened ${formatDate(book.last_opened)}`}
                </div>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between gap-3 p-6 border-t border-border bg-background sticky bottom-0 z-10">
            <div className="flex items-center gap-2 mr-auto">

              <FeatureHint
                featureId="metadata-search"
                title="Find Book Metadata"
                description="Search online databases to automatically populate your book's metadata including cover, description, and more."
                position="top"
              >
                <Button
                  variant="outline"
                  onClick={() => setMetadataDialogOpen(true)}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Find Metadata
                </Button>
              </FeatureHint>
              <Button
                variant="secondary"
                disabled={autoEnrichLoading}
                onClick={async () => {
                  try {
                    setAutoEnrichLoading(true);
                    await api.enrichBookMetadata(bookId);
                   } catch (e) {
                     setAutoEnrichLoading(false);
                     logger.error("Auto enrich failed:", e);
                    toast.error("Dispatch Failed", "Could not start the enrichment process");
                  }
                }}
              >
                {autoEnrichLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Enriching...
                  </>
                ) : (
                  "Auto-Enrich"
                )}
              </Button>
            </div>

            <div className="flex items-center gap-3">
              {onDelete && (
                <Button variant="outline" onClick={() => {
                  onOpenChange(false);
                  onDelete();
                }}>
                  Delete
                </Button>
              )}
              {onEdit && (
                <Button variant="outline" onClick={() => {
                  onOpenChange(false);
                  onEdit();
                }}>
                  Edit Metadata
                </Button>
              )}
              {onRead && (
                <Button onClick={() => {
                  onOpenChange(false);
                  onRead();
                }}>
                  <BookOpen className="w-4 h-4 mr-2" />
                  Read Now
                </Button>
              )}
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
