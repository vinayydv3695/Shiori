import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { ReadingWrappedData } from '@/lib/tauri';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Award,
  Clock,
  BookOpen,
  Layers,
  Trophy,
  Moon,
  Flame,
  Bookmark,
  Share2,
} from 'lucide-react';
import { Button } from '../ui/button';
import { useCoverImage } from '@/components/common/hooks/useCoverImage';
import { WrappedCardCanvas } from './WrappedCardCanvas';
import { formatWrappedTime } from './wrappedCanvasRenderer';
import { cn } from '@/lib/utils';

interface ReadingWrappedModalProps {
  data: ReadingWrappedData;
  isOpen: boolean;
  onClose: () => void;
}

function WrappedCover({
  bookId,
  coverPath,
  title,
  className = 'w-36 h-52',
}: {
  bookId: number;
  coverPath: string | null;
  title: string;
  className?: string;
}) {
  const { coverUrl, error } = useCoverImage(bookId, coverPath);
  const [imgErr, setImgErr] = useState(false);

  if (coverUrl && !error && !imgErr) {
    return (
      <img
        src={coverUrl}
        alt={title}
        onError={() => setImgErr(true)}
        className={`${className} object-cover rounded-2xl shadow-xl border border-border/70`}
      />
    );
  }

  return (
    <div
      className={`${className} rounded-2xl bg-muted/60 border border-border/60 flex flex-col items-center justify-center p-4 text-center shadow-lg`}
    >
      <BookOpen className="w-8 h-8 text-primary/80 mb-2" />
      <span className="text-xs font-bold text-foreground line-clamp-2">{title}</span>
    </div>
  );
}

