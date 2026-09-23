import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  History,
  BookOpen,
  X,
  Users,
  ChevronRight,
  ArrowRight,
  Loader2,
  Clock,
  Compass,
} from 'lucide-react';
import {
  useReadingSettings,
  READER_THEME_COLORS,
  applyReaderThemeToElement,
  removeReaderThemeFromElement,
} from '@/store/premiumReaderStore';
import { useAIStore } from '@/store/aiStore';
import {
  getChapterCatchUpData,
  generateAICatchUpRecap,
  type ChapterCatchUpData,
} from '@/lib/catchUpService';
import { ReaderTooltip } from './ReaderTooltip';

interface ChapterCatchUpModalProps {
  bookId: number;
  bookTitle?: string;
  currentChapterIndex: number;
  lastRead?: string;
  isOpen: boolean;
  onClose: () => void;
  onNavigateToChapter: (chapterIndex: number) => void;
}

export function ChapterCatchUpModal({
  bookId,
  bookTitle = 'Book',
  currentChapterIndex,
  lastRead,
  isOpen,
  onClose,
  onNavigateToChapter,
}: ChapterCatchUpModalProps) {
  const [data, setData] = useState<ChapterCatchUpData | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiRecapLoading, setAiRecapLoading] = useState(false);
  const [aiRecapText, setAiRecapText] = useState<string | null>(null);

  const readerTheme = useReadingSettings((s) => s.theme) || 'paper';
  const aiEnabled = useAIStore((s) => s.enabled);
  const modalRef = React.useRef<HTMLDivElement>(null);

  // Apply reader theme to portalled modal
  useEffect(() => {
    const el = modalRef.current;
    if (!el) return;
    applyReaderThemeToElement(el, readerTheme);
    return () => {
      removeReaderThemeFromElement(el);
    };
  }, [readerTheme, isOpen]);

  // Load offline chapter moments on modal open
  useEffect(() => {
    if (!isOpen) {
      setAiRecapText(null);
      return;
    }

    setLoading(true);
    getChapterCatchUpData(bookId, currentChapterIndex, lastRead)
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [bookId, currentChapterIndex, lastRead, isOpen]);

  // Handle Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleGenerateAIRecap = async () => {
    if (!data || aiRecapLoading) return;
    setAiRecapLoading(true);
    try {
      const result = await generateAICatchUpRecap(
        bookTitle,
        data.chapterTitle,
        data.rawExcerpt
      );
      setAiRecapText(result);
    } catch {
      // Ignore
    } finally {
      setAiRecapLoading(false);
    }
  };

  if (!isOpen) return null;

  const themeVars = (READER_THEME_COLORS[readerTheme] || READER_THEME_COLORS.paper) as React.CSSProperties;

  return (
    <div
      ref={modalRef}
      data-reader-theme={readerTheme}
      style={themeVars}
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 bg-black/65 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 14 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-xl max-h-[88vh] flex flex-col rounded-3xl bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[color-mix(in_srgb,var(--ui-border)_85%,transparent)] shadow-2xl overflow-hidden font-sans"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 shrink-0 border-b border-[color-mix(in_srgb,var(--ui-border)_50%,transparent)]">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-xl bg-[color-mix(in_srgb,var(--ui-focus)_12%,transparent)] text-[var(--ui-focus)]">
              <History size={16} />
            </span>
            <div>
              <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-1.5 my-0">
                <span>Previously in {bookTitle}</span>
              </h3>
              <p className="text-[11px] text-[var(--text-tertiary)] m-0">
                Catch up on key moments before continuing
              </p>
            </div>
          </div>

          <ReaderTooltip content="Close (Esc)">
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </ReaderTooltip>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-2.5 text-[var(--text-tertiary)]">
              <Loader2 size={24} className="animate-spin text-[var(--ui-focus)]" />
              <span className="text-xs font-medium">Extracting chapter narrative beats...</span>
            </div>
          ) : data ? (
            <>
              {/* Hiatus Banner */}
              {data.daysSinceRead >= 2 && (
                <div className="p-3 rounded-2xl bg-[color-mix(in_srgb,var(--ui-focus)_10%,var(--bg-secondary))] border border-[color-mix(in_srgb,var(--ui-focus)_30%,transparent)] flex items-center gap-2.5 text-xs text-[var(--text-primary)] font-medium">
                  <Clock size={15} className="text-[var(--ui-focus)] shrink-0" />
                  <span>
                    Welcome back! You last read this book{' '}
                    <strong className="text-[var(--ui-focus)] font-bold">{data.daysSinceRead} days ago</strong>. Here is where the story left off:
                  </span>
                </div>
              )}

              {/* Chapter Title Badge */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-1.5">
                  <Compass size={13} className="text-[var(--ui-focus)]" />
                  Chapter {data.chapterIndex + 1}: {data.chapterTitle}
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)] text-[var(--text-tertiary)]">
                  Previous chapter
                </span>
              </div>

              {/* Active Characters */}
              {data.activeCharacters.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider flex items-center gap-1">
                    <Users size={11} />
                    Active in this Scene
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {data.activeCharacters.map((char) => (
                      <span
                        key={char}
                        className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-[color-mix(in_srgb,var(--text-primary)_8%,var(--bg-secondary))] border border-[color-mix(in_srgb,var(--ui-border)_60%,transparent)] text-[var(--text-primary)]"
                      >
                        {char}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Key Narrative Moments */}
              <div className="space-y-2">
                <span className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider flex items-center gap-1">
                  <Sparkles size={11} className="text-[var(--ui-focus)]" />
                  Key Story Beats
                </span>
                <div className="p-3.5 rounded-2xl bg-[color-mix(in_srgb,var(--bg-secondary)_75%,var(--bg-elevated))] border border-[color-mix(in_srgb,var(--ui-border)_65%,transparent)] shadow-2xs space-y-2.5">
                  <ul className="space-y-2 text-[12.5px] leading-relaxed text-[var(--text-primary)] m-0 pl-0 list-none">
                    {data.keyMoments.map((moment, idx) => (
                      <li key={idx} className="flex items-start gap-2.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--ui-focus)] shrink-0 mt-2 ring-2 ring-[color-mix(in_srgb,var(--ui-focus)_25%,transparent)]" />
                        <span className="flex-1 font-serif">{moment}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Where You Left Off */}
              {data.closingScene && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
                    Where You Left Off
                  </span>
                  <div className="p-3 rounded-2xl bg-[color-mix(in_srgb,var(--bg-secondary)_40%,var(--bg-elevated))] border border-[color-mix(in_srgb,var(--ui-border)_45%,transparent)] text-xs font-serif italic leading-relaxed text-[var(--text-secondary)]">
                    "{data.closingScene}"
                  </div>
                </div>
              )}

              {/* Optional AI Narrative Recap */}
              {aiEnabled && (
                <div className="space-y-2 pt-1 border-t border-[color-mix(in_srgb,var(--ui-border)_40%,transparent)]">
                  {aiRecapText ? (
                    <div className="p-3.5 rounded-2xl bg-[color-mix(in_srgb,var(--ui-focus)_8%,var(--bg-elevated))] border border-[var(--ui-focus)] text-xs leading-relaxed text-[var(--text-primary)] font-serif space-y-2 shadow-xs">
                      <div className="flex items-center justify-between not-italic text-[10px] font-bold text-[var(--ui-focus)] uppercase tracking-wider font-sans">
                        <span className="flex items-center gap-1">
                          <Sparkles size={12} />
                          AI Dramatic Catch-Up
                        </span>
                        <span>Spoiler-free</span>
                      </div>
                      <div className="whitespace-pre-line">{aiRecapText}</div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleGenerateAIRecap}
                      disabled={aiRecapLoading}
                      className="w-full py-2 px-3 rounded-xl bg-[color-mix(in_srgb,var(--ui-focus)_12%,var(--bg-secondary))] hover:bg-[color-mix(in_srgb,var(--ui-focus)_20%,var(--bg-secondary))] border border-[color-mix(in_srgb,var(--ui-focus)_30%,transparent)] text-xs font-semibold text-[var(--ui-focus)] transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {aiRecapLoading ? (
                        <>
                          <Loader2 size={13} className="animate-spin" />
                          <span>Generating AI Dramatic Recap...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles size={13} />
                          <span>Enhance with AI Narrative Recap</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="py-12 text-center text-xs text-[var(--text-tertiary)] italic">
              No previous chapter content found to summarize.
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-[color-mix(in_srgb,var(--ui-border)_50%,transparent)] bg-[color-mix(in_srgb,var(--bg-secondary)_50%,var(--bg-elevated))] shrink-0 gap-2">
          {data && (
            <button
              type="button"
              onClick={() => {
                onNavigateToChapter(data.chapterIndex);
                onClose();
              }}
              className="py-1.5 px-3 rounded-xl bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)] hover:bg-[color-mix(in_srgb,var(--text-primary)_12%,transparent)] text-xs font-semibold text-[var(--text-secondary)] transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <BookOpen size={13} />
              <span>Review Chapter {data.chapterIndex + 1}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="py-1.5 px-4 rounded-xl bg-[var(--ui-focus)] hover:opacity-90 text-white text-xs font-bold transition-opacity flex items-center gap-1.5 cursor-pointer shadow-xs ml-auto"
          >
            <span>Continue Reading</span>
            <ArrowRight size={13} />
          </button>
        </div>
      </motion.div>
    </div>
  );
}
