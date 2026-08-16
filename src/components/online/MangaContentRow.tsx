import { useRef, useCallback, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ModernBookCard } from './ModernBookCard';
import type { CarouselItem } from './ContentCarousel';
import { SkeletonGrid } from './SkeletonLoaders';

interface MangaContentRowProps {
  title: string;
  icon?: React.ReactNode;
  items: CarouselItem[];
  loading?: boolean;
  onItemClick?: (item: CarouselItem) => void;
  onViewAll?: () => void;
}

export function MangaContentRow({
  title,
  icon,
  items,
  loading = false,
  onItemClick,
  onViewAll,
}: MangaContentRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const updateButtons = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 10);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 10);
  }, []);

  const scroll = useCallback((dir: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.clientWidth * 0.75;
    el.scrollBy({ left: dir === 'left' ? -distance : distance, behavior: 'smooth' });
    setTimeout(updateButtons, 350);
  }, [updateButtons]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateButtons();
    el.addEventListener('scroll', updateButtons, { passive: true });
    window.addEventListener('resize', updateButtons);
    return () => {
      el.removeEventListener('scroll', updateButtons);
      window.removeEventListener('resize', updateButtons);
    };
  }, [updateButtons, items]);

  if (!loading && items.length === 0) return null;

  return (
    <div className="space-y-2.5 sm:space-y-3 mb-6 sm:mb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-2.5">
          {icon}
          <h2 className="text-base sm:text-lg md:text-xl font-extrabold tracking-tight text-foreground">{title}</h2>
        </div>

        <div className="flex items-center gap-2">
          {onViewAll && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onViewAll}
              className="text-xs sm:text-sm font-semibold gap-1 text-muted-foreground hover:text-foreground cursor-pointer px-2 sm:px-3 h-8"
            >
              View All <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          )}

          <div className="hidden sm:flex items-center gap-1 ml-1">
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0 rounded-full border-border/50 bg-card/60 backdrop-blur-sm cursor-pointer hover:bg-secondary"
              onClick={() => scroll('left')}
              disabled={!canScrollLeft}
              aria-label="Scroll left"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0 rounded-full border-border/50 bg-card/60 backdrop-blur-sm cursor-pointer hover:bg-secondary"
              onClick={() => scroll('right')}
              disabled={!canScrollRight}
              aria-label="Scroll right"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Horizontal Carousel */}
      {loading ? (
        <div className="flex gap-3 sm:gap-4 overflow-hidden py-1">
          <SkeletonGrid count={6} />
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="flex gap-3 sm:gap-4 overflow-x-auto custom-scrollbar-none scroll-smooth pb-2 pt-1 -mx-3 px-3 sm:-mx-1 sm:px-1"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {items.map((item) => (
            <div key={item.id} className="w-[125px] sm:w-[150px] md:w-[165px] lg:w-[175px] flex-shrink-0">
              <ModernBookCard
                id={item.id}
                title={item.title}
                coverUrl={item.coverUrl}
                author={item.subtitle}
                onClick={() => onItemClick?.(item)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
