import { useEffect, useState } from 'react';
import { useReaderStore } from '@/store/readerStore';
import { api } from '@/lib/tauri';
import type { BookMetadata, Chapter } from '@/lib/tauri';
import { ChevronLeft, ChevronRight, Loader2, AlertCircle } from '@/components/icons';

interface EpubReaderProps {
  bookPath: string;
  bookId: number;
}

// Helper function to convert resource URLs to data URIs
async function processEpubHtml(bookId: number, html: string): Promise<string> {
  console.log(`[processEpubHtml] Starting for book ${bookId}, HTML length: ${html.length}`);
  
  const srcRegex = /(src|href)="([^"]+)"/g;
  const matches = Array.from(html.matchAll(srcRegex));
  
  console.log(`[processEpubHtml] Found ${matches.length} resource references`);
  
  let processedHtml = html;
  let successCount = 0;
  let failCount = 0;
  
  for (const match of matches) {
    const attr = match[1];
    const originalPath = match[2];
    
    // Skip absolute URLs, data URIs, and anchors
    if (originalPath.startsWith('http') || originalPath.startsWith('data:') || originalPath.startsWith('#')) {
      continue;
    }
    
    try {
      console.log(`[processEpubHtml] Fetching resource: ${originalPath}`);
      const resourceData = await api.getEpubResource(bookId, originalPath);
      console.log(`[processEpubHtml] Got resource data, size: ${resourceData.length} bytes`);
      
      // Determine MIME type
      let mimeType = 'application/octet-stream';
      const ext = originalPath.toLowerCase();
      if (ext.endsWith('.jpg') || ext.endsWith('.jpeg')) mimeType = 'image/jpeg';
      else if (ext.endsWith('.png')) mimeType = 'image/png';
      else if (ext.endsWith('.gif')) mimeType = 'image/gif';
      else if (ext.endsWith('.svg')) mimeType = 'image/svg+xml';
      else if (ext.endsWith('.css')) mimeType = 'text/css';
      else if (ext.endsWith('.woff')) mimeType = 'font/woff';
      else if (ext.endsWith('.woff2')) mimeType = 'font/woff2';
      else if (ext.endsWith('.ttf')) mimeType = 'font/ttf';
      
      // Convert to base64
      const base64 = btoa(String.fromCharCode(...new Uint8Array(resourceData)));
      const dataUri = `data:${mimeType};base64,${base64}`;
      
      processedHtml = processedHtml.replace(`${attr}="${originalPath}"`, `${attr}="${dataUri}"`);
      successCount++;
      console.log(`[processEpubHtml] ✅ Processed: ${originalPath}`);
    } catch (err) {
      failCount++;
      console.warn(`[processEpubHtml] ❌ Could not load resource: ${originalPath}`, err);
    }
  }
  
  console.log(`[processEpubHtml] Completed. Success: ${successCount}, Failed: ${failCount}`);
  return processedHtml;
}

