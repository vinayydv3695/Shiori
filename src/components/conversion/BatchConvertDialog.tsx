/**
 * BatchConvertDialog.tsx
 *
 * Bulk "Convert to EPUB" for multi-selected library books.
 *
 * Flow (sequential, one book at a time):
 *   1. api.convertBook(bookId)            → { new_path, new_format }
 *   2. api.importBooks([new_path])        → the converted EPUB joins the library
 *   3. api.deleteBooks([bookId])          → original goes to the recycle bin
 *   4. useLibraryStore.loadInitialBooks() → refresh the library
 *
 * Per-book status is tracked in a list of rows (queued / converting / done /
 * failed / skipped). The shared <ConversionProgress> overlay is shown while
 * any book converts — it mirrors the active job's real progress events
 * (conversion:progress) since we convert sequentially.
 *
 * Failures are collected per-book and surfaced in the dialog summary.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, FileOutput, Loader2, CheckCircle2, XCircle, Clock, MinusCircle } from 'lucide-react';
import type { Book } from '@/lib/tauri';
import { api } from '@/lib/tauri';
import { logger } from '@/lib/logger';
import { Button } from '@/components/ui/button';
import { ConversionProgress } from '@/components/reader/ConversionProgress';
import { useToastStore } from '@/store/toastStore';
import { useLibraryStore } from '@/store/libraryStore';
import { useConversionStore } from '@/store/conversionStore';
import { cn } from '@/lib/utils';
import {
  createBatchItems,
  markConverting,
  markDone,
  markFailed,
  queuedItems,
  summarize,
  type BatchConvertItem,
  type BatchConvertSummary,
} from './batchConvertState';

interface BatchConvertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The selected books to convert (snapshot taken when the dialog opens). */
  books: Book[];
}

const STATUS_META: Record<
  BatchConvertItem['status'],
  { icon: React.ReactNode; label: string; className: string }
> = {
  queued: {
    icon: <Clock className="w-3.5 h-3.5" />,
    label: 'Queued',
    className: 'text-muted-foreground',
  },
  converting: {
    icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />,
    label: 'Converting',
    className: 'text-amber-500',
  },
  done: {
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    label: 'Done',
    className: 'text-green-500',
  },
  failed: {
    icon: <XCircle className="w-3.5 h-3.5" />,
    label: 'Failed',
    className: 'text-destructive',
  },
  skipped: {
    icon: <MinusCircle className="w-3.5 h-3.5" />,
    label: 'Skipped (already EPUB)',
    className: 'text-muted-foreground/60',
  },
};

