/**
 * AudiobookConversionFloatingPill.tsx
 *
 * Minimal floating indicator rendered while an audiobook conversion is running
 * in the background. Allows the reader to read completely undisturbed while keeping
 * live synthesis progress visible at a glance. Clicking restores the dialog.
 */

import React from 'react';
import { Headphones, X, Square } from 'lucide-react';
import { useAudiobookConversionStore } from '@/store/audiobookConversionStore';

export function AudiobookConversionFloatingPill() {
  const isConverting = useAudiobookConversionStore((s) => s.isConverting);
  const isMinimized = useAudiobookConversionStore((s) => s.isMinimized);
  const currentChapterTitle = useAudiobookConversionStore((s) => s.currentChapterTitle);
  const progressPercent = useAudiobookConversionStore((s) => s.progressPercent);
  const restore = useAudiobookConversionStore((s) => s.restore);
  const cancelConversion = useAudiobookConversionStore((s) => s.cancelConversion);

  if (!isConverting || !isMinimized) {
    return null;
  }

  return (
    <div className="fixed bottom-6 right-6 z-[160] flex items-center gap-1.5 animate-in fade-in slide-in-from-bottom-3 duration-300">
      <div
        role="button"
        tabIndex={0}
        onClick={restore}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            restore();
          }
        }}
        className="group flex items-center gap-2.5 px-3.5 py-2 rounded-full border border-primary/40 shadow-xl backdrop-blur-md cursor-pointer transition-all hover:scale-102 active:scale-98 select-none"
        style={{
          backgroundColor: 'var(--bg-elevated, hsl(var(--card)))',
          color: 'var(--text-primary, hsl(var(--card-foreground)))',
        }}
        title="Audiobook converting in background. Click to open details."
      >
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
        </span>

        <Headphones className="w-3.5 h-3.5 text-primary shrink-0" />

        <div className="flex items-center gap-2 text-xs font-semibold max-w-[180px] sm:max-w-[220px]">
          <span className="truncate">
            {currentChapterTitle ? `Narrating: ${currentChapterTitle}` : 'Converting audiobook...'}
          </span>
          <span className="font-mono font-bold text-primary shrink-0">
            {progressPercent}%
          </span>
        </div>
      </div>

      {/* Quick Stop Button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          cancelConversion();
        }}
        className="w-7 h-7 rounded-full flex items-center justify-center border border-border/80 shadow-md hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-all cursor-pointer opacity-70 hover:opacity-100"
        style={{
          backgroundColor: 'var(--bg-elevated, hsl(var(--card)))',
          color: 'var(--text-secondary, hsl(var(--muted-foreground)))',
        }}
        title="Stop background conversion"
        aria-label="Stop background conversion"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
