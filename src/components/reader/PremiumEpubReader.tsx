import { logger } from '@/lib/logger';
import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { api } from '@/lib/tauri';
import type { BookMetadata, Chapter } from '@/lib/tauri';
import { useReaderUIStore, useReadingSettings, applyReaderThemeToElement, removeReaderThemeFromElement, applyAllSettingsToDOM } from '@/store/premiumReaderStore';
import { useReaderStore } from '@/store/readerStore';
import { useDoodleStore } from '@/store/doodleStore';
import { usePremiumReaderKeyboard } from '@/hooks/usePremiumReaderKeyboard';
import { useReadingSession } from '@/hooks/useReadingSession';
import { PremiumSidebar } from './PremiumSidebar';
import { DoodleCanvas } from './DoodleCanvas';
import { DoodleToolbar } from './DoodleToolbar';
import { PageFlipEngine, type PageFlipHandle } from './PageFlipEngine';
import { TextSelectionToolbar } from './TextSelectionToolbar';
import { TTSControlBar } from './TTSControlBar';
import { ChevronLeft, ChevronRight, Loader2, AlertCircle, Search, BookOpen } from '@/components/icons';
import { sanitizeBookContent } from '@/lib/sanitize';
import { applyHighlightsToDOM } from '@/lib/highlightAnnotations';
import { useToastStore } from '@/store/toastStore';
import { ReaderTopBar } from './ReaderTopBar';
import type { ReaderContent } from './readerContent';
import '@/styles/premium-reader.css';
import '@/styles/themes/paper-theme.css';
import '@/styles/page-flip.css';

interface PremiumEpubReaderProps {
  bookPath: string;
  bookId: number;
  readerContent?: ReaderContent | null;
  onClose: () => void;
}

function ChapterHtml({ content }: { content: string }) {
  const htmlRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (htmlRef.current) {
      htmlRef.current.innerHTML = sanitizeBookContent(content);
    }
  }, [content]);

  return <div ref={htmlRef} className="premium-chapter-content" />;
}