export function BatchConvertDialog({ open, onOpenChange, books }: BatchConvertDialogProps) {
  const [items, setItems] = useState<BatchConvertItem[]>([]);
  const [running, setRunning] = useState(false);
  const [currentTitle, setCurrentTitle] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const cancelledRef = useRef(false);
  const itemsRef = useRef<BatchConvertItem[]>([]);

  // Rebuild the per-book status list every time the dialog opens.
  useEffect(() => {
    if (open) {
      const next = createBatchItems(books);
      itemsRef.current = next;
      // Intentional: reset the run state whenever the dialog reopens.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setItems(next);
      setRunning(false);
      setStarted(false);
      setCurrentTitle(null);
      cancelledRef.current = false;
    }
  }, [open, books]);

  const summary: BatchConvertSummary = useMemo(() => summarize(items), [items]);
  const activeItems = queuedItems(items);
  const progressPercent =
    summary.total === 0
      ? 0
      : Math.round(((summary.done + summary.failed + summary.skipped) / summary.total) * 100);

  const updateItems = useCallback((updater: (prev: BatchConvertItem[]) => BatchConvertItem[]) => {
    setItems((prev) => {
      const next = updater(prev);
      itemsRef.current = next;
      return next;
    });
  }, []);

  const handleCancelOverlay = useCallback(() => {
    cancelledRef.current = true;
    // Best-effort cancel of the in-flight job (tracked by the conversion store).
    const job = useConversionStore
      .getState()
      .jobs.find((j) => j.status === 'Queued' || j.status === 'Processing');
    if (job) {
      useConversionStore.getState().cancelJob(job.id).catch(() => {});
    }
  }, []);

  const handleStart = useCallback(async () => {
    if (running) return;
    const toConvert = queuedItems(itemsRef.current);
    if (toConvert.length === 0) return;

    cancelledRef.current = false;
    setRunning(true);
    setStarted(true);

    let done = 0;
    const failed: { title: string; error: string }[] = [];

    for (const item of toConvert) {
      if (cancelledRef.current) break;
      setCurrentTitle(item.title);
      updateItems((prev) => markConverting(prev, item.bookId));

      try {
        // 1. Convert (non-destructive — original file untouched).
        const result = await api.convertBook(item.bookId);
        const newPath = result.new_path;

        // 2. Import the converted EPUB into the library.
        await api.importBooks([newPath]);

        // 3. Remove the original (recycle bin when enabled).
        await api.deleteBooks([item.bookId]);

        // 4. Refresh the library so the swap is visible.
        await useLibraryStore.getState().loadInitialBooks();

        done += 1;
        updateItems((prev) => markDone(prev, item.bookId));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(`[BatchConvert] Failed to convert book ${item.bookId} (${item.title}):`, err);
        failed.push({ title: item.title, error: message });
        updateItems((prev) => markFailed(prev, item.bookId, message));
      }
    }

    setRunning(false);
    setCurrentTitle(null);

    const toast = useToastStore.getState();
    if (failed.length === 0) {
      toast.addToast({
        title: 'Batch conversion complete',
        description: `${done} book${done === 1 ? '' : 's'} converted to EPUB and imported.`,
        variant: 'success',
      });
    } else {
      toast.addToast({
        title: 'Batch conversion finished with errors',
        description: `${done} converted, ${failed.length} failed — see the dialog for details.`,
        variant: 'error',
      });
    }
  }, [running, updateItems]);

  const handleClose = useCallback(() => {
    if (running) return; // keep the dialog open while converting
    onOpenChange(false);
  }, [running, onOpenChange]);

  return (
    <>
      <Dialog.Root open={open} onOpenChange={(next) => {
        if (next) onOpenChange(next)
        else handleClose()
      }}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay fixed inset-0 z-[70] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content className="fixed left-[50%] top-[50%] z-[70] grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border border-border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg">
            <div className="flex flex-col space-y-1.5">
              <div className="flex items-center justify-between">
                <Dialog.Title className="text-lg font-semibold leading-none tracking-tight flex items-center gap-2">
                  <FileOutput className="h-5 w-5" />
                  Convert to EPUB
                </Dialog.Title>
                <Dialog.Close
                  disabled={running}
                  className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
                >
                  <X className="h-4 w-4" />
                  <span className="sr-only">Close</span>
                </Dialog.Close>
              </div>
              <Dialog.Description className="text-sm text-muted-foreground">
                {summary.total} book{summary.total === 1 ? '' : 's'} selected — each is
                converted, imported as EPUB, and the original is removed (recycle bin).
              </Dialog.Description>
            </div>

            {/* Overall progress */}
            {started && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-medium text-muted-foreground">
                  <span>
                    {running
                      ? `Converting: ${currentTitle ?? '…'}`
                      : summary.failed > 0
                        ? 'Finished with errors'
                        : 'Finished'}
                  </span>
                  <span className="text-primary tabular-nums">{progressPercent}%</span>
                </div>
                <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${progressPercent}%`,
                      background: 'linear-gradient(90deg, hsl(var(--primary)), hsl(var(--primary) / 0.6))',
                    }}
                  />
                </div>
              </div>
            )}

            {/* Per-book status list */}
            <div className="py-2 max-h-[45vh] overflow-y-auto space-y-1.5 -mx-2 px-2">
              {items.length === 0 ? (
                <div className="text-center text-muted-foreground py-8 text-sm">
                  No convertible books selected.
                </div>
              ) : (
                items.map((item) => {
                  const meta = STATUS_META[item.status];
                  return (
                    <div
                      key={item.bookId}
                      className={cn(
                        'flex items-center gap-2.5 p-2.5 rounded-lg border border-border/60 bg-muted/40',
                        item.status === 'converting' && 'border-amber-500/40 bg-amber-500/5',
                        item.status === 'failed' && 'border-destructive/30 bg-destructive/5',
                      )}
                    >
                      <span className={cn(meta.className, 'shrink-0')}>{meta.icon}</span>
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-sm font-medium text-foreground truncate" title={item.title}>
                          {item.title}
                        </span>
                        {item.status === 'failed' && item.error ? (
                          <span className="text-xs text-destructive truncate" title={item.error}>
                            {item.error}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {item.format ? `${item.format.toUpperCase()} → EPUB` : 'Unknown format → EPUB'}
                          </span>
                        )}
                      </div>
                      <span
                        className={cn(
                          'px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap',
                          meta.className,
                          'bg-muted',
                        )}
                      >
                        {meta.label}
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {summary.done > 0 && <span className="text-green-500">{summary.done} done</span>}
                {summary.done > 0 && summary.failed > 0 && <span> · </span>}
                {summary.failed > 0 && <span className="text-destructive">{summary.failed} failed</span>}
                {summary.skipped > 0 && (
                  <>
                    {summary.done + summary.failed > 0 && <span> · </span>}
                    <span>{summary.skipped} skipped</span>
                  </>
                )}
              </span>
              <div className="flex items-center gap-2">
                {!running && (
                  <Button variant="outline" onClick={handleClose}>
                    {started ? 'Close' : 'Cancel'}
                  </Button>
                )}
                {!started && (
                  <Button onClick={handleStart} disabled={activeItems.length === 0}>
                    <FileOutput className="w-4 h-4 mr-2" />
                    Convert {activeItems.length > 0 ? `${activeItems.length} book${activeItems.length === 1 ? '' : 's'}` : ''}
                  </Button>
                )}
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Global conversion overlay — mirrors the active job's progress events.
          Driven manually: visible while any book in the batch is converting. */}
      <ConversionProgress
        visible={running}
        bookTitle={currentTitle ?? undefined}
        onCancel={handleCancelOverlay}
      />
    </>
  );
}

export default BatchConvertDialog;
