import React, { useEffect, useState, useRef, useCallback } from 'react';
import { api, type BookMetadata } from '@/lib/tauri';
import { ChapterHtml, processEpubHtml } from './PremiumEpubReader';
import { applyHighlightsToDOM } from '@/lib/highlightAnnotations';
import { useDoodleStore } from '@/store/doodleStore';

interface ContinuousEpubViewProps {
  bookId: number;
  metadata: BookMetadata;
  initialChapterIndex: number;
  initialScrollRatio?: number;
  onChapterChange: (index: number) => void;
  widthClass: string;
  isFocusMode: boolean;
  searchTerm?: string | null;
  scrollRef?: React.RefObject<HTMLDivElement>;
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
}

interface LoadedChapter {
  index: number;
  content: string;
}

export function ContinuousEpubView({
  bookId,
  metadata,
  initialChapterIndex,
  initialScrollRatio = 0,
  onChapterChange,
  widthClass,
  isFocusMode,
  searchTerm,
}: ContinuousEpubViewProps) {
  const [chapters, setChapters] = useState<LoadedChapter[]>([]);
  const [loadingTop, setLoadingTop] = useState(false);
  const [loadingBottom, setLoadingBottom] = useState(false);
  const loadingBottomRef = useRef(false);
  const [activeChapterIndex, setActiveChapterIndex] = useState(initialChapterIndex);
  const activeChapterIndexRef = useRef(initialChapterIndex);
  const onChapterChangeRef = useRef(onChapterChange);

  useEffect(() => {
    onChapterChangeRef.current = onChapterChange;
  }, [onChapterChange]);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const chapterRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const isFetchingRef = useRef(false);
  
  const isDoodleMode = useDoodleStore(state => state.isDoodleMode);

  // Load a single chapter and process its HTML
  const fetchChapter = async (index: number): Promise<LoadedChapter | null> => {
    if (index < 0 || index >= metadata.total_chapters) return null;
    try {
      const chapter = await api.getBookChapter(bookId, index);
      const processed = await processEpubHtml(bookId, chapter.content, searchTerm);
      return { index, content: processed };
    } catch (e) {
      console.error('Failed to load chapter', index, e);
      return null;
    }
  };

  // Initial load
  useEffect(() => {
    let active = true;
    const loadInitial = async () => {
      // Load current chapter
      const ch1 = await fetchChapter(initialChapterIndex);
      if (!active || !ch1) return;
      
      let initialList = [ch1];
      
      // Optionally load next chapter immediately for smooth scroll
      if (initialChapterIndex + 1 < metadata.total_chapters) {
        const ch2 = await fetchChapter(initialChapterIndex + 1);
        if (ch2 && active) initialList.push(ch2);
      }
      
      setChapters(initialList);
    };
    loadInitial();
    
    return () => { active = false; };
  }, [bookId, initialChapterIndex, metadata.total_chapters, searchTerm]);

  // Handle scroll anchoring and initial scroll
  const hasAppliedInitialScroll = useRef(false);
  useEffect(() => {
    if (hasAppliedInitialScroll.current || chapters.length === 0 || !containerRef.current) return;
    
    const el = chapterRefs.current.get(initialChapterIndex);
    if (el) {
      if (initialScrollRatio > 0) {
        // Wait for images/styles to potentially render
        setTimeout(() => {
          const container = containerRef.current!;
          const scrollTarget = el.offsetTop + (el.scrollHeight * initialScrollRatio);
          container.scrollTo({ top: scrollTarget, behavior: 'instant' });
        }, 100);
      } else {
        // Just scroll the element into view
        el.scrollIntoView({ behavior: 'instant', block: 'start' });
      }
      hasAppliedInitialScroll.current = true;
    }
  }, [chapters, initialChapterIndex, initialScrollRatio]);

  // Setup IntersectionObserver to track active chapter and trigger lazy loading
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleIntersect = (entries: IntersectionObserverEntry[]) => {
      let maxRatio = 0;
      let mostVisibleIdx = activeChapterIndexRef.current;
      let loadNext = false;

      entries.forEach(entry => {
        const idxStr = entry.target.getAttribute('data-chapter-index');
        if (!idxStr) return;
        const idx = parseInt(idxStr, 10);

        if (entry.isIntersecting && entry.intersectionRatio > maxRatio) {
          maxRatio = entry.intersectionRatio;
          mostVisibleIdx = idx;
        }

        // Proactively fetch next chapter when the last loaded chapter enters the viewport (or its margin)
        if (entry.isIntersecting && chapters.length > 0) {
          if (idx === chapters[chapters.length - 1].index && idx < metadata.total_chapters - 1) {
            loadNext = true;
          }
        }
      });

      if (maxRatio > 0 && mostVisibleIdx !== activeChapterIndexRef.current) {
        activeChapterIndexRef.current = mostVisibleIdx;
        setActiveChapterIndex(mostVisibleIdx);
        onChapterChangeRef.current(mostVisibleIdx);
      }

      if (loadNext && !loadingBottomRef.current) {
        loadMoreChapters();
      }
    };

    observerRef.current = new IntersectionObserver(handleIntersect, {
      root: container,
      rootMargin: '100% 0px', // Trigger when 1 viewport away (preloading)
      threshold: [0, 0.1, 0.5, 0.9, 1.0],
    });

    chapterRefs.current.forEach(el => observerRef.current?.observe(el));

    return () => {
      observerRef.current?.disconnect();
    };
  }, [chapters, metadata.total_chapters]);

  const loadMoreChapters = async () => {
    if (chapters.length === 0 || isFetchingRef.current) return;
    
    const lastIdx = chapters[chapters.length - 1].index;
    if (lastIdx >= metadata.total_chapters - 1) return;
    
    isFetchingRef.current = true;
    setLoadingBottom(true);
    loadingBottomRef.current = true;
    
    try {
      const newCh = await fetchChapter(lastIdx + 1);
      if (newCh) {
        setChapters(prev => {
          if (prev.some(c => c.index === newCh.index)) return prev;
          return [...prev, newCh];
        });
      }
    } finally {
      setLoadingBottom(false);
      loadingBottomRef.current = false;
      isFetchingRef.current = false;
    }
  };

  // Apply highlights when chapters load
  useEffect(() => {
    let cancelled = false;

    const applyHighlights = async () => {
      if (cancelled || chapters.length === 0) return;
      
      try {
        const annotations = await api.getAnnotations(bookId);
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
      } catch (e) {
        console.error('Failed to load annotations for continuous view', e);
      }
    };

    const handle = setTimeout(applyHighlights, 200);

    const handleAnnotationChanged = () => {
      window.setTimeout(applyHighlights, 50);
    };
    window.addEventListener('annotation-changed', handleAnnotationChanged);

    return () => {
      cancelled = true;
      clearTimeout(handle);
      window.removeEventListener('annotation-changed', handleAnnotationChanged);
    };
  }, [chapters, bookId]);

  return (
    <div 
      ref={el => {
        containerRef.current = el;
        if (scrollRef && 'current' in scrollRef) {
          (scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
        }
      }} 
      className={`premium-reading-canvas ${isFocusMode ? 'premium-reading-canvas--focus-mode' : ''}`}
      style={{ overflowY: 'auto', overflowAnchor: 'auto', height: '100%' }}
      onScroll={onScroll}
    >
      <div className={`premium-content-container premium-content-container--${widthClass}`}>
        
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
              style={{ minHeight: '50vh', paddingBottom: '2rem', contentVisibility: 'auto', containIntrinsicSize: 'auto 1000px' }}
            >
              <ChapterHtml content={ch.content} />
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
