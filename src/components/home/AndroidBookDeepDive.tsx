import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Heart,
  BookOpen,
  Star,
  Clock,
  Globe,
  Headphones,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { Book, ReadingProgress } from '@/lib/tauri';
import { api } from '@/lib/tauri';
import { useLibraryStore } from '@/store/libraryStore';
import { convertFileSrc } from '@tauri-apps/api/core';
import { proxyExternalCover, cn } from '@/lib/utils';

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
  book,
  progress,
  onClose,
  onRead,
  onListen,
}: AndroidBookDeepDiveProps) {
  const favoriteBookIds = useLibraryStore((s) => s.favoriteBookIds);
  const toggleFavorite = useLibraryStore((s) => s.toggleFavorite);
  const isFav = book.id ? favoriteBookIds.has(book.id) : false;

  const [isExpanded, setIsExpanded] = useState(false);

  const handleToggleFav = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!book.id) return;
    toggleFavorite(book.id);
    await api.toggleBookFavorite(book.id).catch(() => {});
  };

  const coverUrl = getCoverUrl(book.cover_path);
  const authorName = book.authors?.map((a) => a.name).join(', ') || 'Unknown Author';
  const synopsis = cleanSynopsis(book.notes) ||
    'An engaging volume from your library. Tap Read Book below to explore its chapters, annotations, and reading experience.';

  // Estimated pages and reading time
  const totalPages = book.page_count || Math.max(1, Math.round((book.file_size || 600000) / 1800));
  const estMinutes = Math.round(totalPages * 1.6);
  const hours = Math.floor(estMinutes / 60);
  const mins = estMinutes % 60;
  const timeFormatted = hours > 0 ? `${hours}h ${mins}min` : `${mins}min`;

  // Rating formatted to e.g. 4.5
  const ratingValue = book.rating ? (book.rating > 5 ? (book.rating / 2).toFixed(1) : book.rating.toFixed(1)) : '4.5';

  // Language display
  const langDisplay = book.language ? (book.language.length <= 3 ? book.language.toUpperCase() : book.language) : 'English';

  // Progress percentage
  const progressPercent = progress?.progressPercent || 0;

  // Subtitle from series or publisher
  const subtitle = book.series
    ? (book.series_index ? `${book.series} · Vol. ${book.series_index}` : book.series)
    : book.publisher;

  // Tags/Genres
  const displayTags = (book.tags && book.tags.length > 0)
    ? book.tags.map((t) => t.name).slice(0, 4)
    : ['General', 'Literature'];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-0 z-50 bg-background text-foreground flex flex-col overflow-y-auto no-scrollbar pb-28 select-none"
    >
      {/* ── 1. HERO COVER ART WITH ATMOSPHERIC GRADIENT FADE ── */}
      <div className="relative w-full h-[360px] sm:h-[400px] shrink-0 bg-muted overflow-hidden">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={book.title}
            className="w-full h-full object-cover object-top scale-105 filter brightness-95"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-card via-muted to-card p-6 text-center">
            <BookOpen className="w-16 h-16 text-primary/40 mb-3" />
            <span className="text-base font-bold text-foreground/80 line-clamp-2">{book.title}</span>
          </div>
        )}

        {/* Ambient top vignette & bottom gradient fade into page background */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-transparent pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent pointer-events-none" />

        {/* Floating Top Navigation Header */}
        <div
          className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 pt-3"
          style={{ paddingTop: 'max(12px, env(safe-area-inset-top, 0px))' }}
        >
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-black/40 backdrop-blur-md text-white border border-white/15 active:scale-90 transition-all shadow-md cursor-pointer"
            aria-label="Back to collection"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={handleToggleFav}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-black/40 backdrop-blur-md text-white border border-white/15 active:scale-90 transition-all shadow-md cursor-pointer"
            aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Heart className={cn('w-5 h-5 transition-colors', isFav ? 'fill-rose-500 text-rose-500' : 'text-white')} />
          </button>
        </div>
      </div>

      {/* ── 2. BOOK METADATA & TITLE SECTION ── */}
      <div className="relative -mt-10 px-5 flex flex-col z-10">
        {/* Author Eyebrow */}
        <span className="text-xs font-bold text-primary tracking-wider uppercase mb-1">
          By {authorName}
        </span>

        {/* Book Title */}
        <h1 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight leading-tight">
          {book.title}
        </h1>

        {/* Subtitle / Series Context */}
        {subtitle && (
          <p className="text-xs sm:text-sm text-muted-foreground font-medium mt-1 leading-snug">
            {subtitle}
          </p>
        )}

        {/* Genre / Tag Chips */}
        <div className="flex items-center gap-2 flex-wrap mt-3.5">
          {displayTags.map((tag) => (
            <span
              key={tag}
              className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-muted/70 text-foreground/80 border border-border/50 shadow-2xs"
            >
              {tag}
            </span>
          ))}
        </div>

        {/* Key Stats Bar (Pages, Rating, Est Time, Language) */}
        <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground/90 py-3 border-y border-border/40 mt-5 mb-4">
          {/* Pages */}
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-foreground tabular-nums">{totalPages}</span>
            <BookOpen size={14} className="text-primary" />
          </div>

          <div className="w-1 h-1 rounded-full bg-border" />

          {/* Rating */}
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-foreground tabular-nums">{ratingValue}</span>
            <Star size={14} className="fill-amber-400 text-amber-400" />
          </div>

          <div className="w-1 h-1 rounded-full bg-border" />

          {/* Time */}
          <div className="flex items-center gap-1.5">
            <Clock size={14} className="text-muted-foreground" />
            <span className="font-medium tabular-nums">{timeFormatted}</span>
          </div>

          <div className="w-1 h-1 rounded-full bg-border" />

          {/* Language */}
          <div className="flex items-center gap-1.5">
            <span className="font-medium">{langDisplay}</span>
            <Globe size={14} className="text-muted-foreground" />
          </div>
        </div>

        {/* Synopsis / Description */}
        <div className="flex flex-col gap-1.5">
          <p className={cn(
            'text-xs sm:text-sm text-foreground/80 leading-relaxed font-normal whitespace-pre-line',
            !isExpanded && synopsis.length > 220 && 'line-clamp-4'
          )}>
            {synopsis}
          </p>

          {synopsis.length > 220 && (
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-xs font-bold text-primary hover:underline flex items-center gap-1 mt-1 cursor-pointer w-fit"
            >
              <span>{isExpanded ? 'Show less' : 'Read more'}</span>
              {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          )}
        </div>
      </div>

      {/* ── 3. FIXED BOTTOM ACTION BAR ── */}
      <div
        className="fixed bottom-0 left-0 right-0 z-40 p-4 pb-6 bg-gradient-to-t from-background via-background/95 to-background/70 backdrop-blur-md border-t border-border/40 flex items-center gap-3"
        style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom, 0px))' }}
      >
        {/* Audio / TTS Button */}
        <button
          type="button"
          onClick={() => {
            if (onListen) onListen(book);
            else onRead(book);
          }}
          className="w-13 h-13 rounded-2xl bg-card hover:bg-card/80 border border-border/70 flex items-center justify-center text-foreground active:scale-95 transition-all shadow-xs cursor-pointer shrink-0"
          aria-label="Listen with Audio / TTS"
        >
          <Headphones className="w-5 h-5" />
        </button>

        {/* Main "Read Book" CTA Button */}
        <button
          type="button"
          onClick={() => onRead(book)}
          className="flex-1 h-13 rounded-2xl bg-primary text-primary-foreground font-extrabold text-sm sm:text-base flex items-center justify-center gap-2 shadow-lg shadow-primary/25 active:scale-98 transition-all cursor-pointer"
        >
          <BookOpen className="w-5 h-5" />
          <span>
            {progressPercent > 0
              ? `Continue (${Math.round(progressPercent)}%)`
              : 'Read Book'}
          </span>
        </button>
      </div>
    </motion.div>
  );
}
