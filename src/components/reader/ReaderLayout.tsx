import { useEffect, useState } from 'react';
import { useReaderStore } from '@/store/readerStore';
import { api } from '@/lib/tauri';
import { logger } from '@/lib/logger';
import { PremiumEpubReader } from './PremiumEpubReader';
import { PdfReader } from './PdfReader';
import { GenericHtmlReader } from './GenericHtmlReader';
import { MangaReader } from '@/components/manga/MangaReader';
import { ReaderErrorBoundary, parseReaderError } from './ReaderErrorBoundary';
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

        // Step 2: Detect and validate format
         updateStage('detecting-format');
         logger.debug('[ReaderLayout] Step 2: Detecting format...');

         let detectedFormat: string;
         try {
           detectedFormat = await api.detectBookFormat(filePath);
           logger.debug('[ReaderLayout] Step 2 ✓ Detected format:', detectedFormat);
         } catch (formatError) {
           logger.error('[ReaderLayout] Format detection failed, falling back to extension:', formatError);
           // Fallback to extension-based detection if magic byte detection fails
           const extension = filePath.split('.').pop()?.toLowerCase() || 'epub';
           logger.debug('[ReaderLayout] Using fallback format from extension:', extension);
           detectedFormat = extension;
         }

        // Step 3: Validate file integrity (skip validation if detection failed)
          updateStage('validating-file');
         logger.debug('[ReaderLayout] Step 3: Validating file integrity...');

         try {
           const isValid = await api.validateBookFile(filePath, detectedFormat);
           if (!isValid) {
             logger.warn('[ReaderLayout] File validation returned false, but continuing anyway');
           }
           logger.debug('[ReaderLayout] Step 3 ✓ File validation complete (valid:', isValid, ')');
         } catch (validationError) {
           logger.warn('[ReaderLayout] File validation failed, but continuing anyway:', validationError);
           // Don't throw - continue with the book even if validation fails
           // The actual reader components will handle corrupted files
         }

        // Step 4: Open book in store (now that we know it's valid)
         logger.debug('[ReaderLayout] Step 4: Opening book in store...');
         const normalizedFormat = detectedFormat.toLowerCase();

         const [book, progress, annotations, settings] = await Promise.all([
           api.getBook(bookId),
           api.getReadingProgress(bookId),
           api.getAnnotations(bookId),
           api.getReaderSettings('default'),
         ]);

         const content: ReaderContent = {
           title: book.title,
           author: book.authors?.[0]?.name,
           cover: book.cover_path,
           format: normalizedFormat,
         };

         if (normalizedFormat === 'pdf' && typeof book.page_count === 'number') {
           content.pages = book.page_count;
         }

         openBook(bookId, filePath, normalizedFormat, content);
         logger.debug('[ReaderLayout] Step 4 ✓ Book opened in store');

         // Step 5: Load metadata (progress, annotations, settings)
          updateStage('loading-metadata');
         logger.debug('[ReaderLayout] Step 5: Loading metadata...');

         logger.debug('[ReaderLayout] Step 5 ✓ Loaded metadata:', {
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

          updateStage('complete');
          logger.debug('[ReaderLayout] ✅ All steps complete!');
        } catch (err) {
          logger.error('[ReaderLayout] ❌ Error at stage:', currentStage, err);
         const parsedError = parseReaderError(err);
         setError(parsedError);
         updateStage('idle');
       }
     };

    // Add timeout fallback (10 seconds)
     const timeoutId = setTimeout(() => {
       if (currentStage !== 'complete' && currentStage !== 'idle') {
          logger.error('[ReaderLayout] ⏱️ Timeout - loading took too long at stage:', currentStage);
         setError({
          title: 'Loading Timeout',
          message: 'The book is taking too long to load. This may indicate a corrupted file or performance issue.',
          suggestions: [
            'Try closing and reopening the book',
            'Restart the application',
            'Check if the file is very large (>100MB)',
            'Re-import the book if the problem persists',
          ],
           technicalDetails: `Timeout at stage: ${currentStage}`,
         });
         updateStage('idle');
       }
     }, 10000); // 10 second timeout

    logger.debug('[ReaderLayout] Starting load sequence (attempt', retryCount + 1, ')');
    loadBookData();

    return () => {
      clearTimeout(timeoutId);
    };
  }, [bookId, retryCount, openBook, setAnnotations, setProgress, setSettings]);

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
      {/* Reader content */}
      {currentBookPath && currentBookFormat === 'epub' && (
        <PremiumEpubReader bookPath={currentBookPath} bookId={bookId} readerContent={currentContent} onClose={handleClose} />
      )}
      {currentBookPath && currentBookFormat === 'pdf' && (
        <PdfReader bookPath={currentBookPath} bookId={bookId} readerContent={currentContent} onClose={handleClose} />
      )}
      {currentBookPath && (currentBookFormat === 'cbz' || currentBookFormat === 'cbr') && (
        <MangaReader
          bookId={bookId}
          bookPath={currentBookPath}
          onClose={handleClose}
        />
      )}
      {currentBookPath && (currentBookFormat === 'mobi' || currentBookFormat === 'azw' || currentBookFormat === 'azw3' || currentBookFormat === 'fb2' || currentBookFormat === 'docx' || currentBookFormat === 'html' || currentBookFormat === 'htm' || currentBookFormat === 'txt' || currentBookFormat === 'md' || currentBookFormat === 'markdown') && (
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
          <p className="text-gray-500 dark:text-gray-400">No book loaded</p>
        </div>
      )}
    </div>
  );
}
