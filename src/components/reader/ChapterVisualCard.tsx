import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { BookOpen, CheckCircle2, Clock, Highlighter, StickyNote } from 'lucide-react';
import type { TocEntry } from '@/lib/tauri';
import { api } from '@/lib/tauri';
import { cn } from '@/lib/utils';

// Shared in-memory cache for chapter snippets across render cycles
const snippetCache = new Map<string, { snippet: string; readingMinutes: number }>();

interface ChapterVisualCardProps {
  entry: TocEntry;
  index: number;
  bookId: number;
  isCurrent: boolean;
  isRead: boolean;
  onClick: (entry: TocEntry) => void;
  annotationCounts?: { highlights: number; notes: number };
}

export function ChapterVisualCard({
  entry,
  index,
  bookId,
  isCurrent,
  isRead,
  onClick,
  annotationCounts,
}: ChapterVisualCardProps) {
  const [data, setData] = useState<{ snippet: string; readingMinutes: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Auto-scroll current chapter card into view
  useEffect(() => {
    if (isCurrent && cardRef.current) {
      cardRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [isCurrent]);

  // Extract chapter index from location
  const chapterMatch = entry.location?.match(/^chapter_(\d+)/) || entry.location?.match(/^chapter:(\d+)/);
  const resolvedIndex = chapterMatch ? parseInt(chapterMatch[1], 10) : index;
  const cacheKey = `${bookId}-${resolvedIndex}`;

  useEffect(() => {
    if (snippetCache.has(cacheKey)) {
      setData(snippetCache.get(cacheKey)!);
      return;
    }

    let isMounted = true;
    api.getBookChapter(bookId, resolvedIndex)
      .then((chap) => {
        if (!isMounted) return;
        const rawHtml = chap?.content || '';
        // Extract clean text preview
        const doc = new DOMParser().parseFromString(rawHtml, 'text/html');
        // Remove style and script tags
        doc.querySelectorAll('script, style').forEach((el) => el.remove());
        const plain = (doc.body.textContent || '').replace(/\s+/g, ' ').trim();

        // Calculate reading minutes
        const words = plain.split(/\s+/).filter(Boolean).length;
        const minutes = Math.max(1, Math.round(words / 220));

        // First 140 chars snippet
        const snippet = plain.slice(0, 140);
        const result = { snippet, readingMinutes: minutes };

        snippetCache.set(cacheKey, result);
        setData(result);
      })
      .catch(() => {
        // Fallback gracefully
        if (isMounted) {
          setData({ snippet: '', readingMinutes: 1 });
        }
      });

    return () => {
      isMounted = false;
    };
  }, [bookId, resolvedIndex, cacheKey]);

  return (
    <motion.div
      ref={cardRef}
      className={cn(
        "group relative p-3.5 rounded-2xl border transition-all duration-200 cursor-pointer select-none",
        isCurrent
          ? "bg-[color-mix(in_srgb,var(--ui-focus)_8%,var(--bg-elevated))] border-[var(--ui-focus)] shadow-md shadow-[color-mix(in_srgb,var(--ui-focus)_15%,transparent)]"
          : "bg-[var(--bg-elevated)] border-[color-mix(in_srgb,var(--ui-border)_70%,transparent)] hover:border-[color-mix(in_srgb,var(--ui-focus)_60%,transparent)] hover:bg-[color-mix(in_srgb,var(--ui-focus)_4%,var(--bg-elevated))] shadow-2xs"
      )}
      onClick={() => onClick(entry)}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.99 }}
    >
      {/* Header: Milestone Index & Status Badge */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md",
              isCurrent
                ? "bg-[var(--ui-focus)] text-white shadow-2xs"
                : "bg-[var(--bg-secondary)] text-[var(--text-tertiary)] border border-[color-mix(in_srgb,var(--ui-border)_50%,transparent)]"
            )}
          >
            Ch. {resolvedIndex + 1}
          </span>
          {isCurrent && (
            <span className="flex items-center gap-1 text-[11px] font-bold text-[var(--ui-focus)]">
              <BookOpen size={12} className="animate-pulse" />
              Reading
            </span>
          )}
        </div>

        {isRead && !isCurrent && (
          <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-500">
            <CheckCircle2 size={12} />
            Read
          </span>
        )}
      </div>

      {/* Chapter Title */}
      <h4
        className={cn(
          "text-sm font-bold font-serif leading-snug line-clamp-2 my-0",
          isCurrent ? "text-[var(--ui-focus)]" : "text-[var(--text-primary)] group-hover:text-[var(--ui-focus)] transition-colors"
        )}
      >
        {entry.label}
      </h4>

      {/* First-line text snippet preview */}
      {data?.snippet ? (
        <p className="text-[12px] font-serif leading-relaxed text-[var(--text-secondary)] line-clamp-2 italic mt-1.5 mb-2 select-text opacity-85">
          "{data.snippet}..."
        </p>
      ) : (
        <div className="h-4 my-1.5" />
      )}

      {/* Footer Metrics & Annotation Pills */}
      <div className="flex items-center justify-between text-[11px] text-[var(--text-tertiary)] pt-1 border-t border-[color-mix(in_srgb,var(--ui-border)_45%,transparent)]">
        <span className="flex items-center gap-1 font-medium">
          <Clock size={11} />
          {data ? `~${data.readingMinutes} min read` : 'Calculating...'}
        </span>

        <div className="flex items-center gap-2">
          {Boolean(annotationCounts?.highlights) && (
            <span className="flex items-center gap-1 font-semibold text-amber-500">
              <Highlighter size={11} />
              {annotationCounts!.highlights}
            </span>
          )}
          {Boolean(annotationCounts?.notes) && (
            <span className="flex items-center gap-1 font-semibold text-blue-500">
              <StickyNote size={11} />
              {annotationCounts!.notes}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
