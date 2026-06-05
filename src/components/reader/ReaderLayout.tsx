import { useEffect, useState } from 'react';
import { useReaderStore } from '@/store/readerStore';
import { api } from '@/lib/tauri';
import { invoke } from '@tauri-apps/api/core';
import { logger } from '@/lib/logger';
import { PremiumEpubReader } from './PremiumEpubReader';
import { PdfReader } from './PdfReader';
import { GenericHtmlReader } from './GenericHtmlReader';
import { MangaReader } from '@/components/manga/MangaReader';
import { ReaderErrorBoundary, parseReaderError } from './ReaderErrorBoundary';
import { ConversionProgress } from './ConversionProgress';
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
  | 'converting'
  | 'validating-file'
  | 'loading-metadata'
  | 'complete';

// Formats handled as-is by their native readers (no conversion needed)
const NATIVE_FORMATS = ['epub', 'pdf', 'cbz', 'cbr'];

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
  const [bookTitle, setBookTitle] = useState<string | undefined>(undefined);

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

        logger.debug('[ReaderLayout] Step 1: Getting file path for bookId:', bookId);
        const filePath = await api.getBookFilePath(bookId);
        logger.debug('[ReaderLayout] Step 1 ✓ Got file path:', filePath);

        // Step 2: Detect format
        updateStage('detecting-format');
        let detectedFormat: string;
        try {
          detectedFormat = await api.detectBookFormat(filePath);
        } catch {
          detectedFormat = filePath.split('.').pop()?.toLowerCase() || 'epub';
        }
        const finalFormat = detectedFormat.toLowerCase();
        logger.debug('[ReaderLayout] Detected format:', finalFormat);

        // Step 3: Convert if not a natively handled format
        let finalFilePath = filePath;

        if (!NATIVE_FORMATS.includes(finalFormat)) {
          logger.debug('[ReaderLayout] Format', finalFormat, 'needs conversion → running open_book_for_reading');
          updateStage('converting');

          try {
            // open_book_for_reading handles: MOBI, AZW3, DOCX, FB2, TXT, CBZ, CBR, PDF
            // It emits conversion-progress events → picked up by <ConversionProgress>
            const convertedPath = await api.openBookForReading(bookId);
            logger.info('[ReaderLayout] ✓ Converted/opened:', convertedPath);
            finalFilePath = convertedPath;
            // format is now epub (the command outputs EPUB for all non-native types)
          } catch (convErr) {
            logger.warn('[ReaderLayout] openBookForReading failed, falling back to convertAndReplaceBook:', convErr);
            try {
              const result = await api.convertAndReplaceBook(bookId);
              finalFilePath = result.new_path;
              logger.info('[ReaderLayout] ✓ Fallback conversion succeeded:', finalFilePath);
            } catch (fallbackErr) {
              logger.warn('[ReaderLayout] Fallback also failed, using original file:', fallbackErr);
              // Continue with the original — GenericHtmlReader will do its best
            }
          }
        }

        // Determine effective format from the (possibly converted) file path
        const effectiveFormat = finalFilePath.endsWith('.epub')
          ? 'epub'
          : finalFormat;

        // Step 4: Validate file
        updateStage('validating-file');
        try {
          await api.validateBookFile(finalFilePath, effectiveFormat);
        } catch {
          // Non-fatal — let the reader attempt to open it
        }

        // Step 5: Fetch book metadata + open in store
        updateStage('loading-metadata');
        const startupData = await invoke<{
          book: any;
          progress: any;
          annotations: any;
          settings: any;
        }>('get_reader_startup_data', { bookId });

        const { book, progress, annotations, settings } = startupData;

        setBookTitle(book.title);

        const content: ReaderContent = {
          title: book.title,
          author: book.authors?.[0]?.name,
          cover: book.cover_path,
          format: effectiveFormat,
        };
        if (effectiveFormat === 'pdf' && typeof book.page_count === 'number') {
          content.pages = book.page_count;
        }

        openBook(bookId, finalFilePath, effectiveFormat, content);

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

    // 90 s timeout — long enough for large MOBI/CBR files
    const timeoutId = setTimeout(() => {
      if (currentStage !== 'complete' && currentStage !== 'idle') {
        setError({
          title: 'Loading Timeout',
          message: currentStage === 'converting'
            ? 'Conversion is taking too long. The file may be very large or corrupted.'
            : 'The book is taking too long to load.',
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

  // ── CONVERSION OVERLAY ─────────────────────────────────────────────────
  // Shown during 'converting' stage — replaces the generic spinner with the
  // animated ConversionProgress component that listens to Tauri events.
  if (loadingStage === 'converting') {
    return (
      <ConversionProgress
        visible
        bookTitle={bookTitle}
        onComplete={() => {/* conversion-progress events control this; stage updates complete it */}}
      />
    );
  }

  // ── GENERIC LOADING SPINNER ────────────────────────────────────────────
  if (loadingStage !== 'complete' && loadingStage !== 'idle' && !error) {
    const stageMessages: Record<LoadingStage, string> = {
      idle: 'Preparing...',
      'fetching-path': 'Locating book file...',
      'detecting-format': 'Detecting file format...',
      converting: 'Converting...',
      'validating-file': 'Validating file...',
      'loading-metadata': 'Loading book data...',
      complete: 'Complete',
    };
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'var(--reader-bg)' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 mb-4 mx-auto" style={{ borderColor: 'var(--loading-spinner)' }} />
          <p style={{ color: 'var(--text-secondary)' }}>{stageMessages[loadingStage]}</p>
        </div>
      </div>
    );
  }

  // ── ERROR STATE ────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="fixed inset-0 z-50">
        <ReaderErrorBoundary error={error} onRetry={handleRetry} onClose={handleClose} />
      </div>
    );
  }

  // ── READER ─────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: 'var(--reader-bg)' }}>
      {currentBookPath && currentBookFormat === 'epub' && (
        <PremiumEpubReader bookPath={currentBookPath} bookId={bookId} readerContent={currentContent} onClose={handleClose} />
      )}
      {currentBookPath && currentBookFormat === 'pdf' && (
        <PdfReader bookPath={currentBookPath} bookId={bookId} readerContent={currentContent} onClose={handleClose} />
      )}
      {currentBookPath && (['cbz', 'cbr', 'zip', 'rar'].includes(currentBookFormat || '')) && (
        <MangaReader mode="local" bookId={bookId} bookPath={currentBookPath} onClose={handleClose} />
      )}
      {currentBookPath && !['epub', 'pdf', 'cbz', 'cbr', 'zip', 'rar'].includes(currentBookFormat || '') && (
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
  );
}
