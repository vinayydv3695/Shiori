import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, BookOpen, Calendar, FileText, Tag, Star, Globe, Hash, Download, Loader2 } from 'lucide-react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { api, type Book } from '../../lib/tauri';
import { useToast } from '../../store/toastStore';
import { Button } from '../ui/button';
import { MetadataSearchDialog } from './MetadataSearchDialog';

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
  const toast = useToast();

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      unlisten = await listen<any>("metadata-update", (event) => {
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
  }, [open, bookId]);

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
      console.error('Failed to load book:', error);
    } finally {
      setLoading(false);
    }
  };

  const coverSrc = book?.cover_path ? convertFileSrc(book.cover_path) : null;

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
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background border border-border rounded-lg shadow-lg w-[90vw] max-w-4xl max-h-[85vh] overflow-y-auto z-50">
            <div className="flex items-center justify-center p-12">
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
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background border border-border rounded-lg shadow-lg w-[90vw] max-w-4xl max-h-[85vh] overflow-y-auto z-50">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-border sticky top-0 bg-background z-10">
            <Dialog.Title className="text-lg font-semibold text-foreground">
              Book Details
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-5 w-5" />
              </button>
            </Dialog.Close>
          </div>

          {/* Content */}
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Cover Image */}
              <div className="md:col-span-1">
                <div className="aspect-[2/3] bg-muted rounded-lg overflow-hidden border border-border">
                  {coverSrc ? (
                    <img
                      src={coverSrc}
                      alt={book.title}
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
              <div className="md:col-span-2 space-y-6">
                {/* Title and Authors */}
                <div>
                  <h2 className="text-2xl font-bold text-foreground mb-2">{book.title}</h2>
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

                {/* Metadata Grid */}
                <div className="grid grid-cols-2 gap-4">
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
          <div className="flex items-center justify-between gap-3 p-6 border-t border-border bg-muted/30">
            <div className="flex items-center gap-2 mr-auto">
              <Button
                variant="outline"
                onClick={() => setMetadataDialogOpen(true)}
              >
                <Download className="w-4 h-4 mr-2" />
                Find Metadata
              </Button>
              <Button
                variant="secondary"
                disabled={autoEnrichLoading}
                onClick={async () => {
                  try {
                    setAutoEnrichLoading(true);
                    await api.enrichBookMetadata(bookId);
                  } catch (e) {
                    setAutoEnrichLoading(false);
                    console.error("Auto enrich failed:", e);
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
          bookId={bookId}
          bookTitle={book.title}
          isManga={isManga}
          isbn={book.isbn || book.isbn13}
          onMetadataSelected={handleMetadataFetched}
        />
      )}
    </Dialog.Root>
  );
};
