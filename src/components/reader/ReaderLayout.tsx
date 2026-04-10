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
  | 'checking-calibre'
  | 'converting'
  | 'validating-file'
  | 'loading-metadata'
  | 'complete';

// Formats that should be converted to EPUB for better reading experience
const FORMATS_TO_CONVERT = ['pdf', 'mobi', 'azw', 'azw3'];

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

        // Step 2.5: Check if format needs Calibre conversion for better reading
        let finalFilePath = filePath;
        let finalFormat = detectedFormat.toLowerCase();
        
        if (FORMATS_TO_CONVERT.includes(finalFormat)) {
          logger.debug('[ReaderLayout] Format', finalFormat, 'can be converted to EPUB for better reading');
          
          updateStage('checking-calibre');
          const calibreAvailable = await api.checkCalibreAvailable();
          
          if (calibreAvailable) {
            logger.debug('[ReaderLayout] Calibre is available, converting to EPUB...');
            updateStage('converting');
            
            try {
              const result = await api.convertWithCalibre(
                filePath,
                'epub',
                true, // Replace original with converted EPUB
                bookId
              );
              
              if (result.success) {
                logger.info('[ReaderLayout] ✓ Converted to EPUB:', result.output_path);
                finalFilePath = result.output_path;
                finalFormat = 'epub';
              } else {
                logger.warn('[ReaderLayout] Conversion failed, using original format:', result.message);
              }
            } catch (conversionError) {
              logger.warn('[ReaderLayout] Calibre conversion failed, falling back to original format:', conversionError);
              // Continue with original format - don't block the user
            }
          } else {
            logger.debug('[ReaderLayout] Calibre not available, using original format');
          }
        }

        // Step 3: Validate file integrity (skip validation if detection failed)
          updateStage('validating-file');
         logger.debug('[ReaderLayout] Step 3: Validating file integrity...');

         try {
           const isValid = await api.validateBookFile(finalFilePath, finalFormat);
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
           format: finalFormat,
         };

         if (finalFormat === 'pdf' && typeof book.page_count === 'number') {
           content.pages = book.page_count;
         }

         openBook(bookId, finalFilePath, finalFormat, content);
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

    // Add timeout fallback (60 seconds for conversion, 10 seconds otherwise)
     const timeoutMs = 60000; // 60 seconds to allow for Calibre conversion
     const timeoutId = setTimeout(() => {
       if (currentStage !== 'complete' && currentStage !== 'idle') {
          logger.error('[ReaderLayout] ⏱️ Timeout - loading took too long at stage:', currentStage);
         setError({
          title: 'Loading Timeout',
          message: currentStage === 'converting' 
            ? 'The conversion is taking too long. The file may be very large or corrupted.'
            : 'The book is taking too long to load. This may indicate a corrupted file or performance issue.',
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
     }, timeoutMs);

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
      'checking-calibre': 'Checking conversion tools...',
      'converting': 'Converting to EPUB for better reading...',
      'validating-file': 'Validating file integrity...',
      'loading-metadata': 'Loading book data...',
      complete: 'Complete',
    };

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'var(--reader-bg)' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 mb-4 mx-auto" style={{ borderColor: 'var(--loading-spinner)' }}></div>
          <p style={{ color: 'var(--text-secondary)' }}>{stageMessages[loadingStage]}</p>
          <p className="text-xs mt-2" style={{ color: 'var(--text-tertiary)' }}>
            {loadingStage === 'validating-file' && 'This may take a moment for large files...'}
            {loadingStage === 'converting' && 'This may take a minute for large files...'}
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
    <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: 'var(--reader-bg)' }}>
      {/* Reader content */}
      {currentBookPath && currentBookFormat === 'epub' && (
        <PremiumEpubReader bookPath={currentBookPath} bookId={bookId} readerContent={currentContent} onClose={handleClose} />
      )}
      {currentBookPath && currentBookFormat === 'pdf' && (
        <PdfReader bookPath={currentBookPath} bookId={bookId} readerContent={currentContent} onClose={handleClose} />
      )}
      {currentBookPath && (currentBookFormat === 'cbz' || currentBookFormat === 'cbr') && (
        <MangaReader
          mode="local"
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
          <p style={{ color: 'var(--text-secondary)' }}>No book loaded</p>
        </div>
      )}
    </div>
  );
}
