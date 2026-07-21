import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import { X, Download } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useState, useEffect } from 'react';
import { useIsMobile } from '@/hooks/useIsMobile';
import { cn } from '@/lib/utils';
import { isAndroid } from '@/lib/tauri';
  title: string;
  author?: string;
  coverUrl?: string;
  format?: string;
  year?: number;
  language?: string;
  size?: string;
  mirrors?: string[];
  source: 'libgen' | 'gutenberg';
  downloadUrl: string; // The URL to download
}

interface OnlineBookSidePanelProps {
  book: PreviewBook;
  onClose: () => void;
  onDownload: () => void;
}

export function OnlineBookSidePanel({
  book,
  onClose,
  onDownload,
}: OnlineBookSidePanelProps) {
  const isMobile = useIsMobile();
  const dragControls = useDragControls();

  const [proxyUrl, setProxyUrl] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);
  const [fallbackAttempted, setFallbackAttempted] = useState(false);

  useEffect(() => {
    // Reset state when book changes
    setImgError(false);
    setFallbackAttempted(false);
  }, [book.downloadUrl]); // Assuming downloadUrl or id changes per book

  useEffect(() => {
    if (!book.coverUrl || imgError) {
      if (imgError) setProxyUrl(null);
      return;
    }
    
    if (book.coverUrl.includes('libgen') || book.coverUrl.includes('libgen.li')) {
      const proxyUri = isAndroid 
        ? `http://shiori-proxy.localhost?source=libgen&url=${encodeURIComponent(book.coverUrl)}`
        : `shiori-proxy://localhost?source=libgen&url=${encodeURIComponent(book.coverUrl)}`;
      setProxyUrl(proxyUri);
    } else if (isAndroid && (book.coverUrl.startsWith('http://') || book.coverUrl.startsWith('https://'))) {
      setProxyUrl(`http://shiori-proxy.localhost?source=generic&url=${encodeURIComponent(book.coverUrl)}`);
    } else {
      setProxyUrl(book.coverUrl);
    }
  }, [book.coverUrl, imgError]);

  useEffect(() => {
    if (!book.coverUrl || !imgError || fallbackAttempted) return;
    let active = true;
    
    setFallbackAttempted(true);

    import('@/online-books/openlibrary/api').then(({ fetchCoverForBook }) => {
      fetchCoverForBook(book.title, book.author).then(fallbackUrl => {
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
  }, [book.coverUrl, imgError, book.title, book.author, fallbackAttempted]);

  return createPortal(
      <AnimatePresence>
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
        >
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" 
            onClick={onClose}
          />

          {/* Side Panel */}
          <motion.div
            initial={isMobile ? { opacity: 0, y: "100%" } : { opacity: 0, scale: 0.95, y: 20 }}
            animate={isMobile ? { opacity: 1, y: 0 } : { opacity: 1, scale: 1, y: 0 }}
            exit={isMobile ? { opacity: 0, y: "100%" } : { opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            drag={isMobile ? "y" : false}
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.2}
            onDragEnd={(e, info) => {
              if (info.offset.y > 100 || info.velocity.y > 500) {
                onClose();
              }
            }}
            className={cn(
              "relative bg-background/95 backdrop-blur-xl border-border/50 shadow-2xl flex flex-col overflow-hidden",
              isMobile
                ? "fixed inset-x-0 bottom-0 h-[85vh] w-full rounded-t-2xl border-t border-l-0 border-r-0"
                : "w-full max-w-2xl max-h-[90vh] rounded-2xl border"
            )}
          >
            {isMobile && (
              <div 
                className="w-full flex justify-center pb-2 pt-3 z-30"
                onPointerDown={(e) => dragControls.start(e)}
                style={{ touchAction: 'none', cursor: 'grab' }}
              >
                <div className="w-12 h-1.5 rounded-full bg-[var(--ui-border)] pointer-events-none" />
              </div>
            )}
            {/* Close button */}
            <button 
              onClick={onClose}
              className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-muted/50 hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

              <motion.div 
                className="flex-1 overflow-y-auto custom-scrollbar relative"
                variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05, delayChildren: 0.1 } } }}
                initial="hidden" animate="show"
              >
              {/* Sticky Compact Header for Mobile/Scrolling */}
              <div className="sticky top-0 z-20 w-full bg-background/95 backdrop-blur-md border-b border-border/50 px-4 py-3 flex items-center justify-between shadow-sm transform transition-all duration-300">
                <div className="flex flex-col flex-1 min-w-0 pr-4">
                  <span className="font-serif font-bold text-foreground truncate text-sm">
                    {book.title}
                  </span>
                  {book.format && (
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">
                      {book.format} • {book.size || 'Unknown size'}
                    </span>
                  )}
                </div>
                <button 
                  onClick={onDownload}
                  className="shrink-0 h-9 px-4 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold flex items-center justify-center gap-1.5 shadow-md transition-all text-xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download
                </button>
              </div>

              {/* Header / Cover */}
              <motion.div className="relative pt-6 pb-8 px-8 flex flex-col items-center border-b border-white/5" variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}>
                <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-30 pointer-events-none" />
                
                <div className="relative w-48 aspect-[2/3] rounded-xl overflow-hidden shadow-[0_10px_40px_rgba(0,0,0,0.6)] border border-white/10 mb-6 shrink-0">
                  {proxyUrl && !imgError ? (
                    <img 
                      src={proxyUrl} 
                      alt={book.title} 
                      className="w-full h-full object-cover" 
                      onError={() => setImgError(true)}
                    />
                  ) : (
                    <div className="w-full h-full bg-muted flex items-center justify-center p-4 text-center">
                      <span className="font-serif text-white/80">{book.title}</span>
                    </div>
                  )}
                  
                  {/* Glow behind cover */}
                  <div className="absolute inset-0 shadow-[inset_0_0_20px_rgba(255,255,255,0.1)] pointer-events-none" />
                </div>

                <h2 className="text-2xl font-bold text-foreground text-center leading-tight mb-2 font-serif">
                  {book.title}
                </h2>
                {book.author && (
                  <p className="text-muted-foreground text-lg text-center mb-4">
                    {book.author}
                  </p>
                )}

                <div className="flex flex-wrap items-center justify-center gap-3">
                  <span className="px-3 py-1 rounded-full bg-muted/50 text-foreground/80 text-xs font-medium uppercase tracking-wider border border-border/50">
                    {book.format}
                  </span>
                  {book.language && (
                    <span className="px-3 py-1 rounded-full bg-muted/50 text-foreground/80 text-xs font-medium uppercase tracking-wider border border-border/50">
                      {book.language}
                    </span>
                  )}
                  {book.size && (
                    <span className="px-3 py-1 rounded-full bg-muted/50 text-foreground/80 text-xs font-medium uppercase tracking-wider border border-border/50">
                      {book.size}
                    </span>
                  )}
                </div>
              </motion.div>

              {/* Actions (Main Download Button) */}
              <motion.div className="p-8 flex flex-col gap-4 hidden sm:flex" variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}>
                <button 
                  onClick={onDownload}
                  className="w-full py-4 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold flex items-center justify-center gap-2 shadow-lg transition-all duration-300"
                >
                  <Download className="w-5 h-5" />
                  Download to Library
                </button>
              </motion.div>

              {/* Additional Info / Synopsis could go here if fetched */}
              <motion.div className="px-8 pb-8" variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}>
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">About this edition</h3>
                <p className="text-foreground/70 leading-relaxed text-sm">
                  Source: <span className="capitalize text-foreground">{book.source}</span>
                  <br/>
                  This book was found via global search and can be instantly added to your local Shiori library.
                </p>
              </motion.div>
            </motion.div>
          </motion.div>
        </motion.div>
      </AnimatePresence>,
      document.body
    )
}
