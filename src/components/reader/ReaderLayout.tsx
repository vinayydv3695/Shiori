import { useEffect, useState } from 'react';
import { useReaderStore } from '@/store/readerStore';
import { api } from '@/lib/tauri';
import { PremiumEpubReader } from './PremiumEpubReader';
import { PdfReader } from './PdfReader';
import { MobiReader } from './MobiReader';
import { MangaReader } from '@/components/manga/MangaReader';
import { ReaderErrorBoundary, parseReaderError } from './ReaderErrorBoundary';
import { X } from '@/components/icons';

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
  } = useReaderStore();

  const [loadingStage, setLoadingStage] = useState<LoadingStage>('idle');
  const [error, setError] = useState<ReturnType<typeof parseReaderError> | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let timeoutId: number;

    const loadBookData = async () => {
      try {
        setLoadingStage('fetching-path');
        setError(null);

        console.log('[ReaderLayout] Step 1: Getting file path for bookId:', bookId);
        const filePath = await api.getBookFilePath(bookId);
        console.log('[ReaderLayout] Step 1 ✓ Got file path:', filePath);

        // Step 2: Detect and validate format
        setLoadingStage('detecting-format');
        console.log('[ReaderLayout] Step 2: Detecting format...');

        let detectedFormat: string;
        try {
          detectedFormat = await api.detectBookFormat(filePath);
          console.log('[ReaderLayout] Step 2 ✓ Detected format:', detectedFormat);
        } catch (formatError) {
          console.error('[ReaderLayout] Format detection failed, falling back to extension:', formatError);
          // Fallback to extension-based detection if magic byte detection fails
          const extension = filePath.split('.').pop()?.toLowerCase() || 'epub';
          console.log('[ReaderLayout] Using fallback format from extension:', extension);
          detectedFormat = extension;
        }

        // Step 3: Validate file integrity (skip validation if detection failed)
        setLoadingStage('validating-file');
        console.log('[ReaderLayout] Step 3: Validating file integrity...');

        try {
          const isValid = await api.validateBookFile(filePath, detectedFormat);
          if (!isValid) {
            console.warn('[ReaderLayout] File validation returned false, but continuing anyway');
          }
          console.log('[ReaderLayout] Step 3 ✓ File validation complete (valid:', isValid, ')');
        } catch (validationError) {
          console.warn('[ReaderLayout] File validation failed, but continuing anyway:', validationError);
          // Don't throw - continue with the book even if validation fails
          // The actual reader components will handle corrupted files
        }

        // Step 4: Open book in store (now that we know it's valid)
        console.log('[ReaderLayout] Step 4: Opening book in store...');
        openBook(bookId, filePath, detectedFormat);
        console.log('[ReaderLayout] Step 4 ✓ Book opened in store');

        // Step 5: Load metadata (progress, annotations, settings)
        setLoadingStage('loading-metadata');
        console.log('[ReaderLayout] Step 5: Loading metadata...');

        const [book, progress, annotations, settings] = await Promise.all([
          api.getBook(bookId),
          api.getReadingProgress(bookId),
          api.getAnnotations(bookId),
          api.getReaderSettings('default'),
        ]);

        console.log('[ReaderLayout] Step 5 ✓ Loaded metadata:', {
          title: book.title,
          hasProgress: !!progress,
          annotationCount: annotations.length,
        });

        // Update store
        if (progress) {
          setProgress(progress);
        }
        setAnnotations(annotations);
        setSettings(settings);

        setLoadingStage('complete');
        console.log('[ReaderLayout] ✅ All steps complete!');
      } catch (err) {
        console.error('[ReaderLayout] ❌ Error at stage:', loadingStage, err);
        const parsedError = parseReaderError(err);
        setError(parsedError);
        setLoadingStage('idle');
      }
    };

    // Add timeout fallback (10 seconds)
    timeoutId = setTimeout(() => {
      if (loadingStage !== 'complete' && loadingStage !== 'idle') {
        console.error('[ReaderLayout] ⏱️ Timeout - loading took too long at stage:', loadingStage);
        setError({
          title: 'Loading Timeout',
          message: 'The book is taking too long to load. This may indicate a corrupted file or performance issue.',
          suggestions: [
            'Try closing and reopening the book',
            'Restart the application',
            'Check if the file is very large (>100MB)',
            'Re-import the book if the problem persists',
          ],
          technicalDetails: `Timeout at stage: ${loadingStage}`,
        });
        setLoadingStage('idle');
      }
    }, 10000); // 10 second timeout

    console.log('[ReaderLayout] Starting load sequence (attempt', retryCount + 1, ')');
    loadBookData();

    return () => {
      clearTimeout(timeoutId);
    };
  }, [bookId, retryCount]);

  const handleClose = () => {
    closeBook();
    onClose();
  };

  const handleRetry = () => {
    setRetryCount(prev => prev + 1);
    setError(null);
    setLoadingStage('idle');
  };

  // Show loading state
  if (loadingStage !== 'complete' && loadingStage !== 'idle' && !error) {
    const stageMessages: Record<LoadingStage, string> = {
      idle: 'Preparing...',
      'fetching-path': 'Locating book file...',
      'detecting-format': 'Detecting file format...',
      'validating-file': 'Validating file integrity...',
      'loading-metadata': 'Loading book data...',
      complete: 'Complete',
    };

    return (
      <div className="fixed inset-0 bg-white dark:bg-gray-900 z-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4 mx-auto"></div>
          <p className="text-gray-600 dark:text-gray-400">{stageMessages[loadingStage]}</p>
          <p className="text-xs text-gray-400 dark:text-gray-600 mt-2">
            {loadingStage === 'validating-file' && 'This may take a moment for large files...'}
          </p>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="fixed inset-0 z-50">
        <ReaderErrorBoundary
          error={error}
          onRetry={handleRetry}
          onClose={handleClose}
        />
      </div>
    );
  }

  // Show reader
  return (
    <div className="fixed inset-0 bg-white dark:bg-gray-900 z-50 flex flex-col">
      {/* Top bar with close button (minimal for premium reader) */}
      <div className="absolute top-4 left-4 z-[110]">
        <button
          onClick={handleClose}
          className="p-2 bg-white/90 dark:bg-gray-800/90 hover:bg-white dark:hover:bg-gray-800 rounded-lg transition-all backdrop-blur-sm shadow-lg border border-gray-200 dark:border-gray-700"
          title="Close reader"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Reader content */}
      {currentBookPath && currentBookFormat === 'epub' && (
        <PremiumEpubReader bookPath={currentBookPath} bookId={bookId} />
      )}
      {currentBookPath && currentBookFormat === 'pdf' && (
        <PdfReader bookPath={currentBookPath} bookId={bookId} />
      )}
      {currentBookPath && (currentBookFormat === 'cbz' || currentBookFormat === 'cbr') && (
        <MangaReader
          bookId={bookId}
          bookPath={currentBookPath}
          onClose={handleClose}
        />
      )}
      {currentBookPath && (currentBookFormat === 'mobi' || currentBookFormat === 'azw3') && (
        <MobiReader bookPath={currentBookPath} bookId={bookId} />
      )}
      {!currentBookPath && (
        <div className="flex items-center justify-center h-full">
          <p className="text-gray-500 dark:text-gray-400">No book loaded</p>
        </div>
      )}
    </div>
  );
}
