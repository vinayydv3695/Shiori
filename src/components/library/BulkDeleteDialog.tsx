import React, { useState, useMemo } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  AlertTriangle,
  Trash2,
  X,
  Loader2,
  Check,
  ShieldAlert,
  Archive,
  Layers,
  FileText,
} from 'lucide-react';
import { api, type Book } from '@/lib/tauri';
import { useLibraryStore } from '@/store/libraryStore';
import { useToast } from '@/store/toastStore';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { invalidateCover } from '@/lib/coverCache';
import { logger } from '@/lib/logger';

interface BulkDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookIds: number[];
  initialMode?: 'trash' | 'permanent';
  onDeleted?: () => void;
}

export function BulkDeleteDialog({
  open,
  onOpenChange,
  bookIds,
  initialMode = 'trash',
  onDeleted,
}: BulkDeleteDialogProps) {
  const [mode, setMode] = useState<'trash' | 'permanent'>(initialMode);
  const [isDeleting, setIsDeleting] = useState(false);
  const toast = useToast();
  const books = useLibraryStore((s) => s.books);

  // Sync initialMode when modal opens
  React.useEffect(() => {
    if (open) {
      setMode(initialMode);
    }
  }, [open, initialMode]);

  // Analyze the selected items: series vs standalone books
  const { selectedBooks, seriesBreakdown, standaloneBooks } = useMemo(() => {
    const selected = books.filter((b) => b.id != null && bookIds.includes(b.id));
    const seriesMap = new Map<string, Book[]>();
    const standalone: Book[] = [];

    for (const b of selected) {
      const sName = b.series?.trim();
      if (sName) {
        if (!seriesMap.has(sName)) seriesMap.set(sName, []);
        seriesMap.get(sName)!.push(b);
      } else {
        standalone.push(b);
      }
    }

    const seriesList = Array.from(seriesMap.entries()).map(([title, sBooks]) => ({
      title,
      books: sBooks,
      count: sBooks.length,
    }));

    return {
      selectedBooks: selected,
      seriesBreakdown: seriesList,
      standaloneBooks: standalone,
    };
  }, [books, bookIds]);

  const totalCount = bookIds.length;
  const isPermanent = mode === 'permanent';

  const handleDelete = async () => {
    if (totalCount === 0 || isDeleting) return;
    setIsDeleting(true);

    try {
      if (isPermanent) {
        // ── Permanent Deletion (Bypasses Recycle Bin) ──
        await api.permanentDeleteBooks(bookIds);

        // Also clean up any manga series containers if all their books were selected
        try {
          const list = await api.getMangaSeriesList(1000, 0);
          for (const s of seriesBreakdown) {
            const target = list.find((ms) => ms.title.toLowerCase() === s.title.toLowerCase());
            if (target?.id != null) {
              await api.deleteMangaSeries(target.id);
            }
          }
        } catch (e) {
          logger.debug('[BulkDeleteDialog] Manga series cleanup non-critical error:', e);
        }

        // Invalidate covers
        for (const id of bookIds) {
          invalidateCover(id);
        }

        toast.success(
          'Permanently Deleted',
          totalCount === 1
            ? '1 book permanently erased from disk.'
            : `${totalCount} books/volumes permanently erased from disk.`
        );
      } else {
        // ── Regular Deletion (Moves to Recycle Bin) ──
        await api.deleteBooks(bookIds);

        toast.success(
          'Moved to Recycle Bin',
          totalCount === 1
            ? '1 book moved to Recycle Bin.'
            : `${totalCount} books/volumes moved to Recycle Bin.`
        );
      }

      // Optimistically update store
      const current = useLibraryStore.getState().books;
      useLibraryStore.setState({
        books: current.filter((b) => b.id != null && !bookIds.includes(b.id)),
        totalCount: Math.max(0, useLibraryStore.getState().totalCount - totalCount),
      });
      useLibraryStore.getState().clearSelection();

      onDeleted?.();
      onOpenChange(false);
    } catch (err) {
      logger.error('[BulkDeleteDialog] Failed to delete items:', err);
      toast.error(
        'Deletion Failed',
        err instanceof Error ? err.message : 'An unexpected error occurred during deletion.'
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 z-[200] bg-black/65 backdrop-blur-xl transition-all duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-32px)] max-w-lg max-h-[88vh] bg-background dark:bg-card border border-border/80 rounded-3xl shadow-2xl z-[210] flex flex-col overflow-hidden focus:outline-none transition-all duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 font-sans"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border/60">
            <div className="flex items-center gap-2.5">
              <div
                className={cn(
                  'w-9 h-9 rounded-xl flex items-center justify-center shadow-xs',
                  isPermanent
                    ? 'bg-rose-500/15 text-rose-500 border border-rose-500/30'
                    : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                )}
              >
                {isPermanent ? <ShieldAlert className="w-5 h-5" /> : <Trash2 className="w-5 h-5" />}
              </div>
              <div>
                <Dialog.Title className="text-base font-bold text-foreground">
                  {isPermanent ? 'Permanently Delete' : 'Delete Items'}
                </Dialog.Title>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {totalCount} {totalCount === 1 ? 'item' : 'items'} selected
                  {seriesBreakdown.length > 0 && ` (${seriesBreakdown.length} series)`}
                </p>
              </div>
            </div>

            <Dialog.Close asChild>
              <button
                type="button"
                className="p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </div>

          {/* Content Body */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {/* Mode Selection Cards */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Deletion Method
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* Mode 1: Move to Recycle Bin */}
                <button
                  type="button"
                  onClick={() => setMode('trash')}
                  className={cn(
                    'p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between space-y-2 shadow-2xs',
                    mode === 'trash'
                      ? 'bg-amber-500/10 border-amber-500/50 ring-2 ring-amber-500/30'
                      : 'bg-muted/40 hover:bg-muted/70 border-border/60 text-muted-foreground hover:text-foreground'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Archive className={cn('w-4 h-4', mode === 'trash' ? 'text-amber-500' : 'text-muted-foreground')} />
                      <span className="text-xs font-bold text-foreground">Move to Recycle Bin</span>
                    </div>
                    {mode === 'trash' && <Check className="w-4 h-4 text-amber-500 stroke-[3]" />}
                  </div>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Safely moves items to the Recycle Bin. Can be easily restored from Trash at any time.
                  </p>
                  <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                    Recommended
                  </span>
                </button>

                {/* Mode 2: Permanent Delete */}
                <button
                  type="button"
                  onClick={() => setMode('permanent')}
                  className={cn(
                    'p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between space-y-2 shadow-2xs',
                    mode === 'permanent'
                      ? 'bg-rose-500/10 border-rose-500/60 ring-2 ring-rose-500/30'
                      : 'bg-muted/40 hover:bg-muted/70 border-border/60 text-muted-foreground hover:text-foreground'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className={cn('w-4 h-4', mode === 'permanent' ? 'text-rose-500' : 'text-muted-foreground')} />
                      <span className="text-xs font-bold text-foreground">Permanent Delete</span>
                    </div>
                    {mode === 'permanent' && <Check className="w-4 h-4 text-rose-500 stroke-[3]" />}
                  </div>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Bypasses the Recycle Bin. Completely deletes records and files from disk. Irreversible.
                  </p>
                  <span className="text-[10px] font-semibold text-rose-500 uppercase tracking-wider">
                    Cannot be undone
                  </span>
                </button>
              </div>
            </div>

            {/* Warning Banner if Permanent Mode is active */}
            {isPermanent && (
              <div
                data-testid="bulk-delete-warning-banner"
                className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs flex items-start gap-2.5"
              >
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <strong>Warning:</strong> These books will <strong>NOT</strong> go to the Recycle Bin. The files will be permanently deleted from your computer or storage.
                </div>
              </div>
            )}

            {/* Breakdown of What Is Being Deleted */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                <span>Selected Items Overview</span>
                <span className="text-[11px] font-mono font-medium">{totalCount} items</span>
              </label>

              <div className="max-h-44 overflow-y-auto rounded-2xl border border-border/60 bg-muted/30 p-2.5 space-y-1.5 divide-y divide-border/40">
                {seriesBreakdown.map((s, idx) => (
                  <div key={idx} className={cn('flex items-center justify-between pt-1.5 first:pt-0 text-xs')}>
                    <span className="flex items-center gap-1.5 font-medium text-foreground truncate max-w-[70%]">
                      <Layers className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="truncate">{s.title}</span>
                    </span>
                    <span className="px-2 py-0.5 rounded-lg text-[10.5px] font-bold bg-muted font-mono text-muted-foreground">
                      {s.count} {s.count === 1 ? 'volume' : 'volumes'}
                    </span>
                  </div>
                ))}

                {standaloneBooks.length > 0 && (
                  <div className="flex items-center justify-between pt-1.5 first:pt-0 text-xs">
                    <span className="flex items-center gap-1.5 font-medium text-foreground">
                      <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span>Individual Books</span>
                    </span>
                    <span className="px-2 py-0.5 rounded-lg text-[10.5px] font-bold bg-muted font-mono text-muted-foreground">
                      {standaloneBooks.length} {standaloneBooks.length === 1 ? 'book' : 'books'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="px-6 py-4 border-t border-border/60 bg-muted/25 flex items-center justify-between gap-3">
            <Dialog.Close asChild>
              <Button variant="outline" size="sm" disabled={isDeleting} className="rounded-xl text-xs font-semibold">
                Cancel
              </Button>
            </Dialog.Close>

            <Button
              type="button"
              size="sm"
              data-testid="bulk-delete-confirm-btn"
              onClick={handleDelete}
              disabled={isDeleting}
              variant={isPermanent ? 'destructive' : 'default'}
              className={cn(
                'rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm min-w-36 transition-all',
                !isPermanent && 'bg-amber-600 hover:bg-amber-700 text-white'
              )}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Deleting...</span>
                </>
              ) : isPermanent ? (
                <>
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Permanently Delete</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Move to Recycle Bin</span>
                </>
              )}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
