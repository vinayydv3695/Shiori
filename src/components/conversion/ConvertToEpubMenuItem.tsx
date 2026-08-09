/**
 * ConvertToEpubMenuItem.tsx
 *
 * Explicit, NON-destructive "Convert to EPUB" menu action. Replaces the old
 * auto-convert dialog flow: conversion only ever runs when the user asks,
 * and the original file / DB row are never touched.
 *
 * Usage:
 *   <ConvertToEpubMenuItem bookId={42} format="pdf" variant="menu" />
 *
 * - variant="menu"    → full-width dropdown/menu item (reader top bar, card menus)
 * - variant="button"  → primary/secondary Button (dialogs)
 * - variant="overlay" → renders nothing until a conversion starts (context menus
 *                       that trigger via their own onClick)
 *
 * Progress is shown with the shared <ConversionProgress> overlay, which listens
 * for `conversion-progress` events. Completion is also driven by the job queue
 * events (`conversion:progress` / `conversion:complete` / `conversion:error`).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { FileOutput, Loader2 } from 'lucide-react';
import { api } from '@/lib/tauri';
import { logger } from '@/lib/logger';
import { getErrorMessage } from '@/lib/errors';
import { ConversionProgress } from '@/components/reader/ConversionProgress';
import { useToastStore } from '@/store/toastStore';
import { useLibraryStore } from '@/store/libraryStore';
import { useReaderStore } from '@/store/readerStore';
import { useConversionStore, type ConversionJob } from '@/store/conversionStore';
import { Button } from '@/components/ui/button';

interface ConvertToEpubMenuItemProps {
  bookId: number;
  bookTitle?: string;
  /** Book's current file format — hides the action for non-convertible formats */
  format?: string;
  variant?: 'menu' | 'button' | 'overlay';
  /** After a successful conversion, swap the open reader to the new EPUB */
  reopenOnSuccess?: boolean;
  /** Called when the conversion finishes (success or failure) */
  onDone?: () => void;
  /** Start the conversion automatically on mount (used by dialogs) */
  autoStart?: boolean;
  /** Called after the converted EPUB is imported + the original removed,
   *  with the new library book id (null when import/trash was skipped). */
  onImported?: (newBookId: number | null) => void;
}

/** Formats that are already EPUB (or manga/comics/non-local) — no conversion offered. */
const NON_CONVERTIBLE_FORMATS = new Set(['epub', 'online-manga', 'cbz', 'cbr']);

