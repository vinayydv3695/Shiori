import React, { useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Download, Copy, Check } from 'lucide-react';
import { toPng } from 'html-to-image';
import { AnnotationSearchResult } from '@/lib/tauri';
import { useToastStore } from '@/store/toastStore';
import { cn } from '@/lib/utils';

interface QuoteCardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  annotationData: AnnotationSearchResult | null;
}

type CardTheme = 'sepia' | 'obsidian' | 'paper' | 'gradient';

const THEME_STYLES: Record<CardTheme, {
  name: string;
  bg: string;
  cardBg: string;
  cardBorder: string;
  textColor: string;
  mutedColor: string;
  accentBar: string;
  quoteColor: string;
}> = {
  sepia: {
    name: 'Warm Sepia',
    bg: 'bg-[#f4ecd8]',
    cardBg: 'bg-[#fbf7ee]',
    cardBorder: 'border-[#e4d7c0]',
    textColor: 'text-[#433422]',
    mutedColor: 'text-[#857158]',
    accentBar: 'linear-gradient(90deg, #d97706 0%, #ca8a04 100%)',
    quoteColor: 'text-[#d97706]/15',
  },
  obsidian: {
    name: 'Obsidian',
    bg: 'bg-[#0f1117]',
    cardBg: 'bg-[#181b25]',
    cardBorder: 'border-[#2a2f42]',
    textColor: 'text-[#f1f5f9]',
    mutedColor: 'text-[#94a3b8]',
    accentBar: 'linear-gradient(90deg, #6366f1 0%, #a855f7 100%)',
    quoteColor: 'text-[#6366f1]/20',
  },
  paper: {
    name: 'Paper',
    bg: 'bg-[#f8fafc]',
    cardBg: 'bg-[#ffffff]',
    cardBorder: 'border-[#e2e8f0]',
    textColor: 'text-[#0f172a]',
    mutedColor: 'text-[#64748b]',
    accentBar: 'linear-gradient(90deg, #0284c7 0%, #06b6d4 100%)',
    quoteColor: 'text-[#0284c7]/15',
  },
  gradient: {
    name: 'Sunset',
    bg: 'bg-gradient-to-br from-amber-500/20 via-orange-500/20 to-rose-500/20',
    cardBg: 'bg-background/90 backdrop-blur-2xl',
    cardBorder: 'border-orange-500/30',
    textColor: 'text-foreground',
    mutedColor: 'text-muted-foreground',
    accentBar: 'linear-gradient(90deg, #f97316 0%, #ec4899 100%)',
    quoteColor: 'text-orange-500/20',
  },
};

