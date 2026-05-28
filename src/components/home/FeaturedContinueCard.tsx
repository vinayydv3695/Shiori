import React from 'react';
import { motion } from 'framer-motion';
import { PlayCircle, ArrowRight, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Book, ReadingProgress } from '@/lib/tauri';
import { useCoverImage } from '../common/hooks/useCoverImage';

interface FeaturedContinueCardProps {
  book: Book;
  progress: ReadingProgress;
  onOpenBook: (book: Book) => void;
  isManga: boolean;
}

export function FeaturedContinueCard({
  book,
  progress,
  onOpenBook,
  isManga
}: FeaturedContinueCardProps) {
  const percent = progress.progressPercent || 0;
  const { coverUrl } = useCoverImage(book.id, book.cover_path);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className="relative flex flex-col justify-end h-full min-h-[280px] rounded-2xl overflow-hidden cursor-pointer group border border-border/20 shadow-xl"
      onClick={() => onOpenBook(book)}
    >
      {/* Background Image with heavy blur */}
      <div className="absolute inset-0 bg-muted z-0">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt="Background"
            className="w-full h-full object-cover opacity-60 scale-105 group-hover:scale-110 transition-transform duration-700 ease-out"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/10 to-accent/10" />
        )}
        <div className="absolute inset-0 bg-background/50 backdrop-blur-3xl" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
      </div>

      {/* Content */}
      <div className="relative z-10 p-6 flex flex-col gap-4">
        <div className="flex items-start gap-5">
          {/* Cover Thumbnail */}
          <div className="w-20 h-28 flex-shrink-0 rounded-lg overflow-hidden shadow-2xl ring-1 ring-white/10 group-hover:-translate-y-1 transition-transform duration-300">
            {coverUrl ? (
              <img src={coverUrl} alt={book.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-muted flex items-center justify-center">
                <BookOpen size={24} className="text-muted-foreground/50" />
              </div>
            )}
          </div>
          
          <div className="flex flex-col gap-1.5 pt-2">
            <span className="text-[10px] uppercase tracking-widest font-bold text-primary">
              Continue Reading
            </span>
            <h2 className="text-xl font-bold leading-tight line-clamp-2 text-foreground">
              {book.title}
            </h2>
            <p className="text-sm text-muted-foreground line-clamp-1">
              {book.authors?.map(a => a.name).join(', ') || 'Unknown Author'}
            </p>
          </div>
        </div>

        {/* Progress & Action */}
        <div className="flex items-center gap-4 mt-2">
          <div className="flex-1 h-2 rounded-full bg-foreground/10 overflow-hidden relative">
            <div 
              className="absolute top-0 left-0 h-full bg-primary rounded-full transition-all duration-500 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="text-xs font-semibold text-foreground/80 min-w-[3ch]">
            {Math.round(percent)}%
          </span>
          <button className="flex items-center justify-center w-10 h-10 rounded-full bg-primary text-primary-foreground shadow-lg group-hover:bg-primary/90 group-hover:scale-105 transition-all">
            <PlayCircle size={20} className="ml-0.5" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
