import { useState, useEffect, useRef, memo } from 'react';
import { Download, CheckCircle2, AlertCircle, BookOpen } from 'lucide-react';
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
  scrollRoot,
}: ModernBookCardProps) {
  const [visible, setVisible] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [proxyUrl, setProxyUrl] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  
  const downloads = useOnlineDownloadStore((state) => state.downloads);
  const downloadState = downloads[id]; // check if this book is downloading

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
      { root: scrollRoot ?? null, threshold: 0.01 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [scrollRoot]);

  useEffect(() => {
    if (!visible || !coverUrl || imgError) return;
    let active = true;
    const objectUrl: string | null = null;
    
    const needsProxy = coverUrl.includes('libgen') || 
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
      else if (coverUrl.includes('toontop')) sourceId = 'toontop';
      else if (coverUrl.includes('toonily')) sourceId = 'toonily';
      else if (coverUrl.includes('manhwaread')) sourceId = 'manhwaread';
      else if (coverUrl.includes('toongod')) sourceId = 'toongod';
      else if (coverUrl.includes('weebrook')) sourceId = 'weebrook';
      else if (coverUrl.includes('manhwahub')) sourceId = 'manhwahub';
      else if (coverUrl.includes('mangafire')) sourceId = 'mangafire';

      const proxyUri = getProxyUrl(sourceId, coverUrl);
      setProxyUrl(proxyUri);
    } else if (coverUrl.startsWith('http://') || coverUrl.startsWith('https://')) {
      setProxyUrl(getProxyUrl('generic', coverUrl));
    } else {
      setProxyUrl(coverUrl);
    }
    
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [visible, coverUrl, imgError, title, author]);
  const [fallbackAttempted, setFallbackAttempted] = useState(false);

  useEffect(() => {
    if (!visible || !coverUrl || !imgError || fallbackAttempted) return;
    let active = true;
    
    setFallbackAttempted(true); // Only attempt fallback once

    // If the primary image errors out (e.g., shiori-proxy fails), try the fallback
    import('@/online-books/openlibrary/api').then(({ fetchCoverForBook }) => {
      fetchCoverForBook(title, author).then(fallbackUrl => {
        if (!active) return;
        if (fallbackUrl) {
          const proxyUri = isAndroid 
            ? `http://shiori-proxy.localhost?source=generic&url=${encodeURIComponent(fallbackUrl)}`
            : fallbackUrl;
          setProxyUrl(proxyUri);
          setImgError(false); // allow the img tag to try rendering again
        }
      });
    });

    return () => { active = false; };
  }, [visible, coverUrl, imgError, title, author, fallbackAttempted]);
  // Calculate download progress if available
  const progressPercent = downloadState?.total_bytes && downloadState.total_bytes > 0 
    ? Math.min(100, Math.round((downloadState.downloaded_bytes / downloadState.total_bytes) * 100))
    : null;

  return (
    <div
      ref={cardRef}
      onClick={onClick}
      className={cn(
        'group/card relative flex flex-col cursor-pointer transition-all duration-300',
        !visible && 'opacity-0 translate-y-8',
        visible && 'animate-in fade-in slide-in-from-bottom-8 duration-700 ease-out fill-mode-forwards'
      )}
    >
      {/* Cover Container with Aspect Ratio */}
      <div className="relative w-full aspect-[2/3] rounded-2xl bg-secondary/40 backdrop-blur-md shadow-md border border-border/40 group-hover/card:border-border group-hover/card:shadow-xl transition-all duration-500 overflow-hidden">
        
        {/* Actual Image */}
        {visible && proxyUrl && !imgError ? (
          <>
            {!imgLoaded && (
              <div className="absolute inset-0 bg-muted animate-pulse z-0" />
            )}
            <img
              src={proxyUrl}
              alt={title}
              loading="lazy"
              decoding="async"
              className={cn(
                'w-full h-full object-cover group-hover/card:scale-105 transition-all duration-700 relative z-10',
                imgLoaded ? 'opacity-100' : 'opacity-0 scale-110'
              )}
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgError(true)}
            />
          </>
        ) : visible && (
          <div className="w-full h-full flex flex-col justify-center items-center p-4 bg-gradient-to-br from-indigo-950 to-slate-900 text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-primary/20 rounded-full blur-2xl pointer-events-none" />
            <div className="text-[10px] font-semibold text-primary/80 mb-2">{format || 'BOOK'}</div>
            <div className="font-serif font-bold text-sm text-foreground line-clamp-4 leading-snug">{title}</div>
            {author && <div className="text-xs text-muted-foreground mt-2 line-clamp-2">{author}</div>}
          </div>
        )}

        {/* Hover Glassmorphism Overlay */}
        <div className="absolute inset-0 bg-card-overlay/60 opacity-0 group-hover/card:opacity-100 transition-all duration-500 flex flex-col items-center justify-center backdrop-blur-md z-20">
          <div className="w-14 h-14 rounded-full bg-card-overlay-text/10 flex items-center justify-center border border-card-overlay-text/20 transform translate-y-4 group-hover/card:translate-y-0 transition-all duration-500 shadow-xl">
            <BookOpen className="w-6 h-6 text-card-overlay-text drop-shadow-sm" />
          </div>
          <span className="text-card-overlay-text font-medium mt-3 opacity-0 group-hover/card:opacity-100 transition-opacity duration-500 delay-100 tracking-wide drop-shadow-sm">
            View
          </span>
        </div>


        {/* Download Progress Overlay */}
        {downloadState && (
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center z-10 animate-in fade-in">
            {downloadState.status === 'downloading' && (
              <>
                <div className="relative w-16 h-16 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                    <path
                      className="text-white/20"
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
                  <div className="absolute text-white text-xs font-bold">
                    {progressPercent !== null ? `${progressPercent}%` : '...'}
                  </div>
                </div>
                <span className="text-white text-xs font-medium mt-3 animate-pulse">Downloading</span>
              </>
            )}
            
            {downloadState.status === 'completed' && (
              <div className="flex flex-col items-center animate-in zoom-in">
                <CheckCircle2 className="w-12 h-12 text-green-400 mb-2" />
                <span className="text-white text-xs font-bold">Done!</span>
              </div>
            )}
            
            {downloadState.status === 'error' && (
              <div className="flex flex-col items-center animate-in zoom-in">
                <AlertCircle className="w-12 h-12 text-red-400 mb-2" />
                <span className="text-white text-xs font-bold">Failed</span>
              </div>
            )}
          </div>
        )}

        {/* ── Info Strip (Tachiyomi Style) ── */}
        <div className={cn(
          'absolute bottom-0 left-0 right-0 z-10',
          'flex flex-col gap-0.5',
          'bg-gradient-to-t from-black via-black/80 to-transparent',
          'px-3 pt-12 pb-3 text-white'
        )}>
          <h3 className="font-bold leading-tight line-clamp-2 drop-shadow-lg text-white text-[14px]">
            {title}
          </h3>
          {author && author !== 'Unknown Author' && (
            <p className="truncate drop-shadow-lg text-white/80 font-medium text-[11px] mt-0.5">
              {author}
            </p>
          )}
        </div>
      </div>
    </div>
  );
});
