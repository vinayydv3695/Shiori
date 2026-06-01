import React, { useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Download } from 'lucide-react';
import { toPng } from 'html-to-image';
import { AnnotationSearchResult } from '@/lib/tauri';
import { useToastStore } from '@/store/toastStore';

interface QuoteCardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  annotationData: AnnotationSearchResult | null;
}

export function QuoteCardDialog({ open, onOpenChange, annotationData }: QuoteCardDialogProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  if (!annotationData) return null;
  const { annotation, book_title, book_author } = annotationData;

  const handleDownload = async () => {
    if (!cardRef.current) return;
    try {
      setIsExporting(true);
      const dataUrl = await toPng(cardRef.current, {
        quality: 1,
        pixelRatio: 3,
        backgroundColor: 'transparent',
      });
      const link = document.createElement('a');
      link.download = `quote-${book_title.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
      
      useToastStore.getState().addToast({
        title: 'Quote card saved',
        description: 'The image has been downloaded successfully.',
        variant: 'success',
      });
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to generate image:', error);
      useToastStore.getState().addToast({
        title: 'Export failed',
        description: 'Failed to generate quote card image.',
        variant: 'error',
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg shadow-2xl focus:outline-none">
          <div className="bg-background border border-border rounded-xl flex flex-col overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/50">
              <Dialog.Title className="text-sm font-semibold">Share Quote</Dialog.Title>
              <Dialog.Close className="p-1 hover:bg-muted rounded text-muted-foreground transition-colors">
                <X size={16} />
              </Dialog.Close>
            </div>

            <div className="p-8 bg-zinc-100 dark:bg-zinc-950 flex items-center justify-center relative overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.05),transparent_60%)] pointer-events-none" />
              
              {/* Card to be exported */}
              <div 
                ref={cardRef} 
                className="relative bg-white dark:bg-zinc-900 rounded-xl shadow-xl overflow-hidden w-full max-w-md p-8"
                style={{
                  borderTop: `4px solid ${annotation.color || '#3b82f6'}`,
                }}
              >
                {/* Decorative quotes */}
                <div className="absolute top-4 right-6 text-6xl text-zinc-200 dark:text-zinc-800 font-serif leading-none select-none">
                  "
                </div>

                <div className="relative z-10">
                  <div className="text-lg md:text-xl font-serif text-zinc-900 dark:text-zinc-100 leading-relaxed mb-6 whitespace-pre-wrap italic">
                    {annotation.selectedText}
                  </div>
                  
                  {annotation.noteContent && (
                    <div className="mb-6 p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg text-sm text-zinc-600 dark:text-zinc-400">
                      {annotation.noteContent}
                    </div>
                  )}

                  <div className="flex items-center justify-between border-t border-zinc-100 dark:border-zinc-800 pt-4 mt-6">
                    <div>
                      <div className="font-medium text-sm text-zinc-900 dark:text-zinc-100">
                        {book_title}
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                        {book_author || 'Unknown Author'}
                      </div>
                    </div>
                    <div className="text-xs font-semibold tracking-wider text-zinc-400 dark:text-zinc-500 uppercase flex flex-col items-end">
                      <span>Shiori</span>
                      <span className="text-[10px] font-normal opacity-50">Reader</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 bg-background border-t border-border flex justify-end">
              <button
                onClick={handleDownload}
                disabled={isExporting}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md font-medium text-sm transition-colors disabled:opacity-50"
              >
                {isExporting ? (
                  <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                ) : (
                  <Download size={16} />
                )}
                {isExporting ? 'Generating...' : 'Save Image'}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
