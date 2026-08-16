import { useState, useEffect, memo } from 'react';
import { BookOpen, User, Calendar, Download, Loader2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { isAndroid, getProxyUrl } from '@/lib/tauri';

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
    
    import('@/online-books/openlibrary/api').then(({ fetchCoverForBook }) => {
      fetchCoverForBook(title, author).then(fallbackUrl => {
        if (!active) return;
        if (fallbackUrl) {
          setProxyUrl(fallbackUrl);
          setImgError(false);
        }
      });
    });

    return () => { active = false; };
  }, [coverUrl, imgError, title, author]);

  return (
    <div 
      className={cn(
        "group relative flex flex-row gap-3 sm:gap-4 p-3 sm:p-4 rounded-2xl transition-all duration-300",
        "bg-card/60 hover:bg-card/90 border border-border/40 hover:border-primary/40",
        "shadow-sm hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-0.5",
        "backdrop-blur-xl overflow-hidden"
      )}
    >
      {/* Cover / Thumbnail */}
      <div 
        onClick={onViewDetails}
        className={cn(
          "relative shrink-0 rounded-xl overflow-hidden cursor-pointer",
          "aspect-[2/3] w-20 sm:w-28 md:w-32 shadow-md",
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
          <div className="w-full h-full p-2 flex flex-col justify-between text-center select-none bg-gradient-to-br from-primary/15 via-card to-secondary/30 text-foreground border border-border/40 shadow-inner relative overflow-hidden">
            <div className="text-[8px] sm:text-[9px] uppercase tracking-wider font-semibold text-primary/80 mb-0.5 border-b border-border/40 pb-0.5 truncate">
              {format || 'BOOK'}
            </div>
            
            <div className="flex-1 flex items-center justify-center py-0.5">
              <span className="font-serif font-bold text-[9px] sm:text-[10px] leading-snug line-clamp-3 tracking-tight drop-shadow-xs px-0.5">
                {title}
              </span>
            </div>
            
            {author && (
              <div className="text-[7px] sm:text-[8px] font-medium text-muted-foreground border-t border-border/40 pt-0.5 truncate max-w-full">
                {author}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col justify-between">
        <div>
          <h3 
            onClick={onViewDetails}
            className="font-semibold text-sm sm:text-base md:text-lg text-foreground line-clamp-2 leading-tight group-hover:text-primary transition-colors cursor-pointer"
          >
            {title}
          </h3>
          {author && (
            <div className="flex items-center gap-1.5 mt-1 text-xs sm:text-sm text-muted-foreground">
              <User className="w-3.5 h-3.5 shrink-0 hidden sm:inline" />
              <span className="line-clamp-1 font-medium">{author}</span>
            </div>
          )}

          {description && (
            <p className="text-xs text-muted-foreground line-clamp-2 mt-1.5 hidden sm:block">
              {description}
            </p>
          )}

          {/* Badges */}
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            {format && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-bold uppercase bg-primary/10 text-primary border border-primary/20">
                {format}
              </span>
            )}
            {fileSize && (
              <span className="text-[10px] sm:text-[11px] text-muted-foreground bg-muted/60 px-2 py-0.5 rounded">
                {fileSize}
              </span>
            )}
            {year && (
              <span className="flex items-center gap-1 text-[10px] sm:text-[11px] text-muted-foreground bg-muted/60 px-2 py-0.5 rounded">
                <Calendar className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                {year}
              </span>
            )}
            {language && (
              <span className="text-[10px] sm:text-[11px] uppercase text-muted-foreground bg-muted/60 px-2 py-0.5 rounded">
                {language}
              </span>
            )}
            {editionCount !== undefined && editionCount > 0 && (
              <span className="text-[10px] sm:text-[11px] text-muted-foreground bg-muted/60 px-2 py-0.5 rounded hidden sm:inline-block">
                {editionCount} {editionCount === 1 ? 'edition' : 'editions'}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end w-full mt-2 sm:mt-3 gap-1.5 sm:gap-2 flex-wrap">
          {onReadOnline && !isAndroid && (
            <Button size="sm" onClick={(e) => { e.stopPropagation(); onReadOnline(); }} className="gap-1 h-7 sm:h-8 text-[11px] sm:text-xs bg-primary/90 hover:bg-primary px-2.5 sm:px-3">
              <BookOpen className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span>Read Online</span>
            </Button>
          )}
          
          {onViewDetails && (
            <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); onViewDetails(); }} className="gap-1 h-7 sm:h-8 text-[11px] sm:text-xs border-border/50 hover:bg-accent px-2.5 sm:px-3">
              <Info className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span>Details</span>
            </Button>
          )}

          {onDownload && (
            <Button 
              variant={isAndroid ? "default" : "secondary"}
              size="sm" 
              onClick={(e) => { e.stopPropagation(); onDownload(); }}
              disabled={Boolean(isDownloading)}
              className={cn("gap-1 h-7 sm:h-8 text-[11px] sm:text-xs font-semibold px-2.5 sm:px-3.5", isAndroid && "bg-primary text-primary-foreground shadow-sm")}
            >
              {isDownloading ? (
                <Loader2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 animate-spin" />
              ) : (
                <Download className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              )}
              <span>
                {isDownloading ? (typeof isDownloading === 'string' ? isDownloading : 'Downloading...') : (isAndroid ? 'Download Now' : 'Download')}
              </span>
            </Button>
          )}

          {onTorbox && torboxAvailable && (
            <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); onTorbox(); }} className="gap-1 h-7 sm:h-8 text-[11px] sm:text-xs border-border/50 hover:bg-accent px-2.5 sm:px-3 hidden sm:inline-flex">
              <Download className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              Torbox
            </Button>
          )}
        </div>
      </div>
    </div>
  );
});
