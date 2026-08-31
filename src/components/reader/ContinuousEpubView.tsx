import React, { useEffect, useState, useRef, useLayoutEffect, useCallback } from 'react';
import { api, isAndroid, type Annotation, type BookMetadata } from '@/lib/tauri';
import { ChapterHtml, loadProcessedChapter } from './PremiumEpubReader';
import { applyHighlightsToDOM, scrollToAnnotationMark } from '@/lib/highlightAnnotations';
import { handleExternalLinkClick } from '@/lib/externalLinks';
import { isSelectionOrNoteActive, isTouchOnSelectionOrModal } from '@/lib/selectionLock';
import { logger } from '@/lib/logger';
import { useDoodleStore } from '@/store/doodleStore';
import { useReaderUIStore } from '@/store/premiumReaderStore';
import DoodleCanvas from './DoodleCanvas';

interface ContinuousEpubViewProps {
  bookId: number;
  metadata: BookMetadata;
  initialChapterIndex: number;
  initialScrollRatio?: number;
  onChapterChange: (index: number) => void;
  widthClass: string;
  isFocusMode: boolean;
  searchTerm?: string | null;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  contentRef?: React.RefObject<HTMLDivElement | null>;
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
  onToggleUI?: () => void;
}

interface LoadedChapter {
  index: number;
  content: string;
}

// Chapters outside [active-KEEP_ABOVE, active+KEEP_BELOW] are unloaded to bound
// memory while providing smooth continuous reading without layout thrashing.
const KEEP_ABOVE = 3;
const KEEP_BELOW = 3;

