import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import type { CarouselItem } from './ContentCarousel';
import { cn } from '@/lib/utils';

import { getProxyUrl } from '@/lib/tauri';

interface HeroBookBannerProps {
  items: CarouselItem[];
  loading?: boolean;
  onReadClick?: (item: CarouselItem) => void;
  actionLabel?: string;
  sourceId?: string;
}

export function HeroBookBanner({
  items,
  loading,
  onReadClick,
  actionLabel,
  sourceId = 'gutenberg',
}: HeroBookBannerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  // Auto rotate every 8 seconds
  useEffect(() => {
    if (!items || items.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % Math.min(items.length, 5));
    }, 8000);
    return () => clearInterval(interval);
  }, [items]);

  if (loading) {
    return (
      <div className="relative w-full h-[240px] sm:h-[300px] md:h-[360px] rounded-2xl sm:rounded-3xl overflow-hidden bg-card/40 border border-border/40 animate-pulse mb-6 sm:mb-8" />
    );
  }

  if (!items || items.length === 0) return null;

  const current = items[currentIndex] || items[0];
  const rawCover = current?.coverUrl || null;
  const cover = rawCover ? getProxyUrl(sourceId, rawCover) : null;
  const buttonLabel = actionLabel || 'Download Now';

  return (
    <div className="relative w-full h-[240px] sm:h-[300px] md:h-[360px] rounded-2xl sm:rounded-3xl overflow-hidden group border border-border/60 bg-card shadow-lg backdrop-blur-xl mb-6 sm:mb-8 select-none">
      {/* Seamless HD Background Artwork Layer with Ambient Color Trail */}
      {cover && (
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
          {/* Ambient Color Trail Glow across the whole banner (gives the banner the book's palette) */}
          <div className="absolute inset-0 overflow-hidden">
            <img
              key={current.id + '-ambient-trail'}
              src={cover}
              alt=""
              aria-hidden="true"
              className="w-full h-full object-cover object-center filter blur-3xl scale-125 opacity-40 dark:opacity-35 saturate-[1.8] transition-all duration-700 ease-out"
            />
          </div>

          {/* Zoomed-out, natural-proportions HD artwork anchored to the right */}
          <div className="absolute inset-0 flex justify-end items-center">
            <div className="relative h-[110%] w-auto max-w-[65%] sm:max-w-[55%] md:max-w-[50%] flex items-center justify-end [mask-image:linear-gradient(to_right,transparent_0%,rgba(0,0,0,0.2)_25%,rgba(0,0,0,0.85)_60%,black_90%)] [-webkit-mask-image:linear-gradient(to_right,transparent_0%,rgba(0,0,0,0.2)_25%,rgba(0,0,0,0.85)_60%,black_90%)]">
              <img
                key={current.id + '-bg'}
                src={cover}
                alt=""
                className="h-full w-auto max-w-none object-contain filter contrast-[1.08] saturate-[1.12] brightness-[1.02] opacity-95 dark:opacity-85 transition-all duration-700 ease-out group-hover:scale-105"
              />
            </div>
          </div>

          {/* Smooth directional contrast scrim for crystal-clear typography readability */}
          <div className="absolute inset-0 bg-gradient-to-r from-card/85 via-card/50 to-transparent dark:from-background/85 dark:via-background/50 dark:to-transparent [mask-image:linear-gradient(to_right,black_0%,black_45%,transparent_90%)] [-webkit-mask-image:linear-gradient(to_right,black_0%,black_45%,transparent_90%)]" />
          <div className="absolute inset-0 bg-gradient-to-t from-card/40 via-transparent to-card/20 dark:from-background/40 dark:via-transparent dark:to-background/20" />
        </div>
      )}

      {/* Main Content Area */}
      <div className="relative z-10 h-full p-5 sm:p-7 md:p-9 flex items-center gap-6 md:gap-9">
        {/* Elevated 3D Pop-Up Foreground Card */}
        {cover && (
          <div 
            onClick={() => onReadClick?.(current)}
            className="hidden sm:block flex-shrink-0 w-32 md:w-40 aspect-[2/3] rounded-2xl overflow-hidden cursor-pointer shadow-[0_20px_45px_-8px_rgba(0,0,0,0.6),0_6px_16px_rgba(0,0,0,0.35)] ring-1 ring-white/30 dark:ring-white/15 border border-white/20 transition-all duration-300 ease-out hover:scale-[1.05] hover:-translate-y-1.5 hover:shadow-[0_28px_55px_-10px_rgba(0,0,0,0.75)] bg-muted/40 relative group/card"
          >
            <img
              src={cover}
              alt={current.title}
              className="w-full h-full object-cover transition-transform duration-500 group-hover/card:scale-105"
            />
            {/* Glossy sheen overlay & book spine crease for depth */}
            <div className="absolute inset-0 bg-gradient-to-tr from-black/25 via-transparent to-white/25 pointer-events-none" />
            <div className="absolute left-0 top-0 bottom-0 w-2 bg-gradient-to-r from-black/40 via-black/10 to-transparent pointer-events-none" />
          </div>
        )}

        {/* Text Details */}
        <div className="flex-1 min-w-0 max-w-2xl space-y-2.5 sm:space-y-3.5">
          {/* Premium Spotlight Badge */}
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center px-3 py-1 rounded-full bg-primary/15 text-primary border border-primary/30 text-[10px] sm:text-[11px] font-black tracking-wider uppercase backdrop-blur-md shadow-xs">
              Featured Spotlight
            </span>
            <span className="text-xs font-bold text-muted-foreground/80">
              #{currentIndex + 1} of {Math.min(items.length, 5)}
            </span>
          </div>

          {/* Title */}
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-foreground tracking-tight line-clamp-2 drop-shadow-sm">
            {current.title}
          </h1>

          {/* Subtitle / Author */}
          {current.subtitle && (
            <p className="text-sm md:text-base font-semibold text-foreground/80 line-clamp-1">
              {current.subtitle}
            </p>
          )}

          {/* Action Buttons */}
          <div className="pt-1.5 flex items-center gap-3">
            <Button
              size="default"
              className="rounded-xl font-bold gap-2 shadow-md shadow-primary/20 hover:scale-105 transition-all duration-200 cursor-pointer active:scale-95 bg-primary text-primary-foreground hover:bg-primary/90 px-5"
              onClick={() => onReadClick?.(current)}
            >
              <Download className="w-4 h-4" />
              {buttonLabel}
            </Button>
          </div>
        </div>

        {/* Carousel Navigation Controls */}
        {items.length > 1 && (
          <div className="absolute bottom-3 sm:bottom-4 right-4 sm:right-6 flex items-center gap-2 z-20">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setCurrentIndex((prev) => (prev - 1 + Math.min(items.length, 5)) % Math.min(items.length, 5));
              }}
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-card/85 hover:bg-card border border-border/50 backdrop-blur-md flex items-center justify-center text-foreground transition-all active:scale-90 shadow-xs cursor-pointer"
              aria-label="Previous featured book"
            >
              <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
            
            {/* Dots */}
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-card/60 backdrop-blur-md border border-border/40">
              {items.slice(0, 5).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setCurrentIndex(i)}
                  className={cn(
                    "h-1.5 rounded-full transition-all duration-300 cursor-pointer",
                    i === currentIndex ? "w-4 sm:w-5 bg-primary" : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60"
                  )}
                  aria-label={`Go to slide ${i + 1}`}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setCurrentIndex((prev) => (prev + 1) % Math.min(items.length, 5));
              }}
              className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-card/85 hover:bg-card border border-border/50 backdrop-blur-md flex items-center justify-center text-foreground transition-all active:scale-90 shadow-xs cursor-pointer"
              aria-label="Next featured book"
            >
              <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
