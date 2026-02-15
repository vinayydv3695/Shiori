import { useEffect, useRef, useState } from 'react';
import ePub, { Book, Rendition } from 'epubjs';
import { useReaderStore } from '@/store/readerStore';
import { api } from '@/lib/tauri';
import { convertFileSrc } from '@tauri-apps/api/core';

interface EpubReaderProps {
  bookPath: string;
  bookId: number;
}

export function EpubReader({ bookPath, bookId }: EpubReaderProps) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<Book | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  
  const { progress, settings, setProgress, addAnnotation } = useReaderStore();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!viewerRef.current) return;

    const loadBook = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Convert file path to asset URL for Tauri
        const assetUrl = convertFileSrc(bookPath);
        
        // Initialize epub.js
        const book = ePub(assetUrl);
        bookRef.current = book;

        // Render the book
        if (!viewerRef.current) {
          throw new Error('Viewer element not found');
        }
        
        const rendition = book.renderTo(viewerRef.current, {
          width: '100%',
          height: '100%',
          spread: settings.pageMode === 'paginated' ? 'auto' : 'none',
        });
        renditionRef.current = rendition;

        // Apply reader settings
        rendition.themes.default({
          body: {
            'font-family': settings.fontFamily === 'serif' ? 'Georgia, serif' : 
                           settings.fontFamily === 'sans' ? 'Arial, sans-serif' : 
                           'monospace',
            'font-size': `${settings.fontSize}px`,
            'line-height': settings.lineHeight.toString(),
            'padding': `${settings.marginSize * 20}px`,
          },
        });

        // Load progress or start from beginning
        if (progress?.currentLocation) {
          await rendition.display(progress.currentLocation);
        } else {
          await rendition.display();
        }

        setIsLoading(false);

        // Save progress on location change
        rendition.on('relocated', async (location: any) => {
          const currentCfi = location.start.cfi;
          const progressPercent = book.locations.percentageFromCfi(currentCfi) * 100;
          
          setProgress({
            bookId,
            currentLocation: currentCfi,
            progressPercent,
            lastRead: new Date().toISOString(),
          });

          // Save to backend
          await api.saveReadingProgress(
            bookId,
            currentCfi,
            progressPercent
          );
        });

        // Handle text selection for highlights
        rendition.on('selected', async (cfiRange: string, contents: any) => {
          const selectedText = contents.window.getSelection().toString();
          
          if (selectedText) {
            // Create highlight annotation
            const annotation = await api.createAnnotation(
              bookId,
              'highlight',
              cfiRange,
              cfiRange,
              selectedText,
              undefined,
              '#fbbf24' // Yellow color
            );

            addAnnotation(annotation);

            // Mark the highlight in the book
            rendition.annotations.add(
              'highlight',
              cfiRange,
              {},
              undefined,
              'hl',
              { fill: annotation.color, 'fill-opacity': '0.3' }
            );
          }
        });

        // Keyboard navigation
        const handleKeyPress = (e: KeyboardEvent) => {
          if (e.key === 'ArrowLeft') {
            rendition.prev();
          } else if (e.key === 'ArrowRight') {
            rendition.next();
          }
        };

        document.addEventListener('keydown', handleKeyPress);

        return () => {
          document.removeEventListener('keydown', handleKeyPress);
          rendition.destroy();
        };
      } catch (err) {
        console.error('Error loading EPUB:', err);
        setError('Failed to load eBook. Please check the file format.');
        setIsLoading(false);
      }
    };

    loadBook();
  }, [bookPath, bookId]);

  // Update rendition when settings change
  useEffect(() => {
    if (!renditionRef.current) return;

    renditionRef.current.themes.default({
      body: {
        'font-family': settings.fontFamily === 'serif' ? 'Georgia, serif' : 
                       settings.fontFamily === 'sans' ? 'Arial, sans-serif' : 
                       'monospace',
        'font-size': `${settings.fontSize}px`,
        'line-height': settings.lineHeight.toString(),
        'padding': `${settings.marginSize * 20}px`,
      },
    });
  }, [settings]);

  const nextPage = () => {
    renditionRef.current?.next();
  };

  const prevPage = () => {
    renditionRef.current?.prev();
  };

  // Expose navigation methods to parent
  useEffect(() => {
    (window as any).epubNavigation = {
      next: nextPage,
      prev: prevPage,
    };
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-red-500 text-lg mb-2">{error}</p>
          <p className="text-gray-500">Try opening a different book.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
          <p className="text-gray-600">Loading book...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full relative">
      <div ref={viewerRef} className="h-full w-full" />
      
      {/* Navigation arrows */}
      <button
        onClick={prevPage}
        className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-white/80 hover:bg-white rounded-full shadow-lg transition-all opacity-0 hover:opacity-100"
        aria-label="Previous page"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      
      <button
        onClick={nextPage}
        className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-white/80 hover:bg-white rounded-full shadow-lg transition-all opacity-0 hover:opacity-100"
        aria-label="Next page"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}
