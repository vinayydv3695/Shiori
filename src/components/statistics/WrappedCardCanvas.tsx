import React, { useRef, useState, useEffect, useCallback } from 'react';
import type { ReadingWrappedData } from '@/lib/tauri';
import {
  renderStoryCard,
  renderLandscapeCard,
  type WrappedExportFormat,
  type WrappedCardTheme,
} from './wrappedCanvasRenderer';
import { Download, Copy, Check, Smartphone, Monitor, Loader2, Award } from 'lucide-react';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface WrappedCardCanvasProps {
  data: ReadingWrappedData;
}

function getInitialCardTheme(): WrappedCardTheme {
  if (typeof document === 'undefined') return 'parchment';
  const dataTheme = document.documentElement.getAttribute('data-theme') || '';
  const isDarkClass = document.documentElement.classList.contains('dark');
  if (dataTheme === 'black' || dataTheme === 'premium-dark' || dataTheme === 'gray' || isDarkClass) {
    return 'obsidian';
  }
  return 'parchment';
}

export function WrappedCardCanvas({ data }: WrappedCardCanvasProps) {
  const [format, setFormat] = useState<WrappedExportFormat>('story');
  const [cardTheme, setCardTheme] = useState<WrappedCardTheme>(getInitialCardTheme);
  const [rendering, setRendering] = useState(false);
  const [copied, setCopied] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const drawCard = useCallback(async () => {
    if (!canvasRef.current) return;
    setRendering(true);
    try {
      if (format === 'story') {
        await renderStoryCard(canvasRef.current, data, cardTheme);
      } else {
        await renderLandscapeCard(canvasRef.current, data, cardTheme);
      }
      const dataUrl = canvasRef.current.toDataURL('image/png');
      setPreviewUrl(dataUrl);
    } catch (err) {
      console.error('[WrappedCardCanvas] Failed to render card:', err);
      toast.error('Failed to generate preview image');
    } finally {
      setRendering(false);
    }
  }, [data, format, cardTheme]);

  useEffect(() => {
    drawCard();
  }, [drawCard]);

  const handleDownload = () => {
    if (!canvasRef.current) return;
    try {
      const link = document.createElement('a');
      link.download = `shiori-wrapped-${data.year}-${format}-${cardTheme}.png`;
      link.href = canvasRef.current.toDataURL('image/png');
      link.click();
      toast.success(`Saved Shiori Wrapped (${format.toUpperCase()} · ${cardTheme.toUpperCase()}) PNG!`);
    } catch (err) {
      console.error('[WrappedCardCanvas] Download failed:', err);
      toast.error('Failed to download image');
    }
  };

  const handleCopy = async () => {
    if (!canvasRef.current) return;
    try {
      canvasRef.current.toBlob(async (blob) => {
        if (!blob) {
          toast.error('Failed to copy image to clipboard');
          return;
        }
        try {
          if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': blob }),
            ]);
            setCopied(true);
            toast.success('Wrapped card copied to clipboard!');
            setTimeout(() => setCopied(false), 2500);
          } else {
            handleDownload();
          }
        } catch {
          handleDownload();
        }
      }, 'image/png');
    } catch (err) {
      console.error('[WrappedCardCanvas] Copy failed:', err);
      toast.error('Could not copy image');
    }
  };

  return (
    <div className="flex flex-col items-center gap-3.5 w-full">
      {/* Format & Theme Selectors */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {/* Format Selector */}
        <div className="flex items-center gap-1 p-1 bg-muted/60 border border-border/60 rounded-xl">
          <button
            type="button"
            onClick={() => setFormat('story')}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
              format === 'story'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Smartphone size={13} />
            Story (9:16)
          </button>
          <button
            type="button"
            onClick={() => setFormat('card')}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
              format === 'card'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Monitor size={13} />
            Post Card (16:9)
          </button>
        </div>

        {/* Theme Selector */}
        <div className="flex items-center gap-1 p-1 bg-muted/60 border border-border/60 rounded-xl">
          <button
            type="button"
            onClick={() => setCardTheme('parchment')}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
              cardTheme === 'parchment'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-[#f7f1e7] border border-[#dfd2c2]" />
            Parchment
          </button>
          <button
            type="button"
            onClick={() => setCardTheme('obsidian')}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
              cardTheme === 'obsidian'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <span className="w-2.5 h-2.5 rounded-full bg-[#0c0a08] border border-[#3b3229]" />
            Obsidian
          </button>
        </div>
      </div>

      {/* Hidden high-res canvas */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Card Preview Container */}
      <div className="relative group max-w-full flex items-center justify-center">
        {rendering && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-card/80 backdrop-blur-sm rounded-2xl">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="text-xs font-semibold text-muted-foreground">Rendering high-res card...</span>
          </div>
        )}

        {previewUrl ? (
          <div className="relative overflow-hidden rounded-2xl border border-border/70 shadow-xl transition-all group-hover:border-primary/40 bg-card">
            <img
              src={previewUrl}
              alt={`Shiori Wrapped ${data.year}`}
              className={cn(
                "object-contain transition-all duration-300",
                format === 'story'
                  ? 'h-[300px] sm:h-[340px] w-auto aspect-[9/16]'
                  : 'w-full max-w-[400px] sm:max-w-[440px] h-auto aspect-[16/9]'
              )}
            />
          </div>
        ) : (
          <div
            className={cn(
              "flex items-center justify-center rounded-2xl bg-muted/30 border border-border/60",
              format === 'story' ? 'w-[190px] h-[340px]' : 'w-[400px] h-[225px]'
            )}
          >
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-3 w-full max-w-xs justify-center pt-1">
        <Button
          onClick={handleDownload}
          variant="default"
          className="flex-1 font-bold gap-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs h-10"
        >
          <Download size={15} />
          Save PNG
        </Button>
        <Button
          onClick={handleCopy}
          variant="outline"
          className="flex-1 font-bold gap-2 rounded-xl h-10 border-border/60 text-foreground hover:bg-muted"
        >
          {copied ? <Check size={15} className="text-emerald-500" /> : <Copy size={15} />}
          {copied ? 'Copied!' : 'Copy'}
        </Button>
      </div>

      <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
        <Award size={13} className="text-primary" />
        High-resolution 100% offline generation · Ready to share on social media
      </p>
    </div>
  );
}
