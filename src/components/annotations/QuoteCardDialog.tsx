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
        <Dialog.Overlay className="dialog-overlay fixed inset-0 z-50 transition-opacity" />
        <Dialog.Content aria-describedby={undefined} className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg shadow-2xl focus:outline-none">
          <div className="bg-card border border-border/60 rounded-2xl flex flex-col overflow-hidden shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/50 bg-secondary/30">
              <Dialog.Title className="text-sm font-bold tracking-tight text-foreground">Share Quote</Dialog.Title>
              <Dialog.Close className="p-1.5 hover:bg-secondary rounded-lg text-muted-foreground hover:text-foreground transition-colors">
                <X size={16} />
              </Dialog.Close>
            </div>

            <div className="p-8 bg-muted/30 flex items-center justify-center relative overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(var(--primary),0.15),transparent_70%)] pointer-events-none" />
              
              {/* Card to be exported */}
              <div 
                ref={cardRef} 
                className="relative bg-card rounded-2xl shadow-2xl overflow-hidden w-full max-w-md p-8 border border-border/50"
              >
                {/* Colored Top Accent Bar */}
                <div 
                  className="absolute top-0 left-0 right-0 h-1.5 opacity-90"
                  style={{ background: `linear-gradient(90deg, ${annotation.color || 'hsl(var(--primary))'} 0%, transparent 100%)` }} 
                />

                {/* Decorative background quote mark */}
                <div className="absolute top-2 right-6 text-[100px] text-muted-foreground/10 font-serif leading-none select-none pointer-events-none">
                  "
                </div>

                <div className="relative z-10">
                  <div className="text-lg md:text-xl font-serif text-foreground leading-relaxed mb-6 whitespace-pre-wrap font-medium tracking-tight">
                    {annotation.selectedText}
                  </div>
                  
                  {(() => {
                    const isVocabulary = annotation.annotationType === 'vocabulary' || 
                      (annotation.noteContent && annotation.noteContent.includes('{"type":"define"'));
                      
                    if (isVocabulary && annotation.noteContent) {
                      try {
                        const vocabData = JSON.parse(annotation.noteContent);
                        return (
                          <div className="mb-6 space-y-4">
                            {vocabData.data?.phonetic && (
                              <div className="text-sm font-serif italic text-muted-foreground">
                                {vocabData.data.phonetic}
                              </div>
                            )}
                            {vocabData.data?.meanings?.slice(0, 2).map((m: any, i: number) => (
                              <div key={i} className="flex flex-col gap-1">
                                <span className="font-bold text-[9px] text-primary uppercase tracking-[0.25em]">{m.part_of_speech}</span>
                                <div className="text-foreground/90 text-[14px] leading-relaxed font-medium">{m.definitions[0]?.definition}</div>
                              </div>
                            ))}
                          </div>
                        );
                      } catch (e) {
                        return (
                          <div className="mb-6 p-4 bg-muted/40 rounded-xl border border-border/40 text-sm text-muted-foreground">
                            {annotation.noteContent}
                          </div>
                        );
                      }
                    } else if (annotation.noteContent) {
                      return (
                        <div className="mb-6 p-4 bg-muted/40 rounded-xl border border-border/40 text-sm text-muted-foreground leading-relaxed shadow-inner">
                          {annotation.noteContent}
                        </div>
                      );
                    }
                    return null;
                  })()}

                  <div className="flex items-center justify-between border-t border-border/50 pt-5 mt-6">
                    <div className="pr-4">
                      <div className="font-semibold text-sm text-foreground tracking-tight">
                        {book_title}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-1 font-medium uppercase tracking-wider">
                        {book_author || 'Unknown Author'}
                      </div>
                    </div>
                    <div className="shrink-0 text-[10px] font-bold tracking-[0.2em] text-muted-foreground/70 uppercase flex flex-col items-end">
                      <span>Shiori</span>
                      <span className="text-[8px] font-medium opacity-50 tracking-[0.3em] mt-0.5">Reader</span>
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
