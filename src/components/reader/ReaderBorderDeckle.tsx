import React, { useState } from 'react';
import { useReadingSettings } from '@/store/premiumReaderStore';

interface ReaderBorderDeckleProps {
  currentIndex: number;
  totalChapters: number;
  onNavigateToChapter?: (index: number) => void;
  chapterTitle?: string;
}

export const ReaderBorderDeckle: React.FC<ReaderBorderDeckleProps> = ({
  currentIndex,
  totalChapters,
  onNavigateToChapter,
}) => {
  const [hoverSide, setHoverSide] = useState<'left' | 'right' | null>(null);
  const theme = useReadingSettings((s) => s.theme);

  const safeTotal = Math.max(1, totalChapters);
  const readFraction = safeTotal > 1 ? currentIndex / (safeTotal - 1) : 0;
  const remainingFraction = 1 - readFraction;

  // Physical stack thicknesses in px (between 4px and 26px)
  const leftStackWidth = Math.max(4, Math.min(26, Math.round(readFraction * 24) + 4));
  const rightStackWidth = Math.max(4, Math.min(26, Math.round(remainingFraction * 24) + 4));

  // Determine number of visible layered edge slices
  const leftLayersCount = Math.max(2, Math.round(readFraction * 8));
  const rightLayersCount = Math.max(2, Math.round(remainingFraction * 8));

  const handleLeftClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (!onNavigateToChapter || currentIndex <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const ratio = Math.max(0, Math.min(1, clickY / rect.height));
    const targetIdx = Math.floor(ratio * currentIndex);
    onNavigateToChapter(targetIdx);
  };

  const handleRightClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (!onNavigateToChapter || currentIndex >= safeTotal - 1) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const ratio = Math.max(0, Math.min(1, clickY / rect.height));
    const remainingCount = safeTotal - 1 - currentIndex;
    const targetIdx = currentIndex + 1 + Math.floor(ratio * remainingCount);
    onNavigateToChapter(Math.min(safeTotal - 1, targetIdx));
  };

  return (
    <div
      className={`reader-deckle-container theme-${theme}`}
      aria-label="3D Deckled Page Stack"
    >
      {/* Left Deckled Edge (Pages Read) */}
      <div
        className={`reader-deckle-stack reader-deckle-stack--left ${hoverSide === 'left' ? 'reader-deckle-stack--hover' : ''}`}
        style={{ width: `${leftStackWidth}px` }}
        onMouseEnter={() => setHoverSide('left')}
        onMouseLeave={() => setHoverSide(null)}
        onClick={handleLeftClick}
        title={
          currentIndex > 0
            ? `${currentIndex} of ${safeTotal} chapters read (${Math.round(readFraction * 100)}%) — Click to scrub past pages`
            : 'At start of book'
        }
      >
        <div className="reader-deckle-spine-shadow" />
        <div className="reader-deckle-layers">
          {Array.from({ length: leftLayersCount }).map((_, i) => (
            <span
              key={`left-layer-${i}`}
              className="reader-deckle-layer-line"
              style={{
                left: `${(i / leftLayersCount) * (leftStackWidth - 3)}px`,
                opacity: 0.25 + (i / leftLayersCount) * 0.45,
              }}
            />
          ))}
        </div>
        {hoverSide === 'left' && currentIndex > 0 && (
          <div className="reader-deckle-tooltip reader-deckle-tooltip--left">
            <span className="font-semibold">{currentIndex} read</span>
            <span className="text-[10px] opacity-75">Click to scrub</span>
          </div>
        )}
      </div>

      {/* Right Deckled Edge (Pages Remaining) */}
      <div
        className={`reader-deckle-stack reader-deckle-stack--right ${hoverSide === 'right' ? 'reader-deckle-stack--hover' : ''}`}
        style={{ width: `${rightStackWidth}px` }}
        onMouseEnter={() => setHoverSide('right')}
        onMouseLeave={() => setHoverSide(null)}
        onClick={handleRightClick}
        title={
          currentIndex < safeTotal - 1
            ? `${safeTotal - 1 - currentIndex} chapters remaining — Click to scrub forward`
            : 'At final chapter'
        }
      >
        <div className="reader-deckle-spine-shadow reader-deckle-spine-shadow--right" />
        <div className="reader-deckle-layers">
          {Array.from({ length: rightLayersCount }).map((_, i) => (
            <span
              key={`right-layer-${i}`}
              className="reader-deckle-layer-line"
              style={{
                right: `${(i / rightLayersCount) * (rightStackWidth - 3)}px`,
                opacity: 0.25 + (i / rightLayersCount) * 0.45,
              }}
            />
          ))}
        </div>
        {hoverSide === 'right' && currentIndex < safeTotal - 1 && (
          <div className="reader-deckle-tooltip reader-deckle-tooltip--right">
            <span className="font-semibold">{safeTotal - 1 - currentIndex} remaining</span>
            <span className="text-[10px] opacity-75">Click to scrub</span>
          </div>
        )}
      </div>
    </div>
  );
};
