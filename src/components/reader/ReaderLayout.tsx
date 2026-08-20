import { useEffect, useState, useCallback } from 'react';
import { useReaderStore } from '@/store/readerStore';
import { api } from '@/lib/tauri';
import { invoke } from '@tauri-apps/api/core';
import { logger } from '@/lib/logger';
import { PremiumEpubReader } from './PremiumEpubReader';
import { PdfReader } from './PdfReader';
import { GenericHtmlReader } from './GenericHtmlReader';
import { MangaReader } from '@/components/manga/MangaReader';
import { ReaderErrorBoundary, parseReaderError } from './ReaderErrorBoundary';
import { getReaderKind } from './readerRouting';
import { useKeepScreenOn } from '@/hooks/useKeepScreenOn';
import { useToastStore } from '@/store/toastStore';
import { BookSkeletonLoading } from './BookSkeletonLoading';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { ReaderFormat } from './ReaderSettings';
import type { ReaderContent } from './readerContent';

interface ReaderLayoutProps {
  bookId: number;
  onClose: () => void;
}

type LoadingStage =
  | 'idle'
  | 'fetching-path'
  | 'detecting-format'
  | 'validating-file'
  | 'loading-metadata'
  | 'complete';

export function ReaderLayout({ bookId, onClose }: ReaderLayoutProps) {
  const {
    currentBookPath,
    currentBookFormat,
    openBook,
    setProgress,
    setAnnotations,
    setSettings,
    closeBook,
    currentContent,
  } = useReaderStore();

  const [loadingStage, setLoadingStage] = useState<LoadingStage>('idle');
  const [error, setError] = useState<ReturnType<typeof parseReaderError> | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [isConverting, setIsConverting] = useState(false);

  useEffect(() => {
    let currentStage: LoadingStage = 'idle';
    const updateStage = (stage: LoadingStage) => {
      currentStage = stage;
      setLoadingStage(stage);
    };

    const loadBookData = async () => {
      try {
        updateStage('fetching-path');
        setError(null);

        logger.debug('[ReaderLayout] Step 1: Opening book natively for bookId:', bookId);
        // Backend returns the ORIGINAL file path for every format — never converts.
        const filePath = await api.openBookForReading(bookId);
        logger.debug('[ReaderLayout] Step 1 ✓ Got file path:', filePath);

        // Step 2: Detect format (determines which native reader renders the file)
        updateStage('detecting-format');
        let detectedFormat: string;
        try {
          detectedFormat = await api.detectBookFormat(filePath);
        } catch {
          detectedFormat = filePath.split('.').pop()?.toLowerCase() || 'epub';
        }
        const effectiveFormat = detectedFormat.toLowerCase();
        logger.debug('[ReaderLayout] Detected format:', effectiveFormat);

        // Step 3: Validate file (non-fatal)
        updateStage('validating-file');
        try {
          await api.validateBookFile(filePath, effectiveFormat);
        } catch {
          // Non-fatal — let the reader attempt to open it
        }

        // Step 4: Fetch book metadata + open in store
        updateStage('loading-metadata');
        const startupData = await invoke<{
          book: any;
          progress: any;
          annotations: any;
          settings: any;
        }>('get_reader_startup_data', { bookId });

        const { book, progress, annotations, settings } = startupData;

        const content: ReaderContent = {
          title: book.title,
          author: book.authors?.[0]?.name,
          cover: book.cover_path,
          isbn: book.isbn13 || book.isbn,
          format: effectiveFormat,
        };
        if (effectiveFormat === 'pdf' && typeof book.page_count === 'number') {
          content.pages = book.page_count;
        }

        openBook(bookId, filePath, effectiveFormat, content);

        if (progress) setProgress(progress);
        setAnnotations(annotations);
        setSettings(settings);

        updateStage('complete');
        logger.debug('[ReaderLayout] ✅ All steps complete!');
      } catch (err) {
        logger.error('[ReaderLayout] ❌ Error at stage:', currentStage, err);
        setError(parseReaderError(err));
        updateStage('idle');
      }
    };

    // 90 s timeout — long enough for very large files
    const timeoutId = setTimeout(() => {
      if (currentStage !== 'complete' && currentStage !== 'idle') {
        setError({
          title: 'Loading Timeout',
          message: 'The book is taking too long to load.',
          suggestions: [
            'Try closing and reopening the book',
            'Restart the application',
            'Check if the file is very large (>200MB)',
          ],
          technicalDetails: `Timeout at stage: ${currentStage}`,
        });
        updateStage('idle');
      }
    }, 90_000);

    loadBookData();

    return () => {
      clearTimeout(timeoutId);
    };
  }, [bookId, retryCount, openBook, setAnnotations, setProgress, setSettings]);

  const handleClose = () => { closeBook(); onClose(); };
  const handleRetry = () => { setRetryCount(p => p + 1); setError(null); setLoadingStage('idle'); };

  // ── "Convert to EPUB" from the error screen — explicit, non-destructive ──
  const handleConvertToEpub = useCallback(async () => {
    if (isConverting) return;
    setIsConverting(true);
    try {
      const result = await api.convertBook(bookId);
      useToastStore.getState().addToast({
        title: 'Converted to EPUB',
        description: 'The EPUB file is ready. Opening it now.',
        variant: 'success',
        duration: 3000,
      });
      setError(null);
      // Open the freshly converted EPUB directly in the reader.
      useReaderStore.getState().setStartFromBeginning(false);
      openBook(bookId, result.new_path, result.new_format || 'epub');
      setLoadingStage('complete');
    } catch (err) {
      logger.error('[ReaderLayout] Convert to EPUB failed:', err);
      useToastStore.getState().addToast({
        title: 'Conversion failed',
        description: String(err),
        variant: 'error',
      });
    } finally {
      setIsConverting(false);
    }
  }, [bookId, isConverting, openBook]);

  // A1: keep the Android screen awake while reading (setting-driven).
  useKeepScreenOn();

  const handleNextChapter = useCallback(async () => {
    try {
      const nextBook: any = await invoke('get_next_book_in_series', { bookId });
      if (nextBook && nextBook.id) {
        import('@/store/toastStore').then(({ useToastStore }) => {
          useToastStore.getState().addToast({
            title: `Continuing to ${nextBook.title}`,
            variant: 'success',
            duration: 3000,
          });
        });
        // Use the app-wide event to switch the active book in the reader
        window.dispatchEvent(new CustomEvent('open-book', { detail: { bookId: nextBook.id } }));
      } else {
        import('@/store/toastStore').then(({ useToastStore }) => {
          useToastStore.getState().addToast({
            title: 'You have finished the series!',
            variant: 'info',
            duration: 3000,
          });
        });
      }
    } catch (e) {
      logger.error('Failed to get next book in series', e);
    }
  }, [bookId]);

  // ── SKELETON LOADING VIEW ────────────────────────────────────────────
  if (loadingStage !== 'complete' && loadingStage !== 'idle' && !error) {
    const stageMessages: Record<LoadingStage, string> = {
      idle: 'Preparing...',
      'fetching-path': 'Locating book file...',
      'detecting-format': 'Detecting file format...',
      'validating-file': 'Validating file...',
      'loading-metadata': 'Loading book data...',
      complete: 'Complete',
    };
    return (
      <BookSkeletonLoading
        message={stageMessages[loadingStage]}
        title={currentContent?.title}
        subtitle={currentContent?.author}
        coverUrl={currentContent?.cover}
        format={currentBookFormat || undefined}
      />
    );
  }

  // ── ERROR STATE ────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="fixed inset-0 z-50">
        <ReaderErrorBoundary
          error={error}
          onRetry={handleRetry}
          onClose={handleClose}
          onConvert={handleConvertToEpub}
          isConverting={isConverting}
        />
      </div>
    );
  }

  // ── READER ─────────────────────────────────────────────────────────────
  // Unknown formats fall back to the GenericHtmlReader (best-effort) — nothing falls through.
  const readerKind = getReaderKind(currentBookFormat) ?? 'html';
  return (
    <TooltipProvider delayDuration={0}>
      <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: 'var(--reader-bg)' }}>
        {currentBookPath && readerKind === 'epub' && (
          <PremiumEpubReader bookPath={currentBookPath} bookId={bookId} readerContent={currentContent} onClose={handleClose} />
        )}
        {currentBookPath && readerKind === 'pdf' && (
          <PdfReader bookPath={currentBookPath} bookId={bookId} readerContent={currentContent} onClose={handleClose} />
        )}
        {currentBookPath && readerKind === 'manga' && (
          <MangaReader mode="local" bookId={bookId} bookPath={currentBookPath} onClose={handleClose} onNextChapter={handleNextChapter} />
        )}
        {currentBookPath && readerKind === 'html' && (
          <GenericHtmlReader
            bookPath={currentBookPath}
            bookId={bookId}
            format={currentBookFormat as ReaderFormat}
            readerContent={currentContent}
            onClose={handleClose}
          />
        )}
        {!currentBookPath && (
          <div className="flex items-center justify-center h-full">
            <p style={{ color: 'var(--text-secondary)' }}>No book loaded</p>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
