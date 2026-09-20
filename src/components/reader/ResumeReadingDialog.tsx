import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Play, RotateCcw, X } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';

export interface ResumeReadingDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  bookTitle: string;
  bookAuthor?: string;
  coverPath?: string;
  lastRead?: string;
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
  bookAuthor,
  lastRead,
  progressPercent,
  locationLabel,
  onResume,
  onStartOver,
}) => {
  const pct = Math.round(Math.min(100, Math.max(0, progressPercent)));

  return (
    <Dialog.Root open={isOpen} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-in fade-in-0" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[calc(100vw-32px)] max-w-sm sm:max-w-md bg-card text-card-foreground border border-border/80 rounded-2xl shadow-xl p-5 sm:p-6 focus:outline-none animate-in fade-in-0 zoom-in-95"
          style={{ backgroundColor: 'hsl(var(--card))', opacity: 1 }}
          aria-describedby="resume-reading-description"
        >
          {/* Close button */}
          <Dialog.Close asChild>
            <button
              className="absolute top-4 right-4 p-1.5 rounded-full text-muted-foreground/60 hover:text-foreground hover:bg-muted/80 transition-colors focus:outline-none"
              aria-label="Close dialog"
            >
              <X className="w-4 h-4" />
            </button>
          </Dialog.Close>

          {/* Book Header */}
          <div className="pr-7 space-y-1">
            <Dialog.Title className="text-lg font-bold text-foreground leading-snug tracking-tight line-clamp-2">
              {bookTitle}
            </Dialog.Title>

            {(bookAuthor || lastRead) && (
              <p className="text-xs text-muted-foreground truncate">
                {bookAuthor}
                {bookAuthor && lastRead ? ' • ' : ''}
                {lastRead ? `Last read ${formatRelativeTime(lastRead)}` : ''}
              </p>
            )}
          </div>

          {/* Progress Bar */}
          <div id="resume-reading-description" className="space-y-1.5 my-4">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-foreground">{locationLabel}</span>
              <span className="text-muted-foreground">{pct}% complete</span>
            </div>
            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-2 pt-1">
            <button
              id="resume-reading-continue-btn"
              onClick={onResume}
              className="w-full h-11 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-sm hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              autoFocus
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Resume Reading</span>
            </button>

            <button
              id="resume-reading-start-over-btn"
              onClick={onStartOver}
              className="w-full h-9 px-4 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Start from the beginning</span>
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default ResumeReadingDialog;