// Helper function to convert resource URLs to data URIs and inline CSS
/** Convert a byte array to base64 without hitting call-stack limits on large files. */
function bytesToBase64(data: number[] | Uint8Array | ArrayBuffer): string {
  const bytes = data instanceof Uint8Array ? data
    : data instanceof ArrayBuffer ? new Uint8Array(data)
    : new Uint8Array(data);
  let binary = '';
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + CHUNK, bytes.length)));
  }
  return btoa(binary);
}

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

    // Skip HTML files (these are internal anchor links, not embedded resources)
    const originalPathLower = originalPath.toLowerCase();
    if (originalPathLower.includes('.xhtml') || originalPathLower.includes('.html') || originalPathLower.includes('.htm') || originalPathLower.includes('.xml')) {
      continue;
    }

    try {
      let cleanPath = originalPath.split('#')[0]; // Strip hash if any
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

      // Convert to base64 (chunked to avoid call-stack overflow on large files)
      const base64 = bytesToBase64(resourceData);
      const dataUri = `data:${mimeType};base64,${base64}`;

      processedHtml = processedHtml.replace(`${attr}="${originalPath}"`, `${attr}="${dataUri}"`);
    } catch {
      // Skip failed resources silently
    }
  }

  // Step 3: Highlight search term if provided
  if (searchTerm?.trim()) {
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
    [data-reader-theme="dark"] .search-highlight {
      background-color: #f59e0b;
      color: #000;
    }
  `;
  doc.head.appendChild(style);

  return doc.documentElement.outerHTML;
}

export function PremiumEpubReader({ bookPath, bookId, readerContent, onClose }: PremiumEpubReaderProps) {
  // State management
  const isFocusMode = useReaderUIStore(state => state.isFocusMode);
  const isTopBarShortcutOnly = useReaderUIStore(state => state.isTopBarShortcutOnly);
  const setTopBarVisible = useReaderUIStore(state => state.setTopBarVisible);
  const toggleSidebar = useReaderUIStore(state => state.toggleSidebar);
  const setScrollProgress = useReaderUIStore(state => state.setScrollProgress);
  // Read the startFromBeginning flag from the global reader store.
  // This survives ReaderLayout's openBook call that would otherwise overwrite readerContent.
  const startFromBeginning = useReaderStore(state => state.startFromBeginning);
  const setStartFromBeginning = useReaderStore(state => state.setStartFromBeginning);
  const explicitResumeTarget = useReaderStore(state => state.explicitResumeTarget);
  const setExplicitResumeTarget = useReaderStore(state => state.setExplicitResumeTarget);

  const readingSettings = useReadingSettings();
  const { theme, width, twoPageView, toggleTwoPageView, pageFlipEnabled, pageFlipSpeed, animationStyle } = readingSettings;

  // Apply all reading settings (typography, margins, etc.) on mount and when they change
  useEffect(() => {
    applyAllSettingsToDOM(readingSettings);
  }, [readingSettings]);
  const isDoodleMode = useDoodleStore(state => state.isDoodleMode);
  const toggleDoodleMode = useDoodleStore(state => state.toggleDoodleMode);
  const resetDoodlePage = useDoodleStore(state => state.resetPage);

  useReadingSession(bookId);

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
  const readerContainerRef = useRef<HTMLDivElement>(null);
  const pageFlipRef = useRef<PageFlipHandle>(null);
  const scrollPositionsRef = useRef<Map<number, number>>(new Map());
  const currentIndexRef = useRef(0);
  const metadataRef = useRef<BookMetadata | null>(null);
  const loadChapterRef = useRef<(index: number, highlightTerm?: string | null, initialScrollRatio?: number) => Promise<void>>(async () => { });
  const previousTwoPageViewRef = useRef(twoPageView);
  const previousDoodleChapterRef = useRef<number | null>(null);

  // Preloaded chapter content for page flip
  const [nextChapterContent, setNextChapterContent] = useState<string | null>(null);
  const [prevChapterContent, setPrevChapterContent] = useState<string | null>(null);

  // ────────────────────────────────────────────────────────────
  // READER THEME — scoped to this container, not global <html>
  // ────────────────────────────────────────────────────────────
  const loadChapter = useCallback(async (index: number, highlightTerm?: string | null, initialScrollRatio?: number) => {
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
      const shouldRenderTwoPage = useReadingSettings.getState().twoPageView;
      if (shouldRenderTwoPage && metadata && index < metadata.total_chapters - 1) {
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

      const scrollRatio = scrollPositionsRef.current.get(index) || 0;
      const location = scrollRatio > 0
        ? `chapter_${index}:scroll_${scrollRatio.toFixed(6)}`
        : `chapter_${index}`;
      const cfi = `epubcfi(/0/${index}!/scroll/${scrollRatio.toFixed(6)})`;

      try {
        await api.saveReadingProgress(bookId, location, progressPercent, undefined, undefined, cfi);
      } catch {
        // Silently ignore database errors
      }

      requestAnimationFrame(() => {
        setTimeout(() => {
          if (canvasRef.current) {
            if (initialScrollRatio !== undefined && initialScrollRatio > 0 && !termToHighlight) {
              const { scrollHeight, clientHeight } = canvasRef.current;
              canvasRef.current.scrollTop = initialScrollRatio * (scrollHeight - clientHeight);
            } else {
              const savedPos = scrollPositionsRef.current.get(index);
              if (savedPos && savedPos > 0 && !termToHighlight) {
                const { scrollHeight, clientHeight } = canvasRef.current;
                canvasRef.current.scrollTop = savedPos * (scrollHeight - clientHeight);
              } else {
                canvasRef.current.scrollTop = 0;
              }
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
  }, [bookId, currentChapter, currentIndex, metadata, searchHighlight]);

  useEffect(() => {
    loadChapterRef.current = loadChapter;
  }, [loadChapter]);

  useEffect(() => {
    const el = readerContainerRef.current;
    if (el) {
      applyReaderThemeToElement(el, theme);
    }
    return () => {
      if (el) removeReaderThemeFromElement(el);
    };
  }, [theme, isLoading, error]);

  // ────────────────────────────────────────────────────────────
  // AUTO-HIDE TOP BAR LOGIC
  // ────────────────────────────────────────────────────────────
  
  // Initial visibility and Focus mode override
  useEffect(() => {
    if (isFocusMode || isTopBarShortcutOnly) {
      setTopBarVisible(false);
    } else {
      setTopBarVisible(true);
    }
  }, [isFocusMode, setTopBarVisible, isTopBarShortcutOnly]);

  // ────────────────────────────────────────────────────────────
  // SCROLL PROGRESS TRACKING (optimized)
  // ────────────────────────────────────────────────────────────
  const saveScrollProgressRef = useRef<number | null>(null);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  const hasLoadedChapterRef = useRef(false);

  useEffect(() => {
    hasLoadedChapterRef.current = Boolean(currentChapter);
  }, [currentChapter]);

  useEffect(() => {
    metadataRef.current = metadata;
  }, [metadata]);

  const flushProgressNow = useCallback(() => {
    const totalChapters = metadataRef.current?.total_chapters ?? 1;
    const chapterIndex = currentIndexRef.current;
    const canvas = canvasRef.current;
    let scrollRatio = scrollPositionsRef.current.get(chapterIndex) ?? 0;

    if (canvas) {
      const { scrollTop, scrollHeight, clientHeight } = canvas;
      scrollRatio = scrollHeight > clientHeight
        ? scrollTop / (scrollHeight - clientHeight)
        : 0;
      scrollPositionsRef.current.set(chapterIndex, scrollRatio);
    }

    const chapterFraction = scrollRatio / totalChapters;
    const progressPercent = ((chapterIndex + chapterFraction) / totalChapters) * 100;
    const loc = scrollRatio > 0
      ? `chapter_${chapterIndex}:scroll_${scrollRatio.toFixed(6)}`
      : `chapter_${chapterIndex}`;
    const cfi = `epubcfi(/0/${chapterIndex}!/scroll/${scrollRatio.toFixed(6)})`;

    api.saveReadingProgress(bookId, loc, Math.min(100, progressPercent), undefined, undefined, cfi).catch(() => { });
  }, [bookId]);

  const handleScroll = useMemo(() => {
    let ticking = false;
    let lastUpdateTime = 0;
    const UPDATE_INTERVAL = 150;
    let lastScrollTop = 0;

    return () => {
      const now = Date.now();

      if (!ticking && (now - lastUpdateTime) >= UPDATE_INTERVAL) {
        requestAnimationFrame(() => {
          const canvas = canvasRef.current;
          if (canvas) {
            const scrollTop = canvas.scrollTop;

            if (!isFocusMode && !isTopBarShortcutOnly) {
              if (scrollTop > lastScrollTop + 20) {
                setTopBarVisible(false);
              } else if (scrollTop < lastScrollTop - 20) {
                setTopBarVisible(true);
              }
            }
            lastScrollTop = scrollTop;

            const scrollHeight = canvas.scrollHeight;
            const clientHeight = canvas.clientHeight;
            const progress = scrollHeight > clientHeight
              ? (scrollTop / (scrollHeight - clientHeight)) * 100
              : 0;
            setScrollProgress(Math.min(100, Math.max(0, progress)));
            lastUpdateTime = Date.now();

            if (saveScrollProgressRef.current) {
              clearTimeout(saveScrollProgressRef.current);
            }
            saveScrollProgressRef.current = window.setTimeout(() => {
              const scrollRatio = scrollHeight > clientHeight
                ? scrollTop / (scrollHeight - clientHeight)
                : 0;
              const totalChapters = metadata?.total_chapters ?? 1;
              const chapterFraction = scrollRatio / totalChapters;
              const progressPercent = ((currentIndex + chapterFraction) / totalChapters) * 100;
              const loc = scrollRatio > 0
                ? `chapter_${currentIndex}:scroll_${scrollRatio.toFixed(6)}`
                : `chapter_${currentIndex}`;
              const cfi = `epubcfi(/0/${currentIndex}!/scroll/${scrollRatio.toFixed(6)})`;
              api.saveReadingProgress(bookId, loc, Math.min(100, progressPercent), undefined, undefined, cfi).catch(() => { });
            }, 2000);
          }
          ticking = false;
        });
        ticking = true;
      }
    };
  }, [setScrollProgress, metadata, currentIndex, bookId, isFocusMode, isTopBarShortcutOnly, setTopBarVisible]);

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
    const run = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Add small delay to ensure book is in database
        await new Promise(resolve => setTimeout(resolve, 500));

        const bookMetadata = await api.openBookRenderer(bookId, bookPath, 'epub');
        setMetadata(bookMetadata);

        // Add another small delay to ensure HashMap insert completes
        await new Promise(resolve => setTimeout(resolve, 200));

        // Restore chapter + scroll.
        // Priority:
        // 1) explicit one-shot target from resume prompt (exact intent)
        // 2) persisted DB progress
        // Skip all restore if user chose "Start from beginning".
        let startIndex = 0;
        let savedScrollRatio = 0;
        const skipRestore = startFromBeginning;

        const normalizeChapterIndex = (rawIdx: number): number | null => {
          if (Number.isNaN(rawIdx)) return null;

          // Preferred: zero-based index
          if (rawIdx >= 0 && rawIdx < bookMetadata.total_chapters) {
            return rawIdx;
          }

          // Legacy compatibility: one-based index
          if (rawIdx > 0 && rawIdx <= bookMetadata.total_chapters) {
            return rawIdx - 1;
          }

          return null;
        };

        // Consume start-over flag immediately so it doesn't leak into future opens.
        if (skipRestore) {
          setStartFromBeginning(false);
        }

        if (!skipRestore) {
          const directTarget = explicitResumeTarget?.bookId === bookId ? explicitResumeTarget : null;

          if (directTarget) {
            const normalized = normalizeChapterIndex(directTarget.chapterIndex);
            if (normalized !== null) {
              startIndex = normalized;
            }
            const ratio = directTarget.scrollRatio;
            if (!Number.isNaN(ratio) && ratio >= 0 && ratio <= 1) {
              savedScrollRatio = ratio;
            }
            // One-shot target consumed.
            setExplicitResumeTarget(null);
          } else {
            try {
              const progress = await api.getReadingProgress(bookId);
              if (progress) {
                const fallbackFromLocation = () => {
                  if (!progress.currentLocation) return { chapter: null as number | null, scroll: null as number | null };
                  // Legacy location format: "chapter_N" or "chapter_N:scroll_R"
                  const parts = progress.currentLocation.split(':');

                  let chapter: number | null = null;
                  if (parts[0].startsWith('chapter_')) {
                    const idx = parseInt(parts[0].replace('chapter_', ''), 10);
                    chapter = normalizeChapterIndex(idx);
                  }

                  let scroll: number | null = null;
                  if (parts[1]?.startsWith('scroll_')) {
                    const ratio = parseFloat(parts[1].replace('scroll_', ''));
                    if (!Number.isNaN(ratio) && ratio >= 0 && ratio <= 1) {
                      scroll = ratio;
                    }
                  }

                  return { chapter, scroll };
                };

                let cfiChapter: number | null = null;
                let cfiScroll: number | null = null;

                // Prefer CFI-based restore for precision.
                // Fill missing parts from currentLocation fallback when needed.
                if (progress.cfiLocation?.startsWith('epubcfi(') && progress.cfiLocation.endsWith(')')) {
                  const cfiInner = progress.cfiLocation.slice(8, -1);
                  const cfiParts = cfiInner.split('!/');
                  if (cfiParts.length === 2) {
                    const pathParts = cfiParts[0].split('/').filter(Boolean);
                    if (pathParts.length >= 2) {
                      const idx = parseInt(pathParts[1], 10);
                      cfiChapter = normalizeChapterIndex(idx);
                    }

                    const scrollMatch = cfiParts[1].match(/^scroll\/([0-9.]+)/);
                    if (scrollMatch) {
                      const ratio = parseFloat(scrollMatch[1]);
                      if (!Number.isNaN(ratio) && ratio >= 0 && ratio <= 1) {
                        cfiScroll = ratio;
                      }
                    }
                  }
                }

                const fallback = fallbackFromLocation();
                startIndex = cfiChapter ?? fallback.chapter ?? startIndex;
                savedScrollRatio = cfiScroll ?? fallback.scroll ?? savedScrollRatio;
              }
            } catch {
              // Silently ignore
            }
          }
        }

        await loadChapterRef.current(startIndex, null, savedScrollRatio);
        setIsLoading(false);

        if (!skipRestore && (startIndex > 0 || savedScrollRatio > 0)) {
          const pct = bookMetadata.total_chapters > 0
            ? Math.round((startIndex / bookMetadata.total_chapters) * 100)
            : 0;
          useToastStore.getState().addToast({
            title: 'Resuming reading',
            description: `Chapter ${startIndex + 1} of ${bookMetadata.total_chapters} (${pct}%)`,
            variant: 'info',
            duration: 3000,
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load eBook');
        setIsLoading(false);
      }
    };

    void run();
    return () => {
      if (saveScrollProgressRef.current) {
        clearTimeout(saveScrollProgressRef.current);
        saveScrollProgressRef.current = null;
      }
      flushProgressNow();
      api.closeBookRenderer(bookId).catch(logger.error);
    };
  }, [bookPath, bookId, flushProgressNow]);

  const handleClose = useCallback(() => {
    if (saveScrollProgressRef.current) {
      clearTimeout(saveScrollProgressRef.current);
      saveScrollProgressRef.current = null;
    }
    flushProgressNow();
    onClose();
  }, [flushProgressNow, onClose]);

  // ────────────────────────────────────────────────────────────
  // NAVIGATION
  // ────────────────────────────────────────────────────────────
  const nextChapter = useCallback(() => {
    if (!metadata) return;
    if (currentIndex < metadata.total_chapters - 1) {
      loadChapter(currentIndex + 1, null); // Clear search highlight when navigating manually
    }
  }, [metadata, currentIndex, loadChapter]);

  const prevChapter = useCallback(() => {
    if (currentIndex > 0) {
      loadChapter(currentIndex - 1, null); // Clear search highlight when navigating manually
    }
  }, [currentIndex, loadChapter]);

  useEffect(() => {
    if (!hasLoadedChapterRef.current) {
      previousTwoPageViewRef.current = twoPageView;
      return;
    }
    if (previousTwoPageViewRef.current === twoPageView) return;
    previousTwoPageViewRef.current = twoPageView;
    void loadChapterRef.current(currentIndexRef.current);
  }, [twoPageView]);

  useEffect(() => {
    if (previousDoodleChapterRef.current === currentIndex) return;
    previousDoodleChapterRef.current = currentIndex;
    resetDoodlePage();
  }, [currentIndex, resetDoodlePage]);

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
      ? (window as Window & { requestIdleCallback: (callback: () => void) => number }).requestIdleCallback(() => preload())
      : setTimeout(() => preload(), 500);

    return () => {
      cancelled = true;
      if ('cancelIdleCallback' in window) {
        (window as Window & { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(idleId);
      } else {
        clearTimeout(idleId);
      }
    };
  }, [currentIndex, pageFlipEnabled, metadata, bookId]);

  // ────────────────────────────────────────────────────────────
  // ANNOTATION HIGHLIGHTS — render saved highlights into DOM
  // ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentChapter || isLoading) return;

    let cancelled = false;

    const applyAnnotations = async () => {
      const container = contentContainerRef.current;
      if (!container || cancelled) return;

      try {
        const annotations = await api.getAnnotations(bookId);
        if (cancelled) return;

        // Filter to annotations for the current chapter
        const chapterLocation = `chapter_${currentIndex}`;
        const chapterAnnotations = annotations.filter(
          (a) =>
            a.location === chapterLocation ||
            a.location.startsWith(`${chapterLocation}:`)
        );

        applyHighlightsToDOM(container, chapterAnnotations);

        // Scroll to pending annotation if set (from sidebar click)
        const pendingId = useReaderUIStore.getState().pendingAnnotationId;
        if (pendingId) {
          const mark = container.querySelector(`mark.epub-highlight[data-annotation-id="${pendingId}"]`);
          if (mark) {
            mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          useReaderUIStore.getState().setPendingAnnotationId(null);
        }
      } catch {
        // Silently ignore — highlights are non-critical
      }
    };

    // Small delay to ensure dangerouslySetInnerHTML content is in the DOM
    const timerId = window.setTimeout(applyAnnotations, 80);

    // Also listen for annotation changes (e.g. new highlight created)
    const handleAnnotationChanged = () => {
      window.setTimeout(applyAnnotations, 50);
    };
    window.addEventListener('annotation-changed', handleAnnotationChanged);

    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
      window.removeEventListener('annotation-changed', handleAnnotationChanged);
    };
  }, [currentChapter, currentIndex, bookId, isLoading]);

  const nextPage = useCallback(() => {
    if (!isFocusMode && !isTopBarShortcutOnly) {
      setTopBarVisible(false);
    }
    
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
    if (!isFocusMode && !isTopBarShortcutOnly) {
      setTopBarVisible(false);
    }

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

  // ────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────

  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    // If doodle mode or text selection is active, let them handle it
    if (isDoodleMode) return;
    
    // Ignore if clicking an interactive element or if already handled
    const target = e.target as Element;
    if (e.defaultPrevented || !target || typeof target.closest !== 'function') return;
    
    if (target.closest('a') || target.closest('button') || target.closest('.premium-top-bar') || target.closest('.premium-sidebar') || target.closest('.text-selection-toolbar')) {
      return;
    }

    const { clientX } = e;
    const { innerWidth } = window;
    
    // Clicking the center 40% toggles the top bar
    if (clientX > innerWidth * 0.3 && clientX < innerWidth * 0.7) {
      setTopBarVisible(!useReaderUIStore.getState().isTopBarVisible);
    }
    // Edges are handled by the next/prev buttons natively or page flip engine
  }, [isDoodleMode, setTopBarVisible]);

  // ────────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div ref={readerContainerRef} className="premium-reader premium-reader--error">
        <div className="premium-error-container">
          <AlertCircle className="premium-error-icon" />
          <p className="premium-error-title">{error}</p>
          <p className="premium-error-subtitle">Try opening a different book or check the file format.</p>
          <button
            type="button"
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
      <div ref={readerContainerRef} className="premium-reader premium-reader--loading">
        <div className="premium-loading-container">
          <Loader2 className="premium-loading-spinner" />
          <p className="premium-loading-text">
            {isLoading && currentChapter ? 'Loading chapter...' : 'Loading book...'}
          </p>
          {(metadata || readerContent) && (
            <p className="premium-loading-subtitle">{metadata?.title ?? readerContent?.title}</p>
          )}
        </div>
      </div>
    );
  }

  const progressPercentage = metadata
    ? ((currentIndex + 1) / metadata.total_chapters) * 100
    : 0;

  return (
    <div ref={readerContainerRef} className={`premium-reader ${isFocusMode ? 'premium-reader--focus-mode' : ''}`} onClick={handleContainerClick}>
      {/* Auto-hide Top Bar */}
      <ReaderTopBar
        bookId={bookId}
        title={metadata?.title || readerContent?.title || 'Loading...'}
        subtitle={currentChapter.title}
        progress={progressPercentage}
        format="epub"
        onClose={handleClose}
        rightExtra={
          <>
            <button
              type="button"
              onClick={() => toggleSidebar('search')}
              className="premium-control-button"
              aria-label="Search"
              title="Search in book"
            >
              <Search className="premium-control-icon" />
            </button>
            <button
              type="button"
              onClick={() => toggleSidebar('toc')}
              className="premium-control-button"
              aria-label="Table of Contents"
              title="Table of Contents"
            >
              <BookOpen className="premium-control-icon" />
            </button>
            <button
              type="button"
              onClick={toggleTwoPageView}
              className={`premium-control-button ${twoPageView ? 'premium-control-button--active' : ''}`}
              aria-label="Two-page view"
              title="Two-page view"
            >
              <svg aria-hidden="true" className="premium-control-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="8" height="16" />
                <rect x="13" y="4" width="8" height="16" />
              </svg>
            </button>
            <button
              type="button"
              onClick={toggleDoodleMode}
              className={`premium-control-button ${isDoodleMode ? 'premium-control-button--active' : ''}`}
              aria-label="Drawing mode"
              title="Toggle drawing mode"
            >
              <svg aria-hidden="true" className="premium-control-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            </button>
          </>
        }
      />

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
                <ChapterHtml content={currentChapter.content} />
              </div>

              <div className="premium-chapter-page">
                <ChapterHtml content={adjacentChapter.content} />
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
              animationStyle={animationStyle}
              onFlipComplete={handleFlipComplete}
              className="premium-chapter-page"
            />
          ) : (
            /* Standard single-page layout */
            <div className="premium-chapter-page">
              <ChapterHtml content={currentChapter.content} />
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

      {/* Text Selection Toolbar */}
      {!isDoodleMode && (
        <TextSelectionToolbar
          bookId={bookId}
          currentLocation={`chapter_${currentIndex}`}
        />
      )}

      {/* TTS Control Bar */}
      <TTSControlBar
        contentRef={contentContainerRef}
        onChapterEnd={nextPage}
      />



      {/* Floating Navigation Arrows */}
      {!isFocusMode && (
        <>
          <button
            type="button"
            onClick={prevPage}
            className="premium-nav-arrow premium-nav-arrow--left"
            aria-label="Previous page"
          >
            <ChevronLeft className="premium-nav-icon" />
          </button>

          <button
            type="button"
            onClick={nextPage}
            className="premium-nav-arrow premium-nav-arrow--right"
            aria-label="Next page"
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
