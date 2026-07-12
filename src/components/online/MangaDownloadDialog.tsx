import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UnifiedChapter } from './OnlineMangaDetailView';

interface MangaDownloadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chapters: UnifiedChapter[];
  onDownload: (selectedChapters: UnifiedChapter[]) => void;
}

export function MangaDownloadDialog({ open, onOpenChange, chapters, onDownload }: MangaDownloadDialogProps) {
  const handleDownload = (count: number | 'ALL' | string) => {
    // Sort chapters ascending to get the oldest ones first
    const sorted = [...chapters].sort((a, b) => {
      const aVol = a.volume === 'None' ? 0 : Number(a.volume) || 0;
      const bVol = b.volume === 'None' ? 0 : Number(b.volume) || 0;
      const aChap = Number(a.chapter) || 0;
      const bChap = Number(b.chapter) || 0;

      if (aVol !== bVol) return aVol - bVol;
      return aChap - bChap;
    });

    if (typeof count === 'string' && count !== 'ALL') {
      // Handle custom range like "42-50"
      const parts = count.split('-').map(s => parseInt(s.trim(), 10));
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        const [start, end] = parts;
        const selected = sorted.filter(ch => {
          const chNum = Number(ch.chapter);
          return !isNaN(chNum) && chNum >= start && chNum <= end;
        });
        onDownload(selected);
        onOpenChange(false);
      }
      return;
    }

    const selected = count === 'ALL' ? sorted : sorted.slice(0, count as number);
    onDownload(selected);
    onOpenChange(false);
  };

  const [customRange, setCustomRange] = useState('');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby="manga-download-dialog-description" className="w-[calc(100vw-2rem)] max-w-[460px] bg-[#09090b]/80 backdrop-blur-2xl text-foreground border-white/10 shadow-[0_0_60px_-15px_rgba(0,0,0,0.7)] rounded-3xl overflow-hidden p-0">
        <DialogDescription id="manga-download-dialog-description" className="sr-only">
          Manga download options.
        </DialogDescription>
        
        {/* Header with gradient line */}
        <div className="relative px-8 pt-8 pb-4">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-50" />
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold tracking-tight bg-gradient-to-br from-white to-white/60 bg-clip-text text-transparent">
              Download Chapters
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-foreground/60 leading-relaxed mt-2">
            Select the chapters you want to download for offline reading. They will be added to your library automatically.
          </p>
        </div>

        {/* Options */}
        <div className="px-8 py-2 pb-6 flex flex-col gap-3">
          
          <Button 
            variant="outline" 
            className="group relative justify-between h-14 bg-white/[0.02] border-white/5 hover:border-white/10 hover:bg-white/[0.04] font-medium transition-all rounded-xl" 
            onClick={() => handleDownload(10)}
          >
            <span className="flex items-center gap-3 text-foreground/90 group-hover:text-foreground">
              <span className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center border border-white/5">
                <span className="text-xs font-bold text-muted-foreground group-hover:text-primary transition-colors">10</span>
              </span>
              Next 10 Chapters
            </span>
            <span className="text-primary opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all">↓</span>
          </Button>

          <Button 
            variant="outline" 
            className="group relative justify-between h-14 bg-white/[0.02] border-white/5 hover:border-white/10 hover:bg-white/[0.04] font-medium transition-all rounded-xl" 
            onClick={() => handleDownload(20)}
          >
            <span className="flex items-center gap-3 text-foreground/90 group-hover:text-foreground">
              <span className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center border border-white/5">
                <span className="text-xs font-bold text-muted-foreground group-hover:text-primary transition-colors">20</span>
              </span>
              Next 20 Chapters
            </span>
            <span className="text-primary opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all">↓</span>
          </Button>

          <Button 
            variant="outline" 
            className="group relative justify-between h-14 bg-white/[0.02] border-white/5 hover:border-white/10 hover:bg-white/[0.04] font-medium transition-all rounded-xl" 
            onClick={() => handleDownload(50)}
          >
            <span className="flex items-center gap-3 text-foreground/90 group-hover:text-foreground">
              <span className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center border border-white/5">
                <span className="text-xs font-bold text-muted-foreground group-hover:text-primary transition-colors">50</span>
              </span>
              Next 50 Chapters
            </span>
            <span className="text-primary opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all">↓</span>
          </Button>

          <Button 
            variant="outline" 
            className="group relative justify-between h-14 bg-primary/10 border-primary/20 hover:bg-primary/20 hover:border-primary/30 font-bold transition-all rounded-xl shadow-[0_0_20px_-10px_rgba(var(--primary),0.3)]" 
            onClick={() => handleDownload('ALL')}
          >
            <span className="flex items-center gap-3 text-primary">
              <span className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center border border-primary/20">
                <span className="text-xs font-bold text-primary">∞</span>
              </span>
              All Chapters ({chapters.length})
            </span>
            <span className="text-primary opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all">↓</span>
          </Button>
          
          <div className="flex items-center gap-3 mt-5 pt-5 border-t border-white/5">
            <Input 
              placeholder="e.g. 42-50" 
              value={customRange}
              onChange={(e) => setCustomRange(e.target.value)}
              className="flex-1 bg-black/40 border-white/10 focus-visible:ring-primary focus-visible:border-primary/50 h-12 rounded-xl px-4 transition-all"
            />
            <Button 
              variant="secondary" 
              onClick={() => handleDownload(customRange)}
              disabled={!customRange.includes('-')}
              className="h-12 bg-white/10 hover:bg-white/20 text-foreground font-semibold px-6 rounded-xl transition-all shadow-sm"
            >
              Download
            </Button>
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="px-8 py-4 bg-black/40 border-t border-white/5">
          <Button variant="ghost" className="hover:bg-white/5 rounded-xl font-medium" onClick={() => onOpenChange(false)}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
