import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, FileWarning, Loader2, ArrowRight, BookOpen } from 'lucide-react';

interface AutoConvertDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  bookTitle: string;
  currentFormat: string;
  onConfirm: () => void;
  onCancel: () => void;
  isConverting: boolean;
}

const FORMAT_LABELS: Record<string, string> = {
  mobi: 'MOBI',
  azw3: 'AZW3',
  pdf: 'PDF',
  txt: 'TXT',
  docx: 'DOCX',
  fb2: 'FB2',
  html: 'HTML',
};

export const AutoConvertDialog: React.FC<AutoConvertDialogProps> = ({
  isOpen,
  onOpenChange,
  bookTitle,
  currentFormat,
  onConfirm,
  onCancel,
  isConverting,
}) => {
  const formatLabel = FORMAT_LABELS[currentFormat.toLowerCase()] ?? currentFormat.toUpperCase();

  return (
    <Dialog.Root open={isOpen} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 animate-in fade-in-0" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-background border border-border rounded-xl shadow-2xl p-0 focus:outline-none animate-in fade-in-0 zoom-in-95"
          aria-describedby="auto-convert-description"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <Dialog.Title className="text-lg font-semibold text-foreground flex items-center gap-2">
              <FileWarning className="w-5 h-5 text-amber-500" />
              Convert to EPUB?
            </Dialog.Title>
            {!isConverting && (
              <Dialog.Close asChild>
                <button
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </Dialog.Close>
            )}
          </div>

          {/* Body */}
          <div className="px-6 py-5 space-y-4">
            <p className="text-sm text-foreground leading-relaxed">
              <span className="font-medium">{bookTitle}</span> is in{' '}
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-accent text-xs font-bold uppercase tracking-wider">
                {formatLabel}
              </span>{' '}
              format. Convert it to EPUB for better readability?
            </p>

            <div
              id="auto-convert-description"
              className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20"
            >
              <FileWarning className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-amber-600 dark:text-amber-400">
                The original {formatLabel} file will be permanently deleted after successful conversion.
              </p>
            </div>

            {isConverting && (
              <div className="flex items-center justify-center gap-3 py-3">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">
                  Converting to EPUB…
                </span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex gap-3 px-6 py-4 border-t border-border">
            <button
              onClick={onCancel}
              disabled={isConverting}
              className="flex-1 px-4 py-2.5 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              <BookOpen className="w-4 h-4" />
              Open as {formatLabel}
            </button>
            <button
              onClick={onConfirm}
              disabled={isConverting}
              className="flex-1 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity flex items-center justify-center gap-2"
            >
              {isConverting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Converting…
                </>
              ) : (
                <>
                  Convert to EPUB
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
