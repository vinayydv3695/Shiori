import { useEffect, useState, useRef } from 'react';
import { useReaderStore } from '@/store/readerStore';
import { api } from '@/lib/tauri';
import type { BookMetadata } from '@/lib/tauri';
import { convertFileSrc } from '@tauri-apps/api/core';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Loader2, AlertCircle, Search, BookOpen, Bookmark } from '@/components/icons';
import { useUIStore, useReadingSettings, applyReaderThemeToElement, removeReaderThemeFromElement } from '@/store/premiumReaderStore';
import { ReaderSettings } from './ReaderSettings';
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
}

export function PdfReader({ bookPath, bookId }: PdfReaderProps) {
  const { progress, setProgress } = useReaderStore();
  const { isTopBarVisible, isFocusMode, setTopBarVisible, toggleSidebar } = useUIStore();
  const { theme } = useReadingSettings();

  const [metadata, setMetadata] = useState<BookMetadata | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState<number>(1.0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string>('');

  const containerRef = useRef<HTMLDivElement>(null);
  const readerContainerRef = useRef<HTMLDivElement>(null);
  const autoHideTimerRef = useRef<number | null>(null);

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
  const resetAutoHideTimer = () => {
    if (!isFocusMode) {
      setTopBarVisible(true);
      if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
      autoHideTimerRef.current = window.setTimeout(() => setTopBarVisible(false), 3000);
    }
  };

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
  }, [isFocusMode, setTopBarVisible]);

  useEffect(() => {
    if (isFocusMode) {
      setTopBarVisible(false);
      if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
    } else {
      setTopBarVisible(true);
      resetAutoHideTimer();
    }
  }, [isFocusMode, setTopBarVisible]);

  useEffect(() => {
    loadBook();
    return () => {
      // Cleanup
      api.closeBookRenderer(bookId).catch(console.error);
    };
  }, [bookPath, bookId]);

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

      // Load saved progress
      if (progress?.currentPage) {
        setPageNumber(progress.currentPage);
      }
    } catch (err) {
      console.error('[PdfReader] Error initializing PDF:', err);
      setError(err instanceof Error ? err.message : 'Failed to initialize PDF');
      setIsLoading(false);
    }
  };

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setIsLoading(false);
  };

  const onDocumentLoadError = (error: Error) => {
    console.error('[PdfReader] Error loading PDF document:', error);
    setError(error.message || 'Failed to parse PDF document.');
    setIsLoading(false);
  }

  // Effect to update progress whenever page changes
  useEffect(() => {
    if (numPages > 0) {
      updateProgress(pageNumber);
    }
  }, [pageNumber, numPages]);

  const updateProgress = async (pageIndex: number) => {
    const progressPercent = numPages > 0 ? (pageIndex / numPages) * 100 : 0;

    setProgress({
      bookId,
      currentLocation: `page-${pageIndex}`,
      progressPercent,
      currentPage: pageIndex,
      totalPages: numPages,
      lastRead: new Date().toISOString(),
    });

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
      <div className={`premium-top-bar ${!isTopBarVisible ? 'premium-top-bar--hidden' : ''}`}>
        <div className="premium-top-bar-content">
          <div className="premium-top-bar-left">
            <span className="premium-book-title">{metadata?.title || 'Loading...'}</span>
            <span className="premium-chapter-indicator">Page {pageNumber} of {numPages}</span>
          </div>

          <div className="premium-top-bar-center">
            <span className="premium-progress-text">{Math.round((pageNumber / numPages) * 100 || 0)}%</span>
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
          </div>

          <div className="premium-top-bar-right">
            <ReaderSettings />
          </div>
        </div>
      </div>

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
                scale={scale}
                renderTextLayer={true}
                renderAnnotationLayer={true}
                className="bg-white"
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
    </div>
  );
}
