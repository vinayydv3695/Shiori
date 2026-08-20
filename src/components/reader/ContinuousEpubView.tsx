import React, { useEffect, useState, useRef, useLayoutEffect, useCallback } from 'react';
import { api, isAndroid, type Annotation, type BookMetadata } from '@/lib/tauri';
import { ChapterHtml, processEpubHtml, applySearchHighlight } from './PremiumEpubReader';
import { applyHighlightsToDOM, scrollToAnnotationMark } from '@/lib/highlightAnnotations';
import { handleExternalLinkClick } from '@/lib/externalLinks';
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
}

interface LoadedChapter {
  index: number;
  content: string;
}

// Chapters outside [active-KEEP_ABOVE, active+KEEP_BELOW] are unloaded to bound
// memory (long books previously kept every scrolled chapter, OOM-crashing Android).
const KEEP_ABOVE = isAndroid ? 1 : 3;
const KEEP_BELOW = isAndroid ? 1 : 3;

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
  const chapterRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const isFetchingRef = useRef(false);
  const annotationsRef = useRef<Annotation[] | null>(null);
  const annotationsPromiseRef = useRef<Promise<Annotation[]> | null>(null);

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

  // Load a single chapter and process its HTML
  const fetchChapter = async (index: number): Promise<LoadedChapter | null> => {
    if (index < 0 || index >= metadata.total_chapters) return null;
    try {
      const chapter = await api.getBookChapter(bookId, index);
      const processed = await processEpubHtml(bookId, chapter.content);
      const withTerm = searchTerm ? applySearchHighlight(processed, searchTerm) : processed;
      return { index, content: withTerm };
    } catch (e) {
      console.error('Failed to load chapter', index, e);
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
      
      const initialList = [ch1];
      
      if (initialChapterIndex + 1 < metadata.total_chapters) {
        const ch2 = await fetchChapter(initialChapterIndex + 1);
        if (ch2 && active) initialList.push(ch2);
      }
      
      setChapters(initialList);
      hasAppliedInitialScroll.current = false;
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
  const previousRequestedChapterRef = useRef(initialChapterIndex);

  // Parent-level chapter navigation can change initialChapterIndex while the
  // target chapter is already in the loaded window. Reset the one-shot scroll
  // gate before the layout effect so target navigation actually moves there.
  useLayoutEffect(() => {
    if (previousRequestedChapterRef.current === initialChapterIndex) return;
    previousRequestedChapterRef.current = initialChapterIndex;
    if (initialChapterIndex !== activeChapterIndexRef.current) {
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

    const handleIntersect = (entries: IntersectionObserverEntry[]) => {
      let maxVisibleHeight = 0;
      let mostVisibleIdx = activeChapterIndexRef.current;

      entries.forEach(entry => {
        const idxStr = entry.target.getAttribute('data-chapter-index');
        if (!idxStr) return;
        const idx = parseInt(idxStr, 10);

        if (entry.isIntersecting) {
          const visibleHeight = entry.intersectionRect.height;
          if (visibleHeight > maxVisibleHeight) {
            maxVisibleHeight = visibleHeight;
            mostVisibleIdx = idx;
          }
        }
      });

      if (maxVisibleHeight > 0 && mostVisibleIdx !== activeChapterIndexRef.current) {
        activeChapterIndexRef.current = mostVisibleIdx;
        setActiveChapterIndex(mostVisibleIdx);
        onChapterChangeRef.current(mostVisibleIdx);
      }
    };

    observerRef.current = new IntersectionObserver(handleIntersect, {
      root: container,
      rootMargin: '0px', // Exact viewport
      threshold: Array.from({ length: 21 }, (_, i) => i * 0.05), // More granular thresholds for long chapters
    });

    chapterRefs.current.forEach(el => observerRef.current?.observe(el));

    return () => {
      observerRef.current?.disconnect();
    };
  }, [chapters, metadata.total_chapters]);

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
            return [...prev, newCh];
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
            return [newCh, ...prev];
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

  // Dedicated reactive listener for continuous view to jump directly to exact clicked annotation mark
  const pendingAnnotationId = useReaderUIStore((state) => state.pendingAnnotationId);
  useEffect(() => {
    if (!pendingAnnotationId) return;

    let attempts = 0;
    const maxAttempts = 35;

    const tryScroll = async () => {
      const container = containerRef.current;
      if (!container) {
        if (attempts < maxAttempts) {
          attempts++;
          setTimeout(tryScroll, 80);
        }
        return;
      }

      let success = scrollToAnnotationMark(container, pendingAnnotationId);
      if (success) {
        useReaderUIStore.getState().setPendingAnnotationId(null);
        return;
      }

      // Proactively ensure highlights are applied
      try {
        const annotations = await loadAnnotations();
        chapters.forEach((ch) => {
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
        success = scrollToAnnotationMark(container, pendingAnnotationId);
        if (success) {
          useReaderUIStore.getState().setPendingAnnotationId(null);
          return;
        }
      } catch {
        // continue
      }

      if (attempts < maxAttempts) {
        attempts++;
        setTimeout(tryScroll, 80);
      } else {
        useReaderUIStore.getState().setPendingAnnotationId(null);
      }
    };

    const timerId = setTimeout(tryScroll, 40);
    return () => clearTimeout(timerId);
  }, [pendingAnnotationId, chapters, bookId, loadAnnotations]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (onScroll) onScroll(e);

    const container = e.currentTarget;
    
    // Fetch previous chapters when within 5000px of top
    if (container.scrollTop < 5000 && !loadingTopRef.current && chapters.length > 0) {
      if (chapters[0].index > 0) {
        loadMoreChapters('up');
      }
    }
    
    // Fetch next chapters when within 5000px of bottom
    if (container.scrollHeight - container.scrollTop - container.clientHeight < 5000 && !loadingBottomRef.current && chapters.length > 0) {
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
          // External links → system browser; internal links stay untouched so
          // hash/relative navigation keeps working inside the reader.
          handleExternalLinkClick(e.nativeEvent, contentRef?.current ?? null);
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
