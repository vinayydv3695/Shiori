import React, { useState, useMemo } from 'react';
import { useReadingSettings } from '@/store/premiumReaderStore';

export interface RhythmChapter {
  index: number;
  title: string;
}

interface ReaderMarginRhythmBeadsProps {
  chapters?: RhythmChapter[];
  currentIndex: number;
  totalChapters?: number;
  onNavigateToChapter?: (index: number) => void;
}

export const ReaderMarginRhythmBeads: React.FC<ReaderMarginRhythmBeadsProps> = ({
  chapters,
  currentIndex,
  totalChapters,
  onNavigateToChapter,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const theme = useReadingSettings((s) => s.theme);
  const total = Math.max(1, totalChapters ?? chapters?.length ?? 1);

  // Group chapters if there are many (e.g. max 32 beads displayed)
  const displayBeads = useMemo(() => {
    const maxBeads = 32;
    if (total <= maxBeads) {
      return Array.from({ length: total }, (_, i) => ({
        index: i,
        title: chapters?.[i]?.title || `Chapter ${i + 1}`,
      }));
    }

    // Evenly sample `maxBeads` chapters across the entire book
    const sampled: Array<{ index: number; title: string }> = [];
    for (let b = 0; b < maxBeads; b++) {
      const targetChapter = Math.min(total - 1, Math.round((b / (maxBeads - 1)) * (total - 1)));
      sampled.push({
        index: targetChapter,
        title: chapters?.[targetChapter]?.title || `Chapter ${targetChapter + 1}`,
      });
    }
    return sampled;
  }, [total, chapters]);

  return (
    <nav
      className={`reader-rhythm-track theme-${theme}`}
      aria-label="Margin Chapter Rhythm Track"
    >
      <div className="reader-rhythm-spine" />
      <div className="reader-rhythm-beads-list">
        {displayBeads.map((bead) => {
          const isCurrent = bead.index === currentIndex;
          const isRead = bead.index < currentIndex;
          const isHovered = hoveredIdx === bead.index;

          return (
            <div
              key={`rhythm-bead-${bead.index}`}
              className="reader-rhythm-bead-anchor"
              onMouseEnter={() => setHoveredIdx(bead.index)}
              onMouseLeave={() => setHoveredIdx(null)}
              onClick={(e) => {
                e.stopPropagation();
                onNavigateToChapter?.(bead.index);
              }}
            >
              <button
                type="button"
                className={`reader-rhythm-bead ${isCurrent ? 'reader-rhythm-bead--active' : isRead ? 'reader-rhythm-bead--read' : 'reader-rhythm-bead--unread'}`}
                aria-label={`Jump to ${bead.title}`}
              >
                {isCurrent && <span className="reader-rhythm-bead-pulse" />}
              </button>

              {isHovered && (
                <div className="reader-rhythm-tooltip">
                  <div className="text-[11px] font-semibold text-foreground truncate max-w-[180px]">
                    {bead.title}
                  </div>
                  <div className="text-[9px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                    <span>Ch. {bead.index + 1} of {total}</span>
                    <span>•</span>
                    <span>{isCurrent ? 'Current' : isRead ? 'Read' : 'Upcoming'}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
};
