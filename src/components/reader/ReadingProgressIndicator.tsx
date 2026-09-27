import { useEffect, useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/lib/tauri';
import { Clock, BookOpen, Timer, Hourglass, Percent } from 'lucide-react';
import type { BookReadingStats } from '@/lib/tauri';
import { 
  type ReadoutMode, 
  READOUT_MODES, 
  getStoredReadoutMode, 
  setStoredReadoutMode, 
  getStoredWpm, 
  recordReadingSample,
  calculateMinutesLeft, 
  formatTimeRemaining 
} from '@/lib/readingPacing';
import { ReaderTooltip } from './ReaderTooltip';
import { hapticTick } from '@/lib/haptics';

interface ReadingProgressIndicatorProps {
  bookId: number;
  progressPercentage: number;
  isVisible?: boolean;
  chapterWordCount?: number;
  chapterProgress?: number; // 0 to 1 fraction within current chapter
  totalChapters?: number;
  currentChapterIndex?: number;
  totalBookWords?: number;
}

export function ReadingProgressIndicator({
  bookId,
  progressPercentage,
  isVisible = true,
  chapterWordCount = 0,
  chapterProgress = 0,
  totalChapters = 1,
  currentChapterIndex = 0,
  totalBookWords = 0,
}: ReadingProgressIndicatorProps) {
  const [initialStats, setInitialStats] = useState<BookReadingStats | null>(null);
  const [sessionMinutes, setSessionMinutes] = useState(0);
  const [mode, setMode] = useState<ReadoutMode>(getStoredReadoutMode);
  const [wpm, setWpm] = useState<number>(getStoredWpm);

  // Fetch initial total reading stats
  useEffect(() => {
    let mounted = true;
    api.getBookReadingStats(bookId)
      .then(stats => {
        if (mounted) setInitialStats(stats);
      })
      .catch(() => {});

    // Active session minute ticker
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        setSessionMinutes(m => {
          const next = m + 1;
          // Record passive reading pacing sample if we have chapter word count
          if (chapterWordCount > 50) {
            const estimatedWordsRead = Math.round(chapterWordCount * Math.min(1, Math.max(0.05, chapterProgress)));
            setWpm(recordReadingSample(estimatedWordsRead, next * 60));
          }
          return next;
        });
      }
    }, 60000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [bookId, chapterWordCount, chapterProgress]);

  // Dynamic pacing calculations
  const { chapterMinutesLeft, bookMinutesLeft } = useMemo(() => {
    // 1. Chapter time left
    const effectiveChapterWords = chapterWordCount > 0 ? chapterWordCount : 1800;
    const clampedChapterProgress = Math.min(1, Math.max(0, chapterProgress));
    const remainingChapterWords = Math.max(0, Math.round(effectiveChapterWords * (1 - clampedChapterProgress)));
    const chMins = calculateMinutesLeft(remainingChapterWords, wpm);

    // 2. Book time left
    let remainingBookWords = 0;
    const clampedOverallProgress = Math.min(1, Math.max(0, progressPercentage / 100));

    if (totalBookWords > 0) {
      remainingBookWords = Math.max(0, Math.round(totalBookWords * (1 - clampedOverallProgress)));
    } else if (totalChapters > 0) {
      const avgWordsPerChapter = chapterWordCount > 0 ? chapterWordCount : 2200;
      const estimatedTotalBookWords = avgWordsPerChapter * totalChapters;
      remainingBookWords = Math.max(0, Math.round(estimatedTotalBookWords * (1 - clampedOverallProgress)));
    }

    const bkMins = calculateMinutesLeft(remainingBookWords, wpm);

    return {
      chapterMinutesLeft: chMins,
      bookMinutesLeft: bkMins,
    };
  }, [chapterWordCount, chapterProgress, totalChapters, totalBookWords, progressPercentage, wpm]);

  // Total reading time in minutes
  const totalMinutes = Math.floor(((initialStats?.total_seconds || 0) / 60) + sessionMinutes);

  // Cycle to next readout mode
  const handleCycleMode = useCallback(() => {
    hapticTick();
    const curIdx = READOUT_MODES.indexOf(mode);
    const nextMode = READOUT_MODES[(curIdx + 1) % READOUT_MODES.length];
    setMode(nextMode);
    setStoredReadoutMode(nextMode);
  }, [mode]);

  if (!isVisible) return null;

  // Determine current label, icon, and tooltip description
  let icon = <Clock className="premium-progress-icon" size={13} />;
  let readoutText = '';
  let tooltipText = '';

  switch (mode) {
    case 'chapter':
      icon = <Timer className="premium-progress-icon text-amber-500" size={13} />;
      readoutText = `${formatTimeRemaining(chapterMinutesLeft, true)} left in ch`;
      tooltipText = 'Time left in chapter • Tap to cycle modes';
      break;
    case 'book':
      icon = <BookOpen className="premium-progress-icon text-primary" size={13} />;
      readoutText = `${formatTimeRemaining(bookMinutesLeft, true)} left in book`;
      tooltipText = 'Time left in book • Tap to cycle modes';
      break;
    case 'percent':
      icon = <Percent className="premium-progress-icon text-emerald-500" size={13} />;
      readoutText = `${Math.round(progressPercentage)}% completed`;
      tooltipText = 'Overall progress • Tap to cycle modes';
      break;
    case 'session':
      icon = <Hourglass className="premium-progress-icon text-rose-500" size={13} />;
      readoutText = `${sessionMinutes}m session (${totalMinutes}m total)`;
      tooltipText = 'Session reading time • Tap to cycle modes';
      break;
  }

  return (
    <ReaderTooltip content={tooltipText} side="top">
      <motion.button
        type="button"
        onClick={handleCycleMode}
        whileHover={{ scale: 1.03, y: -1 }}
        whileTap={{ scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 420, damping: 25 }}
        className="premium-reading-progress-indicator select-none group"
        aria-label={tooltipText}
      >
        <span className="premium-progress-icon-bubble">
          {icon}
        </span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={mode}
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            transition={{ duration: 0.15 }}
            className="premium-progress-text tabular-nums text-xs font-semibold tracking-tight"
          >
            {readoutText}
          </motion.span>
        </AnimatePresence>
      </motion.button>
    </ReaderTooltip>
  );
}
