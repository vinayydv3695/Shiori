import { useEffect, useState } from 'react';
import { useReaderStore } from '@/store/readerStore';
import { api } from '@/lib/tauri';
import type { BookMetadata, Chapter } from '@/lib/tauri';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Loader2, AlertCircle, Info } from '@/components/icons';

interface PdfReaderProps {
  bookPath: string;
  bookId: number;
}

export function PdfReader({ bookPath, bookId }: PdfReaderProps) {
  const { progress, settings, setProgress } = useReaderStore();
  
  // Map font family IDs to CSS font-family strings
  const getFontFamily = (fontId: string): string => {
    const fontMap: Record<string, string> = {
      serif: 'Georgia, serif',
      sans: 'Arial, sans-serif',
      system: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      literata: '"Literata", Georgia, serif',
      merriweather: '"Merriweather", Georgia, serif',
      opensans: '"Open Sans", Arial, sans-serif',
      lora: '"Lora", Georgia, serif',
      mono: 'Courier, "Courier New", monospace',
    };
    return fontMap[fontId] || fontMap.serif;
  };
  
  const [metadata, setMetadata] = useState<BookMetadata | null>(null);
  const [currentPage, setCurrentPage] = useState<Chapter | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [scale, setScale] = useState<number>(1.0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadBook();
    return () => {
      // Cleanup: close book renderer when component unmounts
      api.closeBookRenderer(bookId).catch(console.error);
    };
  }, [bookPath, bookId]);

  const loadBook = async () => {
    try {
      setIsLoading(true);
      setError(null);

      console.log('[PdfReader] Opening book:', bookId, bookPath);
      
      // Open book in rendering system
      const bookMetadata = await api.openBookRenderer(bookId, bookPath, 'pdf');
      setMetadata(bookMetadata);
      
      console.log('[PdfReader] Book metadata:', bookMetadata);

      // Load first page or saved progress
      let startIndex = 0;
      if (progress?.currentPage) {
        startIndex = progress.currentPage - 1; // Convert 1-based to 0-based
      }

      await loadPage(startIndex);
      setIsLoading(false);
    } catch (err) {
      console.error('[PdfReader] Error loading book:', err);
      setError(err instanceof Error ? err.message : 'Failed to load PDF');
      setIsLoading(false);
    }
  };

  const loadPage = async (index: number) => {
    try {
      console.log('[PdfReader] Loading page:', index);
      const page = await api.getBookChapter(bookId, index);
      setCurrentPage(page);
      setCurrentIndex(index);

      // Calculate and save progress
      const progressPercent = metadata && metadata.total_pages
        ? ((index + 1) / metadata.total_pages) * 100
        : 0;
      
      setProgress({
        bookId,
        currentLocation: `page-${index + 1}`,
        progressPercent,
        currentPage: index + 1,
        totalPages: metadata?.total_pages || undefined,
        lastRead: new Date().toISOString(),
      });

      // Save to backend
      await api.saveReadingProgress(
        bookId,
        `page-${index + 1}`,
        progressPercent,
        index + 1,
        metadata?.total_pages || undefined
      );
    } catch (err) {
      console.error('[PdfReader] Error loading page:', err);
      setError(err instanceof Error ? err.message : 'Failed to load page');
    }
  };

  const nextPage = () => {
    const totalPages = metadata?.total_pages || metadata?.total_chapters || 0;
    if (currentIndex < totalPages - 1) {
      loadPage(currentIndex + 1);
    }
  };

  const prevPage = () => {
    if (currentIndex > 0) {
      loadPage(currentIndex - 1);
    }
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
  }, [currentIndex, metadata]);

  // Expose navigation methods to parent
  useEffect(() => {
    (window as any).pdfNavigation = {
      next: nextPage,
      prev: prevPage,
      zoomIn,
      zoomOut,
      resetZoom,
    };
  }, [currentIndex, metadata]);

  const totalPages = metadata?.total_pages || metadata?.total_chapters || 0;

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-center p-8 max-w-md">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <p className="text-red-600 text-lg font-semibold mb-2">{error}</p>
          <p className="text-gray-600">Try opening a different book or check the file format.</p>
        </div>
      </div>
    );
  }

  if (isLoading || !currentPage) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-700 font-medium">Loading PDF...</p>
          {metadata && (
            <p className="text-gray-500 text-sm mt-2">{metadata.title}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col bg-gray-100">
      {/* Top toolbar */}
      <div className="flex items-center justify-between bg-white border-b px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={prevPage}
            disabled={currentIndex === 0}
            className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Previous</span>
          </button>
          <span className="text-sm font-medium text-gray-700 min-w-[100px] text-center">
            Page {currentIndex + 1} of {totalPages}
          </span>
          <button
            onClick={nextPage}
            disabled={currentIndex >= totalPages - 1}
            className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors"
          >
            <span>Next</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={zoomOut}
            className="p-2 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
            title="Zoom out (-)"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium text-gray-700 min-w-[60px] text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={zoomIn}
            className="p-2 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
            title="Zoom in (+)"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={resetZoom}
            className="px-3 py-1.5 text-sm font-medium bg-gray-100 hover:bg-gray-200 rounded-md transition-colors ml-2"
            title="Reset zoom (0)"
          >
            Reset
          </button>
        </div>
      </div>

      {/* PDF content (text extraction mode) */}
      <div className="flex-1 overflow-auto bg-white">
        <div className="max-w-4xl mx-auto">
          {/* Info banner about text extraction */}
          <div className="bg-blue-50 border-l-4 border-blue-400 p-4 m-6">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-blue-900">Text Extraction Mode</p>
                <p className="text-sm text-blue-700 mt-1">
                  Currently displaying extracted text from the PDF. Image rendering will be added in a future update.
                </p>
              </div>
            </div>
          </div>

          {/* Page content */}
          <div 
            className="px-8 py-6"
            style={{
              fontFamily: getFontFamily(settings.fontFamily),
              fontSize: `${settings.fontSize * scale}px`,
              lineHeight: settings.lineHeight,
            }}
          >
            <div 
              className="prose prose-lg max-w-none"
              dangerouslySetInnerHTML={{ __html: currentPage.content || '<p class="text-gray-500 italic">No text content found on this page.</p>' }}
            />
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="bg-white border-t px-4 py-3">
        <div className="max-w-4xl mx-auto">
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all"
              style={{ width: `${((currentIndex + 1) / totalPages) * 100}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 text-center mt-1">
            {Math.round(((currentIndex + 1) / totalPages) * 100)}% complete
          </p>
        </div>
      </div>
    </div>
  );
}
