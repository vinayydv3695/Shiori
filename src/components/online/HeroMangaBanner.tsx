import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { IconBookOpen } from '@/components/icons/ShioriIcons';
import type { CarouselItem } from './ContentCarousel';
import { getProxyUrl, isAndroid } from '@/lib/tauri';
import { cn } from '@/lib/utils';

interface HeroMangaBannerProps {
  items: CarouselItem[];
  loading?: boolean;
  onReadClick?: (item: CarouselItem) => void;
  sourceId?: string;
  actionLabel?: string;
}

export function HeroMangaBanner({
  items,
  loading,
  onReadClick,
  sourceId = 'generic',
  actionLabel,
}: HeroMangaBannerProps) {
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
  const cover = current?.coverUrl ? getProxyUrl(sourceId, current.coverUrl) : null;

  const defaultButtonLabel = (isAndroid || sourceId === 'generic') ? 'Download Now' : 'Read Now';
  const buttonLabel = actionLabel || defaultButtonLabel;
  const isDownloadAction = buttonLabel.toLowerCase().includes('download');

  return (
    <div className="relative w-full h-[240px] sm:h-[300px] md:h-[360px] rounded-2xl sm:rounded-3xl overflow-hidden group border border-border/60 bg-card shadow-lg backdrop-blur-xl mb-6 sm:mb-8 select-none">
      {/* Visible Manga Cover Backdrop on the right & center */}
      {cover && (
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
          {/* Main visible artwork spanning right side */}
          <div className="absolute right-0 top-0 bottom-0 w-full sm:w-[75%] md:w-[65%] lg:w-[55%] h-full">
            <img
              src={cover}
              alt=""
              className="w-full h-full object-cover object-top opacity-70 dark:opacity-60 transition-all duration-700 group-hover:scale-105"
            />
          </div>

          {/* Smooth multi-stop gradient masks for clean text contrast */}
          <div className="absolute inset-0 bg-gradient-to-r from-card via-card/85 sm:via-card/75 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/40 to-transparent opacity-90" />
          <div className="absolute inset-0 bg-gradient-to-b from-card/30 via-transparent to-card/60" />
        </div>
      )}

      {/* Main Content Area */}
      <div className="relative z-10 h-full p-6 sm:p-8 md:p-10 flex items-center gap-6 md:gap-10">
        {/* Foreground Cover Card */}
        {cover && (
          <div className="hidden sm:block flex-shrink-0 w-36 md:w-44 aspect-[2/3] rounded-2xl overflow-hidden shadow-2xl border border-border/60 group-hover:scale-[1.02] transition-transform duration-500 bg-muted/40 relative">
            <img
              src={cover}
              alt={current.title}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Text Details */}
        <div className="flex-1 min-w-0 max-w-2xl space-y-3 md:space-y-4">
          {/* Premium Spotlight Badge */}
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/25 text-[11px] font-extrabold tracking-wider uppercase backdrop-blur-md shadow-xs">
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
          <div className="pt-1 sm:pt-2 flex items-center gap-3">
            <Button
              size="lg"
              className="h-10 sm:h-11 px-5 sm:px-6 rounded-xl font-bold gap-2 shadow-md shadow-primary/20 hover:scale-105 transition-all duration-200 cursor-pointer active:scale-95 bg-primary text-primary-foreground hover:bg-primary/90 text-xs sm:text-sm"
              onClick={() => onReadClick?.(current)}
            >
              {isDownloadAction ? <Download size={17} /> : <IconBookOpen size={17} />}
              {buttonLabel}
            </Button>
          </div>
        </div>

        {/* Carousel Navigation Controls */}
        {items.length > 1 && (
          <div className="absolute bottom-4 right-6 flex items-center gap-2 z-20">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setCurrentIndex((prev) => (prev - 1 + Math.min(items.length, 5)) % Math.min(items.length, 5));
              }}
              className="w-8 h-8 rounded-full bg-card/85 hover:bg-card border border-border/50 backdrop-blur-md flex items-center justify-center text-foreground transition-all active:scale-90 shadow-xs cursor-pointer"
              aria-label="Previous featured manga"
            >
              <ChevronLeft className="w-4 h-4" />
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
                    i === currentIndex ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60"
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
              className="w-8 h-8 rounded-full bg-card/85 hover:bg-card border border-border/50 backdrop-blur-md flex items-center justify-center text-foreground transition-all active:scale-90 shadow-xs cursor-pointer"
              aria-label="Next featured manga"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
