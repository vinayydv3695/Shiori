import { useState, useEffect, useRef, memo } from 'react';
import { api } from '@/lib/tauri';
import { fetchCoverForBook } from '@/online-books/openlibrary/api';
import { BookOpen, User, Calendar, ExternalLink, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface OnlineResultCardProps {
  id: string;
  title: string;
  coverUrl?: string;
  author?: string;
  description?: string;
  format?: string;
  fileSize?: string;
  language?: string;
  year?: number;
  editionCount?: number;
  
  // Actions
  onReadOnline?: () => void;
  onViewDetails?: () => void;
  onDownload?: () => void;
  onTorbox?: () => void;
  
  // State
  isDownloading?: string | boolean;
  torboxAvailable?: boolean;
  
  // Animation/View
  scrollRoot?: HTMLElement | null;
}

export const OnlineResultCard = memo(function OnlineResultCard({
  title,
  coverUrl,
  author,
  description,
  format,
  fileSize,
  language,
  year,
  editionCount,
  onReadOnline,
  onViewDetails,
  onDownload,
  onTorbox,
  isDownloading,
  torboxAvailable,
  scrollRoot,
}: OnlineResultCardProps) {
  const [visible, setVisible] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [proxyUrl, setProxyUrl] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { root: scrollRoot ?? null, threshold: 0.05 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [scrollRoot]);

  useEffect(() => {
    if (!visible || !coverUrl || imgError) return;
    
    let active = true;
    let objectUrl: string | null = null;
    
    if (coverUrl.includes('libgen')) {
      api.proxyMangaImage('libgen', coverUrl)
        .then(arr => {
          if (!active) return;
          // libgen.li is known to return 0 byte images or HTML for covers if blocked
          if (arr.length < 100) throw new Error('Invalid or empty cover image');
          const u8arr = new Uint8Array(arr as unknown as Iterable<number>);
          const blob = new Blob([u8arr], { type: 'image/jpeg' });
          objectUrl = URL.createObjectURL(blob);
          setProxyUrl(objectUrl);
        })
        .catch(() => {
          if (!active) return;
          // Fallback to OpenLibrary
          fetchCoverForBook(title, author).then(fallbackUrl => {
            if (!active) return;
            if (fallbackUrl) {
              setProxyUrl(fallbackUrl);
            } else {
              setImgError(true);
            }
          });
        });
    } else {
      setProxyUrl(coverUrl);
    }
    
    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [visible, coverUrl, imgError]);

  return (
    <div
      ref={cardRef}
      className={cn(
        'group relative flex gap-4 p-4 rounded-xl border border-border bg-card/60 backdrop-blur-sm',
        'hover:bg-accent/40 hover:border-border/80 transition-all duration-300',
        'shadow-sm hover:shadow-md',
        !visible && 'opacity-0 translate-y-4',
        visible && 'animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-forwards'
      )}
    >
      {/* Cover */}
      <div className="w-24 h-36 sm:w-28 sm:h-40 flex-shrink-0 bg-muted/50 rounded-lg overflow-hidden relative shadow-sm border border-border/40">
        {!visible && <div className="absolute inset-0 shimmer" />}
        {visible && proxyUrl && !imgError && (
          <img
            src={proxyUrl}
            alt={title}
            className={cn(
              'w-full h-full object-cover transition-all duration-500',
              imgLoaded ? 'opacity-100 scale-100' : 'opacity-0 scale-105'
            )}
            loading="lazy"
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgError(true)}
          />
        )}
        {(!coverUrl || imgError) && visible && (
          <div className="w-full h-full p-2.5 flex flex-col justify-between text-center select-none bg-gradient-to-br from-indigo-950 via-slate-900 to-blue-950 text-slate-200 border border-indigo-500/20 shadow-inner relative overflow-hidden">
            {/* Elegant corner patterns or glows */}
            <div className="absolute top-0 right-0 w-12 h-12 bg-primary/20 rounded-full blur-xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-12 h-12 bg-violet-500/20 rounded-full blur-xl pointer-events-none" />
            
            <div className="text-[9px] uppercase tracking-wider font-semibold text-indigo-400/80 mb-1 border-b border-indigo-500/10 pb-0.5 truncate">
              {format || 'BOOK'}
            </div>
            
            <div className="flex-1 flex items-center justify-center py-1">
              <span className="font-serif font-bold text-[10px] leading-snug line-clamp-4 tracking-tight drop-shadow-sm px-0.5">
                {title}
              </span>
            </div>
            
            {author && (
              <div className="text-[8px] font-medium text-slate-400 border-t border-indigo-500/10 pt-1 truncate max-w-full">
                {author}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="mb-2">
          <h3 className="font-semibold text-base sm:text-lg text-foreground line-clamp-2 leading-tight group-hover:text-primary transition-colors">
            {title}
          </h3>
          {author && (
            <div className="flex items-center gap-1.5 mt-1.5 text-sm text-muted-foreground">
              <User className="w-3.5 h-3.5" />
              <span className="line-clamp-1">{author}</span>
            </div>
          )}
        </div>

        {description && (
          <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2 mb-3">
            {description}
          </p>
        )}

        {/* Badges */}
        <div className="flex flex-wrap items-center gap-2 mt-auto pb-3">
          {format && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-primary/10 text-primary border border-primary/20">
              {format}
            </span>
          )}
          {fileSize && (
            <span className="text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded">
              {fileSize}
            </span>
          )}
          {year && (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded">
              <Calendar className="w-3 h-3" />
              {year}
            </span>
          )}
          {language && (
            <span className="text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded">
              {language}
            </span>
          )}
          {editionCount !== undefined && editionCount > 0 && (
            <span className="text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded">
              {editionCount} {editionCount === 1 ? 'edition' : 'editions'}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          {onReadOnline && (
            <Button size="sm" onClick={onReadOnline} className="gap-1.5 h-8 text-xs bg-primary/90 hover:bg-primary">
              <BookOpen className="w-3.5 h-3.5" />
              Read Online
            </Button>
          )}
          
          {onViewDetails && (
            <Button variant="outline" size="sm" onClick={onViewDetails} className="gap-1.5 h-8 text-xs border-border/50 hover:bg-accent">
              <ExternalLink className="w-3.5 h-3.5" />
              Details
            </Button>
          )}

          {onDownload && (
            <Button
              variant={isDownloading ? "secondary" : "default"}
              size="sm"
              onClick={onDownload}
              disabled={!!isDownloading}
              className={cn("gap-1.5 h-8 text-xs", !isDownloading && "bg-primary/90 hover:bg-primary")}
            >
              {isDownloading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {typeof isDownloading === 'string' ? isDownloading : 'Downloading...'}
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  Download
                </>
              )}
            </Button>
          )}

          {torboxAvailable && onTorbox && !isDownloading && (
            <Button variant="outline" size="sm" onClick={onTorbox} className="gap-1.5 h-8 text-xs border-border/50 hover:bg-accent">
              <Download className="w-3.5 h-3.5" />
              Torbox
            </Button>
          )}
          
          {torboxAvailable === false && (
            <p className="text-[10px] text-muted-foreground/60 flex items-center ml-1">
              Torbox unavailable
            </p>
          )}
        </div>
      </div>
    </div>
  );
});
