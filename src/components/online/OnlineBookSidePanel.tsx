import { motion, AnimatePresence } from 'framer-motion';
import { X, Download } from 'lucide-react';
export interface PreviewBook {
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
  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      >
        {/* Backdrop */}
        <div 
          className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" 
          onClick={onClose}
        />

        {/* Side Panel */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="relative w-full max-w-2xl max-h-[90vh] bg-background/95 backdrop-blur-xl border border-border/50 shadow-2xl rounded-2xl flex flex-col overflow-hidden"
        >
          {/* Close button */}
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-muted/50 hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {/* Header / Cover */}
            <div className="relative pt-12 pb-8 px-8 flex flex-col items-center border-b border-white/5">
              <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-30 pointer-events-none" />
              
              <div className="relative w-48 aspect-[2/3] rounded-xl overflow-hidden shadow-[0_10px_40px_rgba(0,0,0,0.6)] border border-white/10 mb-6">
                {book.coverUrl ? (
                  <img src={book.coverUrl} alt={book.title} className="w-full h-full object-cover" />
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
            </div>

            {/* Actions */}
            <div className="p-8 flex flex-col gap-4">
              <button 
                onClick={onDownload}
                className="w-full py-4 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold flex items-center justify-center gap-2 shadow-lg transition-all duration-300"
              >
                <Download className="w-5 h-5" />
                Download to Library
              </button>
            </div>

            {/* Additional Info / Synopsis could go here if fetched */}
            <div className="px-8 pb-8">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">About this edition</h3>
              <p className="text-foreground/70 leading-relaxed text-sm">
                Source: <span className="capitalize text-foreground">{book.source}</span>
                <br/>
                This book was found via global search and can be instantly added to your local Shiori library.
              </p>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
