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
      className={cn("group relative cursor-pointer w-full aspect-[2/3] overflow-hidden rounded-xl bg-secondary/20 shadow-md transition-all duration-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.4)] hover:-translate-y-1 border border-border/50", className)}
      onClick={onClick}
    >
      <img
        src={coverUrl}
        alt={title}
        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        loading="lazy"
      />
      
      {/* Overlay Gradients */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-80 transition-opacity duration-300 group-hover:opacity-100" />
      
      {/* Play/Read Icon on Hover */}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100">
         <PlayCircle className="w-12 h-12 text-white/90 drop-shadow-lg" />
      </div>

      {/* Top Badges (Score & Format) */}
      <div className="absolute top-2 left-2 right-2 flex justify-between items-start pointer-events-none z-10">
        {score && score > 0 ? (
          <div className="flex items-center gap-1 bg-black/60 backdrop-blur-md text-white text-[11px] font-bold px-1.5 py-0.5 rounded shadow-sm border border-white/10">
            <Star className="w-3 h-3 fill-yellow-500 text-yellow-500" />
            {score % 10 === 0 ? score / 10 : score}
          </div>
        ) : <div />}
        
        {format && (
          <div className="bg-black/60 backdrop-blur-md text-white/90 text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm uppercase tracking-wider border border-white/10">
            {format}
          </div>
        )}
      </div>

      {/* Title & Progress Area */}
      <div className="absolute bottom-0 left-0 right-0 p-3 z-10 flex flex-col gap-1.5">
        <h3 
          className="font-bold text-sm leading-tight text-white line-clamp-2 drop-shadow-sm group-hover:text-primary transition-colors"
          title={title}
        >
          {title}
        </h3>
        
        {progress !== undefined && (
          <div className="pointer-events-none flex items-center">
             <div className={cn(
               "text-[10px] font-bold px-2 py-0.5 rounded shadow-sm border border-white/10 flex items-center gap-1",
               isReading ? "bg-primary text-primary-foreground" : "bg-black/60 backdrop-blur-md text-white"
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
