import { useEffect, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { useReaderStore } from '@/store/readerStore';
import { api } from '@/lib/tauri';
import { convertFileSrc } from '@tauri-apps/api/core';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

interface PdfReaderProps {
  bookPath: string;
  bookId: number;
}

export function PdfReader({ bookPath, bookId }: PdfReaderProps) {
  const { progress, settings, setProgress } = useReaderStore();
  
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [isLoading, setIsLoading] = useState(true);
  const [pdfUrl, setPdfUrl] = useState<string>('');

  useEffect(() => {
    // Convert file path to asset URL for Tauri
    const assetUrl = convertFileSrc(bookPath);
    setPdfUrl(assetUrl);
  }, [bookPath]);

  useEffect(() => {
    // Load saved progress
    if (progress?.currentPage) {
      setCurrentPage(progress.currentPage);
    }
  }, [progress]);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setIsLoading(false);
  };

  const goToPage = async (pageNumber: number) => {
    if (pageNumber < 1 || pageNumber > numPages) return;
    
    setCurrentPage(pageNumber);
    
    const progressPercent = (pageNumber / numPages) * 100;
    
    // Update local state
    setProgress({
      bookId,
      currentLocation: `page-${pageNumber}`,
      progressPercent,
      currentPage: pageNumber,
      totalPages: numPages,
      lastRead: new Date().toISOString(),
    });

    // Save to backend
    await api.saveReadingProgress(
      bookId,
      `page-${pageNumber}`,
      progressPercent,
      pageNumber,
      numPages
    );
  };

  const nextPage = () => {
    goToPage(currentPage + 1);
  };

  const prevPage = () => {
    goToPage(currentPage - 1);
  };

  const zoomIn = () => {
    setScale((prev) => Math.min(prev + 0.2, 3.0));
  };

  const zoomOut = () => {
    setScale((prev) => Math.max(prev - 0.2, 0.5));
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
  }, [currentPage, numPages]);

  // Expose navigation methods to parent
  useEffect(() => {
    (window as any).pdfNavigation = {
      next: nextPage,
      prev: prevPage,
      zoomIn,
      zoomOut,
      resetZoom,
    };
  }, [currentPage, numPages]);

  if (!pdfUrl) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
          <p className="text-gray-600">Preparing PDF...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col bg-gray-100">
      {/* Top toolbar */}
      <div className="flex items-center justify-between bg-white border-b px-4 py-2 shadow-sm">
        <div className="flex items-center gap-2">
          <button
            onClick={prevPage}
            disabled={currentPage <= 1}
            className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed rounded"
          >
            Previous
          </button>
          <span className="text-sm text-gray-600">
            Page {currentPage} of {numPages || '...'}
          </span>
          <button
            onClick={nextPage}
            disabled={currentPage >= numPages}
            className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed rounded"
          >
            Next
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={zoomOut}
            className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded"
            title="Zoom out (-)"
          >
            -
          </button>
          <span className="text-sm text-gray-600 min-w-[60px] text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={zoomIn}
            className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded"
            title="Zoom in (+)"
          >
            +
          </button>
          <button
            onClick={resetZoom}
            className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded"
            title="Reset zoom (0)"
          >
            Reset
          </button>
        </div>
      </div>

      {/* PDF viewer */}
      <div className="flex-1 overflow-auto flex items-start justify-center p-8">
        <Document
          file={pdfUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
                <p className="text-gray-600">Loading PDF...</p>
              </div>
            </div>
          }
          error={
            <div className="text-center text-red-500">
              <p className="text-lg mb-2">Failed to load PDF</p>
              <p className="text-sm text-gray-500">Please check the file format.</p>
            </div>
          }
        >
          <Page
            pageNumber={currentPage}
            scale={scale}
            className="shadow-lg"
            renderTextLayer={true}
            renderAnnotationLayer={true}
          />
        </Document>
      </div>

      {/* Progress bar */}
      <div className="bg-white border-t px-4 py-2">
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-500 h-2 rounded-full transition-all"
            style={{ width: `${(currentPage / numPages) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
