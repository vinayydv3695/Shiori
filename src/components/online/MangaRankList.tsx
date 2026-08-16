import { Skeleton } from '@/components/ui/skeleton';
import { BookOpen, Trophy, Flame } from 'lucide-react';
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

export function MangaRankList({ 
  title, 
  items, 
  loading, 
  onItemClick, 
  className, 
  sourceId, 
  icon = <Trophy className="w-5 h-5 text-amber-500" /> 
}: MangaRankListProps) {
  if (loading) {
    return (
      <div className={cn("bg-card/70 backdrop-blur-xl rounded-3xl border border-border/50 p-4 shadow-sm space-y-3", className)}>
        <div className="flex items-center justify-between px-1 pb-2 border-b border-border/40">
          <div className="flex items-center gap-2.5">
            {icon}
            <h2 className="text-base font-extrabold text-foreground">{title}</h2>
          </div>
          <span className="text-xs font-bold text-muted-foreground/70 bg-secondary/70 px-2.5 py-1 rounded-full border border-border/40">
            Top 10
          </span>
        </div>
        <div className="space-y-2">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="flex items-center gap-3 p-2 rounded-2xl bg-muted/20">
              <Skeleton className="w-6 h-5 rounded shrink-0" />
              <Skeleton className="w-12 h-16 rounded-xl shrink-0" />
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
    <div className={cn("bg-card/70 backdrop-blur-xl rounded-3xl border border-border/50 p-4 shadow-sm", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-1 pb-3 mb-2 border-b border-border/40">
        <div className="flex items-center gap-2.5">
          {icon}
          <h2 className="text-base font-extrabold tracking-tight text-foreground">{title}</h2>
        </div>
        <span className="text-xs font-bold text-muted-foreground/80 bg-secondary/80 px-2.5 py-1 rounded-full border border-border/40 flex items-center gap-1">
          <Flame className="w-3 h-3 text-amber-500" />
          Top 10
        </span>
      </div>
      
      {/* List items */}
      <div className="space-y-1.5">
        {items.slice(0, 10).map((item, index) => {
          const rankNum = (index + 1).toString().padStart(2, '0');
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onItemClick?.(item)}
              className="w-full flex items-center gap-3 p-2 px-2.5 rounded-2xl hover:bg-secondary/80 border border-transparent hover:border-border/50 shadow-none hover:shadow-xs transition-all duration-200 text-left group focus:outline-none cursor-pointer active:scale-[0.99]"
            >
              {/* Typographic Rank Number */}
              <span className={cn(
                "w-7 text-center font-mono font-black text-sm sm:text-base shrink-0 select-none",
                index === 0 ? "text-amber-500 dark:text-amber-400 text-lg" :
                index === 1 ? "text-slate-400 dark:text-slate-300 text-base" :
                index === 2 ? "text-amber-700 dark:text-amber-500 text-base" :
                "text-muted-foreground/50 text-xs font-bold"
              )}>
                {rankNum}
              </span>

              {/* Thumbnail */}
              <div className="w-11 h-15 bg-muted/40 rounded-xl overflow-hidden shrink-0 border border-border/40 relative shadow-xs">
                {item.coverUrl ? (
                  <img
                    src={getProxyUrl(sourceId, item.coverUrl)}
                    alt={item.title}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-108"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <BookOpen className="w-4 h-4 text-muted-foreground opacity-40" />
                  </div>
                )}
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0 py-0.5">
                <h3 className="font-bold text-xs sm:text-sm leading-snug line-clamp-1 text-foreground group-hover:text-primary transition-colors">
                  {item.title}
                </h3>
                {item.subtitle && (
                  <p className="text-[11px] font-medium text-muted-foreground line-clamp-1 mt-1 opacity-80">
                    {item.subtitle}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
