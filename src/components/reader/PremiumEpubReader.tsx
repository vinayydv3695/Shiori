import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { api } from '@/lib/tauri';
import type { BookMetadata, Chapter } from '@/lib/tauri';
import { useUIStore, useReadingSettings } from '@/store/premiumReaderStore';
import { usePremiumReaderKeyboard } from '@/hooks/usePremiumReaderKeyboard';
import { PremiumSidebar } from './PremiumSidebar';
import { ReaderSettings } from './ReaderSettings';
import { ChevronLeft, ChevronRight, Loader2, AlertCircle, Search, BookOpen, Bookmark } from '@/components/icons';
import '@/styles/premium-reader.css';

interface PremiumEpubReaderProps {
  bookPath: string;
  bookId: number;
}

// Helper function to convert resource URLs to data URIs and inline CSS
async function processEpubHtml(bookId: number, html: string, searchTerm?: string | null): Promise<string> {
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
  
  // Step 3: Highlight search term if provided
  if (searchTerm && searchTerm.trim()) {
    processedHtml = highlightSearchTerm(processedHtml, searchTerm);
  }
  
  console.log(`[processEpubHtml] Completed. Success: ${successCount}, Failed: ${failCount}`);
  return processedHtml;
}

// Helper function to highlight search terms in HTML (case-insensitive, preserves HTML tags)
function highlightSearchTerm(html: string, searchTerm: string): string {
  if (!searchTerm || !searchTerm.trim()) return html;
  
  // Create a temporary DOM element to parse HTML safely
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  // Escape special regex characters in search term
  const escapedTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedTerm})`, 'gi');
  
  // Recursive function to highlight text nodes only
  const highlightTextNodes = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      if (regex.test(text)) {
        const highlightedHTML = text.replace(regex, '<mark class="search-highlight">$1</mark>');
        const span = document.createElement('span');
        span.innerHTML = highlightedHTML;
        node.parentNode?.replaceChild(span, node);
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      // Don't highlight inside <script>, <style>, or <mark> tags
      const tagName = (node as Element).tagName?.toLowerCase();
      if (tagName !== 'script' && tagName !== 'style' && tagName !== 'mark') {
        Array.from(node.childNodes).forEach(highlightTextNodes);
      }
    }
  };
  
  highlightTextNodes(doc.body);
  
  // Add styles for highlighted text
  const style = doc.createElement('style');
  style.textContent = `
    .search-highlight {
      background-color: #ffeb3b;
      color: #000;
      padding: 2px 0;
      border-radius: 2px;
      font-weight: 500;
    }
    [data-theme="dark"] .search-highlight {
      background-color: #f59e0b;
      color: #000;
    }
  `;
  doc.head.appendChild(style);
  
  return doc.documentElement.outerHTML;
}

export function PremiumEpubReader({ bookPath, bookId }: PremiumEpubReaderProps) {
  // State management
  const {
    isTopBarVisible,
    isSidebarOpen,
    isFocusMode,
    scrollProgress,
    setTopBarVisible,
    toggleSidebar,
    setScrollProgress,
    updateMouseMovement,
  } = useUIStore();
  
  const { theme, width, twoPageView, toggleTwoPageView } = useReadingSettings();
  
  // Book state
  const [metadata, setMetadata] = useState<BookMetadata | null>(null);
  const [currentChapter, setCurrentChapter] = useState<Chapter | null>(null);
  const [adjacentChapter, setAdjacentChapter] = useState<Chapter | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchHighlight, setSearchHighlight] = useState<string | null>(null); // NEW: Store search term for highlighting
  
  // Refs
  const canvasRef = useRef<HTMLDivElement>(null);
  const autoHideTimerRef = useRef<number | null>(null);
  
  // ────────────────────────────────────────────────────────────
  // AUTO-HIDE TOP BAR LOGIC
  // ────────────────────────────────────────────────────────────
  const resetAutoHideTimer = useCallback(() => {
    // Always show top bar on mouse movement (unless in focus mode)
    if (!isFocusMode) {
      setTopBarVisible(true);
      
      // Clear existing timer
      if (autoHideTimerRef.current) {
        clearTimeout(autoHideTimerRef.current);
      }
      
      // Set new timer to hide after 3 seconds
      autoHideTimerRef.current = setTimeout(() => {
        setTopBarVisible(false);
      }, 3000);
    }
  }, [isFocusMode, setTopBarVisible]);
  
  // Track mouse movement for auto-hide (throttled to prevent excessive updates)
  useEffect(() => {
    let throttleTimeout: number | null = null;
    
    const handleMouseMove = () => {
      if (!throttleTimeout) {
        resetAutoHideTimer();
        throttleTimeout = setTimeout(() => {
          throttleTimeout = null;
        }, 100); // Throttle to max 10 times per second
      }
    };
    
    document.addEventListener('mousemove', handleMouseMove, { passive: true });
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      if (throttleTimeout) {
        clearTimeout(throttleTimeout);
      }
      if (autoHideTimerRef.current) {
        clearTimeout(autoHideTimerRef.current);
      }
    };
  }, [resetAutoHideTimer]);
  
  // Focus mode overrides auto-hide
  useEffect(() => {
    if (isFocusMode) {
      setTopBarVisible(false);
      if (autoHideTimerRef.current) {
        clearTimeout(autoHideTimerRef.current);
      }
    } else {
      setTopBarVisible(true);
      resetAutoHideTimer();
    }
  }, [isFocusMode, setTopBarVisible, resetAutoHideTimer]);
  
  // ────────────────────────────────────────────────────────────
  // SCROLL PROGRESS TRACKING (optimized)
  // ────────────────────────────────────────────────────────────
  const handleScroll = useMemo(() => {
    let ticking = false;
    let lastUpdateTime = 0;
    const UPDATE_INTERVAL = 100; // Only update progress every 100ms
    
    return () => {
      const now = Date.now();
      
      if (!ticking && (now - lastUpdateTime) >= UPDATE_INTERVAL) {
        requestAnimationFrame(() => {
          const canvas = canvasRef.current;
          if (canvas) {
            const scrollTop = canvas.scrollTop;
            const scrollHeight = canvas.scrollHeight;
            const clientHeight = canvas.clientHeight;
            const progress = scrollHeight > clientHeight 
              ? (scrollTop / (scrollHeight - clientHeight)) * 100 
              : 0;
            setScrollProgress(Math.min(100, Math.max(0, progress)));
            lastUpdateTime = Date.now();
          }
          ticking = false;
        });
        ticking = true;
      }
    };
  }, [setScrollProgress]);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener('scroll', handleScroll, { passive: true });
      return () => canvas.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll]);
  
  // ────────────────────────────────────────────────────────────
  // BOOK LOADING
  // ────────────────────────────────────────────────────────────
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

      console.log('[PremiumEpubReader] Opening book:', bookId, bookPath);
      
      // Add small delay to ensure book is in database
      await new Promise(resolve => setTimeout(resolve, 500));
      
      console.log('[PremiumEpubReader] Calling openBookRenderer...');
      const bookMetadata = await api.openBookRenderer(bookId, bookPath, 'epub');
      console.log('[PremiumEpubReader] ✅ Got book metadata:', bookMetadata);
      
      // Add another small delay to ensure HashMap insert completes
      await new Promise(resolve => setTimeout(resolve, 200));
      
      setMetadata(bookMetadata);

      // TODO: Load progress from database
      const startIndex = 0;

      console.log('[PremiumEpubReader] Loading initial chapter:', startIndex);
      await loadChapter(startIndex);
      setIsLoading(false);
      console.log('[PremiumEpubReader] ✅ Book fully loaded');
    } catch (err) {
      console.error('[PremiumEpubReader] ❌ Error loading book:', err);
      setError(err instanceof Error ? err.message : 'Failed to load eBook');
      setIsLoading(false);
    }
  };
  
  const loadChapter = async (index: number, highlightTerm?: string | null) => {
    try {
      console.log('[PremiumEpubReader] Loading chapter:', index);
      setIsLoading(true);
      
      // Update search highlight state
      if (highlightTerm !== undefined) {
        setSearchHighlight(highlightTerm);
      }
      
      const chapter = await api.getBookChapter(bookId, index);
      console.log('[PremiumEpubReader] ✅ Got chapter:', chapter.title, `(${chapter.content.length} chars)`);
      
      // Validate chapter content
      if (!chapter.content || chapter.content.trim().length === 0) {
        console.warn('[PremiumEpubReader] ⚠️ Chapter content is empty!');
        throw new Error(`Chapter ${index + 1} has no content`);
      }
      
      // Process HTML to convert resource paths to data URIs and highlight search terms
      console.log('[PremiumEpubReader] Processing chapter HTML...');
      const termToHighlight = highlightTerm !== undefined ? highlightTerm : searchHighlight;
      const processedContent = await processEpubHtml(bookId, chapter.content, termToHighlight);
      console.log('[PremiumEpubReader] ✅ HTML processed, length:', processedContent.length);
      
      const processedChapter = { ...chapter, content: processedContent };
      
      setCurrentChapter(processedChapter);
      setCurrentIndex(index);
      
      // Load next chapter for two-page view if enabled
      if (twoPageView && metadata && index < metadata.total_chapters - 1) {
        try {
          const nextCh = await api.getBookChapter(bookId, index + 1);
          const processedNext = await processEpubHtml(bookId, nextCh.content, termToHighlight);
          setAdjacentChapter({ ...nextCh, content: processedNext });
        } catch (err) {
          console.warn('[PremiumEpubReader] Could not load adjacent chapter for two-page view:', err);
          setAdjacentChapter(null);
        }
      } else {
        setAdjacentChapter(null);
      }
      
      setIsLoading(false);
      console.log('[PremiumEpubReader] ✅ Chapter loaded and rendered');

      const progressPercent = metadata 
        ? ((index + 1) / metadata.total_chapters) * 100
        : 0;
      
      // Save progress to database (ignore errors gracefully)
      try {
        await api.saveReadingProgress(bookId, `chapter_${index}`, progressPercent);
      } catch (saveErr) {
        // Silently ignore database errors - don't spam console
        if (saveErr instanceof Error && !saveErr.message.includes('database disk image is malformed')) {
          console.warn('[PremiumEpubReader] Could not save reading progress:', saveErr);
        }
      }
      
      // Reset scroll to top
      if (canvasRef.current) {
        canvasRef.current.scrollTop = 0;
      }
      
      // If we have a highlight term, scroll to first highlight after a short delay
      if (termToHighlight) {
        setTimeout(() => {
          const firstHighlight = canvasRef.current?.querySelector('.search-highlight');
          if (firstHighlight) {
            firstHighlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 300);
      }
    } catch (err) {
      console.error('[PremiumEpubReader] ❌ Error loading chapter:', err);
      setError(err instanceof Error ? err.message : 'Failed to load chapter');
      setIsLoading(false);
    }
  };
  
  // ────────────────────────────────────────────────────────────
  // NAVIGATION
  // ────────────────────────────────────────────────────────────
  const nextChapter = useCallback(() => {
    if (!metadata) return;
    if (currentIndex < metadata.total_chapters - 1) {
      loadChapter(currentIndex + 1, null); // Clear search highlight when navigating manually
    }
  }, [metadata, currentIndex]);

  const prevChapter = useCallback(() => {
    if (currentIndex > 0) {
      loadChapter(currentIndex - 1, null); // Clear search highlight when navigating manually
    }
  }, [currentIndex]);
  
  // Keyboard shortcuts
  usePremiumReaderKeyboard({
    onPrevChapter: prevChapter,
    onNextChapter: nextChapter,
  });
  
  // Reload current chapter when two-page view is toggled
  useEffect(() => {
    if (currentChapter) {
      loadChapter(currentIndex);
    }
  }, [twoPageView]);
  
  // ────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────
  
  if (error) {
    return (
      <div className="premium-reader premium-reader--error">
        <div className="premium-error-container">
          <AlertCircle className="premium-error-icon" />
          <p className="premium-error-title">{error}</p>
          <p className="premium-error-subtitle">Try opening a different book or check the file format.</p>
          <button
            onClick={() => window.location.reload()}
            className="premium-error-button"
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }

  if (isLoading || !currentChapter) {
    return (
      <div className="premium-reader premium-reader--loading">
        <div className="premium-loading-container">
          <Loader2 className="premium-loading-spinner" />
          <p className="premium-loading-text">
            {isLoading && currentChapter ? 'Loading chapter...' : 'Loading book...'}
          </p>
          {metadata && (
            <p className="premium-loading-subtitle">{metadata.title}</p>
          )}
        </div>
      </div>
    );
  }

  const progressPercentage = metadata 
    ? ((currentIndex + 1) / metadata.total_chapters) * 100 
    : 0;

  return (
    <div className={`premium-reader ${isFocusMode ? 'premium-reader--focus-mode' : ''}`}>
      {/* Auto-hide Top Bar */}
      <div className={`premium-top-bar ${!isTopBarVisible ? 'premium-top-bar--hidden' : ''}`}>
        <div className="premium-top-bar-content">
          {/* Left: Book info */}
          <div className="premium-top-bar-left">
            <span className="premium-book-title">
              {metadata?.title || 'Loading...'}
            </span>
            <span className="premium-chapter-indicator">
              {currentChapter.title}
            </span>
          </div>
          
          {/* Center: Progress */}
          <div className="premium-top-bar-center">
            <span className="premium-progress-text">
              {Math.round(progressPercentage)}%
            </span>
          </div>
          
          {/* Right: Controls */}
          <div className="premium-top-bar-right">
            <ReaderSettings />
            
            <button
              onClick={() => toggleSidebar('search')}
              className="premium-control-button"
              aria-label="Search"
              title="Search in book"
            >
              <Search className="premium-control-icon" />
            </button>
            
            <button
              onClick={() => toggleSidebar('toc')}
              className="premium-control-button"
              aria-label="Table of Contents"
              title="Table of Contents"
            >
              <BookOpen className="premium-control-icon" />
            </button>
            
            <button
              onClick={toggleTwoPageView}
              className={`premium-control-button ${twoPageView ? 'premium-control-button--active' : ''}`}
              aria-label="Two-page view"
              title="Two-page view"
            >
              <svg className="premium-control-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="8" height="16" />
                <rect x="13" y="4" width="8" height="16" />
              </svg>
            </button>
            
            <button
              onClick={() => toggleSidebar('bookmarks')}
              className="premium-control-button"
              aria-label="Bookmarks"
              title="Bookmarks"
            >
              <Bookmark className="premium-control-icon" />
            </button>
          </div>
        </div>
      </div>
      
      {/* Reading Canvas */}
      <div 
        ref={canvasRef}
        className={`premium-reading-canvas ${isFocusMode ? 'premium-reading-canvas--focus-mode' : ''}`}
      >
        <div className={`premium-content-container premium-content-container--${width} ${twoPageView ? 'premium-content-container--two-page' : ''}`}>
          {twoPageView && adjacentChapter ? (
            /* Two-page layout */
            <>
              <div className="premium-chapter-page">
                <h2 className="premium-chapter-title">{currentChapter.title}</h2>
                <div 
                  className="premium-chapter-content"
                  dangerouslySetInnerHTML={{ __html: currentChapter.content }}
                />
              </div>
              
              <div className="premium-chapter-page">
                <h2 className="premium-chapter-title">{adjacentChapter.title}</h2>
                <div 
                  className="premium-chapter-content"
                  dangerouslySetInnerHTML={{ __html: adjacentChapter.content }}
                />
              </div>
            </>
          ) : (
            /* Single-page layout */
            <div className="premium-chapter-page">
              <h2 className="premium-chapter-title">{currentChapter.title}</h2>
              <div 
                className="premium-chapter-content"
                dangerouslySetInnerHTML={{ __html: currentChapter.content }}
              />
            </div>
          )}
        </div>
      </div>
      
      {/* Bottom Progress Bar */}
      <div className="premium-progress-bar">
        <div 
          className="premium-progress-bar-fill" 
          style={{ width: `${scrollProgress}%` }}
        />
      </div>
      
      {/* Floating Navigation Arrows */}
      {!isFocusMode && (
        <>
          <button
            onClick={prevChapter}
            disabled={currentIndex === 0}
            className="premium-nav-arrow premium-nav-arrow--left"
            aria-label="Previous chapter"
          >
            <ChevronLeft className="premium-nav-icon" />
          </button>
          
          <button
            onClick={nextChapter}
            disabled={!metadata || currentIndex >= metadata.total_chapters - 1}
            className="premium-nav-arrow premium-nav-arrow--right"
            aria-label="Next chapter"
          >
            <ChevronRight className="premium-nav-icon" />
          </button>
        </>
      )}
      
      {/* Sidebar */}
      <PremiumSidebar
        bookId={bookId}
        currentIndex={currentIndex}
        onNavigate={loadChapter}
      />
    </div>
  );
}
