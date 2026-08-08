import { useState, useEffect, memo } from 'react';
import { BookOpen, User, Calendar, Download, Loader2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getProxyUrl } from '@/lib/tauri';

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
}: OnlineResultCardProps) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [proxyUrl, setProxyUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!coverUrl || imgError) return;
    
    let active = true;
    const needsProxy = coverUrl.includes('libgen') || 
                       coverUrl.includes('annas-archive') || 
                       coverUrl.includes('toontop') || 
                       coverUrl.includes('toonily') || 
                       coverUrl.includes('manhwaread') || 
                       coverUrl.includes('toongod') || 
                       coverUrl.includes('weebrook') || 
                       coverUrl.includes('manhwahub') || 
                       coverUrl.includes('mangafire');

    if (needsProxy) {
      let sourceId = 'generic';
      if (coverUrl.includes('libgen')) sourceId = 'libgen';
      else if (coverUrl.includes('annas-archive')) sourceId = 'annas-archive';
      else if (coverUrl.includes('toontop')) sourceId = 'toontop';
      else if (coverUrl.includes('toonily')) sourceId = 'toonily';
      else if (coverUrl.includes('manhwaread')) sourceId = 'manhwaread';
      else if (coverUrl.includes('toongod')) sourceId = 'toongod';
      else if (coverUrl.includes('weebrook')) sourceId = 'weebrook';
      else if (coverUrl.includes('manhwahub')) sourceId = 'manhwahub';
      else if (coverUrl.includes('mangafire')) sourceId = 'mangafire';

      const proxyUri = getProxyUrl(sourceId, coverUrl);
      setProxyUrl(proxyUri);
    } else {
      setProxyUrl(coverUrl);
    }
    
    return () => {
      active = false;
      if (proxyUrl && proxyUrl.startsWith('blob:')) {
        URL.revokeObjectURL(proxyUrl);
      }
    };
  }, [coverUrl, imgError]);

  useEffect(() => {
    if (!coverUrl || !imgError) return;
    let active = true;
    
    // If the primary image errors out (e.g., shiori-proxy fails), try the fallback
    import('@/online-books/openlibrary/api').then(({ fetchCoverForBook }) => {
      fetchCoverForBook(title, author).then(fallbackUrl => {
        if (!active) return;
        if (fallbackUrl) {
          setProxyUrl(fallbackUrl);
          setImgError(false); // allow the img tag to try rendering again
        }
      });
    });

    return () => { active = false; };
  }, [coverUrl, imgError, title, author]);


  return (
    <div 
      className={cn(
        "group relative flex flex-col md:flex-row gap-4 p-3.5 sm:p-4 rounded-2xl transition-all duration-300",
        "bg-card/40 hover:bg-card/70 border border-border/40 hover:border-primary/40",
        "shadow-sm hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-0.5",
        "backdrop-blur-xl overflow-hidden"
      )}
    >
      {/* Cover / Thumbnail */}
      <div 
        onClick={onViewDetails}
        className={cn(
          "relative shrink-0 rounded-xl overflow-hidden cursor-pointer",
          "aspect-[2/3] w-full md:w-28 lg:w-32 shadow-md",
          "border border-border/40 group-hover:border-primary/30 transition-all duration-300",
          "bg-secondary/40"
        )}
      >
        {proxyUrl && !imgError && (
          <>
            {!imgLoaded && (
              <div className="absolute inset-0 bg-muted/40 animate-pulse" />
            )}
            <img 
              src={proxyUrl} 
              alt={title}
              className={cn(
                'w-full h-full object-cover transition-all duration-500 relative z-10',
                imgLoaded ? 'opacity-100 scale-100' : 'opacity-0 scale-105'
              )}
              loading="lazy"
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgError(true)}
            />
          </>
        )}
        {(!coverUrl || imgError) && (
          <div className="w-full h-full p-2.5 flex flex-col justify-between text-center select-none bg-gradient-to-br from-primary/15 via-card to-secondary/30 text-foreground border border-border/40 shadow-inner relative overflow-hidden">
            {/* Elegant ambient glow */}
            <div className="absolute top-0 right-0 w-12 h-12 bg-primary/20 rounded-full blur-xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-12 h-12 bg-primary/10 rounded-full blur-xl pointer-events-none" />
            
            <div className="text-[9px] uppercase tracking-wider font-semibold text-primary/80 mb-1 border-b border-border/40 pb-0.5 truncate">
              {format || 'BOOK'}
            </div>
            
            <div className="flex-1 flex items-center justify-center py-1">
              <span className="font-serif font-bold text-[10px] leading-snug line-clamp-4 tracking-tight drop-shadow-xs px-0.5">
                {title}
              </span>
            </div>
            
            {author && (
              <div className="text-[8px] font-medium text-muted-foreground border-t border-border/40 pt-1 truncate max-w-full">
                {author}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className={cn(
        "flex-1 min-w-0 flex flex-col",
        "max-md:absolute max-md:bottom-0 max-md:left-0 max-md:right-0 max-md:bg-background/60 max-md:backdrop-blur-md max-md:border-t max-md:border-white/10 max-md:p-2 max-md:z-10"
      )}>
        <div className="mb-2 max-md:mb-0">
          <h3 className="font-semibold text-base sm:text-lg text-foreground max-md:text-[14px] max-md:leading-tight line-clamp-2 leading-tight group-hover:text-primary transition-colors max-md:text-foreground/95">
            {title}
          </h3>
          {author && (
            <div className="flex items-center gap-1.5 mt-1.5 text-sm text-muted-foreground">
              <User className="w-3.5 h-3.5 max-md:hidden" />
              <span className="line-clamp-1 max-md:text-[11px] max-md:font-medium">{author}</span>
            </div>
          )}
        </div>

        {description && (
          <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2 mb-3 max-md:hidden">
            {description}
          </p>
        )}

        {/* Badges */}
        <div className="flex flex-wrap items-center gap-2 mt-auto pb-3 max-md:hidden">
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
        <div className="flex items-center justify-end w-full sm:w-auto mt-auto gap-2 p-1.5 bg-background/50 backdrop-blur-sm rounded-lg border border-border/40 shadow-sm self-end max-md:hidden">
          {onReadOnline && (
            <Button size="sm" onClick={(e) => { e.stopPropagation(); onReadOnline(); }} className="gap-1.5 h-8 text-xs bg-primary/90 hover:bg-primary">
              <BookOpen className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Read Online</span>
              <span className="sm:hidden">Read</span>
            </Button>
          )}
          
          {onViewDetails && (
            <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); onViewDetails(); }} className="gap-1.5 h-8 text-xs border-border/50 hover:bg-accent">
              <Info className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Details</span>
              <span className="sm:hidden">Info</span>
            </Button>
          )}

          {onDownload && (
            <Button 
              variant="secondary" 
              size="sm" 
              onClick={(e) => { e.stopPropagation(); onDownload(); }}
              disabled={Boolean(isDownloading)}
              className="gap-1.5 h-8 text-xs font-medium"
            >
              {isDownloading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">
                {isDownloading ? (typeof isDownloading === 'string' ? isDownloading : 'Downloading...') : 'Download'}
              </span>
            </Button>
          )}

          {onTorbox && torboxAvailable && (
            <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); onTorbox(); }} className="gap-1.5 h-8 text-xs border-border/50 hover:bg-accent">
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
