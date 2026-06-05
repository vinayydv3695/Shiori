import React from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, BookOpen, ExternalLink, Loader2 } from 'lucide-react';
import { useOnlineDownloadStore } from '@/store/onlineDownloadStore';

export interface PreviewBook {
  id: string; // The URL or unique ID
  title: string;
  author?: string;
  coverUrl?: string;
  description?: string;
  format?: string;
  fileSize?: string;
  language?: string;
  year?: number;
  editionCount?: number;
  source: 'libgen' | 'gutenberg';
  url: string; // The actual download URL or read online URL
}

interface QuickPreviewModalProps {
  book: PreviewBook | null;
  isOpen: boolean;
  onClose: () => void;
  onDownload: (book: PreviewBook) => void;
  onReadOnline?: (book: PreviewBook) => void;
}

export function QuickPreviewModal({ book, isOpen, onClose, onDownload, onReadOnline }: QuickPreviewModalProps) {
  const downloads = useOnlineDownloadStore((state) => state.downloads);
  
  if (!book) return null;
  
  const downloadState = downloads[book.url];
  const isDownloading = downloadState?.status === 'downloading';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-describedby={undefined} className="max-w-2xl bg-card/95 backdrop-blur-xl border-border/50 shadow-2xl p-0 overflow-hidden sm:rounded-2xl">
        <div className="flex flex-col sm:flex-row max-h-[85vh]">
          {/* Left Column: Cover */}
          <div className="w-full sm:w-2/5 bg-muted/30 relative flex-shrink-0 flex items-center justify-center p-6 border-b sm:border-b-0 sm:border-r border-border/50">
            {book.coverUrl ? (
              <img 
                src={book.coverUrl} 
                alt={book.title} 
                className="w-48 sm:w-full max-w-[200px] aspect-[2/3] object-cover rounded-md shadow-lg border border-border/20"
              />
            ) : (
              <div className="w-48 sm:w-full max-w-[200px] aspect-[2/3] bg-gradient-to-br from-indigo-900 to-slate-800 rounded-md shadow-lg border border-border/20 flex flex-col items-center justify-center p-4 text-center">
                <span className="text-white font-serif font-bold text-lg line-clamp-4">{book.title}</span>
                <span className="text-slate-300 text-sm mt-2">{book.author}</span>
              </div>
            )}
          </div>
          
          {/* Right Column: Details */}
          <div className="w-full sm:w-3/5 p-6 sm:p-8 flex flex-col overflow-y-auto custom-scrollbar">
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider rounded-sm bg-primary/10 text-primary">
                  {book.source === 'libgen' ? 'LibGen' : 'Project Gutenberg'}
                </span>
                {book.format && (
                  <span className="px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider rounded-sm bg-muted text-muted-foreground">
                    {book.format}
                  </span>
                )}
              </div>
              
              <DialogTitle className="text-2xl sm:text-3xl font-bold leading-tight mb-2 text-foreground">
                {book.title}
              </DialogTitle>
              
              {book.author && (
                <p className="text-lg text-muted-foreground font-medium">
                  {book.author}
                </p>
              )}
            </div>

            {/* Metadata Grid */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              {book.year && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-semibold">Published</p>
                  <p className="text-sm font-medium">{book.year}</p>
                </div>
              )}
              {book.language && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-semibold">Language</p>
                  <p className="text-sm font-medium">{String(book.language).toUpperCase()}</p>
                </div>
              )}
              {book.fileSize && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-semibold">Size</p>
                  <p className="text-sm font-medium">{book.fileSize}</p>
                </div>
              )}
            </div>

            {/* Description */}
            {book.description ? (
              <div className="mb-8 flex-1">
                <p className="text-xs text-muted-foreground uppercase font-semibold mb-2">Synopsis</p>
                <DialogDescription className="text-sm text-foreground/80 leading-relaxed">
                  {book.description}
                </DialogDescription>
              </div>
            ) : <div className="flex-1" />}

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 mt-auto pt-4 border-t border-border/50">
              <Button 
                onClick={() => onDownload(book)}
                disabled={isDownloading}
                className="flex-1 gap-2 h-11 bg-primary text-primary-foreground hover:bg-primary/90 shadow-md"
              >
                {isDownloading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Downloading...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Download to Library
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
