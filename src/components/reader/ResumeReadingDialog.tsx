import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { BookOpen, RotateCcw, BookMarked } from 'lucide-react';

interface ResumeReadingDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  bookTitle: string;
  /** Progress percentage (0–100) */
  progressPercent: number;
  /** Human-readable location, e.g. "Chapter 3" or "Page 42" */
  locationLabel: string;
  /** Called when user wants to resume at the last position */
  onResume: () => void;
  /** Called when user wants to start fresh from the beginning */
  onStartOver: () => void;
}

export const ResumeReadingDialog: React.FC<ResumeReadingDialogProps> = ({
  isOpen,
  onOpenChange,
  bookTitle,
  progressPercent,
  locationLabel,
  onResume,
  onStartOver,
}) => {
  const pct = Math.round(Math.min(100, Math.max(0, progressPercent)));

  return (
    <Dialog.Root open={isOpen} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 bg-black/50 backdrop-blur-sm z-50 animate-in fade-in-0" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-background border border-border rounded-2xl shadow-2xl p-0 focus:outline-none animate-in fade-in-0 zoom-in-95"
          aria-describedby="resume-reading-description"
        >
          {/* Header */}
          <div className="flex flex-col items-center px-6 pt-7 pb-4 text-center gap-3">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
              <BookMarked className="w-7 h-7 text-primary" />
            </div>
            <Dialog.Title className="text-xl font-semibold text-foreground leading-snug">
              Continue reading?
            </Dialog.Title>
          </div>

          {/* Body */}
          <div className="px-6 pb-5 space-y-4">
            <p
              id="resume-reading-description"
              className="text-sm text-muted-foreground text-center leading-relaxed"
            >
              You were reading{' '}
              <span className="font-medium text-foreground">{bookTitle}</span>.
              Pick up where you left off or start from the beginning.
            </p>

            {/* Progress bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{locationLabel}</span>
                <span>{pct}% complete</span>
              </div>
              <div className="h-1.5 w-full bg-accent rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex flex-col gap-2 px-6 pb-6">
            {/* Primary: Resume */}
            <button
              id="resume-reading-continue-btn"
              onPointerDown={(e) => { e.preventDefault(); onResume(); }}
              onClick={onResume}
              className="w-full px-4 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-sm"
            >
              <BookOpen className="w-4 h-4" />
              Continue from {locationLabel}
            </button>

            {/* Secondary: Start over */}
            <button
              id="resume-reading-start-over-btn"
              onPointerDown={(e) => { e.preventDefault(); onStartOver(); }}
              onClick={onStartOver}
              className="w-full px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Start from the beginning
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
