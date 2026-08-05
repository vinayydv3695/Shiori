import { Skeleton } from '@/components/ui/skeleton';
import { BookOpen, Trophy } from 'lucide-react';
import type { CarouselItem } from './ContentCarousel';
import { cn } from '@/lib/utils';
import { getProxyUrl } from '@/lib/tauri';

interface MangaRankListProps {
  title: string;
  items: CarouselItem[];
  loading?: boolean;
  onItemClick?: (item: CarouselItem) => void;
  className?: string;
  icon?: React.ReactNode;
  sourceId: string;
}

export function MangaRankList({ title, items, loading, onItemClick, className, sourceId, icon = <Trophy className="w-5 h-5 text-yellow-500" /> }: MangaRankListProps) {
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
        <h2 className="text-base md:text-lg font-extrabold tracking-tight text-foreground">{title}</h2>
      </div>
      
      <div className="space-y-2.5">
        {items.slice(0, 10).map((item, index) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onItemClick?.(item)}
            className="w-full flex items-center gap-3.5 p-2.5 rounded-2xl bg-secondary/20 hover:bg-secondary/60 border border-border/40 hover:border-primary/30 shadow-sm hover:shadow-md transition-all duration-200 text-left group focus:outline-none hover:scale-[1.02]"
          >
            {/* Rank Badge */}
            <div className={cn(
              "w-8 h-8 rounded-xl flex items-center justify-center font-extrabold text-xs shrink-0 transition-transform duration-300 group-hover:scale-110 shadow-sm",
              index === 0 ? "bg-amber-500/20 border border-amber-500/40 text-amber-400 shadow-amber-500/10 text-sm" : 
              index === 1 ? "bg-slate-300/20 border border-slate-300/40 text-slate-300 text-sm" :
              index === 2 ? "bg-orange-500/20 border border-orange-500/40 text-orange-400 text-sm" :
              "bg-secondary/60 text-muted-foreground/80 border border-border/40"
            )}>
              {index + 1}
            </div>

            {/* Thumbnail */}
            <div className="w-12 h-16 bg-secondary/40 rounded-xl overflow-hidden shrink-0 border border-border/40 relative shadow-sm">
              {item.coverUrl ? (
                <img
                  src={getProxyUrl(sourceId, item.coverUrl)}
                  alt={item.title}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <BookOpen className="w-4 h-4 text-muted-foreground opacity-50" />
                </div>
              )}
            </div>

            {/* Details */}
            <div className="flex-1 min-w-0 py-0.5">
              <h3 className="font-bold text-xs sm:text-sm line-clamp-1 text-foreground group-hover:text-primary transition-colors">
                {item.title}
              </h3>
              {item.subtitle && (
                <p className="text-[11px] font-semibold text-muted-foreground line-clamp-1 mt-0.5 opacity-80">
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
