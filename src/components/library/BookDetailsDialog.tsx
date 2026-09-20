import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { 
  X, BookOpen, FileText, Tag, Star, Globe, Loader2, 
  Search, Pencil, Trash2, RefreshCw, LayoutTemplate, 
  CheckCircle2, Clock, PauseCircle, XCircle, Building2, 
  Calendar, HardDrive, Hash, Layers, BookmarkCheck, Heart
} from 'lucide-react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { api, type Book } from '../../lib/tauri';
import { logger } from '@/lib/logger';
import { useToast } from '../../store/toastStore';
import { Button } from '../ui/button';
import { MetadataSearchDialog } from './MetadataSearchDialog';
import { FeatureHint } from '../ui/FeatureHint';
import { pageCountLabel, cn } from '@/lib/utils';
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
  const [readingProgress, setReadingProgress] = useState<number | null>(null);
  const isFavorite = useLibraryStore((s) => s.favoriteBookIds.has(bookId));
  const toast = useToast();

  const handleToggleFavorite = async () => {
    try {
      await api.toggleBookFavorite(bookId);
      useLibraryStore.getState().toggleFavorite(bookId);
      toast.success(isFavorite ? "Removed from Favorites" : "Added to Favorites");
    } catch (err) {
      logger.error('Failed to toggle favorite:', err);
      toast.error("Failed to update favorite");
    }
  };

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

      // Fetch reading progress
      api.getReadingProgress(bookId)
        .then(prog => {
          if (!canceled && prog && typeof prog.progressPercent === 'number' && prog.progressPercent > 0) {
            setReadingProgress(Math.min(100, Math.round(prog.progressPercent)));
          } else if (!canceled) {
            setReadingProgress(null);
          }
        })
        .catch(() => {
          if (!canceled) setReadingProgress(null);
        });
    } else if (!open) {
      // Clear book state when closed so stale metadata is discarded
      setBook(null);
      setReadingProgress(null);
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
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-28px)] sm:w-[92vw] max-w-xl md:max-w-4xl lg:max-w-5xl max-h-[90vh] md:h-[680px] lg:h-[720px] md:max-h-[85vh] bg-card text-card-foreground border border-border/80 rounded-3xl shadow-2xl z-[210] flex flex-col md:flex-row overflow-hidden focus:outline-none transition-all duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]"
          style={{ backgroundColor: 'hsl(var(--card))', opacity: 1 }}
        >
          {/* Accessible Title & Description for Screen Readers & Radix */}
          <Dialog.Title className="sr-only">Book Details - {book?.title}</Dialog.Title>
          <Dialog.Description className="sr-only">{book?.title || 'Book Details'}</Dialog.Description>

          {/* Unified Floating Close Button in top right */}
          <button
            onClick={() => onOpenChange(false)}
            className="absolute top-4 right-4 sm:top-5 sm:right-5 z-40 p-2 rounded-full bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground transition-all cursor-pointer border border-border/40 backdrop-blur-sm shadow-2xs"
            title="Close"
            aria-label="Close"
          >
            <X className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
          </button>

          {loading && !book ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 min-h-[340px]">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
            </div>
          ) : !book ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 min-h-[340px] text-muted-foreground text-sm font-medium">
              Book details unavailable.
            </div>
          ) : (
            <>
              {/* Desktop Left Showcase Pane - completely blended, no dividing border */}
              <div className="hidden md:flex md:w-84 lg:w-96 shrink-0 flex-col items-center justify-between p-6 lg:p-7 relative select-none">
                {/* Ambient Blurred Artwork Glow */}
                {coverSrc && (
                  <div 
                    className="absolute inset-0 opacity-20 dark:opacity-30 blur-3xl scale-150 pointer-events-none"
                    style={{
                      backgroundImage: `url(${coverSrc})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }}
                  />
                )}

                {/* Top Utility Bar: Format Badge + Favorite Toggle Button */}
                <div className="w-full flex items-center justify-between z-10">
                  <span className="px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider bg-background/80 dark:bg-muted/80 border border-border/60 text-foreground shadow-2xs">
                    {book.file_format}
                  </span>
                  <button
                    type="button"
                    onClick={handleToggleFavorite}
                    className={cn(
                      "p-2 rounded-full transition-all duration-200 border cursor-pointer active:scale-95",
                      isFavorite
                        ? "bg-rose-500/15 border-rose-500/30 text-rose-500 hover:bg-rose-500/25 shadow-2xs"
                        : "bg-background/80 dark:bg-muted/80 border-border/60 text-muted-foreground hover:text-rose-500 hover:border-rose-500/30"
                    )}
                    title={isFavorite ? "Remove from favorites" : "Add to favorites"}
                  >
                    <Heart className={cn("w-4 h-4", isFavorite && "fill-current")} />
                  </button>
                </div>

                {/* Center 3D Book Presentation */}
                <div className="relative group my-auto py-2 flex flex-col items-center z-10">
                  {/* Outer Ambient Glow */}
                  {coverSrc && (
                    <div 
                      className="absolute -inset-4 rounded-3xl opacity-45 dark:opacity-55 blur-2xl transition-opacity duration-500 group-hover:opacity-70 pointer-events-none"
                      style={{
                        backgroundImage: `url(${coverSrc})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }}
                    />
                  )}

                  {/* Physical Book Block Wrapper */}
                  <div className="relative transition-transform duration-300 group-hover:-translate-y-1">
                    {/* Page block edge on the right (gives physical thickness) */}
                    <div className="absolute top-2 bottom-2 -right-2 w-2.5 bg-[#f4ece1] dark:bg-[#201c18] rounded-r-sm border-y border-r border-black/15 dark:border-white/10 shadow-xs pointer-events-none" />

                    {/* Front Cover Container */}
                    <div className="relative aspect-[2/3] w-60 sm:w-64 md:w-68 lg:w-72 rounded-l-xs rounded-r-xl overflow-hidden shadow-[0_18px_36px_-6px_rgba(0,0,0,0.3),0_8px_16px_-4px_rgba(0,0,0,0.15)] dark:shadow-[0_22px_45px_-6px_rgba(0,0,0,0.7)] border border-border/60 bg-muted/40">
                      {coverSrc ? (
                        <img
                          src={coverSrc}
                          alt={book.title}
                          loading="eager"
                          decoding="async"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <FallbackBookCover
                          title={book.title}
                          author={book.authors?.map((a) => a.name).join(', ')}
                          format={book.file_format}
                          coverSize="large"
                          isRss={book.tags?.some((t: any) => t.name === 'RSS') || /rss|feed|daily reading|daily digest/i.test(book.title)}
                        />
                      )}

                      {/* Realistic 3D Spine Crease & Hinge */}
                      <div className="absolute inset-y-0 left-0 w-3 pointer-events-none bg-gradient-to-r from-black/20 to-transparent" />
                      <div className="absolute inset-y-0 left-3 w-[1px] pointer-events-none bg-black/20 dark:bg-black/40" />
                      <div className="absolute inset-y-0 left-[13px] w-[1px] pointer-events-none bg-white/20 dark:bg-white/10" />
                      <div className="absolute inset-0 ring-1 ring-inset ring-white/20 dark:ring-white/10 rounded-l-xs rounded-r-xl pointer-events-none" />
                    </div>
                  </div>
                </div>

                {/* Bottom Actions & Metadata Strip */}
                <div className="w-full space-y-3 z-10">
                  {/* Reading Progress Indicator */}
                  {readingProgress !== null && readingProgress > 0 && (
                    <div className="w-full max-w-[280px] sm:max-w-[320px] mx-auto space-y-1.5">
                      <div className="flex justify-between text-[11px] font-bold text-muted-foreground px-1">
                        <span>Reading Progress</span>
                        <span className="text-foreground">{readingProgress}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-muted/60 dark:bg-muted rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary rounded-full transition-all duration-300"
                          style={{ width: `${readingProgress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Primary Read CTA */}
                  {onRead && (
                    <Button
                      size="lg"
                      className="w-full max-w-[280px] sm:max-w-[320px] mx-auto rounded-2xl text-sm lg:text-base font-bold h-12 shadow-lg shadow-primary/25 bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center gap-2.5 active:scale-[0.98] transition-all cursor-pointer"
                      onClick={() => { onOpenChange(false); onRead(); }}
                    >
                      <BookOpen className="w-5 h-5" />
                      <span>{readingProgress && readingProgress > 0 ? 'Continue Reading' : 'Read Now'}</span>
                    </Button>
                  )}

                  {/* Convert to EPUB (if not already epub/manga) */}
                  {book.file_format && !['epub', 'online-manga', 'cbz', 'cbr'].includes(book.file_format.toLowerCase()) && (
                    <div className="w-full max-w-[280px] sm:max-w-[320px] mx-auto">
                      <ConvertToEpubMenuItem
                        bookId={bookId}
                        bookTitle={book.title}
                        format={book.file_format}
                        variant="button"
                        onDone={() => { void loadBook(); }}
                      />
                    </div>
                  )}

                  {/* Unified Metadata Strip */}
                  <div className="flex items-center justify-center gap-2.5 py-2 px-3.5 rounded-xl bg-background/80 dark:bg-muted/60 border border-border/50 text-[11px] font-semibold text-muted-foreground w-full max-w-[280px] sm:max-w-[320px] mx-auto">
                    {book.file_size ? (
                      <span>{formatFileSize(book.file_size)}</span>
                    ) : null}
                    {book.file_size && book.page_count ? (
                      <span className="w-1 h-1 rounded-full bg-muted-foreground/40" />
                    ) : null}
                    {book.page_count ? (
                      <span>{pageCountLabel(book)}</span>
                    ) : null}
                    {(book.file_size || book.page_count) && book.language ? (
                      <span className="w-1 h-1 rounded-full bg-muted-foreground/40" />
                    ) : null}
                    <span className="uppercase">{book.language || 'EN'}</span>
                  </div>
                </div>
              </div>

              {/* Right Column: Seamless Details (No hard headers or borders) */}
              <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
                {/* Scrollable Content Body */}
                <div 
                  className="flex-1 overflow-y-auto pt-6 sm:pt-7 pr-12 sm:pr-14 pl-5 sm:pl-7 pb-6 custom-scrollbar space-y-5 sm:space-y-6"
                  style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 24px)' }}
                >
                  {/* MOBILE HERO (Hidden on Desktop) */}
                  <div className="md:hidden space-y-4">
                    <div className="flex items-start gap-3.5">
                      <div className="relative group w-24 min-[360px]:w-28 aspect-[2/3] rounded-2xl overflow-hidden shadow-lg border border-border/50 bg-muted/20 shrink-0">
                        {coverSrc ? (
                          <img
                            src={coverSrc}
                            alt={book.title}
                            loading="eager"
                            decoding="async"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <FallbackBookCover
                            title={book.title}
                            author={book.authors?.map((a) => a.name).join(', ')}
                            format={book.file_format}
                            isRss={book.tags?.some((t: any) => t.name === 'RSS') || /rss|feed|daily reading|daily digest/i.test(book.title)}
                          />
                        )}
                      </div>

                      <div className="flex-1 min-w-0 space-y-1.5 text-left">
                        <h2 className="text-base min-[380px]:text-lg font-black text-foreground leading-snug tracking-tight line-clamp-3">
                          {book.title}
                        </h2>
                        
                        {book.authors && book.authors.length > 0 && (
                          <p className="text-xs text-muted-foreground font-semibold line-clamp-2">
                            {book.authors.map(a => a.name).join(', ')}
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                          {book.file_format && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-muted text-muted-foreground border border-border/50 uppercase tracking-wider">
                              {book.file_format}
                            </span>
                          )}
                          {book.rating && book.rating > 0 ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                              <Star className="w-3 h-3 fill-current mr-1 text-amber-500" />
                              {book.rating} / {book.metadata_source === 'anilist' ? '10' : '5'}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    {onRead && (
                      <Button 
                        size="lg" 
                        className="w-full rounded-2xl text-xs sm:text-sm font-bold h-11 shadow-lg shadow-primary/25 bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center gap-2 active:scale-[0.98] transition-all cursor-pointer" 
                        onClick={() => { onOpenChange(false); onRead(); }}
                      >
                        <BookOpen className="w-4 h-4" /> 
                        <span>Read Now</span>
                      </Button>
                    )}

                    {book.file_format && !['epub', 'online-manga', 'cbz', 'cbr'].includes(book.file_format.toLowerCase()) && (
                      <ConvertToEpubMenuItem
                        bookId={bookId}
                        bookTitle={book.title}
                        format={book.file_format}
                        variant="button"
                        onDone={() => { void loadBook(); }}
                      />
                    )}
                  </div>

                  {/* DESKTOP HERO HEADER (Title, Author, Series, Badges) */}
                  <div className="hidden md:block space-y-2">
                    {book.series && (
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold mb-1">
                        <LayoutTemplate className="w-3.5 h-3.5" />
                        <span>{book.series} {book.series_index ? <span className="font-black">#{book.series_index}</span> : ''}</span>
                      </div>
                    )}

                    <h2 className="text-2xl lg:text-3xl font-black text-foreground leading-tight tracking-tight">
                      {book.title}
                    </h2>

                    {book.authors && book.authors.length > 0 && (
                      <p className="text-sm lg:text-base text-muted-foreground font-semibold">
                        {book.authors.map(a => a.name).join(', ')}
                      </p>
                    )}

                    {/* Badges: Rating, Source, Format, Language */}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {book.rating && book.rating > 0 ? (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                          <Star className="w-3.5 h-3.5 fill-current mr-1 text-amber-500" />
                          {book.rating} / {book.metadata_source === 'anilist' ? '10' : '5'}
                        </span>
                      ) : null}

                      {book.metadata_source && (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
                          <Globe className="w-3.5 h-3.5 mr-1" />
                          {book.metadata_source}
                        </span>
                      )}

                      {book.pubdate && (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-muted text-muted-foreground border border-border/50">
                          <Calendar className="w-3.5 h-3.5 mr-1 text-primary/70" />
                          {new Date(book.pubdate).getFullYear() || formatDate(book.pubdate)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* SECONDARY ACTION TOOLBAR (Match, Enrich, Edit, Delete) */}
                  <div className="grid grid-cols-4 gap-2 w-full">
                    <FeatureHint featureId="metadata-search" title="Find Metadata" description="Search online for covers and details.">
                      <button 
                        type="button"
                        className="w-full flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 px-2 sm:px-3 rounded-2xl bg-muted/40 hover:bg-muted active:bg-muted/80 border border-border/60 text-foreground transition-all cursor-pointer active:scale-95 text-center font-bold text-[11px] sm:text-xs" 
                        onClick={() => setMetadataDialogOpen(true)}
                      >
                        <Search className="w-4 h-4 text-primary shrink-0"/>
                        <span>Match</span>
                      </button>
                    </FeatureHint>

                    <button 
                      type="button"
                      className="w-full flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 px-2 sm:px-3 rounded-2xl bg-muted/40 hover:bg-muted active:bg-muted/80 border border-border/60 text-foreground transition-all cursor-pointer active:scale-95 text-center font-bold text-[11px] sm:text-xs disabled:opacity-50" 
                      disabled={autoEnrichLoading} 
                      onClick={() => api.enrichBookMetadata(bookId)}
                    >
                      {autoEnrichLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0"/>
                      ) : (
                        <RefreshCw className="w-4 h-4 text-primary shrink-0"/>
                      )}
                      <span>Enrich</span>
                    </button>

                    {onEdit && (
                      <button 
                        type="button"
                        className="w-full flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 px-2 sm:px-3 rounded-2xl bg-muted/40 hover:bg-muted active:bg-muted/80 border border-border/60 text-foreground transition-all cursor-pointer active:scale-95 text-center font-bold text-[11px] sm:text-xs" 
                        onClick={() => { onOpenChange(false); onEdit(); }}
                      >
                        <Pencil className="w-4 h-4 text-primary shrink-0"/>
                        <span>Edit</span>
                      </button>
                    )}

                    {onDelete && (
                      <button 
                        type="button"
                        className="w-full flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 px-2 sm:px-3 rounded-2xl bg-destructive/10 hover:bg-destructive/20 border border-destructive/30 text-destructive transition-all cursor-pointer active:scale-95 text-center font-bold text-[11px] sm:text-xs" 
                        onClick={() => { onOpenChange(false); onDelete(); }}
                      >
                        <Trash2 className="w-4 h-4 shrink-0"/>
                        <span>Delete</span>
                      </button>
                    )}
                  </div>

                  {/* READING STATUS */}
                  <div className="space-y-2">
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

                  {/* Mobile-only Series Banner */}
                  {book.series && (
                    <div className="md:hidden flex items-center gap-3 bg-primary/10 rounded-2xl p-3 border border-primary/20 shadow-2xs">
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

                  {/* NOTES & SYNOPSIS (Prominently placed) */}
                  {book.notes && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-extrabold text-foreground uppercase tracking-wider">
                        <FileText className="w-3.5 h-3.5 text-primary" />
                        <span>Synopsis & Notes</span>
                      </div>
                      <div className="text-xs sm:text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap bg-muted/30 border border-border/60 p-4 rounded-2xl max-h-56 overflow-y-auto custom-scrollbar">
                        {book.notes}
                      </div>
                    </div>
                  )}

                  {/* SPECIFICATIONS & METADATA GRID */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-extrabold text-foreground uppercase tracking-wider">
                      <Layers className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span>Information</span>
                    </div>
                    
                    <div className="grid grid-cols-2 min-[440px]:grid-cols-3 gap-2">
                      {book.publisher && (
                        <div className="bg-muted/30 hover:bg-muted/50 border border-border/60 rounded-2xl p-3 flex flex-col gap-1 transition-all">
                          <div className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                            <Building2 className="w-3 h-3 text-primary/70" />
                            <span>Publisher</span>
                          </div>
                          <span className="text-xs font-semibold text-foreground truncate">{book.publisher}</span>
                        </div>
                      )}

                      {book.pubdate && (
                        <div className="bg-muted/30 hover:bg-muted/50 border border-border/60 rounded-2xl p-3 flex flex-col gap-1 transition-all">
                          <div className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                            <Calendar className="w-3 h-3 text-primary/70" />
                            <span>Published</span>
                          </div>
                          <span className="text-xs font-semibold text-foreground truncate">{formatDate(book.pubdate)}</span>
                        </div>
                      )}

                      <div className="bg-muted/30 hover:bg-muted/50 border border-border/60 rounded-2xl p-3 flex flex-col gap-1 transition-all">
                        <div className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                          <Globe className="w-3 h-3 text-primary/70" />
                          <span>Language</span>
                        </div>
                        <span className="text-xs font-semibold text-foreground truncate uppercase">{book.language || 'EN'}</span>
                      </div>

                      {book.file_size ? (
                        <div className="bg-muted/30 hover:bg-muted/50 border border-border/60 rounded-2xl p-3 flex flex-col gap-1 transition-all">
                          <div className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                            <HardDrive className="w-3 h-3 text-primary/70" />
                            <span>Size</span>
                          </div>
                          <span className="text-xs font-semibold text-foreground truncate">{formatFileSize(book.file_size)}</span>
                        </div>
                      ) : null}

                      {book.page_count ? (
                        <div className="bg-muted/30 hover:bg-muted/50 border border-border/60 rounded-2xl p-3 flex flex-col gap-1 transition-all">
                          <div className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                            <BookOpen className="w-3 h-3 text-primary/70" />
                            <span>Pages</span>
                          </div>
                          <span className="text-xs font-semibold text-foreground truncate">{pageCountLabel(book)}</span>
                        </div>
                      ) : null}

                      {book.isbn ? (
                        <div className="bg-muted/30 hover:bg-muted/50 border border-border/60 rounded-2xl p-3 flex flex-col gap-1 transition-all">
                          <div className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                            <Hash className="w-3 h-3 text-primary/70" />
                            <span>ISBN</span>
                          </div>
                          <span className="text-xs font-semibold text-foreground font-mono truncate">{book.isbn}</span>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {/* TAGS CLOUD */}
                  {book.tags && book.tags.length > 0 && (
                    <div className="space-y-2">
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

                  {/* TIMESTAMP FOOTER */}
                  <div className="pt-2 text-[10px] sm:text-[11px] text-muted-foreground/70 font-medium">
                    Added {formatDate(book.added_date)}
                    {book.last_opened && ` • Last opened ${formatDate(book.last_opened)}`}
                  </div>
                </div>
              </div>
            </>
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