export function QuoteCardDialog({ open, onOpenChange, annotationData }: QuoteCardDialogProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState<CardTheme>('sepia');

  if (!annotationData) return null;
  const { annotation, book_title, book_author } = annotationData;
  const theme = THEME_STYLES[selectedTheme];

  const handleCopyText = async () => {
    try {
      let textToCopy = `"${annotation.selectedText}"`;
      if (book_title) textToCopy += `\n— ${book_title}`;
      if (book_author) textToCopy += ` (${book_author})`;
      
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      
      useToastStore.getState().addToast({
        title: 'Quote copied',
        description: 'Text copied to clipboard.',
        variant: 'success',
      });
    } catch {
      useToastStore.getState().addToast({
        title: 'Copy failed',
        description: 'Could not copy quote text.',
        variant: 'error',
      });
    }
  };

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
      link.download = `quote-${book_title ? book_title.replace(/\s+/g, '-').toLowerCase() : 'shiori'}-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
      
      useToastStore.getState().addToast({
        title: 'Quote card saved',
        description: 'Image saved successfully.',
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
        <Dialog.Overlay className="dialog-overlay fixed inset-0 z-[150] bg-background/80 backdrop-blur-xl transition-opacity animate-in fade-in-0 duration-200" />
        <Dialog.Content aria-describedby={undefined} className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[160] w-full max-w-lg p-3 sm:p-4 focus:outline-none">
          <div className="bg-background border border-border/80 rounded-3xl flex flex-col overflow-hidden shadow-2xl backdrop-blur-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 bg-secondary/30">
              <Dialog.Title className="text-base font-extrabold tracking-tight text-foreground">Share Quote Card</Dialog.Title>
              <Dialog.Close className="p-2 hover:bg-secondary rounded-xl text-muted-foreground hover:text-foreground transition-colors active:scale-95">
                <X size={16} />
              </Dialog.Close>
            </div>

            {/* Theme Selector Pills */}
            <div className="px-5 py-3 border-b border-border/40 bg-secondary/15 flex items-center gap-2 overflow-x-auto no-scrollbar">
              <span className="text-xs font-extrabold text-muted-foreground mr-1 shrink-0">Style:</span>
              {(Object.keys(THEME_STYLES) as CardTheme[]).map((t) => {
                const isSelected = selectedTheme === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setSelectedTheme(t)}
                    className={cn(
                      "px-3 py-1 rounded-xl text-xs font-extrabold transition-all border shrink-0 active:scale-95",
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary shadow-xs"
                        : "bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground border-border/50"
                    )}
                  >
                    {THEME_STYLES[t].name}
                  </button>
                );
              })}
            </div>

            {/* Card Preview Container */}
            <div className={cn("p-6 sm:p-8 flex items-center justify-center relative overflow-hidden transition-colors duration-300", theme.bg)}>
              {/* Card to be exported */}
              <div 
                ref={cardRef} 
                className={cn("relative rounded-3xl shadow-2xl overflow-hidden w-full p-6 sm:p-8 border transition-all duration-300", theme.cardBg, theme.cardBorder)}
              >
                {/* Decorative background quote mark */}
                <div className={cn("absolute top-3 right-6 text-[90px] font-serif leading-none select-none pointer-events-none transition-colors", theme.quoteColor)}>
                  “
                </div>

                <div className="relative z-10">
                  <div className={cn("text-base sm:text-lg font-serif leading-relaxed mb-5 whitespace-pre-wrap font-medium tracking-tight", theme.textColor)}>
                    {annotation.selectedText}
                  </div>
                  
                  {(() => {
                    const isVocabulary = annotation.annotationType === 'vocabulary' || 
                      (annotation.noteContent && annotation.noteContent.includes('{"type":"define"'));
                      
                    if (isVocabulary && annotation.noteContent) {
                      try {
                        const vocabData = JSON.parse(annotation.noteContent);
                        return (
                          <div className="mb-5 space-y-3 pt-3 border-t border-border/40">
                            {vocabData.data?.phonetic && (
                              <div className={cn("text-xs font-serif italic", theme.mutedColor)}>
                                {vocabData.data.phonetic}
                              </div>
                            )}
                            {vocabData.data?.meanings?.slice(0, 2).map((m: any, i: number) => (
                              <div key={i} className="flex flex-col gap-0.5">
                                <span className="font-extrabold text-[9px] text-primary uppercase tracking-[0.2em]">{m.part_of_speech}</span>
                                <div className={cn("text-xs leading-snug font-medium", theme.textColor)}>{m.definitions[0]?.definition}</div>
                              </div>
                            ))}
                          </div>
                        );
                      } catch {
                        return (
                          <div className={cn("mb-5 p-3 rounded-xl border text-xs leading-relaxed", theme.cardBorder, theme.mutedColor)}>
                            {annotation.noteContent}
                          </div>
                        );
                      }
                    } else if (annotation.noteContent) {
                      return (
                        <div className={cn("mb-5 p-3.5 rounded-xl border text-xs leading-relaxed font-serif italic", theme.cardBorder, theme.mutedColor)}>
                          {annotation.noteContent}
                        </div>
                      );
                    }
                    return null;
                  })()}

                  <div className={cn("flex items-center justify-between border-t pt-4 mt-4", theme.cardBorder)}>
                    <div className="pr-4 min-w-0">
                      <div className={cn("font-extrabold text-xs sm:text-sm tracking-tight truncate", theme.textColor)}>
                        {book_title || 'Shiori Library'}
                      </div>
                      {book_author && (
                        <div className={cn("text-[10px] sm:text-[11px] mt-0.5 font-semibold uppercase tracking-wider truncate", theme.mutedColor)}>
                          {book_author}
                        </div>
                      )}
                    </div>
                    <div className={cn("shrink-0 text-[10px] font-extrabold tracking-[0.2em] uppercase flex flex-col items-end opacity-80", theme.mutedColor)}>
                      <span>SHIORI</span>
                      <span className="text-[7px] font-medium opacity-60 tracking-[0.3em]">READER</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Bar */}
            <div className="p-4 bg-background border-t border-border/60 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleCopyText}
                className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-extrabold text-foreground bg-secondary/60 hover:bg-secondary border border-border/50 rounded-2xl transition-all active:scale-95 shadow-xs"
              >
                {copied ? <Check size={14} className="text-primary" /> : <Copy size={14} />}
                <span>{copied ? 'Copied!' : 'Copy Text'}</span>
              </button>

              <button
                type="button"
                onClick={handleDownload}
                disabled={isExporting}
                className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground hover:bg-primary/90 font-extrabold text-xs rounded-2xl transition-all active:scale-95 shadow-md shadow-primary/20 disabled:opacity-50"
              >
                {isExporting ? (
                  <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                ) : (
                  <Download size={15} />
                )}
                <span>{isExporting ? 'Generating...' : 'Save Image'}</span>
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
