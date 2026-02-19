import { useEffect, useState } from 'react';
import { useReaderStore } from '@/store/readerStore';
import { api } from '@/lib/tauri';
import type { BookMetadata, Chapter } from '@/lib/tauri';
import { ChevronLeft, ChevronRight, Loader2, AlertCircle, Columns } from '@/components/icons';

interface EpubReaderProps {
  bookPath: string;
  bookId: number;
}

// Helper function to convert resource URLs to data URIs and inline CSS
async function processEpubHtml(bookId: number, html: string): Promise<string> {
  console.log(`[processEpubHtml] Starting for book ${bookId}, HTML length: ${html.length}`);
  
  let processedHtml = html;
  let successCount = 0;
  let failCount = 0;
  
  // Step 1: Process CSS stylesheets - Convert <link> tags to <style> tags
  const cssLinkRegex = /<link[^>]+rel=["']stylesheet["'][^>]*>/gi;
  const cssMatches = Array.from(html.matchAll(cssLinkRegex));
  
  console.log(`[processEpubHtml] Found ${cssMatches.length} CSS stylesheet links`);
  
  for (const match of cssMatches) {
    const linkTag = match[0];
    const hrefMatch = linkTag.match(/href=["']([^"']+)["']/i);
    
    if (!hrefMatch) continue;
    
    const cssPath = hrefMatch[1];
    
    // Skip absolute URLs
    if (cssPath.startsWith('http') || cssPath.startsWith('data:')) {
      continue;
    }
    
    try {
      // Clean the path
      let cleanPath = cssPath;
      while (cleanPath.startsWith('../') || cleanPath.startsWith('./')) {
        cleanPath = cleanPath.replace(/^\.\.\//, '').replace(/^\.\//, '');
      }
      
      console.log(`[processEpubHtml] Fetching CSS: ${cssPath} (cleaned: ${cleanPath})`);
      const cssData = await api.getEpubResource(bookId, cleanPath);
      
      // Convert bytes to string
      const cssText = new TextDecoder().decode(new Uint8Array(cssData));
      console.log(`[processEpubHtml] ✅ Got CSS, size: ${cssData.length} bytes`);
      
      // Replace <link> tag with <style> tag containing the CSS
      const styleTag = `<style type="text/css">\n${cssText}\n</style>`;
      processedHtml = processedHtml.replace(linkTag, styleTag);
      successCount++;
      console.log(`[processEpubHtml] ✅ Inlined CSS: ${cssPath}`);
    } catch (err) {
      failCount++;
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[processEpubHtml] ❌ Could not load CSS: ${cssPath} - ${errorMsg}`);
      // Remove the broken link tag to prevent browser errors
      processedHtml = processedHtml.replace(linkTag, '');
    }
  }
  
  // Step 2: Process images and other resources
  const srcRegex = /(src|href)="([^"']+)"/g;
  const matches = Array.from(processedHtml.matchAll(srcRegex));
  
  console.log(`[processEpubHtml] Found ${matches.length} src/href resource references`);
  
  for (const match of matches) {
    const attr = match[1];
    const originalPath = match[2];
    
    // Skip absolute URLs, data URIs, anchors, and CSS files (already processed)
    if (originalPath.startsWith('http') || 
        originalPath.startsWith('data:') || 
        originalPath.startsWith('#') ||
        originalPath.endsWith('.css')) {
      continue;
    }
    
    try {
      // Clean the path: remove ../ and ./ prefixes
      let cleanPath = originalPath;
      while (cleanPath.startsWith('../') || cleanPath.startsWith('./')) {
        cleanPath = cleanPath.replace(/^\.\.\//, '').replace(/^\.\//, '');
      }
      
      console.log(`[processEpubHtml] Fetching resource: ${originalPath} (cleaned: ${cleanPath})`);
      const resourceData = await api.getEpubResource(bookId, cleanPath);
      console.log(`[processEpubHtml] Got resource data, size: ${resourceData.length} bytes`);
      
      // Determine MIME type
      let mimeType = 'application/octet-stream';
      const ext = cleanPath.toLowerCase();
      if (ext.endsWith('.jpg') || ext.endsWith('.jpeg')) mimeType = 'image/jpeg';
      else if (ext.endsWith('.png')) mimeType = 'image/png';
      else if (ext.endsWith('.gif')) mimeType = 'image/gif';
      else if (ext.endsWith('.svg')) mimeType = 'image/svg+xml';
      else if (ext.endsWith('.webp')) mimeType = 'image/webp';
      else if (ext.endsWith('.bmp')) mimeType = 'image/bmp';
      else if (ext.endsWith('.woff')) mimeType = 'font/woff';
      else if (ext.endsWith('.woff2')) mimeType = 'font/woff2';
      else if (ext.endsWith('.ttf')) mimeType = 'font/ttf';
      else if (ext.endsWith('.otf')) mimeType = 'font/otf';
      
      // Convert to base64
      const base64 = btoa(String.fromCharCode(...new Uint8Array(resourceData)));
      const dataUri = `data:${mimeType};base64,${base64}`;
      
      processedHtml = processedHtml.replace(`${attr}="${originalPath}"`, `${attr}="${dataUri}"`);
      successCount++;
      console.log(`[processEpubHtml] ✅ Processed: ${originalPath}`);
    } catch (err) {
      failCount++;
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[processEpubHtml] ❌ Could not load resource: ${originalPath} - ${errorMsg}`);
    }
  }
  
  console.log(`[processEpubHtml] Completed. Success: ${successCount}, Failed: ${failCount}`);
  return processedHtml;
}

export function EpubReader({ bookPath, bookId }: EpubReaderProps) {
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
  const [currentChapter, setCurrentChapter] = useState<Chapter | null>(null);
  const [adjacentChapter, setAdjacentChapter] = useState<Chapter | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [twoPageView, setTwoPageView] = useState(false);

  // Theme helper function
  const getTheme = (themeId: string) => {
    const themes: Record<string, any> = {
      light: {
        isDark: false,
        bg: 'bg-white',
        text: 'text-gray-900',
        muted: 'text-gray-600',
        border: 'border-gray-200',
        controlsBg: 'bg-white/95',
        controlsBorder: 'border-gray-200',
        buttonBg: 'bg-gray-200',
        buttonHover: 'hover:bg-gray-300',
        buttonText: 'text-gray-700',
        buttonActive: 'bg-blue-500 text-white',
        progressBg: 'bg-gray-200',
        progressBar: 'bg-blue-500',
        contentColor: '#1f2937',
      },
      dark: {
        isDark: true,
        bg: 'bg-gray-900',
        text: 'text-gray-100',
        muted: 'text-gray-400',
        border: 'border-gray-700',
        controlsBg: 'bg-gray-800/95',
        controlsBorder: 'border-gray-700',
        buttonBg: 'bg-gray-700',
        buttonHover: 'hover:bg-gray-600',
        buttonText: 'text-gray-200',
        buttonActive: 'bg-blue-500 text-white',
        progressBg: 'bg-gray-700',
        progressBar: 'bg-blue-400',
        contentColor: '#e5e7eb',
      },
      nightlight: {
        isDark: true,
        bg: 'bg-amber-950',
        text: 'text-amber-100',
        muted: 'text-amber-300',
        border: 'border-amber-800',
        controlsBg: 'bg-amber-900/95',
        controlsBorder: 'border-amber-800',
        buttonBg: 'bg-amber-800',
        buttonHover: 'hover:bg-amber-700',
        buttonText: 'text-amber-100',
        buttonActive: 'bg-amber-600 text-amber-100',
        progressBg: 'bg-amber-800',
        progressBar: 'bg-amber-500',
        contentColor: '#fef3c7',
      },
    };
    return themes[themeId] || themes.light;
  };

  const theme = getTheme(settings.theme);
  const isDark = theme.isDark;
  const bgColor = theme.bg;
  const textColor = theme.text;
  const mutedColor = theme.muted;

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
      
      // Load next chapter for two-page view if enabled
      if (twoPageView && metadata && index < metadata.total_chapters - 1) {
        try {
          const nextCh = await api.getBookChapter(bookId, index + 1);
          const processedNext = await processEpubHtml(bookId, nextCh.content);
          setAdjacentChapter({ ...nextCh, content: processedNext });
        } catch (err) {
          console.warn('[EpubReader] Could not load adjacent chapter for two-page view:', err);
          setAdjacentChapter(null);
        }
      } else {
        setAdjacentChapter(null);
      }
      
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

  // Reload current chapter when two-page view is toggled
  useEffect(() => {
    if (currentChapter) {
      loadChapter(currentIndex);
    }
  }, [twoPageView]);

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
      {/* Top Control Bar - More Visible */}
      <div className={`${theme.controlsBg} ${theme.controlsBorder} border-b px-6 py-3 backdrop-blur-sm sticky top-0 z-10 shadow-md`}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Left: Book info */}
          <div className="flex items-center gap-3">
            <span className={`text-sm font-medium ${textColor}`}>
              {metadata?.title || 'Loading...'}
            </span>
            <span className={`text-xs ${mutedColor}`}>
              Chapter {currentIndex + 1}/{metadata?.total_chapters || 0}
            </span>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            {/* Two-Page View Toggle - EPUB specific feature */}
            <button
              onClick={() => setTwoPageView(!twoPageView)}
              className={`p-2 rounded-lg transition-all ${
                twoPageView 
                  ? theme.buttonActive
                  : `${theme.buttonBg} ${theme.buttonHover} ${theme.buttonText}`
              }`}
              aria-label="Toggle two-page view"
              title="Two-page view"
            >
              <Columns className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Chapter content */}
      <div className="flex-1 overflow-auto">
        <div className={`mx-auto ${twoPageView ? 'max-w-7xl' : 'max-w-4xl'} px-8 py-12`}>
          {twoPageView && adjacentChapter ? (
            /* Two-page layout */
            <div className="grid grid-cols-2 gap-8">
              {/* Left page - Current chapter */}
              <div
                style={{
                  fontFamily: getFontFamily(settings.fontFamily),
                  fontSize: `${settings.fontSize}px`,
                  lineHeight: settings.lineHeight,
                  padding: `${settings.marginSize * 20}px`,
                }}
              >
                <h2 className={`text-2xl font-bold mb-6 ${textColor}`}>
                  {currentChapter.title}
                </h2>
                <div 
                  className={`prose ${settings.fontSize > 18 ? 'prose-lg' : ''} max-w-none ${
                    isDark ? 'prose-invert' : ''
                  }`}
                  style={{
                    color: theme.contentColor,
                    lineHeight: settings.lineHeight,
                  }}
                  dangerouslySetInnerHTML={{ __html: currentChapter.content }}
                />
              </div>

              {/* Right page - Next chapter */}
              <div
                style={{
                  fontFamily: getFontFamily(settings.fontFamily),
                  fontSize: `${settings.fontSize}px`,
                  lineHeight: settings.lineHeight,
                  padding: `${settings.marginSize * 20}px`,
                }}
              >
                <h2 className={`text-2xl font-bold mb-6 ${textColor}`}>
                  {adjacentChapter.title}
                </h2>
                <div 
                  className={`prose ${settings.fontSize > 18 ? 'prose-lg' : ''} max-w-none ${
                    isDark ? 'prose-invert' : ''
                  }`}
                  style={{
                    color: theme.contentColor,
                    lineHeight: settings.lineHeight,
                  }}
                  dangerouslySetInnerHTML={{ __html: adjacentChapter.content }}
                />
              </div>
            </div>
          ) : (
            /* Single-page layout */
            <div
              style={{
                fontFamily: getFontFamily(settings.fontFamily),
                fontSize: `${settings.fontSize}px`,
                lineHeight: settings.lineHeight,
                padding: `${settings.marginSize * 20}px`,
              }}
            >
              <h2 className={`text-3xl font-bold mb-8 ${textColor}`}>
                {currentChapter.title}
              </h2>
              <div 
                className={`prose prose-lg max-w-none ${
                  isDark ? 'prose-invert' : ''
                }`}
                style={{
                  color: theme.contentColor,
                  lineHeight: settings.lineHeight,
                }}
                dangerouslySetInnerHTML={{ __html: currentChapter.content }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Floating navigation arrows - only show on hover */}
      <button
        onClick={prevChapter}
        disabled={currentIndex === 0}
        className={`fixed left-4 top-1/2 -translate-y-1/2 p-3 rounded-full shadow-lg transition-all opacity-0 hover:opacity-100 disabled:opacity-0 ${theme.controlsBg} ${theme.controlsBorder} ${theme.text} border hover:opacity-100`}
        aria-label="Previous chapter"
      >
        <ChevronLeft className="w-6 h-6" />
      </button>
      
      <button
        onClick={nextChapter}
        disabled={!metadata || currentIndex >= metadata.total_chapters - 1}
        className={`fixed right-4 top-1/2 -translate-y-1/2 p-3 rounded-full shadow-lg transition-all opacity-0 hover:opacity-100 disabled:opacity-0 ${theme.controlsBg} ${theme.controlsBorder} ${theme.text} border hover:opacity-100`}
        aria-label="Next chapter"
      >
        <ChevronRight className="w-6 h-6" />
      </button>
    </div>
  );
}
