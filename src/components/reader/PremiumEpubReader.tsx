import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { api } from '@/lib/tauri';
import type { BookMetadata, Chapter } from '@/lib/tauri';
import { useUIStore, useReadingSettings } from '@/store/premiumReaderStore';
import { useDoodleStore } from '@/store/doodleStore';
import { usePremiumReaderKeyboard } from '@/hooks/usePremiumReaderKeyboard';
import { PremiumSidebar } from './PremiumSidebar';
import { ReaderSettings } from './ReaderSettings';
import { DoodleCanvas } from './DoodleCanvas';
import { DoodleToolbar } from './DoodleToolbar';
import { PageFlipEngine, type PageFlipHandle } from './PageFlipEngine';
import { ChevronLeft, ChevronRight, Loader2, AlertCircle, Search, BookOpen, Bookmark } from '@/components/icons';
import { sanitizeBookContent } from '@/lib/sanitize';
import '@/styles/premium-reader.css';
import '@/styles/themes/paper-theme.css';
import '@/styles/page-flip.css';

interface PremiumEpubReaderProps {
  bookPath: string;
  bookId: number;
}

// Helper function to convert resource URLs to data URIs and inline CSS
async function processEpubHtml(bookId: number, html: string, searchTerm?: string | null): Promise<string> {
  let processedHtml = html;

  // Step 1: Process CSS stylesheets - Convert <link> tags to <style> tags
  const cssLinkRegex = /<link[^>]+rel=["']stylesheet["'][^>]*>/gi;
  const cssMatches = Array.from(html.matchAll(cssLinkRegex));

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
      let cleanPath = cssPath;
      while (cleanPath.startsWith('../') || cleanPath.startsWith('./')) {
        cleanPath = cleanPath.replace(/^\.\.\//, '').replace(/^\.\//, '');
      }

      const cssData = await api.getEpubResource(bookId, cleanPath);
      const cssText = new TextDecoder().decode(new Uint8Array(cssData));
      const styleTag = `<style type="text/css">\n${cssText}\n</style>`;
      processedHtml = processedHtml.replace(linkTag, styleTag);
    } catch {
      processedHtml = processedHtml.replace(linkTag, '');
    }
  }

  // Step 2: Process images and other resources
  const srcRegex = /(src|href)="([^"']+)"/g;
  const matches = Array.from(processedHtml.matchAll(srcRegex));

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
      let cleanPath = originalPath;
      while (cleanPath.startsWith('../') || cleanPath.startsWith('./')) {
        cleanPath = cleanPath.replace(/^\.\.\//, '').replace(/^\.\//, '');
      }

      const resourceData = await api.getEpubResource(bookId, cleanPath);

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
    } catch {
      // Skip failed resources silently
    }
  }

  // Step 3: Highlight search term if provided
  if (searchTerm && searchTerm.trim()) {
    processedHtml = highlightSearchTerm(processedHtml, searchTerm);
  }

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

  const { theme, width, twoPageView, toggleTwoPageView, pageFlipEnabled, pageFlipSpeed } = useReadingSettings();
  const { isDoodleMode, toggleDoodleMode, resetPage: resetDoodlePage } = useDoodleStore();

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
  const contentContainerRef = useRef<HTMLDivElement>(null);
  const autoHideTimerRef = useRef<number | null>(null);
  const pageFlipRef = useRef<PageFlipHandle>(null);
  const scrollPositionsRef = useRef<Map<number, number>>(new Map());

  // Preloaded chapter content for page flip
  const [nextChapterContent, setNextChapterContent] = useState<string | null>(null);
  const [prevChapterContent, setPrevChapterContent] = useState<string | null>(null);

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
  // Debounced scroll-position save to database
  const saveScrollProgressRef = useRef<number | null>(null);

  const handleScroll = useMemo(() => {
    let ticking = false;
    let lastUpdateTime = 0;
    const UPDATE_INTERVAL = 150; // Reduced frequency for less jank

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

            // Save scroll position to DB every 3s (debounced)
            if (saveScrollProgressRef.current) {
              clearTimeout(saveScrollProgressRef.current);
            }
            saveScrollProgressRef.current = window.setTimeout(() => {
              const scrollRatio = scrollHeight > clientHeight
                ? scrollTop / (scrollHeight - clientHeight)
                : 0;
              const progressPercent = metadata
                ? ((currentIndex + 1) / metadata.total_chapters) * 100
                : 0;
              const loc = scrollRatio > 0
                ? `chapter_${currentIndex}:scroll_${scrollRatio.toFixed(4)}`
                : `chapter_${currentIndex}`;
              api.saveReadingProgress(bookId, loc, progressPercent).catch(() => { });
            }, 3000);
          }
          ticking = false;
        });
        ticking = true;
      }
    };
  }, [setScrollProgress, metadata, currentIndex, bookId]);

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

      // Add small delay to ensure book is in database
      await new Promise(resolve => setTimeout(resolve, 500));

      const bookMetadata = await api.openBookRenderer(bookId, bookPath, 'epub');
      setMetadata(bookMetadata);

      // Add another small delay to ensure HashMap insert completes
      await new Promise(resolve => setTimeout(resolve, 200));

      // Load progress from database — restore chapter AND scroll position
      let startIndex = 0;
      let savedScrollRatio = 0;
      try {
        const progress = await api.getReadingProgress(bookId);
        if (progress && progress.currentLocation) {
          // Parse location format: "chapter_N" or "chapter_N:scroll_R"
          const parts = progress.currentLocation.split(':');
          if (parts[0].startsWith('chapter_')) {
            const idx = parseInt(parts[0].replace('chapter_', ''), 10);
            if (!isNaN(idx) && idx >= 0 && idx < bookMetadata.total_chapters) {
              startIndex = idx;
            }
          }
          if (parts[1] && parts[1].startsWith('scroll_')) {
            const ratio = parseFloat(parts[1].replace('scroll_', ''));
            if (!isNaN(ratio) && ratio >= 0 && ratio <= 1) {
              savedScrollRatio = ratio;
            }
          }
        }
      } catch {
        // Silently ignore
      }

      await loadChapter(startIndex);
      setIsLoading(false);

      // Restore scroll position after content renders
      if (savedScrollRatio > 0) {
        requestAnimationFrame(() => {
          setTimeout(() => {
            if (canvasRef.current) {
              const scrollHeight = canvasRef.current.scrollHeight;
              const clientHeight = canvasRef.current.clientHeight;
              canvasRef.current.scrollTop = savedScrollRatio * (scrollHeight - clientHeight);
            }
          }, 100);
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load eBook');
      setIsLoading(false);
    }
  };

  const loadChapter = async (index: number, highlightTerm?: string | null) => {
    try {
      setIsLoading(true);

      // Save current scroll position before navigating away
      if (canvasRef.current && currentChapter) {
        const { scrollTop, scrollHeight, clientHeight } = canvasRef.current;
        const scrollRatio = scrollHeight > clientHeight
          ? scrollTop / (scrollHeight - clientHeight)
          : 0;
        scrollPositionsRef.current.set(currentIndex, scrollRatio);
      }

      // Update search highlight state
      if (highlightTerm !== undefined) {
        setSearchHighlight(highlightTerm);
      }

      const chapter = await api.getBookChapter(bookId, index);

      if (!chapter.content || chapter.content.trim().length === 0) {
        throw new Error(`Chapter ${index + 1} has no content`);
      }

      const termToHighlight = highlightTerm !== undefined ? highlightTerm : searchHighlight;
      const processedContent = await processEpubHtml(bookId, chapter.content, termToHighlight);

      const processedChapter = { ...chapter, content: processedContent };

      setCurrentChapter(processedChapter);
      setCurrentIndex(index);

      // Load next chapter for two-page view if enabled
      if (twoPageView && metadata && index < metadata.total_chapters - 1) {
        try {
          const nextCh = await api.getBookChapter(bookId, index + 1);
          const processedNext = await processEpubHtml(bookId, nextCh.content, termToHighlight);
          setAdjacentChapter({ ...nextCh, content: processedNext });
        } catch {
          setAdjacentChapter(null);
        }
      } else {
        setAdjacentChapter(null);
      }

      setIsLoading(false);

      const progressPercent = metadata
        ? ((index + 1) / metadata.total_chapters) * 100
        : 0;

      // Compute scroll position for progress save
      const scrollRatio = scrollPositionsRef.current.get(index) || 0;
      const location = scrollRatio > 0
        ? `chapter_${index}:scroll_${scrollRatio.toFixed(4)}`
        : `chapter_${index}`;

      // Save progress to database (debounced, ignore errors)
      try {
        await api.saveReadingProgress(bookId, location, progressPercent);
      } catch {
        // Silently ignore database errors
      }

      // Restore scroll position if we've been to this chapter before, else reset to top
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (canvasRef.current) {
            const savedPos = scrollPositionsRef.current.get(index);
            if (savedPos && savedPos > 0 && !termToHighlight) {
              const { scrollHeight, clientHeight } = canvasRef.current;
              canvasRef.current.scrollTop = savedPos * (scrollHeight - clientHeight);
            } else {
              canvasRef.current.scrollTop = 0;
            }
          }
        }, 50);
      });

      // If we have a highlight term, scroll to first highlight after content renders
      if (termToHighlight) {
        setTimeout(() => {
          const firstHighlight = canvasRef.current?.querySelector('.search-highlight');
          if (firstHighlight) {
            firstHighlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 300);
      }
    } catch (err) {
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

  // Preload adjacent chapters for page flip — deferred to idle time
  useEffect(() => {
    if (!pageFlipEnabled || !metadata) {
      setNextChapterContent(null);
      setPrevChapterContent(null);
      return;
    }

    let cancelled = false;

    const preload = async () => {
      // Preload next chapter
      if (currentIndex < metadata.total_chapters - 1) {
        try {
          const nextCh = await api.getBookChapter(bookId, currentIndex + 1);
          const processed = await processEpubHtml(bookId, nextCh.content);
          if (!cancelled) setNextChapterContent(processed);
        } catch {
          if (!cancelled) setNextChapterContent(null);
        }
      } else {
        if (!cancelled) setNextChapterContent(null);
      }

      // Preload prev chapter
      if (currentIndex > 0) {
        try {
          const prevCh = await api.getBookChapter(bookId, currentIndex - 1);
          const processed = await processEpubHtml(bookId, prevCh.content);
          if (!cancelled) setPrevChapterContent(processed);
        } catch {
          if (!cancelled) setPrevChapterContent(null);
        }
      } else {
        if (!cancelled) setPrevChapterContent(null);
      }
    };

    // Use requestIdleCallback to avoid blocking the main thread
    const idleId = 'requestIdleCallback' in window
      ? (window as any).requestIdleCallback(() => preload())
      : setTimeout(() => preload(), 500);

    return () => {
      cancelled = true;
      if ('cancelIdleCallback' in window) {
        (window as any).cancelIdleCallback(idleId);
      } else {
        clearTimeout(idleId);
      }
    };
  }, [currentIndex, pageFlipEnabled, metadata, bookId]);

  const nextPage = useCallback(() => {
    // Page flip mode: trigger flip animation instead of scroll
    if (pageFlipEnabled && pageFlipRef.current) {
      const flipped = pageFlipRef.current.flipForward();
      if (!flipped) {
        // No next content available or already flipping — try direct chapter nav
        nextChapter();
      }
      return;
    }

    // Normal scroll mode
    if (canvasRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = canvasRef.current;
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 50;

      if (isAtBottom) {
        nextChapter();
      } else {
        canvasRef.current.scrollBy({ top: clientHeight * 0.85, behavior: 'smooth' });
      }
    }
  }, [nextChapter, pageFlipEnabled]);

  const prevPage = useCallback(() => {
    // Page flip mode: trigger flip animation instead of scroll
    if (pageFlipEnabled && pageFlipRef.current) {
      const flipped = pageFlipRef.current.flipBackward();
      if (!flipped) {
        prevChapter();
      }
      return;
    }

    // Normal scroll mode
    if (canvasRef.current) {
      const { scrollTop, clientHeight } = canvasRef.current;
      const isAtTop = scrollTop <= 50;

      if (isAtTop) {
        prevChapter();
      } else {
        canvasRef.current.scrollBy({ top: -clientHeight * 0.85, behavior: 'smooth' });
      }
    }
  }, [prevChapter, pageFlipEnabled]);

  // Keyboard shortcuts
  usePremiumReaderKeyboard({
    onPrevChapter: prevPage,
    onNextChapter: nextPage,
    onPrevPage: prevPage,
    onNextPage: nextPage,
  });

  // Handle page flip completion — navigate to next/prev chapter
  const handleFlipComplete = useCallback((direction: 'forward' | 'backward') => {
    if (direction === 'forward') {
      nextChapter();
    } else {
      prevChapter();
    }
  }, [nextChapter, prevChapter]);

  // Current page identifier for doodle storage
  const currentPageId = useMemo(() => `chapter_${currentIndex}`, [currentIndex]);

  // Reset doodle page on chapter change
  useEffect(() => {
    resetDoodlePage();
  }, [currentIndex, resetDoodlePage]);

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

            {/* Doodle Mode Toggle */}
            <button
              onClick={toggleDoodleMode}
              className={`premium-control-button ${isDoodleMode ? 'premium-control-button--active' : ''}`}
              aria-label="Drawing mode"
              title="Toggle drawing mode"
            >
              <svg className="premium-control-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Reading Canvas */}
      <div
        ref={canvasRef}
        className={`premium-reading-canvas ${isFocusMode ? 'premium-reading-canvas--focus-mode' : ''}`}
      >
        <div
          ref={contentContainerRef}
          className={`premium-content-container premium-content-container--${width} ${twoPageView ? 'premium-content-container--two-page' : ''}`}
        >
          {twoPageView && adjacentChapter ? (
            /* Two-page layout */
            <>
              <div className="premium-chapter-page">
                <div
                  className="premium-chapter-content"
                  dangerouslySetInnerHTML={{ __html: sanitizeBookContent(currentChapter.content) }}
                />
              </div>

              <div className="premium-chapter-page">
                <div
                  className="premium-chapter-content"
                  dangerouslySetInnerHTML={{ __html: sanitizeBookContent(adjacentChapter.content) }}
                />
              </div>
            </>
          ) : pageFlipEnabled ? (
            /* Page flip mode */
            <PageFlipEngine
              ref={pageFlipRef}
              currentContent={currentChapter.content}
              nextContent={nextChapterContent}
              prevContent={prevChapterContent}
              flipSpeed={pageFlipSpeed}
              enabled={pageFlipEnabled}
              onFlipComplete={handleFlipComplete}
              className="premium-chapter-page"
            />
          ) : (
            /* Standard single-page layout */
            <div className="premium-chapter-page">
              <div
                className="premium-chapter-content"
                dangerouslySetInnerHTML={{ __html: sanitizeBookContent(currentChapter.content) }}
              />
            </div>
          )}

        </div>

        {/* Doodle Canvas Overlay — only mount when active */}
        {isDoodleMode && (
          <DoodleCanvas
            bookId={bookId}
            pageId={currentPageId}
            containerRef={contentContainerRef}
          />
        )}
      </div>

      {/* Doodle Toolbar (floating, only when active) */}
      {isDoodleMode && <DoodleToolbar />}

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
