import { useEffect, useState } from 'react';
import { useReaderStore } from '@/store/readerStore';
import { api } from '@/lib/tauri';
import type { BookMetadata, Chapter } from '@/lib/tauri';
import { ChevronLeft, ChevronRight, Loader2, AlertCircle } from '@/components/icons';

interface EpubReaderProps {
  bookPath: string;
  bookId: number;
}

export function EpubReader({ bookPath, bookId }: EpubReaderProps) {
  const { progress, settings, setProgress } = useReaderStore();
  
  const [metadata, setMetadata] = useState<BookMetadata | null>(null);
  const [currentChapter, setCurrentChapter] = useState<Chapter | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
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

      console.log('[EpubReader] Opening book:', bookId, bookPath);
      
      // Open book in rendering system
      const bookMetadata = await api.openBookRenderer(bookId, bookPath, 'epub');
      setMetadata(bookMetadata);
      
      console.log('[EpubReader] Book metadata:', bookMetadata);

      // Load first chapter or saved progress
      let startIndex = 0;
      if (progress?.currentLocation) {
        // Try to parse chapter index from location
        const match = progress.currentLocation.match(/chapter[_-]?(\d+)/i);
        if (match) {
          startIndex = parseInt(match[1], 10);
        }
      }

      await loadChapter(startIndex);
      setIsLoading(false);
    } catch (err) {
      console.error('[EpubReader] Error loading book:', err);
      setError(err instanceof Error ? err.message : 'Failed to load eBook');
      setIsLoading(false);
    }
  };

  const loadChapter = async (index: number) => {
    try {
      console.log('[EpubReader] Loading chapter:', index);
      const chapter = await api.getBookChapter(bookId, index);
      setCurrentChapter(chapter);
      setCurrentIndex(index);

      // Calculate and save progress
      const progressPercent = metadata 
        ? ((index + 1) / metadata.total_chapters) * 100
        : 0;
      
      setProgress({
        bookId,
        currentLocation: `chapter_${index}`,
        progressPercent,
        lastRead: new Date().toISOString(),
      });

      // Save to backend
      await api.saveReadingProgress(
        bookId,
        `chapter_${index}`,
        progressPercent
      );
    } catch (err) {
      console.error('[EpubReader] Error loading chapter:', err);
      setError(err instanceof Error ? err.message : 'Failed to load chapter');
    }
  };

  const nextChapter = () => {
    if (!metadata) return;
    if (currentIndex < metadata.total_chapters - 1) {
      loadChapter(currentIndex + 1);
    }
  };

  const prevChapter = () => {
    if (currentIndex > 0) {
      loadChapter(currentIndex - 1);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        prevChapter();
      } else if (e.key === 'ArrowRight') {
        nextChapter();
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [currentIndex, metadata]);

  // Expose navigation methods to parent
  useEffect(() => {
    (window as any).epubNavigation = {
      next: nextChapter,
      prev: prevChapter,
    };
  }, [currentIndex, metadata]);

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

  if (isLoading || !currentChapter) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-700 font-medium">Loading book...</p>
          {metadata && (
            <p className="text-gray-500 text-sm mt-2">{metadata.title}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col bg-white">
      {/* Chapter content */}
      <div className="flex-1 overflow-auto">
        <div 
          className="max-w-4xl mx-auto px-8 py-12"
          style={{
            fontFamily: settings.fontFamily === 'serif' ? 'Georgia, serif' : 
                       settings.fontFamily === 'sans' ? 'Arial, sans-serif' : 
                       'monospace',
            fontSize: `${settings.fontSize}px`,
            lineHeight: settings.lineHeight,
            padding: `${settings.marginSize * 20}px`,
          }}
        >
          {/* Chapter title */}
          <h2 className="text-2xl font-bold mb-6 text-gray-900">
            {currentChapter.title}
          </h2>
          
          {/* Chapter content */}
          <div 
            className="prose prose-lg max-w-none"
            dangerouslySetInnerHTML={{ __html: currentChapter.content }}
          />
        </div>
      </div>

      {/* Bottom navigation bar */}
      <div className="bg-white border-t border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          {/* Previous button */}
          <button
            onClick={prevChapter}
            disabled={currentIndex === 0}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 text-gray-700"
            aria-label="Previous chapter"
          >
            <ChevronLeft className="w-5 h-5" />
            <span>Previous</span>
          </button>

          {/* Chapter indicator */}
          <div className="text-center">
            <p className="text-sm text-gray-600">
              Chapter {currentIndex + 1} of {metadata?.total_chapters || 0}
            </p>
            <div className="w-48 bg-gray-200 rounded-full h-2 mt-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all"
                style={{ 
                  width: `${metadata ? ((currentIndex + 1) / metadata.total_chapters) * 100 : 0}%` 
                }}
              />
            </div>
          </div>

          {/* Next button */}
          <button
            onClick={nextChapter}
            disabled={!metadata || currentIndex >= metadata.total_chapters - 1}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 text-gray-700"
            aria-label="Next chapter"
          >
            <span>Next</span>
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Floating navigation arrows */}
      <button
        onClick={prevChapter}
        disabled={currentIndex === 0}
        className="fixed left-4 top-1/2 -translate-y-1/2 p-3 bg-white/90 hover:bg-white rounded-full shadow-lg transition-all opacity-0 hover:opacity-100 disabled:opacity-0 border border-gray-200"
        aria-label="Previous chapter"
      >
        <ChevronLeft className="w-6 h-6 text-gray-700" />
      </button>
      
      <button
        onClick={nextChapter}
        disabled={!metadata || currentIndex >= metadata.total_chapters - 1}
        className="fixed right-4 top-1/2 -translate-y-1/2 p-3 bg-white/90 hover:bg-white rounded-full shadow-lg transition-all opacity-0 hover:opacity-100 disabled:opacity-0 border border-gray-200"
        aria-label="Next chapter"
      >
        <ChevronRight className="w-6 h-6 text-gray-700" />
      </button>
    </div>
  );
}
