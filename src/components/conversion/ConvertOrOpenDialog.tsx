/**
 * ConvertOrOpenDialog.tsx
 *
 * Shown when the user opens a book in a convertible non-EPUB format:
 * "Convert to EPUB for the best reading experience" or "Open as-is".
 *
 * Matches the app's dialog aesthetics (Radix + the same classes used by
 * BookDetailsDialog). Conversion runs through <ConvertToEpubMenuItem
 * variant="overlay" autoStart> — the shared conversion flow (percentage
 * overlay, auto-import of the EPUB, recycle-bin of the original).
 */
import * as Dialog from '@radix-ui/react-dialog';
import { FileOutput, BookOpen } from 'lucide-react';
import { useState } from 'react';
import { isAndroid } from '@/lib/tauri';
import { ConvertToEpubMenuItem } from './ConvertToEpubMenuItem';

const FORMAT_LABELS: Record<string, string> = {
  pdf: 'PDF',
  mobi: 'MOBI',
  azw: 'AZW',
  azw3: 'AZW3',
  docx: 'DOCX',
  fb2: 'FB2',
  txt: 'TXT',
  html: 'HTML',
  htm: 'HTML',
  md: 'Markdown',
  markdown: 'Markdown',
};

export interface ConvertOrOpenBook {
  id: number;
  title: string;
  format: string;
}

interface ConvertOrOpenDialogProps {
  book: ConvertOrOpenBook | null;
  /** Open the book natively in its current format */
  onOpenNative: () => void;
  onClose: () => void;
}

export function ConvertOrOpenDialog({ book, onOpenNative, onClose }: ConvertOrOpenDialogProps) {
  const [convertChosen, setConvertChosen] = useState(false);
  const formatLabel = book
    ? (FORMAT_LABELS[book.format.toLowerCase()] ?? book.format.toUpperCase())
    : '';

  // Android: Radix Dialog + Portal touch events are unreliable in the Android
  // WebView, so render a plain fixed-position overlay with the same content
  // and styling (no portal, no Radix). Desktop keeps the Radix implementation.
  if (isAndroid) {
    return (
      <>
        {book !== null && !convertChosen && (
          <>
            <div className="fixed inset-0 z-[90] bg-background/80 backdrop-blur-md" onClick={onClose} />
            <div className="fixed left-[50%] top-[50%] z-[95] w-[92vw] sm:w-[440px] -translate-x-[50%] -translate-y-[50%] rounded-2xl border border-border/50 bg-background/95 backdrop-blur-3xl shadow-2xl p-6">
              <div className="flex flex-col gap-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <FileOutput className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-foreground">Convert to EPUB?</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      <span className="font-medium text-foreground line-clamp-1">{book.title}</span>
                      <span className="mt-1 block">
                        EPUB gives you the best reading experience in Shiori — typography, themes,
                        annotations, TTS and progress sync. The converted EPUB is imported
                        automatically and the {formatLabel} file moves to the recycle bin.
                      </span>
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => setConvertChosen(true)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
                  >
                    <FileOutput className="h-4 w-4" />
                    Convert to EPUB
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenNative();
                    }}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-border/60 bg-secondary/50 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
                  >
                    <BookOpen className="h-4 w-4" />
                    Open as {formatLabel || 'current format'}
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="mt-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Conversion overlay + flow — starts when the user picks "Convert to
            EPUB": percentage overlay, then auto-import + recycle-bin. */}
        {book && (
          <ConvertToEpubMenuItem
            key={book.id}
            bookId={book.id}
            bookTitle={book.title}
            format={book.format}
            variant="overlay"
            autoStart={convertChosen}
            reopenOnSuccess
            onImported={onClose}
            onDone={onClose}
          />
        )}
      </>
    );
  }

  return (
    <Dialog.Root
      open={book !== null && !convertChosen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 z-[90] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-[50%] top-[50%] z-[95] w-[92vw] sm:w-[440px] -translate-x-[50%] -translate-y-[50%] rounded-2xl border border-border/50 bg-background/95 backdrop-blur-3xl shadow-2xl p-6 duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <FileOutput className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <Dialog.Title className="text-base font-semibold text-foreground">
                  Convert to EPUB?
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  <span className="font-medium text-foreground line-clamp-1">{book?.title}</span>
                  <span className="mt-1 block">
                    EPUB gives you the best reading experience in Shiori — typography, themes,
                    annotations, TTS and progress sync. The converted EPUB is imported
                    automatically and the {formatLabel} file moves to the recycle bin.
                  </span>
                </Dialog.Description>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setConvertChosen(true)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
              >
                <FileOutput className="h-4 w-4" />
                Convert to EPUB
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenNative();
                }}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-border/60 bg-secondary/50 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
              >
                <BookOpen className="h-4 w-4" />
                Open as {formatLabel || 'current format'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="mt-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>

      {/* Conversion overlay + flow — starts when the user picks "Convert to
          EPUB": percentage overlay, then auto-import + recycle-bin. */}
      {book && (
        <ConvertToEpubMenuItem
          key={book.id}
          bookId={book.id}
          bookTitle={book.title}
          format={book.format}
          variant="overlay"
          autoStart={convertChosen}
          reopenOnSuccess
          onImported={() => onClose()}
          onDone={onClose}
        />
      )}
    </Dialog.Root>
  );
}

export default ConvertOrOpenDialog;
