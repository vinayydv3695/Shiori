import { useEffect, useState, useRef, useCallback } from 'react';
import { api } from '@/lib/tauri';
import type { BookMetadata, Annotation } from '@/lib/tauri';
import { convertFileSrc } from '@tauri-apps/api/core';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Loader2, AlertCircle } from '@/components/icons';
import { useUIStore, useReadingSettings, applyReaderThemeToElement, removeReaderThemeFromElement } from '@/store/premiumReaderStore';
import { useToastStore } from '@/store/toastStore';
import { ReaderTopBar } from './ReaderTopBar';
import { PremiumSidebar } from './PremiumSidebar';
import { TextSelectionToolbar } from './TextSelectionToolbar';
import { TTSControlBar } from './TTSControlBar';
import { useReadingSession } from '@/hooks/useReadingSession';
import '@/styles/premium-reader.css';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Set up the worker for pdf.js to use the local worker script compatible with the version
// We use Vite's ?url syntax to properly bundle the worker file for offline Tauri support
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

interface PdfReaderProps {
  bookPath: string;
  bookId: number;
  onClose: () => void;
}

export function PdfReader({ bookPath, bookId, onClose }: PdfReaderProps) {
  const isFocusMode = useUIStore(state => state.isFocusMode);
  const setTopBarVisible = useUIStore(state => state.setTopBarVisible);
  const { theme } = useReadingSettings();

  useReadingSession(bookId);

  const [metadata, setMetadata] = useState<BookMetadata | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState<number>(1.0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string>('');
  const [annotations, setAnnotations] = useState<Annotation[]>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const readerContainerRef = useRef<HTMLDivElement>(null);
  const autoHideTimerRef = useRef<number | null>(null);
  const pageCache = useRef<Map<number, ImageBitmap>>(new Map());
  const MAX_CACHE_SIZE = 5;

  // ────────────────────────────────────────────────────────────
  // READER THEME — scoped to this container, not global <html>
  // ────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = readerContainerRef.current;
    if (el) applyReaderThemeToElement(el, theme);
    return () => { if (el) removeReaderThemeFromElement(el); };
  }, [theme]);

  // ────────────────────────────────────────────────────────────
  // AUTO-HIDE TOP BAR LOGIC
  // ────────────────────────────────────────────────────────────
  const resetAutoHideTimer = useCallback(() => {
    if (!isFocusMode) {
      setTopBarVisible(true);
      if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
      autoHideTimerRef.current = window.setTimeout(() => setTopBarVisible(false), 3000);
    }
  }, [isFocusMode, setTopBarVisible]);

  useEffect(() => {
    let throttleTimeout: number | null = null;
    const handleMouseMove = () => {
      if (!throttleTimeout) {
        resetAutoHideTimer();
        throttleTimeout = window.setTimeout(() => { throttleTimeout = null; }, 100);
      }
    };
    document.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      if (throttleTimeout) clearTimeout(throttleTimeout);
      if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
    };
  }, [isFocusMode, setTopBarVisible, resetAutoHideTimer]);

  useEffect(() => {
    if (isFocusMode) {
      setTopBarVisible(false);
      if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
    } else {
      setTopBarVisible(true);
      resetAutoHideTimer();
    }
  }, [isFocusMode, setTopBarVisible, resetAutoHideTimer]);

  const loadBook = async () => {
    try {
      setIsLoading(true);
      setError(null);

      console.log('[PdfReader] Opening book:', bookId, bookPath);

      // Still open in backend to maintain standard reader tracking and metadata
      const bookMetadata = await api.openBookRenderer(bookId, bookPath, 'pdf');
      setMetadata(bookMetadata);

      // Load file directly via Tauri's asset protocol for frontend rendering component
      const assetUrl = convertFileSrc(bookPath);
      console.log('[PdfReader] Asset URL generated:', assetUrl);
      setPdfUrl(assetUrl);

      // Load annotations for this book
      try {
        const bookAnnotations = await api.getAnnotations(bookId);
        setAnnotations(bookAnnotations);
        console.log('[PdfReader] Loaded annotations:', bookAnnotations.length);
      } catch (err) {
        console.error('[PdfReader] Failed to load annotations:', err);
      }

      // Load saved progress from database (persisted across restarts)
      try {
        const savedProgress = await api.getReadingProgress(bookId);
        if (savedProgress?.currentLocation) {
          const match = savedProgress.currentLocation.match(/page-(\d+)/);
          if (match) {
            const savedPage = parseInt(match[1], 10);
            if (!isNaN(savedPage) && savedPage >= 1) {
              setPageNumber(savedPage);
              if (savedPage > 1) {
                useToastStore.getState().addToast({
                  title: 'Resuming reading',
                  description: `Page ${savedPage}`,
                  variant: 'info',
                  duration: 3000,
                });
              }
            }
          }
        }
      } catch {
        // Silently ignore - start from page 1
      }
    } catch (err) {
      console.error('[PdfReader] Error initializing PDF:', err);
      setError(err instanceof Error ? err.message : 'Failed to initialize PDF');
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBook();
    return () => {
      // Cleanup
      api.closeBookRenderer(bookId).catch(console.error);
      pageCache.current.clear();
    };
    // loadBook is recreated each render - would cause infinite loop if added
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookPath, bookId]);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setIsLoading(false);
  };

  const onDocumentLoadError = (error: Error) => {
    console.error('[PdfReader] Error loading PDF document:', error);
    setError(error.message || 'Failed to parse PDF document.');
    setIsLoading(false);
  }

  const applyPDFHighlights = useCallback(() => {
    const textLayer = containerRef.current?.querySelector('.react-pdf__Page__textContent');
    if (!textLayer) return;

    const pageAnnotations = annotations.filter(
      (a) =>
        (a.annotationType === 'highlight' || a.annotationType === 'note') &&
        a.location === `page-${pageNumber}` &&
        a.selectedText &&
        a.selectedText.trim().length > 0
    );

    if (pageAnnotations.length === 0) return;

    clearPDFHighlights();

    for (const annotation of pageAnnotations) {
      highlightTextInPDF(textLayer as HTMLElement, annotation);
    }
  }, [annotations, pageNumber]);

  const clearPDFHighlights = () => {
    const textLayer = containerRef.current?.querySelector('.react-pdf__Page__textContent');
    if (!textLayer) return;

    const marks = textLayer.querySelectorAll('mark.pdf-highlight');
    marks.forEach((mark) => {
      const parent = mark.parentNode;
      if (!parent) return;
      const textNode = document.createTextNode(mark.textContent || '');
      parent.replaceChild(textNode, mark);
      parent.normalize();
    });
  };

  const highlightTextInPDF = (textLayer: HTMLElement, annotation: Annotation) => {
    const searchText = annotation.selectedText;
    if (!searchText) return;

    const walker = document.createTreeWalker(
      textLayer,
      NodeFilter.SHOW_TEXT,
      null
    );

    const textNodes: Text[] = [];
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      textNodes.push(node);
    }

    for (const textNode of textNodes) {
      const nodeText = textNode.textContent || '';
      const index = nodeText.indexOf(searchText);
      if (index === -1) continue;

      try {
        const range = document.createRange();
        range.setStart(textNode, index);
        range.setEnd(textNode, index + searchText.length);

        const mark = document.createElement('mark');
        mark.className = 'pdf-highlight';
        mark.style.backgroundColor = annotation.color || '#fbbf24';
        mark.style.padding = '0';
        mark.style.borderRadius = '2px';
        mark.dataset.annotationId = String(annotation.id || '');
        mark.dataset.annotationType = annotation.annotationType;

        if (annotation.annotationType === 'note') {
          mark.title = annotation.noteContent || '';
        }

        range.surroundContents(mark);
        return;
      } catch {
        break;
      }
    }
  };

  const onPageRenderSuccess = useCallback(() => {
    setTimeout(() => {
      applyPDFHighlights();
    }, 100);
  }, [applyPDFHighlights]);

  const prerenderAdjacentPages = useCallback(async (currentPage: number) => {
    if (pageCache.current.size > MAX_CACHE_SIZE) {
      const oldestKey = pageCache.current.keys().next().value;
      if (oldestKey !== undefined) {
        const bitmap = pageCache.current.get(oldestKey);
        bitmap?.close();
        pageCache.current.delete(oldestKey);
      }
    }

    const pagesToPrerender = [currentPage - 1, currentPage + 1].filter(
      (p) => p >= 1 && p <= numPages && !pageCache.current.has(p)
    );

    for (const page of pagesToPrerender) {
      try {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) continue;

        const dpr = window.devicePixelRatio || 1;
        const adjustedScale = scale * dpr;

        canvas.width = 595 * adjustedScale;
        canvas.height = 842 * adjustedScale;

        const bitmap = await createImageBitmap(canvas);
        pageCache.current.set(page, bitmap);
      } catch (err) {
        console.error(`[PdfReader] Failed to prerender page ${page}:`, err);
      }
    }
  }, [scale, numPages]);

  const updateProgress = async (pageIndex: number) => {
    const progressPercent = numPages > 0 ? (pageIndex / numPages) * 100 : 0;

    try {
      await api.saveReadingProgress(
        bookId,
        `page-${pageIndex}`,
        progressPercent,
        pageIndex,
        numPages
      );
    } catch (err) {
      console.error('[PdfReader] Failed saving progress:', err);
    }
  }

  // Effect to update progress whenever page changes
  useEffect(() => {
    if (numPages > 0) {
      updateProgress(pageNumber);
      prerenderAdjacentPages(pageNumber);
    }
    // updateProgress is recreated each render - would cause infinite loop if added
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageNumber, numPages]);

  const nextPage = () => {
    if (pageNumber < numPages) {
      setPageNumber(prev => prev + 1);
    }
  };

  const prevPage = () => {
    if (pageNumber > 1) {
      setPageNumber(prev => prev - 1);
    }
  };

  const zoomIn = () => {
    setScale((prev) => Math.min(prev + 0.25, 3.0));
  };

  const zoomOut = () => {
    setScale((prev) => Math.max(prev - 0.25, 0.5));
  };

  const resetZoom = () => {
    setScale(1.0);
  };

  // Navigate to a page from sidebar annotation clicks
  const handleSidebarNavigate = useCallback((chapterIndex: number) => {
    // For PDF, annotations use "page-N" location format.
    // The sidebar's handleAnnotationClick parses "chapter_N" → index N,
    // but PDF uses page numbers. We handle this in the sidebar click.
    // This callback receives the parsed index which for PDF IS the page number.
    // However, sidebar also passes raw chapter indices for TOC — we need
    // to ensure the page number is valid.
    const page = chapterIndex;
    if (page >= 1 && page <= numPages) {
      setPageNumber(page);
    }
  }, [numPages]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        prevPage();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        nextPage();
      } else if (e.key === '+' || e.key === '=') {
        zoomIn();
      } else if (e.key === '-') {
        zoomOut();
      } else if (e.key === '0') {
        resetZoom();
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
    // Navigation functions are recreated each render - would cause infinite loop if added
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageNumber, numPages]);

  if (error) {
    return (
      <div className="premium-reader premium-reader--error">
        <div className="premium-error-container">
          <AlertCircle className="premium-error-icon" />
          <p className="premium-error-title">{error}</p>
          <p className="premium-error-subtitle">Try opening a different book or check the file format.</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={readerContainerRef} className={`premium-reader ${isFocusMode ? 'premium-reader--focus-mode' : ''}`}>
      {/* Auto-hide Top Bar */}
      <ReaderTopBar
        bookId={bookId}
        title={metadata?.title || 'Loading...'}
        subtitle={`Page ${pageNumber} of ${numPages}`}
        progress={Math.round((pageNumber / numPages) * 100 || 0)}
        format="pdf"
        onClose={onClose}
        centerExtra={
          <div className="flex items-center gap-2 ml-4">
            <button onClick={zoomOut} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors" title="Zoom out">
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs font-medium min-w-[40px] text-center">{Math.round(scale * 100)}%</span>
            <button onClick={zoomIn} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors" title="Zoom in">
              <ZoomIn className="w-4 h-4" />
            </button>
            <button onClick={resetZoom} className="px-2 py-1 text-xs hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors" title="Reset zoom">
              Reset
            </button>
          </div>
        }
      />

      {/* PDF Canvas Viewport */}
      <div
        ref={containerRef}
        className={`premium-reading-canvas ${isFocusMode ? 'premium-reading-canvas--focus-mode' : ''} flex justify-center`}
        style={{
          backgroundColor: 'var(--bg-primary)',
        }}
      >
        {isLoading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gray-50/80 dark:bg-gray-900/80 backdrop-blur-sm">
            <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
            <p className="text-gray-700 dark:text-gray-300 font-medium">Rendering PDF Document...</p>
          </div>
        )}

        {pdfUrl && (
          <div className="my-6 shadow-xl transition-transform duration-200" style={{ transformOrigin: 'top center' }}>
            <Document
              file={pdfUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={onDocumentLoadError}
              loading={null}
            >
              <Page
                pageNumber={pageNumber}
                scale={scale * (window.devicePixelRatio || 1)}
                renderTextLayer={true}
                renderAnnotationLayer={true}
                className="bg-white"
                onRenderSuccess={onPageRenderSuccess}
              />
            </Document>
          </div>
        )}
      </div>

      {/* Bottom Progress Bar */}
      <div className="premium-progress-bar">
        <div
          className="premium-progress-bar-fill"
          style={{ width: `${(pageNumber / numPages) * 100 || 0}%` }}
        />
      </div>

      {/* Floating Navigation Arrows */}
      {!isFocusMode && (
        <>
          <button
            onClick={prevPage}
            disabled={pageNumber <= 1}
            className="premium-nav-arrow premium-nav-arrow--left"
            aria-label="Previous page"
          >
            <ChevronLeft className="premium-nav-icon" />
          </button>

          <button
            onClick={nextPage}
            disabled={pageNumber >= numPages}
            className="premium-nav-arrow premium-nav-arrow--right"
            aria-label="Next page"
          >
            <ChevronRight className="premium-nav-icon" />
          </button>
        </>
      )}

      {/* Sidebar (bookmarks, highlights, notes, search) */}
      <PremiumSidebar
        bookId={bookId}
        currentIndex={pageNumber}
        onNavigate={handleSidebarNavigate}
      />

      {/* Text Selection Toolbar */}
      <TextSelectionToolbar
        bookId={bookId}
        currentLocation={`page-${pageNumber}`}
      />

      {/* TTS Control Bar */}
      <TTSControlBar
        contentRef={containerRef}
        onChapterEnd={nextPage}
      />
    </div>
  );
}
