import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Annotation, AnnotationCategory } from '@/lib/tauri';
import { Highlighter, StickyNote } from 'lucide-react';

interface ReaderMinimapProps {
  containerRef: React.RefObject<HTMLElement | null>;
  annotations: Annotation[];
  categories?: AnnotationCategory[];
  isCurrentChapterBookmarked?: boolean;
  onBookmarkClick?: () => void;
  className?: string;
}

interface MinimapMarker {
  id: string;
  topPercent: number;
  color: string;
  type: 'highlight' | 'note' | 'bookmark';
  label: string;
  previewText: string;
  element: HTMLElement;
}

export function ReaderMinimap({
  containerRef,
  annotations,
  categories = [],
  isCurrentChapterBookmarked = false,
  className = '',
}: ReaderMinimapProps) {
  const [markers, setMarkers] = useState<MinimapMarker[]>([]);
  const [viewportRatio, setViewportRatio] = useState({ topPercent: 0, heightPercent: 15 });
  const [hoveredMarker, setHoveredMarker] = useState<{ marker: MinimapMarker; y: number } | null>(null);
  const railRef = useRef<HTMLDivElement>(null);

  // Recalculate markers by scanning the DOM container
  const updateMarkers = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const scrollHeight = container.scrollHeight;
    if (scrollHeight <= 0) return;

    const newMarkers: MinimapMarker[] = [];
    const marks = container.querySelectorAll<HTMLElement>('mark.epub-highlight, [data-annotation-id]');

    marks.forEach((mark, index) => {
      const annId = mark.dataset.annotationId;
      const ann = annotations.find((a) => String(a.id) === annId);
      const annType = (mark.dataset.annotationType as any) || (ann?.annotationType ?? 'highlight');
      const color = mark.style.getPropertyValue('--highlight-color') || ann?.color || '#fbbf24';

      let label = mark.dataset.categoryName || '';
      if (!label && ann?.categoryId) {
        label = categories.find((c) => c.id === ann.categoryId)?.name || '';
      }
      if (!label) {
        label = annType === 'note' ? 'Note' : 'Highlight';
      }

      const previewText = ann?.noteContent || ann?.selectedText || mark.textContent || '';

      // Compute relative top offset within container
      const topOffset = mark.offsetTop;
      const topPercent = Math.max(0, Math.min(100, (topOffset / scrollHeight) * 100));

      newMarkers.push({
        id: annId ? `ann-${annId}` : `mark-${index}`,
        topPercent,
        color,
        type: annType === 'note' ? 'note' : 'highlight',
        label,
        previewText: previewText.slice(0, 120),
        element: mark,
      });
    });

    setMarkers(newMarkers);
  }, [containerRef, annotations, categories]);

  // Track scroll position to update viewport indicator thumb
  const updateScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    if (scrollHeight <= 0 || clientHeight <= 0) return;

    const totalScrollable = scrollHeight - clientHeight;
    const topPercent = totalScrollable > 0 ? (scrollTop / scrollHeight) * 100 : 0;
    const heightPercent = Math.max(5, Math.min(100, (clientHeight / scrollHeight) * 100));

    setViewportRatio({ topPercent, heightPercent });
  }, [containerRef]);

  // Set up observers & listeners
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    updateMarkers();
    updateScroll();

    container.addEventListener('scroll', updateScroll, { passive: true });
    window.addEventListener('resize', updateMarkers);
    window.addEventListener('resize', updateScroll);

    // Mutation observer to detect DOM changes when chapters load or highlights render
    const observer = new MutationObserver(() => {
      updateMarkers();
      updateScroll();
    });

    observer.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'data-annotation-id'],
    });

    return () => {
      container.removeEventListener('scroll', updateScroll);
      window.removeEventListener('resize', updateMarkers);
      window.removeEventListener('resize', updateScroll);
      observer.disconnect();
    };
  }, [containerRef, updateMarkers, updateScroll]);

  // Re-run on annotations change
  useEffect(() => {
    const timer = setTimeout(updateMarkers, 80);
    return () => clearTimeout(timer);
  }, [annotations, updateMarkers]);

  // Click on rail to jump or scroll
  const handleRailClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rail = railRef.current;
    const container = containerRef.current;
    if (!rail || !container) return;

    const rect = rail.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const percent = Math.max(0, Math.min(1, clickY / rect.height));

    const targetScrollTop = percent * (container.scrollHeight - container.clientHeight);
    container.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
  };

  const handleMarkerClick = (marker: MinimapMarker, e: React.MouseEvent) => {
    e.stopPropagation();
    const container = containerRef.current;
    if (!container || !marker.element) return;

    marker.element.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Flash animation on the highlight
    marker.element.classList.add('epub-highlight--active-pulse');
    setTimeout(() => {
      marker.element.classList.remove('epub-highlight--active-pulse');
    }, 1500);
  };

  return (
    <div
      ref={railRef}
      className={`fixed right-1 sm:right-2 top-20 bottom-16 w-3 sm:w-3.5 z-40 flex flex-col items-center select-none group transition-opacity duration-300 ${className}`}
      onClick={handleRailClick}
      aria-label="Annotation Heatmap & Minimap"
    >
      {/* Background Track Rail */}
      <div className="absolute inset-0 rounded-full bg-[color-mix(in_srgb,var(--bg-elevated)_75%,transparent)] hover:bg-[color-mix(in_srgb,var(--bg-elevated)_90%,transparent)] border border-[color-mix(in_srgb,var(--ui-border)_60%,transparent)] backdrop-blur-xs transition-colors shadow-2xs cursor-pointer" />

      {/* Viewport Thumb */}
      <div
        className="absolute w-full rounded-full bg-[color-mix(in_srgb,var(--ui-focus)_25%,transparent)] group-hover:bg-[color-mix(in_srgb,var(--ui-focus)_35%,transparent)] border border-[color-mix(in_srgb,var(--ui-focus)_50%,transparent)] pointer-events-none transition-all duration-75"
        style={{
          top: `${viewportRatio.topPercent}%`,
          height: `${viewportRatio.heightPercent}%`,
          minHeight: '12px',
        }}
      />

      {/* Bookmark tick (if current chapter is bookmarked) */}
      {isCurrentChapterBookmarked && (
        <div
          className="absolute left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-amber-500 shadow-sm border border-white/60 pointer-events-none z-10"
          style={{ top: '2px' }}
          aria-label="Bookmarked"
        />
      )}

      {/* Annotation Marker Ticks */}
      {markers.map((marker) => (
        <div
          key={marker.id}
          className="absolute left-0 right-0 h-1.5 -translate-y-1/2 rounded-full cursor-pointer transition-transform hover:scale-x-125 z-20 group/marker"
          style={{
            top: `${marker.topPercent}%`,
            backgroundColor: marker.color,
            boxShadow: `0 0 6px ${marker.color}88`,
          }}
          onClick={(e) => handleMarkerClick(marker, e)}
          onMouseEnter={(e) => {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setHoveredMarker({ marker, y: rect.top });
          }}
          onMouseLeave={() => setHoveredMarker(null)}
        />
      ))}

      {/* Hover Floating Preview Card */}
      <AnimatePresence>
        {hoveredMarker && (
          <motion.div
            initial={{ opacity: 0, x: 10, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="fixed right-6 pointer-events-none z-50 max-w-xs p-2.5 rounded-xl shadow-xl backdrop-blur-md border border-[var(--ui-border)] bg-[var(--bg-elevated)] text-xs space-y-1.5"
            style={{ top: Math.max(60, hoveredMarker.y - 20) }}
          >
            <div className="flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs"
                style={{ backgroundColor: hoveredMarker.marker.color }}
              />
              <span className="font-bold text-[var(--text-primary)]">
                {hoveredMarker.marker.label}
              </span>
              <span className="text-[10px] uppercase font-semibold tracking-wider text-[var(--text-tertiary)] flex items-center gap-1 ml-auto">
                {hoveredMarker.marker.type === 'note' ? (
                  <>
                    <StickyNote size={10} /> Note
                  </>
                ) : (
                  <>
                    <Highlighter size={10} /> Highlight
                  </>
                )}
              </span>
            </div>

            {hoveredMarker.marker.previewText && (
              <p className="text-[11px] leading-relaxed text-[var(--text-secondary)] line-clamp-3 italic">
                "{hoveredMarker.marker.previewText}"
              </p>
            )}

            <div className="text-[10px] text-[var(--ui-focus)] font-medium pt-0.5">
              Click to jump
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
