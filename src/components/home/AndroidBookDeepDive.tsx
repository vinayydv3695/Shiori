import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Heart,
  BookOpen,
  Star,
  Clock,
  Globe,
  Headphones,
  ChevronDown,
  ChevronUp,
  Layers,
  HardDrive,
  Calendar,
  BookmarkCheck,
  CheckCircle2,
  RefreshCw,
  FileText,
  StickyNote,
} from 'lucide-react';
import type { Book, ReadingProgress, Annotation } from '@/lib/tauri';
import { api } from '@/lib/tauri';
import { useLibraryStore } from '@/store/libraryStore';
import { convertFileSrc } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { proxyExternalCover, cn, formatFileSize } from '@/lib/utils';

function getCoverUrl(path: string | null | undefined): string {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return proxyExternalCover(path);
  }
  return convertFileSrc(path.replace(/\\/g, '/'));
}

function cleanSynopsis(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .replace(/<br\s*[\/]?>/gi, '\n')
    .replace(/<p\s*[\/]?>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

export interface AndroidBookDeepDiveProps {
  book: Book;
  progress?: ReadingProgress;
  onClose: () => void;
  onRead: (book: Book) => void;
  onListen?: (book: Book) => void;
}

export function AndroidBookDeepDive({
  book: initialBook,
  progress: initialProgress,
  onClose,
  onRead,
  onListen,
}: AndroidBookDeepDiveProps) {
  const favoriteBookIds = useLibraryStore((s) => s.favoriteBookIds);
  const toggleFavorite = useLibraryStore((s) => s.toggleFavorite);

  const [book, setBook] = useState<Book>(initialBook);
  const [progress, setProgress] = useState<ReadingProgress | undefined>(initialProgress);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [isEnriching, setIsEnriching] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  const isFav = book.id ? favoriteBookIds.has(book.id) : false;

  // Dynamically load fresh metadata, progress, and user notes from DB
  useEffect(() => {
    if (!initialBook.id) return;
    const bookId = initialBook.id;
    let canceled = false;

    // 1. Fetch full book from API
    api.getBook(bookId)
      .then((fullBook) => {
        if (!canceled && fullBook) {
          setBook(fullBook);
        }
      })
      .catch(() => {});

    // 2. Fetch fresh reading progress
    api.getReadingProgress(bookId)
      .then((prog) => {
        if (!canceled && prog) {
          setProgress(prog);
        }
      })
      .catch(() => {});

    // 3. Fetch user annotations/notes
    api.getAnnotations(bookId)
      .then((annots) => {
        if (!canceled && Array.isArray(annots)) {
          setAnnotations(annots);
        }
      })
      .catch(() => {});

    // 4. Listen for metadata updates from enrichment
    let unlisten: (() => void) | undefined;
    listen<{ bookId: number; status: string }>('metadata-update', (event) => {
      if (event.payload.bookId === bookId) {
        if (event.payload.status === 'loading') {
          setIsEnriching(true);
        } else if (event.payload.status === 'success' || event.payload.status === 'not_found' || event.payload.status === 'error') {
          setIsEnriching(false);
          api.getBook(bookId).then((updated) => {
            if (!canceled && updated) setBook(updated);
          }).catch(() => {});
        }
      }
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      canceled = true;
      if (unlisten) unlisten();
    };
  }, [initialBook.id]);

  const handleToggleFav = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!book.id) return;
    toggleFavorite(book.id);
    await api.toggleBookFavorite(book.id).catch(() => {});
  };

  const handleEnrich = async () => {
    if (!book.id || isEnriching) return;
    setIsEnriching(true);
    try {
      await api.enrichBookMetadata(book.id);
    } catch {
      setIsEnriching(false);
    }
  };

  const coverUrl = getCoverUrl(book.cover_path);
  const authorName = book.authors?.map((a) => a.name).join(', ') || 'Unknown Author';
  const synopsis = cleanSynopsis(book.notes || (book as any).summary);

  // Subtitle from series or publisher
  const subtitle = book.series
    ? (book.series_index ? `${book.series} · Vol. ${book.series_index}` : book.series)
    : book.publisher;

  // Real tags / genres only (NO hardcoded fake tags)
  const displayTags = (book.tags && book.tags.length > 0)
    ? book.tags.map((t) => t.name).slice(0, 6)
    : [];

  // Estimated reading time computed ONLY when real page_count is present
  const estReadingTime = (book.page_count && book.page_count > 0) ? (() => {
    const totalMinutes = Math.round(book.page_count * 1.5);
    const hrs = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
  })() : null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[100] w-screen h-screen bg-background text-foreground flex flex-col select-none overflow-hidden"
    >
      {/* Scrollable details body */}
      <div className="flex-1 overflow-y-auto no-scrollbar pb-32">
        {/* ── 1. HERO COVER ART WITH SOFT ATMOSPHERIC FADE ── */}
        <div className="relative w-full h-[280px] sm:h-[340px] shrink-0 bg-card overflow-hidden">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt={book.title}
              className="w-full h-full object-cover object-top"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-muted p-6 text-center">
              <BookOpen className="w-16 h-16 text-primary/40 mb-3" />
              <span className="text-base font-bold text-foreground/80 line-clamp-2">{book.title}</span>
            </div>
          )}

          {/* Top shadow for status bar & nav buttons contrast */}
          <div className="absolute top-0 inset-x-0 h-20 bg-gradient-to-b from-black/50 via-black/15 to-transparent pointer-events-none" />

          {/* Gentle atmospheric fog fading seamlessly into background */}
          <div className="absolute bottom-0 inset-x-0 h-28 sm:h-36 bg-gradient-to-t from-background via-background/45 to-transparent pointer-events-none" />

          {/* Top Floating Navigation Header */}
          <div
            className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 pt-3"
            style={{ paddingTop: 'max(14px, env(safe-area-inset-top, 0px))' }}
          >
            <button
              type="button"
              onClick={onClose}
              className="w-10 h-10 rounded-full flex items-center justify-center bg-black/50 backdrop-blur-md text-white border border-white/20 active:scale-90 transition-all shadow-md cursor-pointer"
              aria-label="Back to collection"
            >
              <ArrowLeft className="w-5 h-5 stroke-[2.2]" />
            </button>

            <button
              type="button"
              onClick={handleToggleFav}
              className="w-10 h-10 rounded-full flex items-center justify-center bg-black/50 backdrop-blur-md text-white border border-white/20 active:scale-90 transition-all shadow-md cursor-pointer"
              aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
            >
              <Heart className={cn('w-5 h-5 transition-colors', isFav ? 'fill-rose-500 text-rose-500' : 'text-white')} />
            </button>
          </div>
        </div>

        {/* ── 2. EDITORIAL METADATA & CONTENT (Gentle overlap into atmospheric fade) ── */}
        <div className="relative -mt-6 px-5 sm:px-6 flex flex-col z-10">
          {/* Author Eyebrow in theme accent */}
          <span className="text-xs sm:text-sm font-bold text-primary tracking-wide mb-1">
            By {authorName}
          </span>

          {/* Title */}
          <h1 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight leading-tight">
            {book.title}
          </h1>

          {/* Subtitle / Series */}
          {subtitle && (
            <p className="text-xs sm:text-sm text-muted-foreground font-medium mt-1 leading-snug">
              {subtitle}
            </p>
          )}

          {/* Genre / Category Capsule Pills - Real Tags Only */}
          {displayTags.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap mt-3">
              {displayTags.map((tag) => (
                <span
                  key={tag}
                  className="px-3 py-1 rounded-full text-xs font-bold bg-secondary/80 text-foreground/90 border border-border/60 shadow-2xs"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* ── 3. REAL DATA STATS ROW WITH ICONS (NO HARDCODED FAKE VALUES) ── */}
          <div className="flex items-center gap-2 flex-wrap mt-4">
            {/* Format badge */}
            {book.file_format && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-card border border-border/60 text-xs font-extrabold uppercase text-foreground/90 shadow-2xs">
                <Layers className="w-3.5 h-3.5 text-primary" />
                {book.file_format}
              </span>
            )}

            {/* Real Page Count (Only shown if book has real page_count > 0) */}
            {book.page_count && book.page_count > 0 ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-card border border-border/60 text-xs font-bold text-foreground shadow-2xs">
                <BookOpen className="w-3.5 h-3.5 text-primary" />
                <span>{book.page_count} pages</span>
              </span>
            ) : null}

            {/* Real Rating (Only shown if book has real rating) */}
            {book.rating && book.rating > 0 ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs font-bold text-amber-600 dark:text-amber-400 shadow-2xs">
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                <span>{book.rating > 5 ? (book.rating / 2).toFixed(1) : book.rating.toFixed(1)}</span>
              </span>
            ) : null}

            {/* Reading Progress Percentage */}
            {progress && progress.progressPercent > 0 ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-primary/10 border border-primary/25 text-xs font-bold text-primary shadow-2xs">
                <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                <span>{Math.round(progress.progressPercent)}% completed</span>
              </span>
            ) : null}

            {/* Estimated Reading Time (Only if real page_count exists) */}
            {estReadingTime ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-card border border-border/60 text-xs font-semibold text-muted-foreground shadow-2xs">
                <Clock className="w-3.5 h-3.5 text-muted-foreground/75" />
                <span>{estReadingTime}</span>
              </span>
            ) : null}

            {/* Real Language (Only if present in metadata) */}
            {book.language ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-card border border-border/60 text-xs font-semibold text-muted-foreground uppercase shadow-2xs">
                <Globe className="w-3.5 h-3.5 text-muted-foreground/75" />
                <span>{book.language}</span>
              </span>
            ) : null}

            {/* File Size */}
            {book.file_size ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-card border border-border/60 text-xs font-semibold text-muted-foreground shadow-2xs">
                <HardDrive className="w-3.5 h-3.5 text-muted-foreground/75" />
                <span>{formatFileSize(book.file_size)}</span>
              </span>
            ) : null}

            {/* Published Date */}
            {book.pubdate ? (() => {
              const match = book.pubdate.match(/\b(18|19|20)\d{2}\b/);
              return match ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-card border border-border/60 text-xs font-semibold text-muted-foreground shadow-2xs">
                  <Calendar className="w-3.5 h-3.5 text-muted-foreground/75" />
                  <span>{match[0]}</span>
                </span>
              ) : null;
            })() : null}

            {/* User Notes Count */}
            {annotations.length > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-primary/10 border border-primary/20 text-xs font-bold text-primary shadow-2xs">
                <FileText className="w-3.5 h-3.5" />
                <span>{annotations.length} note{annotations.length > 1 ? 's' : ''}</span>
              </span>
            )}
          </div>

          {/* ── 4. REAL SYNOPSIS & NOTES ── */}
          <div className="mt-4 pt-4 border-t border-border/50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-primary" />
                About this Book
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleEnrich}
                  disabled={isEnriching}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-primary active:scale-95 transition-transform cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={cn('w-3 h-3', isEnriching && 'animate-spin')} />
                  <span>{isEnriching ? 'Enriching...' : 'Enrich Info'}</span>
                </button>
                {synopsis && synopsis.length > 160 && (
                  <button
                    type="button"
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="text-[11px] font-bold text-primary flex items-center gap-0.5 active:scale-95 cursor-pointer ml-1"
                  >
                    <span>{isExpanded ? 'Show Less' : 'Read More'}</span>
                    {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                )}
              </div>
            </div>

            {synopsis ? (
              <div
                onClick={() => synopsis.length > 160 && setIsExpanded(!isExpanded)}
                className="cursor-pointer"
              >
                <p className={cn(
                  'text-xs sm:text-sm text-foreground/80 leading-relaxed font-normal whitespace-pre-line transition-all',
                  !isExpanded && 'line-clamp-3'
                )}>
                  {synopsis}
                </p>
              </div>
            ) : (
              <div className="p-3.5 rounded-2xl bg-card/60 border border-border/60 flex items-center justify-between gap-3 mt-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>No synopsis available for this book.</span>
                </div>
                <button
                  type="button"
                  onClick={handleEnrich}
                  disabled={isEnriching}
                  className="px-2.5 py-1 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer shrink-0"
                >
                  <RefreshCw className={cn('w-3 h-3', isEnriching && 'animate-spin')} />
                  <span>{isEnriching ? 'Fetching...' : 'Fetch Info'}</span>
                </button>
              </div>
            )}
          </div>

          {/* ── 6. USER ANNOTATIONS / NOTES PREVIEW (IF ANY) ── */}
          {annotations.length > 0 && (
            <div className="mt-4 p-3.5 rounded-2xl bg-card/80 border border-primary/20">
              <div className="flex items-center justify-between text-xs font-bold text-primary mb-2">
                <span className="flex items-center gap-1.5">
                  <StickyNote className="w-3.5 h-3.5 text-primary" />
                  My Notes & Highlights ({annotations.length})
                </span>
              </div>
              <div className="space-y-1.5">
                {annotations.slice(0, 2).map((a, idx) => (
                  <div key={a.id || idx} className="text-xs text-foreground/85 bg-background/60 p-2.5 rounded-xl border border-border/40">
                    {a.selectedText && (
                      <p className="italic text-foreground/75 line-clamp-2">
                        "{a.selectedText}"
                      </p>
                    )}
                    {a.noteContent && (
                      <p className="mt-1 font-semibold text-primary/90 line-clamp-2">
                        {a.noteContent}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── 7. FLOATING FIXED BOTTOM ACTION BAR ── */}
      <div
        className="fixed bottom-0 left-0 right-0 z-30 px-5 sm:px-6 pb-6 pt-3 bg-background/95 dark:bg-background/95 backdrop-blur-md border-t border-border/40 flex items-center gap-3.5 shadow-lg"
        style={{ paddingBottom: 'max(18px, env(safe-area-inset-bottom, 18px))' }}
      >
        {/* Headphone Audio / TTS Button */}
        <button
          type="button"
          onClick={() => {
            if (onListen) onListen(book);
            else onRead(book);
          }}
          className="w-14 h-14 rounded-full bg-card/90 dark:bg-card/75 border border-border/70 hover:bg-card flex items-center justify-center text-foreground active:scale-90 transition-all shadow-md shrink-0 cursor-pointer"
          aria-label="Listen with Audio / TTS"
        >
          <Headphones className="w-5 h-5 stroke-[2.2]" />
        </button>

        {/* Main "Read Book" CTA Button */}
        <button
          type="button"
          onClick={() => onRead(book)}
          className="flex-1 h-14 rounded-full bg-primary text-primary-foreground font-black text-sm sm:text-base flex items-center justify-center gap-2.5 shadow-lg shadow-primary/25 active:scale-98 transition-all cursor-pointer"
        >
          <BookOpen className="w-5 h-5 fill-current stroke-[1.8]" />
          <span>
            {progress && progress.progressPercent > 0
              ? `Continue (${Math.round(progress.progressPercent)}%)`
              : 'Read Book'}
          </span>
        </button>
      </div>
    </motion.div>
  );
}
