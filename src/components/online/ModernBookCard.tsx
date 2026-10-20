import { useState, useEffect, memo } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOnlineDownloadStore } from '@/store/onlineDownloadStore';
import { getProxyUrl } from '@/lib/tauri';
import { FallbackBookCover } from '@/components/library/FallbackBookCover';

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

function cleanBookTitle(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/;\s*or,\s*.*$/i, '')
    .replace(/:\s+A Romance.*$/i, '')
    .replace(/\s*\([^)]*edition[^)]*\)/gi, '')
    .trim();
}

function formatAuthorName(raw?: string): string | undefined {
  if (!raw || raw === 'Unknown Author') return undefined;
  const trimmed = raw.trim();
  if (trimmed.includes(',')) {
    const parts = trimmed.split(',').map((p) => p.trim());
    if (parts.length === 2) {
      return `${parts[1]} ${parts[0]}`;
    }
  }
  return trimmed;
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
  const [proxyUrl, setProxyUrl] = useState<string | null>(coverUrl || null);
  const [fallbackAttempted, setFallbackAttempted] = useState(false);
  
  const downloadState = useOnlineDownloadStore((state) => state.downloads[id]);

  const cleanedTitle = cleanBookTitle(title);
  const cleanedAuthor = formatAuthorName(author);

  useEffect(() => {
    if (!coverUrl) return;
    
    const needsProxy = coverUrl.includes('libgen') || 
                       coverUrl.includes('gutenberg') ||
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
      else if (coverUrl.includes('gutenberg')) sourceId = 'gutenberg';
      else if (coverUrl.includes('annas-archive')) sourceId = 'annas-archive';
      else if (coverUrl.includes('toontop')) sourceId = 'toontop';
      else if (coverUrl.includes('toonily')) sourceId = 'toonily';
      else if (coverUrl.includes('manhwaread')) sourceId = 'manhwaread';
      else if (coverUrl.includes('toongod')) sourceId = 'toongod';
      else if (coverUrl.includes('weebrook')) sourceId = 'weebrook';
      else if (coverUrl.includes('manhwahub')) sourceId = 'manhwahub';
      else if (coverUrl.includes('mangafire')) sourceId = 'mangafire';

      setProxyUrl(getProxyUrl(sourceId, coverUrl));
    } else {
      setProxyUrl(coverUrl);
    }
    setImgError(false);
    setImgLoaded(false);
  }, [coverUrl]);

  // When image fails or coverUrl is missing, attempt fallback cover resolution via OpenLibrary/Google Books
  useEffect(() => {
    if (fallbackAttempted) return;
    if (!imgError && coverUrl) return;
    
    setFallbackAttempted(true);
    let active = true;

    import('@/online-books/openlibrary/api').then(({ fetchCoverForBook }) => {
      fetchCoverForBook(title, author).then((fallbackUrl) => {
        if (!active) return;
        if (fallbackUrl && fallbackUrl !== coverUrl) {
          setProxyUrl(fallbackUrl);
          setImgError(false);
          setImgLoaded(false);
        }
      });
    });

    return () => { active = false; };
  }, [coverUrl, imgError, title, author, fallbackAttempted]);

  const progressPercent = downloadState?.total_bytes && downloadState.total_bytes > 0 
    ? Math.min(100, Math.round((downloadState.downloaded_bytes / downloadState.total_bytes) * 100))
    : null;

  return (
    <div 
      onClick={onClick}
      className={cn(
        "group relative flex flex-col h-full rounded-xl sm:rounded-2xl overflow-hidden cursor-pointer select-none",
        "bg-card/90 border border-border/50 hover:border-primary/40 shadow-2xs hover:shadow-md",
        "transition-all duration-300 hover:-translate-y-1 active:scale-[0.98]"
      )}
    >
      {/* Cover Container */}
      <div className="relative w-full aspect-[2/3] overflow-hidden bg-secondary/30">
        {(!imgLoaded && !imgError && proxyUrl) && (
          <div className="absolute inset-0 bg-muted/40 animate-pulse" />
        )}

        {proxyUrl && !imgError ? (
          <>
            <img
              src={proxyUrl}
              alt={cleanedTitle}
              className={cn(
                "w-full h-full object-cover transition-all duration-500",
                imgLoaded ? "opacity-100 scale-100" : "opacity-0 scale-105",
                "group-hover:scale-105"
              )}
              loading="lazy"
              decoding="async"
              onLoad={() => setImgLoaded(true)}
              onError={() => setImgError(true)}
            />
            {/* Subtle sheen highlight on hover */}
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-white/15 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          </>
        ) : (
          <FallbackBookCover
            title={cleanedTitle}
            author={cleanedAuthor}
            format={format || 'epub'}
            coverSize="medium"
          />
        )}

        {/* Top Badges (Format / Year) */}
        {(format || year) && (
          <div className="absolute top-2 left-2 right-2 flex items-center justify-between pointer-events-none z-10">
            {format ? (
              <span className="px-2 py-0.5 rounded-full bg-background/85 backdrop-blur-md border border-border/50 text-[8px] sm:text-[9px] font-extrabold uppercase text-foreground tracking-wider shadow-2xs">
                {format}
              </span>
            ) : <span />}
            {year && (
              <span className="px-2 py-0.5 rounded-full bg-background/85 backdrop-blur-md border border-border/50 text-[8px] sm:text-[9px] font-bold text-muted-foreground shadow-2xs">
                {year}
              </span>
            )}
          </div>
        )}

        {/* Download State Badges & Overlays */}
        {downloadState && (
          <>
            {downloadState.status === 'downloading' && (
              <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex flex-col items-center justify-center z-30">
                <div className="relative w-10 h-10 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                    <path
                      className="text-white/20"
                      strokeWidth="3.5"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    {progressPercent !== null ? (
                      <path
                        className="text-primary transition-all duration-300 ease-out"
                        strokeDasharray={`${progressPercent}, 100`}
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        stroke="currentColor"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                    ) : (
                      <path
                        className="text-primary animate-spin"
                        strokeDasharray="25, 100"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        stroke="currentColor"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                    )}
                  </svg>
                  <div className="absolute text-white text-[10px] font-extrabold">
                    {progressPercent !== null ? `${progressPercent}%` : '...'}
                  </div>
                </div>
              </div>
            )}
            
            {downloadState.status === 'completed' && (
              <div className="absolute top-2 right-2 z-20 pointer-events-none">
                <span className="p-1 rounded-full bg-emerald-500 text-white shadow-xs flex items-center justify-center">
                  <CheckCircle2 className="w-3 h-3 stroke-[2.5]" />
                </span>
              </div>
            )}
            
            {downloadState.status === 'error' && (
              <div className="absolute top-2 right-2 z-20 pointer-events-none">
                <span className="p-1 rounded-full bg-destructive text-white shadow-xs flex items-center justify-center">
                  <AlertCircle className="w-3 h-3 stroke-[2.5]" />
                </span>
              </div>
            )}
          </>
        )}

        {/* ── Info Strip (Tachiyomi Style) ──
            Only rendered when the cover image is loaded.
            When FallbackBookCover is shown, title & author are already
            displayed on the book cover jacket, so this is omitted to avoid duplicate text.
        */}
        {proxyUrl && !imgError && imgLoaded && (
          <div className="absolute bottom-0 inset-x-0 z-10 flex flex-col justify-end bg-gradient-to-t from-black/85 via-black/45 to-transparent px-2.5 sm:px-3 pt-8 pb-2 sm:pb-2.5 text-white pointer-events-none">
            <h3 className="font-bold leading-snug line-clamp-2 text-white text-xs sm:text-[13px] drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
              {cleanedTitle}
            </h3>
            {cleanedAuthor && (
              <p className="truncate text-white/80 font-medium text-[10px] sm:text-[11px] mt-0.5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                {cleanedAuthor}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
