import { useRef, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface CarouselItem {
  id: string;
  title: string;
  coverUrl?: string;
  subtitle?: string;
}

interface ContentCarouselProps {
  title: string;
  items: CarouselItem[];
  loading?: boolean;
  onItemClick?: (item: CarouselItem) => void;
  className?: string;
}

export function ContentCarousel({
  title,
  items,
  loading = false,
  onItemClick,
  className,
}: ContentCarouselProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const updateScrollButtons = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollLeft, scrollWidth, clientWidth } = container;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 10);
  }, []);

  const scroll = useCallback((direction: 'left' | 'right') => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const scrollAmount = container.clientWidth * 0.8;
    const newScrollLeft = direction === 'left'
      ? container.scrollLeft - scrollAmount
      : container.scrollLeft + scrollAmount;

    container.scrollTo({
      left: newScrollLeft,
      behavior: 'smooth',
    });

    // Update buttons after animation
    setTimeout(updateScrollButtons, 350);
  }, [updateScrollButtons]);

  const handleScroll = useCallback(() => {
    updateScrollButtons();
  }, [updateScrollButtons]);

  // Loading skeleton
  if (loading) {
    return (
      <div className={cn('space-y-3', className)}>
        <div className="flex items-center justify-between px-1">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        </div>
        <div className="flex gap-3 overflow-hidden">
          {['a', 'b', 'c', 'd', 'e', 'f'].map((key) => (
            <div key={`skeleton-${title}-${key}`} className="flex-shrink-0 w-[140px]">
              <Skeleton className="w-full aspect-[2/3] rounded-lg" />
              <Skeleton className="h-4 w-3/4 mt-2" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return null;
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Header with title and navigation */}
      <div className="flex items-center justify-between px-1">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => scroll('left')}
            disabled={!canScrollLeft}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => scroll('right')}
            disabled={!canScrollRight}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="relative group">
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex gap-3 overflow-x-auto scrollbar-hide pb-2 scroll-smooth"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onItemClick?.(item)}
              className="flex-shrink-0 w-[140px] text-left group/item focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg"
            >
              {/* Cover image */}
              <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-muted border border-border group-hover/item:border-primary/50 transition-colors">
                {item.coverUrl ? (
                  <img
                    src={item.coverUrl}
                    alt={item.title}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover/item:scale-105"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <BookOpen className="w-8 h-8 text-muted-foreground opacity-50" />
                  </div>
                )}
                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/0 group-hover/item:bg-black/20 transition-colors" />
              </div>

              {/* Title */}
              <div className="mt-2 space-y-0.5">
                <h3 className="text-sm font-medium line-clamp-2 text-foreground group-hover/item:text-primary transition-colors">
                  {item.title}
                </h3>
                {item.subtitle && (
                  <p className="text-xs text-muted-foreground line-clamp-1">
                    {item.subtitle}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
