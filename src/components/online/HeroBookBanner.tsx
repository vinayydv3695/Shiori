import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import type { CarouselItem } from './ContentCarousel';
import { cn } from '@/lib/utils';
import { getProxyUrl } from '@/lib/tauri';
import { FallbackBookCover } from '@/components/library/FallbackBookCover';

interface HeroBookBannerProps {
  items: CarouselItem[];
  loading?: boolean;
  onReadClick?: (item: CarouselItem) => void;
  actionLabel?: string;
  sourceId?: string;
}

function cleanBookTitle(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/;\s*or,\s*.*$/i, '')
    .replace(/:\s+A Romance.*$/i, '')
    .replace(/\s*\([^)]*edition[^)]*\)/gi, '')
    .trim();
}

function formatAuthorName(raw?: string): string | undefined {
  if (!raw || raw === 'Unknown Author') return undefined;
  const trimmed = raw.trim();
  if (trimmed.includes(',')) {
    const parts = trimmed.split(',').map((p) => p.trim());
    if (parts.length === 2) {
      return `${parts[1]} ${parts[0]}`;
    }
  }
  return trimmed;
}

export function HeroBookBanner({
  items,
  loading,
  onReadClick,
  actionLabel,
  sourceId = 'gutenberg',
}: HeroBookBannerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [imgError, setImgError] = useState(false);

  // Auto rotate every 8 seconds
  useEffect(() => {
    if (!items || items.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % Math.min(items.length, 5));
    }, 8000);
    return () => clearInterval(interval);
  }, [items]);

  useEffect(() => {
    setImgError(false);
  }, [currentIndex]);

  if (loading) {
    return (
      <div className="relative w-full h-[180px] sm:h-[220px] md:h-[250px] rounded-2xl sm:rounded-3xl overflow-hidden bg-card/40 border border-border/40 animate-pulse mb-6 sm:mb-8" />
    );
  }

  if (!items || items.length === 0) return null;

  const current = items[currentIndex] || items[0];
  const rawCover = current?.coverUrl || null;
  const cover = rawCover ? getProxyUrl(sourceId, rawCover) : null;
  const title = cleanBookTitle(current.title);
  const author = formatAuthorName(current.subtitle);
  const buttonLabel = actionLabel || 'Get Book';

  return (
    <div className="relative w-full h-[190px] sm:h-[225px] md:h-[260px] rounded-2xl sm:rounded-3xl overflow-hidden group border border-border/50 bg-card/75 dark:bg-card/45 backdrop-blur-xl shadow-sm mb-6 sm:mb-8 select-none transition-all duration-300">
      {/* Ambient background glow */}
      {cover && !imgError && (
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
          <img
            key={current.id + '-ambient'}
            src={cover}
            alt=""
            aria-hidden="true"
            className="w-full h-full object-cover filter blur-3xl scale-125 opacity-25 dark:opacity-20 saturate-150 transition-all duration-700"
          />
        </div>
      )}

      {/* Directional contrast gradient scrim */}
      <div className="absolute inset-0 bg-gradient-to-r from-card/95 via-card/85 to-card/25 dark:from-background/95 dark:via-background/85 dark:to-background/25 pointer-events-none z-0" />

      {/* Content Container */}
      <div className="relative z-10 h-full p-4 sm:p-6 md:p-8 flex items-center justify-between gap-3 sm:gap-6 md:gap-8">
        {/* Left Side: Metadata & CTA */}
        <div className="flex-1 min-w-0 flex flex-col justify-between h-full py-0.5 sm:py-1">
          {/* Top Tag */}
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-[10px] sm:text-xs font-bold tracking-wider uppercase">
              Featured
            </span>
          </div>

          {/* Title & Author */}
          <div className="space-y-0.5 sm:space-y-1 my-auto">
            <h2 className="text-base sm:text-xl md:text-2xl font-extrabold text-foreground tracking-tight line-clamp-2 leading-snug drop-shadow-xs">
              {title}
            </h2>
            {author && (
              <p className="text-xs sm:text-sm font-medium text-muted-foreground line-clamp-1">
                {author}
              </p>
            )}
          </div>

          {/* CTA Button */}
          <div className="flex items-center gap-2.5 pt-1">
            <Button
              size="sm"
              onClick={() => onReadClick?.(current)}
              className="h-8 sm:h-9 px-3.5 sm:px-4 rounded-full font-bold gap-1.5 shadow-xs bg-primary text-primary-foreground hover:bg-primary/90 text-xs sm:text-sm cursor-pointer active:scale-95 transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{buttonLabel}</span>
            </Button>
          </div>
        </div>

        {/* Right Side: Elevated Book Cover */}
        <div
          onClick={() => onReadClick?.(current)}
          className="relative h-[85%] sm:h-[90%] aspect-[2/3] rounded-xl sm:rounded-2xl overflow-hidden shadow-md border border-border/50 shrink-0 cursor-pointer transition-transform duration-300 hover:scale-105 active:scale-95 bg-secondary/40 flex items-center justify-center group/card"
        >
          {cover && !imgError ? (
            <>
              <img
                src={cover}
                alt={title}
                onError={() => setImgError(true)}
                className="w-full h-full object-cover transition-transform duration-500 group-hover/card:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-tr from-black/20 via-transparent to-white/15 pointer-events-none" />
            </>
          ) : (
            <FallbackBookCover
              title={title}
              author={author}
              format="epub"
              coverSize="small"
            />
          )}
        </div>
      </div>

      {/* Slide Indicators / Navigation Controls */}
      {items.length > 1 && (
        <div className="absolute bottom-3 right-3 sm:bottom-4 sm:right-6 flex items-center gap-1.5 z-20">
          <div className="hidden sm:flex items-center gap-1 mr-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setCurrentIndex((prev) => (prev - 1 + Math.min(items.length, 5)) % Math.min(items.length, 5));
              }}
              className="w-7 h-7 rounded-full bg-card/85 hover:bg-card border border-border/50 flex items-center justify-center text-foreground transition-all active:scale-90 shadow-2xs cursor-pointer"
              aria-label="Previous"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-card/75 backdrop-blur-md border border-border/40 shadow-2xs">
            {items.slice(0, 5).map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setCurrentIndex(i)}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300 cursor-pointer",
                  i === currentIndex ? "w-4 bg-primary" : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60"
                )}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>

          <div className="hidden sm:flex items-center gap-1 ml-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setCurrentIndex((prev) => (prev + 1) % Math.min(items.length, 5));
              }}
              className="w-7 h-7 rounded-full bg-card/85 hover:bg-card border border-border/50 flex items-center justify-center text-foreground transition-all active:scale-90 shadow-2xs cursor-pointer"
              aria-label="Next"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