export function ReadingWrappedModal({ data, isOpen, onClose }: ReadingWrappedModalProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const totalSlides = 6;

  const handleNext = useCallback(() => {
    setCurrentSlide((prev) => Math.min(prev + 1, totalSlides - 1));
  }, [totalSlides]);

  const handlePrev = useCallback(() => {
    setCurrentSlide((prev) => Math.max(prev - 1, 0));
  }, []);

  const handleRestart = () => {
    setCurrentSlide(0);
  };

  useEffect(() => {
    if (isOpen) {
      setCurrentSlide(0);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Space') {
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleNext, handlePrev, onClose]);

  if (!isOpen) return null;

  const topBook = data.top_books[0];
  const totalHours = (data.total_seconds / 3600).toFixed(1);

  const modalContent = (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      className="fixed inset-0 z-[250] flex items-center justify-center bg-black/60 backdrop-blur-md p-3 sm:p-6 overflow-hidden select-none animate-in fade-in duration-200"
    >
      {/* Container: Matches the app's exact theme and card styling */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-xl h-[92vh] max-h-[800px] rounded-3xl overflow-hidden bg-card border border-border/80 text-foreground shadow-2xl flex flex-col justify-between"
      >
        {/* Subtle ambient theme aura */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-primary/5 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-primary/5 rounded-full blur-[100px] pointer-events-none" />

        {/* Top Story Header: Segmented progress bars + Close button */}
        <div className="relative z-30 pt-4 px-5 pb-2 flex flex-col gap-3">
          {/* Segmented Story Bars */}
          <div className="flex items-center gap-1.5 w-full">
            {Array.from({ length: totalSlides }).map((_, idx) => (
              <div
                key={idx}
                onClick={() => setCurrentSlide(idx)}
                className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden cursor-pointer transition-all"
              >
                <div
                  className={cn(
                    "h-full transition-all duration-300 rounded-full",
                    idx < currentSlide
                      ? "w-full bg-primary"
                      : idx === currentSlide
                      ? "w-full bg-primary animate-pulse"
                      : "w-0"
                  )}
                />
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-[11px] font-bold text-primary tracking-wider uppercase flex items-center gap-1.5">
                <Bookmark size={11} className="text-primary" />
                {data.year} Edition
              </span>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground transition-all border border-border/40"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Story Slide Area */}
        <div className="relative z-20 flex-1 px-6 py-4 flex flex-col items-center justify-center overflow-y-auto custom-scrollbar">
          <AnimatePresence mode="wait">
            {/* ── Slide 0: Total Reading Time ── */}
            {currentSlide === 0 && (
              <motion.div
                key="slide-0"
                initial={{ opacity: 0, scale: 0.96, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 1.04, y: -15 }}
                transition={{ duration: 0.3 }}
                className="w-full flex flex-col items-center text-center space-y-6 max-w-md my-auto"
              >
                <div className="w-16 h-16 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-xs">
                  <Clock className="w-8 h-8" />
                </div>

                <div className="space-y-2">
                  <span className="text-xs font-bold tracking-widest text-primary uppercase">
                    Your Year in Words
                  </span>
                  <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground">
                    You read for
                  </h2>
                  <div className="text-5xl sm:text-6xl font-black text-foreground py-1 tracking-tight">
                    {formatWrappedTime(data.total_seconds)}
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">
                    That is equivalent to <span className="text-foreground font-bold">{totalHours} hours</span> of immersion across your library.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 w-full pt-2">
                  <div className="p-4 rounded-2xl bg-muted/30 border border-border/50 text-center">
                    <div className="text-2xl font-black text-foreground">{data.total_sessions}</div>
                    <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mt-0.5">
                      Sessions Logged
                    </div>
                  </div>
                  <div className="p-4 rounded-2xl bg-muted/30 border border-border/50 text-center">
                    <div className="text-2xl font-black text-foreground">{data.total_reading_days}</div>
                    <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mt-0.5">
                      Active Days
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── Slide 1: Books & Pages ── */}
            {currentSlide === 1 && (
              <motion.div
                key="slide-1"
                initial={{ opacity: 0, scale: 0.96, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 1.04, y: -15 }}
                transition={{ duration: 0.3 }}
                className="w-full flex flex-col items-center text-center space-y-6 max-w-md my-auto"
              >
                <div className="w-16 h-16 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-xs">
                  <Trophy className="w-8 h-8" />
                </div>

                <div className="space-y-2">
                  <span className="text-xs font-bold tracking-widest text-primary uppercase">
                    Milestones Reached
                  </span>
                  <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-foreground">
                    Volumes Finished
                  </h2>
                  <div className="text-6xl font-black text-foreground">
                    {data.books_completed}
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">
                    {data.books_completed > 0
                      ? 'You saw stories through from beginning to end.'
                      : 'You explored new worlds and made steady progress.'}
                  </p>
                </div>

                <div className="w-full p-5 rounded-2xl bg-muted/30 border border-border/50 flex items-center justify-between">
                  <div className="flex items-center gap-3.5 text-left">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
                      <Layers size={20} />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-muted-foreground uppercase">Pages Turned</div>
                      <div className="text-2xl font-black text-foreground">{data.total_pages_read.toLocaleString()}</div>
                    </div>
                  </div>
                  {data.longest_streak > 0 && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 border border-primary/20 text-primary text-xs font-bold">
                      <Flame size={14} className="text-primary fill-primary" />
                      {data.longest_streak}d Streak
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* ── Slide 2: Crown Book Spotlight ── */}
            {currentSlide === 2 && (
              <motion.div
                key="slide-2"
                initial={{ opacity: 0, scale: 0.96, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 1.04, y: -15 }}
                transition={{ duration: 0.3 }}
                className="w-full flex flex-col items-center text-center space-y-5 max-w-md my-auto"
              >
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold">
                  <Award size={14} className="text-primary" />
                  Most Read Title of {data.year}
                </div>

                {topBook ? (
                  <>
                    <WrappedCover
                      bookId={topBook.book_id}
                      coverPath={topBook.cover_path}
                      title={topBook.title}
                      className="w-36 h-52 sm:w-44 sm:h-64"
                    />

                    <div className="space-y-1 max-w-sm">
                      <h3 className="text-xl sm:text-2xl font-black text-foreground line-clamp-2">
                        {topBook.title}
                      </h3>
                      <p className="text-sm font-semibold text-muted-foreground">
                        {topBook.author || 'Unknown Author'}
                      </p>
                    </div>

                    <div className="px-4 py-2 rounded-2xl bg-muted/40 border border-border/50 text-foreground text-sm font-bold">
                      ⏱ {formatWrappedTime(topBook.total_seconds)} logged with this title
                    </div>
                  </>
                ) : (
                  <div className="p-8 rounded-2xl bg-muted/30 border border-border/50 text-center space-y-2">
                    <BookOpen className="w-12 h-12 text-muted-foreground mx-auto" />
                    <h3 className="text-lg font-bold text-foreground">Reading In Progress</h3>
                    <p className="text-xs text-muted-foreground">
                      Open a book in your library to start logging top title records!
                    </p>
                  </div>
                )}
              </motion.div>
            )}

            {/* ── Slide 3: Circadian Rhythm ── */}
            {currentSlide === 3 && (
              <motion.div
                key="slide-3"
                initial={{ opacity: 0, scale: 0.96, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 1.04, y: -15 }}
                transition={{ duration: 0.3 }}
                className="w-full flex flex-col items-center text-center space-y-5 max-w-md my-auto"
              >
                <div className="w-16 h-16 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-xs">
                  <Moon className="w-8 h-8" />
                </div>

                <div className="space-y-1">
                  <span className="text-xs font-bold tracking-widest text-primary uppercase">
                    Your Chronotype
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
                    {data.primary_rhythm || 'Balanced Reader'}
                  </h2>
                  <p className="text-xs font-medium text-muted-foreground">
                    Your reading peak hours across the 24-hour day
                  </p>
                </div>

                {/* 24-Hour Bar Visualizer */}
                <div className="w-full p-4 rounded-2xl bg-muted/30 border border-border/50 space-y-3">
                  <div className="flex items-end justify-between h-28 gap-1 pt-2">
                    {data.hourly_distribution.map((h, i) => {
                      const maxSec = Math.max(1, ...data.hourly_distribution.map((d) => d.total_seconds));
                      const heightPct = (h.total_seconds / maxSec) * 100;
                      const isPeak = h.total_seconds === maxSec && maxSec > 0;
                      return (
                        <div
                          key={i}
                          title={`${h.hour}:00 - ${formatWrappedTime(h.total_seconds)}`}
                          className="flex-1 flex flex-col items-center justify-end h-full group relative"
                        >
                          <div
                            className={cn(
                              "w-full rounded-t-sm transition-all duration-300",
                              isPeak
                                ? "bg-primary shadow-md shadow-primary/30"
                                : h.total_seconds > 0
                                ? "bg-foreground/75 group-hover:bg-primary/80"
                                : "bg-muted-foreground/20"
                            )}
                            style={{ height: `${Math.max(6, heightPct)}%` }}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between text-[10px] font-bold text-muted-foreground border-t border-border/40 pt-2">
                    <span>12 AM</span>
                    <span>6 AM</span>
                    <span>12 PM</span>
                    <span>6 PM</span>
                    <span>11 PM</span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-primary/5 border border-primary/15 text-xs font-medium text-foreground">
                  {data.persona_description}
                </div>
              </motion.div>
            )}

            {/* ── Slide 4: Formats & Genres ── */}
            {currentSlide === 4 && (
              <motion.div
                key="slide-4"
                initial={{ opacity: 0, scale: 0.96, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 1.04, y: -15 }}
                transition={{ duration: 0.3 }}
                className="w-full flex flex-col items-center text-center space-y-5 max-w-md my-auto"
              >
                <div className="w-16 h-16 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-xs">
                  <BookOpen className="w-8 h-8" />
                </div>

                <div className="space-y-1">
                  <span className="text-xs font-bold tracking-widest text-primary uppercase">
                    Your Reading Diet
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
                    Top Formats & Genres
                  </h2>
                </div>

                <div className="w-full space-y-2.5">
                  {data.genre_distribution.slice(0, 5).map((g, idx) => {
                    const maxSec = Math.max(1, ...data.genre_distribution.map((d) => d.total_seconds));
                    const widthPct = (g.total_seconds / maxSec) * 100;
                    return (
                      <div
                        key={g.name}
                        className="p-3.5 rounded-2xl bg-muted/30 border border-border/50 relative overflow-hidden"
                      >
                        <div
                          className="absolute inset-0 bg-primary/10 pointer-events-none"
                          style={{ width: `${widthPct}%` }}
                        />
                        <div className="relative z-10 flex items-center justify-between text-xs font-bold">
                          <span className="text-foreground flex items-center gap-2">
                            <span className="text-primary">#{idx + 1}</span> {g.name}
                          </span>
                          <span className="text-muted-foreground">{formatWrappedTime(g.total_seconds)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* ── Slide 5: Share Card Generator ── */}
            {currentSlide === 5 && (
              <motion.div
                key="slide-5"
                initial={{ opacity: 0, scale: 0.96, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 1.04, y: -15 }}
                transition={{ duration: 0.3 }}
                className="w-full flex flex-col items-center text-center space-y-3 max-w-md my-auto"
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-primary uppercase">
                    <Share2 size={13} />
                    Ready to Share
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-black text-foreground">
                    Your {data.year} Wrapped Card
                  </h2>
                </div>

                {/* Canvas preview with Story & Card exports */}
                <WrappedCardCanvas data={data} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Bottom Navigation Toolbar */}
        <div className="relative z-30 px-6 py-4 flex items-center justify-between border-t border-border/60 bg-muted/20 backdrop-blur-md">
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePrev}
            disabled={currentSlide === 0}
            className="text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 gap-1.5 font-bold rounded-xl"
          >
            <ChevronLeft size={16} />
            Back
          </Button>

          {currentSlide === totalSlides - 1 ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRestart}
              className="text-foreground border-border/60 hover:bg-muted gap-1.5 font-bold rounded-xl"
            >
              <RotateCcw size={14} />
              Replay
            </Button>
          ) : (
            <span className="text-xs font-semibold text-muted-foreground">
              {currentSlide + 1} of {totalSlides}
            </span>
          )}

          <Button
            variant="default"
            size="sm"
            onClick={handleNext}
            disabled={currentSlide === totalSlides - 1}
            className="bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-30 gap-1.5 font-bold rounded-xl px-4"
          >
            Next
            <ChevronRight size={16} />
          </Button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : null;
}