export function ContinuousEpubView({
  bookId,
  metadata,
  initialChapterIndex,
  initialScrollRatio = 0,
  onChapterChange,
  widthClass,
  isFocusMode,
  searchTerm,
  scrollRef,
  contentRef,
  onScroll,
  onToggleUI,
}: ContinuousEpubViewProps) {
  const [chapters, setChapters] = useState<LoadedChapter[]>([]);
  const [loadingTop, setLoadingTop] = useState(false);
  const [loadingBottom, setLoadingBottom] = useState(false);
  const loadingBottomRef = useRef(false);
  const loadingTopRef = useRef(false);
  
  const [activeChapterIndex, setActiveChapterIndex] = useState(initialChapterIndex);
  const activeChapterIndexRef = useRef(initialChapterIndex);
  const onChapterChangeRef = useRef(onChapterChange);
  const chaptersRef = useRef<LoadedChapter[]>([]);

  useEffect(() => {
    chaptersRef.current = chapters;
  }, [chapters]);

  useEffect(() => {
    onChapterChangeRef.current = onChapterChange;
  }, [onChapterChange]);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  // Baseline heights per chapter index for scroll compensation: only chapters
  // fully ABOVE the viewport whose height changed (late images/fonts) shift the
  // visible content, and their delta is added to scrollTop.
  const chapterSizesRef = useRef<Map<number, number>>(new Map());
  const chapterRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const isFetchingRef = useRef(false);
  const annotationsRef = useRef<Annotation[] | null>(null);
  const annotationsPromiseRef = useRef<Promise<Annotation[]> | null>(null);

  // IntersectionObserver reports up to once per frame while a chapter boundary
  // is crossed (21 ratio thresholds per element). Flooding setActiveChapterIndex
  // churns React at scroll speed, so the most-visible chapter is committed at
  // most once per COMMIT_DEBOUNCE_MS and only when it actually differs.
  const COMMIT_DEBOUNCE_MS = 100;
  const pendingActiveIdxRef = useRef<number | null>(null);
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadAnnotations = useCallback(async (force = false): Promise<Annotation[]> => {
    if (!force && annotationsRef.current) return annotationsRef.current;
    if (!force && annotationsPromiseRef.current) return annotationsPromiseRef.current;

    const request = api.getAnnotations(bookId);
    annotationsPromiseRef.current = request;
    try {
      const annotations = await request;
      annotationsRef.current = annotations;
      return annotations;
    } finally {
      if (annotationsPromiseRef.current === request) {
        annotationsPromiseRef.current = null;
      }
    }
  }, [bookId]);

  const isDoodleMode = useDoodleStore(state => state.isDoodleMode);

  // Scroll anchoring state
  const prevScrollStateRef = useRef<{ height: number; top: number; activeIdx: number; activeOffsetTop?: number }>({ height: 0, top: 0, activeIdx: -1 });
  const pendingScrollAnchorRef = useRef<'prepend' | 'slice-top' | null>(null);

  const prevSearchTermRef = useRef(searchTerm);
  const prevBookIdRef = useRef(bookId);

  // K3-007: Load a chapter through the shared LRU cache (module-level in
  // PremiumEpubReader). Re-visiting a chapter after window eviction hits the
  // cache instead of doing a fresh IPC + processEpubHtml round-trip.
  const fetchChapter = async (index: number): Promise<LoadedChapter | null> => {
    if (index < 0 || index >= metadata.total_chapters) return null;
    try {
      const chapter = await loadProcessedChapter(bookId, index, searchTerm);
      return { index, content: chapter.content };
    } catch (e) {
      logger.error('[ContinuousEpubView] Failed to load chapter', index, e);
      return null;
    }
  };

  // Initial load
  useEffect(() => {
    let active = true;

    const isDifferentBook = prevBookIdRef.current !== bookId;
    const isDifferentSearch = prevSearchTermRef.current !== searchTerm;
    const isAlreadyLoaded = !isDifferentBook && !isDifferentSearch && chaptersRef.current.some(c => c.index === initialChapterIndex);

    if (isAlreadyLoaded) {
      return;
    }

    prevBookIdRef.current = bookId;
    prevSearchTermRef.current = searchTerm;

    const loadInitial = async () => {
      const ch1 = await fetchChapter(initialChapterIndex);
      if (!active || !ch1) return;
      
      // Fix: Do NOT eagerly preload ch N+1 here. Putting it in the DOM before
      // the initial scroll settles causes the IntersectionObserver to fire with
      // ch N+1 as the "most visible" chapter, which overwrites the saved position
      // and causes the reader to jump 1–2 chapters ahead on reopen.
      // ch N+1 will load naturally via loadMoreChapters when the user scrolls.
      setChapters([ch1]);
      hasAppliedInitialScroll.current = false;
      initialScrollSettledRef.current = false;
    };
    loadInitial();
    
    return () => { active = false; };
  }, [bookId, initialChapterIndex, metadata.total_chapters, searchTerm]);

  // Unload chapters outside the window around the active chapter, freeing their
  // DOM and processed HTML strings. loadMoreChapters reloads them on demand when
  // the user scrolls back.
  useEffect(() => {
    const minKeep = activeChapterIndexRef.current - KEEP_ABOVE;
    const maxKeep = activeChapterIndexRef.current + KEEP_BELOW;

    const hasOutside = chaptersRef.current.some(c => c.index < minKeep) || chaptersRef.current.some(c => c.index > maxKeep);

    if (chaptersRef.current.length === 0 || !hasOutside) return;
    // Never prune while a chapter is being fetched (avoids racing loadMoreChapters);
    // the next activeChapterIndex change will prune.
    if (isFetchingRef.current) return;

    // Removal ABOVE the viewport shrinks the DOM above scrollTop, so capture the
    // current scroll state and let the useLayoutEffect re-anchor after the shrink.
    if (chaptersRef.current.some(c => c.index < minKeep) && containerRef.current) {
      const activeEl = chapterRefs.current.get(activeChapterIndexRef.current);
      prevScrollStateRef.current = {
        height: containerRef.current.scrollHeight,
        top: containerRef.current.scrollTop,
        activeIdx: activeChapterIndexRef.current,
        activeOffsetTop: activeEl ? activeEl.offsetTop : undefined
      };
      pendingScrollAnchorRef.current = 'slice-top';
    }
    // Removal BELOW the viewport needs no anchoring (doesn't move scrollTop).

    setChapters(prev => prev.filter(c => c.index >= minKeep && c.index <= maxKeep));
  }, [activeChapterIndex]);

  // Handle scroll anchoring and initial scroll
  const hasAppliedInitialScroll = useRef(false);
  // Guard: IntersectionObserver must not fire onChapterChange until the initial
  // scroll position has stabilised. Set to true 300ms after scroll is applied.
  const initialScrollSettledRef = useRef(false);
  const previousRequestedChapterRef = useRef(initialChapterIndex);

  // Parent-level chapter navigation: only reset initial scroll if requested
  // chapter is far away (e.g. from TOC/sidebar) and not sequentially scrolled into.
  useLayoutEffect(() => {
    if (previousRequestedChapterRef.current === initialChapterIndex) return;
    const prevReq = previousRequestedChapterRef.current;
    previousRequestedChapterRef.current = initialChapterIndex;
    if (initialChapterIndex !== activeChapterIndexRef.current && Math.abs(initialChapterIndex - prevReq) > 1) {
      activeChapterIndexRef.current = initialChapterIndex;
      hasAppliedInitialScroll.current = false;
    }
  }, [initialChapterIndex]);

  useLayoutEffect(() => {
    if (chapters.length === 0 || !containerRef.current) return;
    
    const container = containerRef.current;
    
    // Initial scroll jump
    if (!hasAppliedInitialScroll.current) {
      const el = chapterRefs.current.get(initialChapterIndex);
      if (el) {
        if (initialScrollRatio > 0) {
          // Allow some time for image loading but set immediately too
          const scrollTarget = el.offsetTop + (el.scrollHeight * initialScrollRatio);
          container.scrollTo({ top: scrollTarget, behavior: 'instant' });
          setTimeout(() => {
            if (container) container.scrollTo({ top: el.offsetTop + (el.scrollHeight * initialScrollRatio), behavior: 'instant' });
          }, 100);
        } else {
          el.scrollIntoView({ behavior: 'instant', block: 'start' });
        }
        hasAppliedInitialScroll.current = true;
        // Allow fonts/images a moment to finish layout before the observer fires
        setTimeout(() => { initialScrollSettledRef.current = true; }, 350);
      }
      return;
    }

    // Scroll anchoring when DOM changes above current viewport
    if (pendingScrollAnchorRef.current && container) {
      const { top: oldTop, activeIdx, activeOffsetTop: oldOffsetTop } = prevScrollStateRef.current;
      
      const activeEl = chapterRefs.current.get(activeIdx);
      if (activeEl && oldOffsetTop !== undefined) {
        const newOffsetTop = activeEl.offsetTop;
        const offsetDiff = newOffsetTop - oldOffsetTop;
        container.scrollTo({ top: oldTop + offsetDiff, behavior: 'instant' });
      } else {
        // Fallback to height diff if we can't find the anchor
        const { height: oldHeight } = prevScrollStateRef.current;
        const newHeight = container.scrollHeight;
        const heightDiff = newHeight - oldHeight;
        if (pendingScrollAnchorRef.current === 'prepend') {
          container.scrollTo({ top: oldTop + heightDiff, behavior: 'instant' });
        } else if (pendingScrollAnchorRef.current === 'slice-top') {
          container.scrollTo({ top: Math.max(0, oldTop + heightDiff), behavior: 'instant' });
        }
      }
      
      pendingScrollAnchorRef.current = null;
    }
  }, [chapters, initialChapterIndex, initialScrollRatio]);

  // Scroll to search highlight when search term is set/updated
  useEffect(() => {
    if (!searchTerm?.trim()) return;

    let cancelled = false;
    let attempts = 0;

    const tryScrollToSearch = () => {
      if (cancelled) return;
      const container = containerRef.current;
      if (!container) return;

      const targetChapterEl = chapterRefs.current.get(initialChapterIndex) || container;
      const highlight = targetChapterEl.querySelector<HTMLElement>('.search-highlight');

      if (highlight) {
        highlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
        highlight.classList.remove('search-highlight--active');
        void highlight.offsetWidth;
        highlight.classList.add('search-highlight--active');
        setTimeout(() => {
          highlight.classList.remove('search-highlight--active');
        }, 2800);
      } else if (attempts < 15) {
        attempts++;
        setTimeout(tryScrollToSearch, 60);
      }
    };

    const timer = setTimeout(tryScrollToSearch, 40);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchTerm, initialChapterIndex, chapters]);

  // Setup IntersectionObserver to track active chapter and trigger lazy loading
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Commit the pending most-visible chapter. Runs at most once per
    // COMMIT_DEBOUNCE_MS; the published index is the last one observed.
    const commitPendingActive = () => {
      commitTimerRef.current = null;
      const pending = pendingActiveIdxRef.current;
      pendingActiveIdxRef.current = null;
      if (pending === null) return;
      // The chapter may have been pruned since it was observed — a removed
      // element can't be most-visible, and committing it would yank scroll.
      if (!chapterRefs.current.has(pending)) return;
      if (pending === activeChapterIndexRef.current) return;
      activeChapterIndexRef.current = pending;
      setActiveChapterIndex(pending);
      onChapterChangeRef.current(pending);
    };

    const scheduleCommit = (idx: number) => {
      pendingActiveIdxRef.current = idx;
      if (commitTimerRef.current === null) {
        commitTimerRef.current = setTimeout(commitPendingActive, COMMIT_DEBOUNCE_MS);
      }
    };

    const visibleHeightsMap = new Map<number, number>();

    const handleIntersect = (entries: IntersectionObserverEntry[]) => {
      entries.forEach(entry => {
        const idxStr = entry.target.getAttribute('data-chapter-index');
        if (!idxStr) return;
        const idx = parseInt(idxStr, 10);

        if (entry.isIntersecting && entry.intersectionRect.height > 0) {
          visibleHeightsMap.set(idx, entry.intersectionRect.height);
        } else {
          visibleHeightsMap.delete(idx);
        }
      });

      let maxVisibleHeight = 0;
      let mostVisibleIdx = activeChapterIndexRef.current;

      for (const [idx, visibleHeight] of visibleHeightsMap) {
        if (visibleHeight > maxVisibleHeight) {
          maxVisibleHeight = visibleHeight;
          mostVisibleIdx = idx;
        }
      }

      // Only fire onChapterChange once the initial scroll has fully settled.
      // Firing before settlement overwrites the saved DB position with ch N+1
      // (the eagerly-loaded next chapter) causing the 2-chapter-ahead jump bug.
      if (maxVisibleHeight > 0 && mostVisibleIdx !== activeChapterIndexRef.current && initialScrollSettledRef.current) {
        scheduleCommit(mostVisibleIdx);
      }
    };

    observerRef.current = new IntersectionObserver(handleIntersect, {
      root: container,
      rootMargin: '0px', // Exact viewport
      threshold: [0, 0.25, 0.5, 0.75, 1.0], // High performance threshold checkpoints
    });

    // ResizeObserver: a chapter fully above the viewport that grows after the
    // scroll anchor ran (images/fonts decode late) pushes the reading position
    // down — compensate by exactly that delta. Coalesced: all entry deltas in
    // one callback are summed into a single scrollTop write.
    const chapterSizes = chapterSizesRef.current;
    resizeObserverRef.current = new ResizeObserver((entries) => {
      if (!containerRef.current) return;
      // An anchor is pending: the layout effect is about to write scrollTop;
      // skip this frame so the two never double-adjust. Stable heights that
      // changed later re-fire the observer.
      if (pendingScrollAnchorRef.current) return;
      const container = containerRef.current;
      let delta = 0;
      for (const entry of entries) {
        const target = entry.target as HTMLElement;
        const idxStr = target.getAttribute('data-chapter-index');
        if (!idxStr) continue;
        const idx = parseInt(idxStr, 10);
        const size = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
        const prev = chapterSizes.get(idx);
        chapterSizes.set(idx, size);
        if (prev === undefined || size === prev) continue;
        // Fully above the viewport? Its growth moves everything below it.
        // If the viewport is INSIDE this chapter, growth may be below the fold
        // and must not shift the reading position — never touch scrollTop.
        if (target.getBoundingClientRect().bottom <= 0) {
          delta += size - prev;
        }
      }
      if (delta !== 0) container.scrollTop += delta;
    });

    chapterRefs.current.forEach(el => observerRef.current?.observe(el));
    chapterRefs.current.forEach(el => resizeObserverRef.current?.observe(el));

    return () => {
      if (commitTimerRef.current !== null) {
        clearTimeout(commitTimerRef.current);
        commitTimerRef.current = null;
      }
      pendingActiveIdxRef.current = null;
      visibleHeightsMap.clear();
      observerRef.current?.disconnect();
      resizeObserverRef.current?.disconnect();
      chapterSizes.clear();
    };
  }, [chapters, metadata.total_chapters]);

  // Layout stabilizer for loaded images: once an image decodes, persist its
  // intrinsic size as width/height attributes. The FIRST decode's layout shift
  // is absorbed by the ResizeObserver above; these attributes keep later DOM
  // mutations (search-highlight toggles, re-layouts) from shifting layout again.
  // <img> 'load' events don't bubble, but they DO capture — the container-level
  // capture listener sees every chapter's images. Fonts are left alone
  // (ponytail: font-display:swap in EPUB CSS plus bounded font waits elsewhere).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onLoadCapture = (e: Event) => {
      const img = e.target as HTMLImageElement;
      if (!(img instanceof HTMLImageElement)) return;
      if (img.naturalWidth > 0 && !img.hasAttribute('width') && !img.hasAttribute('height')) {
        img.setAttribute('width', String(img.naturalWidth));
        img.setAttribute('height', String(img.naturalHeight));
      }
    };
    container.addEventListener('load', onLoadCapture, true);
    return () => container.removeEventListener('load', onLoadCapture, true);
  }, []);

  const loadMoreChapters = async (direction: 'up' | 'down') => {
    if (chapters.length === 0 || isFetchingRef.current || !containerRef.current) return;
    
    isFetchingRef.current = true;
    
    try {
      if (direction === 'down') {
        const lastIdx = chapters[chapters.length - 1].index;
        if (lastIdx >= metadata.total_chapters - 1) return;
        
        setLoadingBottom(true);
        loadingBottomRef.current = true;
        
        const newCh = await fetchChapter(lastIdx + 1);
        if (newCh) {
          setChapters(prev => {
            if (prev.some(c => c.index === newCh.index)) return prev;
            const updated = [...prev, newCh];
            if (updated.length > 8) {
              return updated.slice(updated.length - 8);
            }
            return updated;
          });
        }
      } else {
        const firstIdx = chapters[0].index;
        if (firstIdx <= 0) return;
        
        setLoadingTop(true);
        loadingTopRef.current = true;
        
        const newCh = await fetchChapter(firstIdx - 1);
        if (newCh) {
          const activeEl = chapterRefs.current.get(activeChapterIndexRef.current);
          prevScrollStateRef.current = {
            height: containerRef.current.scrollHeight,
            top: containerRef.current.scrollTop,
            activeIdx: activeChapterIndexRef.current,
            activeOffsetTop: activeEl ? activeEl.offsetTop : undefined
          };
          pendingScrollAnchorRef.current = 'prepend';
          
          setChapters(prev => {
            if (prev.some(c => c.index === newCh.index)) return prev;
            const updated = [newCh, ...prev];
            if (updated.length > 8) {
              return updated.slice(0, 8);
            }
            return updated;
          });
        }
      }
    } finally {
      setLoadingBottom(false);
      loadingBottomRef.current = false;
      setLoadingTop(false);
      loadingTopRef.current = false;
      isFetchingRef.current = false;
    }
  };

  // Apply highlights when chapters load
  useEffect(() => {
    let cancelled = false;

    const applyHighlights = async () => {
      if (cancelled || chapters.length === 0) return;
      
      try {
        const annotations = await loadAnnotations();
        if (cancelled) return;

        // Use a short timeout to ensure DOM layout has settled 
        // after synchronous innerHTML insertion.
        setTimeout(() => {
          if (cancelled) return;
          chapters.forEach(ch => {
            const el = chapterRefs.current.get(ch.index);
            if (el) {
              const chapterLocation = `chapter_${ch.index}`;
              const chapterAnnotations = annotations.filter(
                (a) =>
                  a.location === chapterLocation ||
                  a.location.startsWith(`${chapterLocation}:`)
              );
              applyHighlightsToDOM(el, chapterAnnotations);
            }
          });
        }, 50);
      } catch (e) {
        console.error('Failed to load annotations for continuous view', e);
      }
    };

    applyHighlights();

    const handleAnnotationChanged = () => {
      annotationsRef.current = null;
      annotationsPromiseRef.current = null;
      void applyHighlights();
    };
    window.addEventListener('annotation-changed', handleAnnotationChanged);

    return () => {
      cancelled = true;
      window.removeEventListener('annotation-changed', handleAnnotationChanged);
    };
  }, [chapters, bookId, loadAnnotations]);

  // Dedicated reactive listener for continuous view to jump directly to the exact
  // clicked annotation mark. Resolves the target chapter FIRST (loading it into the
  // rendered window if the lazy window doesn't contain it), then applies highlights
  // and scrolls in a single requestAnimationFrame (one layout pass), retries ONCE on
  // the next frame, then gives up and clears pending — no busy retry loop.
  const pendingAnnotationId = useReaderUIStore((state) => state.pendingAnnotationId);
  useEffect(() => {
    if (!pendingAnnotationId) return;

    let cancelled = false;
    const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

    const tryScroll = async () => {
      if (cancelled) return;
      const container = containerRef.current;
      if (!container) {
        // Container exists once mounted; nothing else to wait for.
        useReaderUIStore.getState().setPendingAnnotationId(null);
        return;
      }
      const startActiveIndex = activeChapterIndexRef.current;

      // Resolve the annotation's chapter from its location BEFORE scrolling.
      let targetIndex: number | null = null;
      try {
        const annotations = await loadAnnotations();
        if (cancelled) return;
        const target = annotations.find((a) => a.id === pendingAnnotationId);
        const chapterMatch = target?.location?.match(/^chapter_(\d+)/);
        if (chapterMatch) targetIndex = parseInt(chapterMatch[1], 10);
      } catch {
        // Non-critical — fall through and scroll anyway.
      }

      // Cross-chapter: continuous mode lazily loads chapters around the active
      // window, so a clicked annotation's chapter may not be rendered yet. Fetch
      // it and insert it into the window; the side effects re-run on state change.
      if (targetIndex !== null && targetIndex >= 0 && targetIndex < metadata.total_chapters) {
        if (!chaptersRef.current.some((c) => c.index === targetIndex)) {
          const ch = await fetchChapter(targetIndex);
          if (cancelled) return;
          if (!ch) {
            useReaderUIStore.getState().setPendingAnnotationId(null);
            return;
          }
          setChapters((prev) =>
            prev.some((c) => c.index === ch.index)
              ? prev
              : [...prev, ch].sort((a, b) => a.index - b.index)
          );
          // Let React commit and register the chapter ref before scrolling.
          await sleep(60);
          if (cancelled) return;
        }
      }

      // Apply highlights and scroll in ONE rAF (single layout pass).
      requestAnimationFrame(async () => {
        if (cancelled) return;
        try {
          const annotations = await loadAnnotations();
          if (cancelled) return;
          chaptersRef.current.forEach((ch) => {
            const el = chapterRefs.current.get(ch.index);
            if (!el) return;
            const chapterLocation = `chapter_${ch.index}`;
            const chapterAnnotations = annotations.filter(
              (a) =>
                a.location === chapterLocation ||
                a.location.startsWith(`${chapterLocation}:`)
            );
            applyHighlightsToDOM(el, chapterAnnotations);
          });
        } catch {
          // Continue to the scroll attempt anyway.
        }
        if (cancelled) return;
        const success = scrollToAnnotationMark(containerRef.current, pendingAnnotationId);
        if (success) {
          useReaderUIStore.getState().setPendingAnnotationId(null);
          // Cross-chapter: after a chapter switch the layout effect re-scrolls to
          // the chapter position (~100ms later, plus an image-loading pass).
          // Re-assert the exact mark position once, after that window closes.
          if (targetIndex !== null && targetIndex !== startActiveIndex) {
            setTimeout(() => {
              if (!cancelled) scrollToAnnotationMark(containerRef.current, pendingAnnotationId);
            }, 200);
          }
          return;
        }
        // ONE rAF-delayed retry for highlights-DOM timing, then give up and
        // clear pending exactly once.
        requestAnimationFrame(() => {
          if (cancelled) return;
          if (scrollToAnnotationMark(containerRef.current, pendingAnnotationId)) {
            useReaderUIStore.getState().setPendingAnnotationId(null);
          } else {
            useReaderUIStore.getState().setPendingAnnotationId(null);
          }
        });
      });
    };

    const timerId = setTimeout(tryScroll, 40);
    return () => {
      cancelled = true;
      clearTimeout(timerId);
    };
  }, [pendingAnnotationId, bookId, loadAnnotations, metadata.total_chapters]);

  const lastScrollTopRef = useRef(0);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (onScroll) onScroll(e);

    const container = e.currentTarget;
    const currentScrollTop = container.scrollTop;
    const isScrollingDown = currentScrollTop > lastScrollTopRef.current;
    const isScrollingUp = currentScrollTop < lastScrollTopRef.current;
    lastScrollTopRef.current = currentScrollTop;
    
    // Only fetch previous chapters when actually scrolling UP and near the top (< 350px)
    if (isScrollingUp && currentScrollTop < 350 && !loadingTopRef.current && chapters.length > 0) {
      if (chapters[0].index > 0) {
        loadMoreChapters('up');
      }
    }
    
    // Only fetch next chapters when actually scrolling DOWN and near bottom (< 1400px)
    const distanceToBottom = container.scrollHeight - currentScrollTop - container.clientHeight;
    if (isScrollingDown && distanceToBottom < 1400 && !loadingBottomRef.current && chapters.length > 0) {
      if (chapters[chapters.length - 1].index < metadata.total_chapters - 1) {
        loadMoreChapters('down');
      }
    }
  }, [chapters, metadata.total_chapters, onScroll]);

  return (
    <div 
      ref={el => {
        containerRef.current = el;
        if (scrollRef && 'current' in scrollRef) {
          (scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
        }
      }} 
      className={`premium-reading-canvas ${isFocusMode ? 'premium-reading-canvas--focus-mode' : ''}`}
      style={{ overflowY: 'auto', overscrollBehaviorY: 'contain', height: '100%' }}
      onScroll={handleScroll}
    >
      <div 
        ref={contentRef}
        onClick={(e) => {
          const target = e.target as Element;
          if (isSelectionOrNoteActive() || isTouchOnSelectionOrModal(target)) {
            return;
          }

          if (target && typeof target.closest === 'function') {
            if (
              target.closest('a') ||
              target.closest('button') ||
              target.closest('input') ||
              target.closest('select') ||
              target.closest('textarea') ||
              target.closest('.text-selection-toolbar') ||
              target.closest('.translation-popup') ||
              target.closest('.text-selection-category-menu') ||
              target.closest('[role="dialog"]') ||
              target.closest('mark.epub-highlight') ||
              target.closest('mark.pdf-highlight') ||
              target.closest('[data-note-content]') ||
              target.closest('[data-annotation-id]') ||
              target.closest('.reader-annotation-tooltip')
            ) {
              handleExternalLinkClick(e.nativeEvent, contentRef?.current ?? null);
              return;
            }
          }
          handleExternalLinkClick(e.nativeEvent, contentRef?.current ?? null);

          const selection = window.getSelection();
          if (selection && selection.toString().trim().length > 0) return;

          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const clickX = e.clientX || (e.nativeEvent as any)?.clientX || 0;
          const clickRatio = rect.width > 0 ? (clickX - rect.left) / rect.width : 0.5;

          // Continuous/scroll mode: edge taps scroll by ~90% of the viewport,
          // center taps toggle the UI. (This view has no paginated page-flip.)
          const container = scrollRef?.current;
          const page = (container?.clientHeight ?? window.innerHeight) * 0.9;
          if (clickRatio < 0.2) {
            container?.scrollBy({ top: -page, behavior: 'smooth' });
          } else if (clickRatio > 0.8) {
            container?.scrollBy({ top: page, behavior: 'smooth' });
          } else if (onToggleUI) {
            onToggleUI();
          }
        }}
        className={`premium-content-container premium-content-container--${widthClass}`}
      >
        
        {loadingTop && (
          <div className="flex items-center justify-center py-4 text-neutral-500">
            <span className="animate-spin mr-2">⟳</span> Loading previous chapter...
          </div>
        )}
        
        {chapters.map((ch, i) => (
          <React.Fragment key={ch.index}>
            <div 
              data-chapter-index={ch.index}
              ref={el => {
                if (el) {
                  chapterRefs.current.set(ch.index, el);
                } else {
                  chapterRefs.current.delete(ch.index);
                }
              }}
              className="premium-chapter-page"
              style={{ paddingBottom: '2rem', position: 'relative' }}
            >
              <ChapterHtml content={ch.content} />
              
              {isDoodleMode && (
                <DoodleCanvas
                  bookId={bookId}
                  pageId={`epub-${bookId}-${ch.index}`}
                  containerRef={{ current: chapterRefs.current.get(ch.index) || null } as React.RefObject<HTMLDivElement>}
                />
              )}
            </div>

            {/* Seamless separator between chapters */}
            {i < chapters.length - 1 && (
              <div style={{ height: '4rem', borderBottom: '1px dashed var(--border-color)', marginBottom: '4rem' }} />
            )}
          </React.Fragment>
        ))}

        {loadingBottom && (
          <div className="flex items-center justify-center py-4 text-neutral-500">
            <span className="animate-spin mr-2">⟳</span> Loading next chapter...
          </div>
        )}

        {!loadingBottom && chapters.length > 0 && chapters[chapters.length - 1].index === metadata.total_chapters - 1 && (
          <div className="flex flex-col items-center justify-center py-12 text-neutral-500">
            <div className="text-xl font-medium mb-2">End of Book</div>
            <div className="text-sm">You have reached the end.</div>
          </div>
        )}

      </div>
    </div>
  );
}