export function EpubReader({ bookPath, bookId }: EpubReaderProps) {
  const { progress, settings, setProgress } = useReaderStore();
  
  const [metadata, setMetadata] = useState<BookMetadata | null>(null);
  const [currentChapter, setCurrentChapter] = useState<Chapter | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isDark = settings.theme === 'dark' || settings.theme === 'sepia';
  const bgColor = settings.theme === 'dark' ? 'bg-gray-900' : 
                  settings.theme === 'sepia' ? 'bg-amber-50' : 'bg-white';
  const textColor = settings.theme === 'dark' ? 'text-gray-100' : 
                    settings.theme === 'sepia' ? 'text-amber-900' : 'text-gray-900';
  const mutedColor = settings.theme === 'dark' ? 'text-gray-400' : 
                     settings.theme === 'sepia' ? 'text-amber-700' : 'text-gray-600';

  useEffect(() => {
    loadBook();
    return () => {
      api.closeBookRenderer(bookId).catch(console.error);
    };
  }, [bookPath, bookId]);

  const loadBook = async () => {
    try {
      setIsLoading(true);
      setError(null);

      console.log('[EpubReader] Opening book:', bookId, bookPath);
      
      // Add small delay to ensure book is in database
      await new Promise(resolve => setTimeout(resolve, 500));
      
      console.log('[EpubReader] Calling openBookRenderer...');
      const bookMetadata = await api.openBookRenderer(bookId, bookPath, 'epub');
      console.log('[EpubReader] ✅ Got book metadata:', bookMetadata);
      
      // Add another small delay to ensure HashMap insert completes
      await new Promise(resolve => setTimeout(resolve, 200));
      
      setMetadata(bookMetadata);

      let startIndex = 0;
      if (progress?.currentLocation) {
        const match = progress.currentLocation.match(/chapter[_-]?(\d+)/i);
        if (match) {
          startIndex = parseInt(match[1], 10);
        }
      }

      console.log('[EpubReader] Loading initial chapter:', startIndex);
      await loadChapter(startIndex);
      setIsLoading(false);
      console.log('[EpubReader] ✅ Book fully loaded');
    } catch (err) {
      console.error('[EpubReader] ❌ Error loading book:', err);
      setError(err instanceof Error ? err.message : 'Failed to load eBook');
      setIsLoading(false);
    }
  };

  const loadChapter = async (index: number) => {
    try {
      console.log('[EpubReader] Loading chapter:', index);
      setIsLoading(true);
      
      const chapter = await api.getBookChapter(bookId, index);
      console.log('[EpubReader] ✅ Got chapter:', chapter.title, `(${chapter.content.length} chars)`);
      
      // Validate chapter content
      if (!chapter.content || chapter.content.trim().length === 0) {
        console.warn('[EpubReader] ⚠️ Chapter content is empty!');
        throw new Error(`Chapter ${index + 1} has no content`);
      }
      
      // Process HTML to convert resource paths to data URIs
      console.log('[EpubReader] Processing chapter HTML...');
      const processedContent = await processEpubHtml(bookId, chapter.content);
      console.log('[EpubReader] ✅ HTML processed, length:', processedContent.length);
      
      const processedChapter = { ...chapter, content: processedContent };
      
      setCurrentChapter(processedChapter);
      setCurrentIndex(index);
      setIsLoading(false);
      console.log('[EpubReader] ✅ Chapter loaded and rendered');

      const progressPercent = metadata 
        ? ((index + 1) / metadata.total_chapters) * 100
        : 0;
      
      setProgress({
        bookId,
        currentLocation: `chapter_${index}`,
        progressPercent,
        lastRead: new Date().toISOString(),
      });

      try {
        await api.saveReadingProgress(bookId, `chapter_${index}`, progressPercent);
      } catch (saveErr) {
        console.warn('[EpubReader] Could not save reading progress:', saveErr);
      }
    } catch (err) {
      console.error('[EpubReader] ❌ Error loading chapter:', err);
      setError(err instanceof Error ? err.message : 'Failed to load chapter');
      setIsLoading(false);
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

  if (error) {
    return (
      <div className={`flex items-center justify-center h-full ${bgColor}`}>
        <div className="text-center p-8 max-w-md">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <p className="text-red-600 text-lg font-semibold mb-2">{error}</p>
          <p className={mutedColor}>Try opening a different book or check the file format.</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }

  if (isLoading || !currentChapter) {
    return (
      <div className={`flex items-center justify-center h-full ${bgColor}`}>
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
          <p className={`${textColor} font-medium`}>
            {isLoading && currentChapter ? 'Loading chapter...' : 'Loading book...'}
          </p>
          {metadata && (
            <p className={`${mutedColor} text-sm mt-2`}>{metadata.title}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`h-full w-full flex flex-col ${bgColor} transition-colors duration-300`}>
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
          <h2 className={`text-3xl font-bold mb-8 ${textColor}`}>
            {currentChapter.title}
          </h2>
          
          {/* Chapter content with theme-aware prose */}
          <div 
            className={`prose prose-lg max-w-none ${
              isDark ? 'prose-invert' : ''
            }`}
            style={{
              color: isDark ? '#e5e7eb' : settings.theme === 'sepia' ? '#78350f' : '#1f2937'
            }}
            dangerouslySetInnerHTML={{ __html: currentChapter.content }}
          />
        </div>
      </div>

      {/* Bottom navigation bar */}
      <div className={`${
        settings.theme === 'dark' ? 'bg-gray-800 border-gray-700' : 
        settings.theme === 'sepia' ? 'bg-amber-100 border-amber-200' : 
        'bg-white border-gray-200'
      } border-t px-6 py-4 transition-colors duration-300`}>
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          {/* Previous button */}
          <button
            onClick={prevChapter}
            disabled={currentIndex === 0}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
              settings.theme === 'dark' 
                ? 'hover:bg-gray-700 text-gray-200' 
                : settings.theme === 'sepia'
                ? 'hover:bg-amber-200 text-amber-900'
                : 'hover:bg-gray-100 text-gray-700'
            }`}
            aria-label="Previous chapter"
          >
            <ChevronLeft className="w-5 h-5" />
            <span>Previous</span>
          </button>

          {/* Chapter indicator */}
          <div className="text-center">
            <p className={`text-sm ${mutedColor} mb-2`}>
              Chapter {currentIndex + 1} of {metadata?.total_chapters || 0}
            </p>
            <div className={`w-48 ${
              settings.theme === 'dark' ? 'bg-gray-700' : 
              settings.theme === 'sepia' ? 'bg-amber-200' : 
              'bg-gray-200'
            } rounded-full h-2`}>
              <div
                className={`${
                  settings.theme === 'dark' ? 'bg-blue-400' :
                  settings.theme === 'sepia' ? 'bg-amber-600' :
                  'bg-blue-500'
                } h-2 rounded-full transition-all duration-300`}
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
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
              settings.theme === 'dark' 
                ? 'hover:bg-gray-700 text-gray-200' 
                : settings.theme === 'sepia'
                ? 'hover:bg-amber-200 text-amber-900'
                : 'hover:bg-gray-100 text-gray-700'
            }`}
            aria-label="Next chapter"
          >
            <span>Next</span>
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Floating navigation arrows - only show on hover */}
      <button
        onClick={prevChapter}
        disabled={currentIndex === 0}
        className={`fixed left-4 top-1/2 -translate-y-1/2 p-3 rounded-full shadow-lg transition-all opacity-0 hover:opacity-100 disabled:opacity-0 ${
          settings.theme === 'dark' 
            ? 'bg-gray-800/90 hover:bg-gray-800 border-gray-700 text-gray-200' 
            : settings.theme === 'sepia'
            ? 'bg-amber-100/90 hover:bg-amber-100 border-amber-200 text-amber-900'
            : 'bg-white/90 hover:bg-white border-gray-200 text-gray-700'
        } border`}
        aria-label="Previous chapter"
      >
        <ChevronLeft className="w-6 h-6" />
      </button>
      
      <button
        onClick={nextChapter}
        disabled={!metadata || currentIndex >= metadata.total_chapters - 1}
        className={`fixed right-4 top-1/2 -translate-y-1/2 p-3 rounded-full shadow-lg transition-all opacity-0 hover:opacity-100 disabled:opacity-0 ${
          settings.theme === 'dark' 
            ? 'bg-gray-800/90 hover:bg-gray-800 border-gray-700 text-gray-200' 
            : settings.theme === 'sepia'
            ? 'bg-amber-100/90 hover:bg-amber-100 border-amber-200 text-amber-900'
            : 'bg-white/90 hover:bg-white border-gray-200 text-gray-700'
        } border`}
        aria-label="Next chapter"
      >
        <ChevronRight className="w-6 h-6" />
      </button>
    </div>
  );
}
