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
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[100] w-screen h-screen bg-background text-foreground flex flex-col select-none overflow-hidden"
    >
      {/* Scrollable details body */}
      <div className="flex-1 overflow-y-auto no-scrollbar pb-28">
      {/* ── 1. HERO COVER ART WITH ATMOSPHERIC GRADIENT FADE ── */}
      <div className="relative w-full h-[320px] sm:h-[380px] shrink-0 bg-muted overflow-hidden">
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

        {/* Ambient top vignette for contrast on status bar and back/heart buttons */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-transparent pointer-events-none" />

        {/* Deep bottom gradient fading seamlessly into page background */}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent pointer-events-none" />

        {/* Top Floating Navigation Header */}
        <div
          className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 pt-3"
          style={{ paddingTop: 'max(14px, env(safe-area-inset-top, 0px))' }}
        >
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-black/45 backdrop-blur-md text-white border border-white/15 active:scale-90 transition-all shadow-md cursor-pointer"
            aria-label="Back to collection"
          >
            <ArrowLeft className="w-5 h-5 stroke-[2.2]" />
          </button>

          <button
            type="button"
            onClick={handleToggleFav}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-black/45 backdrop-blur-md text-white border border-white/15 active:scale-90 transition-all shadow-md cursor-pointer"
            aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Heart className={cn('w-5 h-5 transition-colors', isFav ? 'fill-rose-500 text-rose-500' : 'text-white')} />
          </button>
        </div>
      </div>

      {/* ── 2. EDITORIAL METADATA & CONTENT (Matches media_1792418691337_140e92b7.png) ── */}
      <div className="relative -mt-10 px-5 sm:px-6 flex flex-col z-10">
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

        {/* Genre / Category Capsule Pills */}
        <div className="flex items-center gap-2 flex-wrap mt-3.5">
          {displayTags.map((tag) => (
            <span
              key={tag}
              className="px-4 py-1.5 rounded-full text-xs font-semibold bg-card/85 dark:bg-card/70 text-foreground/85 border border-border/60 shadow-2xs"
            >
              {tag}
            </span>
          ))}
        </div>

        {/* Key Stats Row (320 📖 • 4.5 ★ • 8h 46min 🎧 • English 🌐) */}
        <div className="flex items-center gap-4 text-xs font-semibold mt-4 text-muted-foreground/90">
          {/* Pages */}
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-primary tabular-nums">{totalPages}</span>
            <BookOpen size={14} className="text-muted-foreground" />
          </div>

          {/* Rating */}
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-primary tabular-nums">{ratingValue}</span>
            <Star size={14} className="fill-amber-400 text-amber-400" />
          </div>

          {/* Reading Time */}
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-primary tabular-nums">{timeFormatted}</span>
            <Clock size={14} className="text-muted-foreground" />
          </div>

          {/* Language */}
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-primary">{langDisplay}</span>
            <Globe size={14} className="text-muted-foreground" />
          </div>
        </div>

        {/* Synopsis Paragraph */}
        <p className="text-xs sm:text-sm text-foreground/75 leading-relaxed font-normal mt-4 whitespace-pre-line line-clamp-4">
          {synopsis}
        </p>
      </div>
      </div>

      {/* ── 3. FLOATING FIXED BOTTOM ACTION BAR (Matches media_1792418691337_140e92b7.png) ── */}
      <div
        className="fixed bottom-0 left-0 right-0 z-30 px-5 sm:px-6 pb-6 pt-4 bg-gradient-to-t from-background via-background/95 to-transparent flex items-center gap-3.5"
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

        {/* Main "Read Book" CTA Button (Theme Accent Capsule Matching Reference) */}
        <button
          type="button"
          onClick={() => onRead(book)}
          className="flex-1 h-14 rounded-full bg-primary text-primary-foreground font-black text-sm sm:text-base flex items-center justify-center gap-2.5 shadow-lg shadow-primary/25 active:scale-98 transition-all cursor-pointer"
        >
          <BookOpen className="w-5 h-5 fill-current stroke-[1.8]" />
          <span>Read Book</span>
        </button>
      </div>
    </motion.div>
  );
}
