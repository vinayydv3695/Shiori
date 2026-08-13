import { useState, useEffect, memo } from 'react';
import { CheckCircle2, AlertCircle, BookOpen } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useOnlineDownloadStore } from '@/store/onlineDownloadStore';
import { isAndroid, getProxyUrl } from '@/lib/tauri';

interface ModernBookCardProps {
  id: string; // The URL or unique ID for the book
  title: string;
  coverUrl?: string;
  author?: string;
  format?: string;
  year?: number;
  onClick?: () => void;
  scrollRoot?: HTMLElement | null;
}

export const ModernBookCard = memo(function ModernBookCard({
  id,
  title,
  coverUrl,
  author,
  format,
  year,
  onClick,
}: ModernBookCardProps) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [proxyUrl, setProxyUrl] = useState<string | null>(null);
  
  const downloadState = useOnlineDownloadStore((state) => state.downloads[id]);

  useEffect(() => {
    if (!coverUrl || imgError) return;
    let active = true;
    const objectUrl: string | null = null;
    
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
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [coverUrl, imgError, title, author]);
  const [fallbackAttempted, setFallbackAttempted] = useState(false);

  useEffect(() => {
    if (fallbackAttempted) return;
    if (coverUrl && !imgError) return;
    let active = true;
    
    setFallbackAttempted(true);

    import('@/online-books/openlibrary/api').then(({ fetchCoverForBook }) => {
      fetchCoverForBook(title, author).then(fallbackUrl => {
        if (!active) return;
        if (fallbackUrl) {
          const proxyUri = isAndroid 
            ? `http://shiori-proxy.localhost?source=generic&url=${encodeURIComponent(fallbackUrl)}`
            : fallbackUrl;
          setProxyUrl(proxyUri);
          setImgError(false);
        }
      });
    });

    return () => { active = false; };
  }, [coverUrl, imgError, title, author, fallbackAttempted]);

  const progressPercent = downloadState?.total_bytes && downloadState.total_bytes > 0 
    ? Math.min(100, Math.round((downloadState.downloaded_bytes / downloadState.total_bytes) * 100))
    : null;

  return (
    <motion.div 
      onClick={onClick}
      whileHover={{ y: -5, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "group relative flex flex-col h-full rounded-2xl overflow-hidden cursor-pointer",
        "bg-card/90 shadow-sm transition-all duration-300",
        "hover:shadow-xl hover:shadow-primary/10 border border-border/50 hover:border-primary/40",
      )}
    >
      {/* Cover Container with Aspect Ratio */}
      <div className="relative w-full aspect-[2/3] overflow-hidden bg-muted/30">
        
        {/* Image Container */}
        {(!imgLoaded && !imgError) && (
          <div className="absolute inset-0 bg-muted animate-pulse" />
        )}
        
        {proxyUrl && !imgError ? (
          <img
            src={proxyUrl}
            alt={title}
            className={cn(
              "w-full h-full object-cover transition-all duration-500",
              imgLoaded ? "opacity-100 scale-100" : "opacity-0 scale-105",
              "group-hover:scale-108"
            )}
            loading="lazy"
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex flex-col justify-center items-center p-4 bg-gradient-to-br from-primary/15 via-card to-secondary/30 text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-primary/20 rounded-full blur-2xl pointer-events-none" />
            <div className="text-[10px] font-bold text-primary/90 mb-2 uppercase tracking-wider">{format || 'BOOK'}</div>
            <div className="font-serif font-bold text-sm text-foreground line-clamp-4 leading-snug">{title}</div>
            {author && <div className="text-xs text-muted-foreground mt-2 line-clamp-2">{author}</div>}
          </div>
        )}

        {/* Top Badges (Format / Year) */}
        {(format || year) && (
          <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between pointer-events-none z-10">
            {format ? (
              <span className="px-2 py-0.5 rounded-full bg-background/85 backdrop-blur-md border border-border/60 text-[9px] font-extrabold uppercase text-foreground tracking-wider shadow-xs">
                {format}
              </span>
            ) : <span />}
            {year && (
              <span className="px-2 py-0.5 rounded-full bg-background/85 backdrop-blur-md border border-border/60 text-[9px] font-bold text-muted-foreground shadow-xs">
                {year}
              </span>
            )}
          </div>
        )}

        {/* Hover Action Highlight */}
        <div className="absolute inset-0 bg-primary/15 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center backdrop-blur-[2px] z-20 pointer-events-none">
          <div className="w-11 h-11 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-xl shadow-primary/30 transform scale-75 group-hover:scale-100 transition-all duration-300">
            <BookOpen className="w-5 h-5" />
          </div>
        </div>

        {/* Download Progress Overlay */}
        {downloadState && (
          <div className="absolute inset-0 bg-background/90 backdrop-blur-md flex flex-col items-center justify-center z-30 animate-in fade-in">
            {downloadState.status === 'downloading' && (
              <>
                <div className="relative w-14 h-14 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                    <path
                      className="text-muted/40"
                      strokeWidth="3"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    {progressPercent !== null && (
                      <path
                        className="text-primary transition-all duration-300 ease-out"
                        strokeDasharray={`${progressPercent}, 100`}
                        strokeWidth="3"
                        strokeLinecap="round"
                        stroke="currentColor"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                    )}
                  </svg>
                  <div className="absolute text-foreground text-xs font-bold">
                    {progressPercent !== null ? `${progressPercent}%` : '...'}
                  </div>
                </div>
                <span className="text-foreground text-xs font-bold mt-2 animate-pulse">Downloading</span>
              </>
            )}
            
            {downloadState.status === 'completed' && (
              <div className="flex flex-col items-center animate-in zoom-in">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mb-1.5" />
                <span className="text-foreground text-xs font-extrabold">Ready in Library</span>
              </div>
            )}
            
            {downloadState.status === 'error' && (
              <div className="flex flex-col items-center animate-in zoom-in">
                <AlertCircle className="w-10 h-10 text-destructive mb-1.5" />
                <span className="text-destructive text-xs font-bold">Download Failed</span>
              </div>
            )}
          </div>
        )}

        {/* ── Info Strip (Vignette Style) ── */}
        <div className={cn(
          'absolute bottom-0 left-0 right-0 z-10',
          'flex flex-col justify-end gap-0.5',
          'bg-gradient-to-t from-black/90 via-black/50 to-transparent',
          'px-3 pt-10 pb-2.5 text-white'
        )}>
          <h3 className="font-bold leading-snug line-clamp-2 text-white text-[13px] drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
            {title}
          </h3>
          {author && author !== 'Unknown Author' && (
            <p className="truncate text-white/80 font-medium text-[11px] mt-0.5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
              {author}
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
});