export function ConvertToEpubMenuItem({
  bookId,
  bookTitle,
  format,
  variant = 'menu',
  reopenOnSuccess = false,
  onDone,
  autoStart = false,
  onImported,
}: ConvertToEpubMenuItemProps) {
  const [isConverting, setIsConverting] = useState(false);

  const jobIdRef = useRef<string | null>(null);
  const resultPathRef = useRef<string | null>(null);
  const finishedRef = useRef(false);

  const finishSuccess = useCallback(async () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setIsConverting(false);
    const resultPath = resultPathRef.current;

    // Auto-import the converted EPUB and remove the original (recycle bin
    // when enabled) so the library holds a single EPUB copy — no duplicates.
    let newBookId: number | null = null;
    if (resultPath) {
      try {
        const imported = await api.importBooks([resultPath]);
        // Resolve the library row for the converted file — covers both the
        // fresh import and the duplicate case (already converted before).
        const importedBooks = await api.getBooksByPaths([resultPath]).catch(() => []);
        newBookId = importedBooks[0]?.id ?? null;
        const reallyImported = imported.success.length > 0 || imported.duplicates.includes(resultPath);
        if (reallyImported) {
          await api.deleteBooks([bookId]);
          await useLibraryStore.getState().loadInitialBooks().catch?.(() => {});
        }
      } catch (err) {
        logger.warn('[ConvertToEpub] import/trash step failed:', err);
      }
    }

    useToastStore.getState().addToast({
      title: 'Converted to EPUB',
      description: newBookId !== null
        ? 'Imported to your library — the original was removed.'
        : 'The EPUB file is ready.',
      variant: 'success',
      duration: 3000,
    });
    if (reopenOnSuccess && newBookId !== null && resultPath) {
      // Swap the open reader to the freshly imported EPUB.
      useReaderStore.getState().setStartFromBeginning(false);
      useReaderStore.getState().openBook(newBookId, resultPath, 'epub');
    }
    onImported?.(newBookId);
    onDone?.();
  }, [bookId, onDone, onImported, reopenOnSuccess]);

  const finishError = useCallback((message: string) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setIsConverting(false);
    useToastStore.getState().addToast({
      title: 'Conversion failed',
      description: message,
      variant: 'error',
    });
    onDone?.();
  }, [onDone]);

  const handleCancel = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setIsConverting(false);
    if (jobIdRef.current) {
      useConversionStore.getState().cancelJob(jobIdRef.current).catch(() => {});
    }
    useToastStore.getState().addToast({
      title: 'Conversion cancelled',
      variant: 'info',
      duration: 2500,
    });
    onDone?.();
  }, [onDone]);

  // Completion driven by the conversion engine's job events.
  useEffect(() => {
    if (!isConverting) return;
    let active = true;
    const unlisteners: UnlistenFn[] = [];

    (async () => {
      try {
        const unProgress = await listen<ConversionJob>('conversion:progress', ({ payload }) => {
          if (!active) return;
          if (payload.book_id !== null && payload.book_id !== undefined && payload.book_id !== bookId) return;
          jobIdRef.current = payload.id;
        });
        const unComplete = await listen<{ job_id: string; output_path: string }>('conversion:complete', ({ payload }) => {
          if (!active) return;
          if (jobIdRef.current && payload.job_id !== jobIdRef.current) return;
          resultPathRef.current = payload.output_path;
          finishSuccess();
        });
        const unError = await listen<{ job_id: string; error: string }>('conversion:error', ({ payload }) => {
          if (!active) return;
          if (jobIdRef.current && payload.job_id !== jobIdRef.current) return;
          finishError(payload.error || 'Conversion failed');
        });
        unlisteners.push(unProgress, unComplete, unError);
      } catch (err) {
        logger.error('[ConvertToEpub] Failed to subscribe to conversion events:', err);
      }
    })();

    return () => {
      active = false;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [isConverting, bookId, finishSuccess, finishError]);

  const handleConvert = useCallback(async () => {
    if (isConverting) return;
    finishedRef.current = false;
    jobIdRef.current = null;
    resultPathRef.current = null;
    setIsConverting(true);
    try {
      const result = await api.convertBook(bookId);
      resultPathRef.current = result.new_path;
      // The 100% progress event may have fired before the invoke resolved
      // (handleProgressComplete skips while resultPathRef is unset) — finish
      // now if the event path hasn't already. When the event arrives later,
      // its finishSuccess call is a no-op (finishedRef).
      if (!finishedRef.current) finishSuccess();
    } catch (err) {
      // Keep ONE object log here; the toast below uses getErrorMessage so
      // ShioriError-shaped plain objects render their message, not
      // "[object Object]".
      logger.error('[ConvertToEpub] convert_book failed:', err);
      finishError(getErrorMessage(err));
    }
  }, [bookId, isConverting, finishSuccess, finishError]);

  // Dialogs may start the conversion automatically (autoStart).
  const startedRef = useRef(false);
  useEffect(() => {
    if (autoStart && !startedRef.current) {
      startedRef.current = true;
      void handleConvert();
    }
  }, [autoStart, handleConvert]);

  const handleProgressComplete = useCallback(() => {
    // Fired by <ConversionProgress> when a progress event hits 100%. The
    // converted path may not be known yet (the event races the invoke result)
    // — never finalize without it; finishSuccess then runs from the
    // handleConvert await instead.
    if (!finishedRef.current && resultPathRef.current) finishSuccess();
  }, [finishSuccess]);

  if (!format || NON_CONVERTIBLE_FORMATS.has(format.toLowerCase())) return null;

  const overlay = isConverting && (
    <ConversionProgress
      visible
      bookTitle={bookTitle}
      onComplete={handleProgressComplete}
      onCancel={handleCancel}
    />
  );

  if (variant === 'button') {
    return (
      <>
        <Button
          variant="secondary"
          size="sm"
          className="w-full sm:w-auto rounded-full bg-secondary/50 hover:bg-secondary border border-border/50 shadow-sm"
          onClick={handleConvert}
          disabled={isConverting}
          title="Create an EPUB copy of this book (the original file is kept)"
        >
          {isConverting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileOutput className="w-4 h-4 mr-2" />}
          Convert to EPUB
        </Button>
        {overlay}
      </>
    );
  }

  if (variant === 'overlay') {
    return <>{overlay}</>;
  }

  return (
    <>
      <button
        type="button"
        onClick={handleConvert}
        disabled={isConverting}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-foreground/90 hover:bg-accent hover:text-accent-foreground transition-colors duration-150 disabled:opacity-50"
        title="Create an EPUB copy of this book (the original file is kept)"
      >
        {isConverting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileOutput className="w-4 h-4" />}
        Convert to EPUB
      </button>
      {overlay}
    </>
  );
}

export default ConvertToEpubMenuItem;
