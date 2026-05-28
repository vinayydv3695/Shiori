import { Skeleton } from '@/components/ui/skeleton';
import { BookOpen, Trophy } from 'lucide-react';
import type { CarouselItem } from './ContentCarousel';
import { cn } from '@/lib/utils';

interface MangaRankListProps {
  title: string;
  items: CarouselItem[];
  loading?: boolean;
  onItemClick?: (item: CarouselItem) => void;
  className?: string;
  icon?: React.ReactNode;
}

export function MangaRankList({ title, items, loading, onItemClick, className, icon = <Trophy className="w-5 h-5 text-yellow-500" /> }: MangaRankListProps) {
  if (loading) {
    return (
      <div className={cn("space-y-4", className)}>
        <div className="flex items-center gap-2 px-1">
          {icon}
          <h2 className="text-lg font-bold text-foreground">{title}</h2>
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="w-12 h-16 rounded-md" />
              <div className="flex-1 space-y-2 py-1">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (items.length === 0) return null;

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center gap-2 px-1">
        {icon}
        <h2 className="text-lg font-bold text-foreground">{title}</h2>
      </div>
      
      <div className="space-y-3">
        {items.slice(0, 10).map((item, index) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onItemClick?.(item)}
            className="w-full flex items-center gap-4 p-2 rounded-lg hover:bg-accent/50 transition-colors text-left group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {/* Rank Number */}
            <div className={cn(
              "w-6 text-center font-black text-xl flex-shrink-0 transition-colors",
              index === 0 ? "text-yellow-500 drop-shadow-sm" : 
              index === 1 ? "text-slate-400" :
              index === 2 ? "text-amber-700" :
              "text-muted-foreground/40 group-hover:text-muted-foreground"
            )}>
              {index + 1}
            </div>

            {/* Thumbnail */}
            <div className="relative w-12 h-16 rounded overflow-hidden bg-muted flex-shrink-0 border border-border group-hover:border-primary/50 transition-colors">
              {item.coverUrl ? (
                <img
                  src={item.coverUrl}
                  alt={item.title}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <BookOpen className="w-4 h-4 text-muted-foreground opacity-50" />
                </div>
              )}
            </div>

            {/* Details */}
            <div className="flex-1 min-w-0 py-1">
              <h3 className="font-semibold text-sm line-clamp-1 text-foreground group-hover:text-primary transition-colors">
                {item.title}
              </h3>
              {item.subtitle && (
                <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                  {item.subtitle}
                </p>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
