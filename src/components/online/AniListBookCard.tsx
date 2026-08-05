import React from 'react';
import { PlayCircle, Star, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AniListBookCardProps {
  id: string | number;
  title: string;
  coverUrl: string;
  format?: string;
  score?: number;
  progress?: number;
  total?: number;
  status?: string;
  onClick: () => void;
  className?: string;
}

export function AniListBookCard({
  title,
  coverUrl,
  format,
  score,
  progress,
  total,
  status,
  onClick,
  className
}: AniListBookCardProps) {
  // Determine if it's currently being read
  const isReading = status === 'CURRENT' || status === 'Reading';

  return (
    <div 
      className={cn(
        "group relative cursor-pointer w-full aspect-[2/3] overflow-hidden rounded-xl max-md:rounded-ui-xl bg-card/90 shadow-lg transition-all duration-400 ease-out hover:shadow-[0_12px_32px_rgba(0,0,0,0.5)] hover:-translate-y-1.5 border border-border/50 hover:border-primary/40 select-none",
        className
      )}
      onClick={onClick}
    >
      <img
        src={coverUrl}
        alt={title}
        className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
        loading="lazy"
      />
      
      {/* 3D Book Spine Shadow */}
      <div className="absolute top-0 bottom-0 left-0 w-2.5 bg-gradient-to-r from-black/40 via-black/10 to-transparent z-20 pointer-events-none rounded-l-[inherit]" />

      {/* Premium Inner Sheen / Glare */}
      <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/0 to-white/25 pointer-events-none mix-blend-overlay opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-10" />

      {/* Overlay Gradients */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent opacity-85 transition-opacity duration-300 group-hover:opacity-100 z-10" />

      {/* Top Badges (Score & Format) */}
      <div className="absolute top-2.5 left-2.5 right-2.5 flex justify-between items-start pointer-events-none z-20">
        {score && score > 0 ? (
          <div className="flex items-center gap-1 bg-black/75 backdrop-blur-md text-white text-[11px] font-extrabold px-2 py-0.5 rounded-full shadow-md border border-white/20">
            <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
            {score}
          </div>
        ) : <div />}
        
        {format && (
          <div className="bg-black/75 backdrop-blur-md text-white/90 text-[10px] font-extrabold px-2 py-0.5 rounded-full shadow-md uppercase tracking-wider border border-white/20">
            {format}
          </div>
        )}
      </div>

      {/* Title & Progress Area */}
      <div className="absolute bottom-0 left-0 right-0 p-3 z-20 flex flex-col gap-1">
        <h3 
          className="font-bold text-xs sm:text-sm leading-snug text-white line-clamp-2 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] group-hover:text-primary transition-colors"
          title={title}
        >
          {title}
        </h3>
        
        {progress !== undefined && (
          <div className="pointer-events-none flex items-center mt-0.5">
             <div className={cn(
               "text-[10px] font-extrabold px-2 py-0.5 rounded-full shadow-md border flex items-center gap-1",
               isReading
                 ? "bg-primary text-primary-foreground border-primary/40 shadow-primary/20"
                 : "bg-black/75 backdrop-blur-md text-white/90 border-white/20"
             )}>
               <BookOpen className="w-3 h-3 opacity-90" />
               <span>{progress}{total ? ` / ${total}` : ''}</span>
             </div>
          </div>
        )}
      </div>
    </div>
  );
}
