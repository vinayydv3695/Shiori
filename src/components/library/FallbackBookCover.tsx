import React from 'react';
import { BookOpen, Rss, FileText, Layers, FileCode } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FallbackBookCoverProps {
  title: string;
  author?: string;
  format?: string;
  isRss?: boolean;
  dateSubtitle?: string;
  coverSize?: 'small' | 'medium' | 'large';
  className?: string;
}

export function FallbackBookCover({
  title,
  author,
  format = 'epub',
  isRss = false,
  dateSubtitle,
  coverSize = 'medium',
  className,
}: FallbackBookCoverProps) {
  const authorDisplay = author && author !== 'Unknown Author' ? author : (isRss ? 'Daily RSS Feed' : null);
  const fmt = (format || 'epub').toLowerCase();

  const FormatIcon = isRss 
    ? Rss 
    : fmt === 'pdf' 
      ? FileText 
      : ['cbz', 'cbr', 'zip', 'rar', 'online-manga'].includes(fmt) 
        ? Layers 
        : ['txt', 'docx', 'fb2', 'mobi', 'azw3'].includes(fmt) 
          ? FileCode 
          : BookOpen;

  return (
    <div 
      className={cn(
        "absolute inset-0 z-0 p-3 sm:p-4 pt-10 sm:pt-12 pb-3 sm:pb-4 flex flex-col items-center justify-center select-none overflow-hidden text-center bg-muted/20",
        className
      )}
    >
      <div className="flex flex-col items-center justify-center w-full px-2 my-auto">
        <FormatIcon 
          className={cn(
            "text-muted-foreground/40 stroke-[1.5] mb-2.5",
            coverSize === 'small' ? 'w-6 h-6' : 'w-8 h-8 sm:w-9 sm:h-9'
          )} 
        />

        <h3 className={cn(
          "font-medium text-foreground/90 leading-snug line-clamp-3 text-center tracking-tight",
          coverSize === 'small' ? 'text-[11px]' : coverSize === 'medium' ? 'text-xs sm:text-sm' : 'text-sm'
        )}>
          {title}
        </h3>

        {dateSubtitle && (
          <span className="text-[10px] text-primary/80 font-medium mt-1">
            {dateSubtitle}
          </span>
        )}

        {authorDisplay && (
          <p className={cn(
            "text-muted-foreground/60 font-normal truncate text-center w-full mt-1",
            coverSize === 'small' ? 'text-[9px]' : 'text-[11px]'
          )}>
            {authorDisplay}
          </p>
        )}
      </div>
    </div>
  );
}
