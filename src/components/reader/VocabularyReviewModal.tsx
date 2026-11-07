import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Volume2,
  Download,
  BookOpen,
  CheckCircle2,
  RotateCcw,
  BookA,
  Layers,
  Trash2,
  Search,
  ExternalLink,
  ChevronRight,
  GraduationCap,
  Award,
  Flame,
  Sparkles,
} from 'lucide-react';
import { useVocabularyStore } from '@/store/vocabularyStore';
import type { VocabularyWord } from '@/lib/tauri';
import { useReadingSettings, READER_THEME_COLORS } from '@/store/premiumReaderStore';
import { useToastStore } from '@/store/toastStore';
import { cn } from '@/lib/utils';
import { parseDictionaryDefinition } from '@/lib/dictionaryFormatter';

interface VocabularyReviewModalProps {
  bookId?: number;
  bookTitle?: string;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Highlights the target vocabulary word inside the quoted in-book context sentence
 */
function renderHighlightedSentence(sentence: string, targetWord?: string) {
  if (!sentence) return null;
  if (!targetWord) return sentence;

  const clean = targetWord.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!clean) return sentence;

  // Match target word with common suffixes (e.g. "whether", "running", "looked")
  const regex = new RegExp(`(\\b${clean}(?:s|ed|ing|ly)?\\b)`, 'gi');
  const parts = sentence.split(regex);

  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <span
            key={i}
            className="text-[var(--ui-focus)] font-bold underline decoration-[var(--ui-focus)]/40 underline-offset-4"
          >
            {part}
          </span>
        ) : (
          part
        )
      )}
    </>
  );
}

/**
 * Formatted dictionary definition view that splits Wiktionary/Webster/Dict
 * part-of-speech blocks into clean tags and numbered bullet senses.
 */
function FormattedDefinitionView({ rawDefinition }: { rawDefinition: string }) {
  const sections = parseDictionaryDefinition(rawDefinition);

  if (sections.length === 0) {
    return <span className="opacity-75 italic text-xs">No definition available.</span>;
  }

  return (
    <div className="space-y-3.5 select-text">
      {sections.map((sec, secIdx) => (
        <div key={secIdx} className="space-y-1.5">
          {sec.partOfSpeech && (
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-[var(--ui-focus)]/12 text-[var(--ui-focus)] border border-[var(--ui-focus)]/25">
                {sec.partOfSpeech}
              </span>
              <div className="h-px flex-1 bg-[color-mix(in_srgb,var(--ui-border)_50%,transparent)]" />
            </div>
          )}
          <div className="space-y-1.5 pl-0.5">
            {sec.senses.map((sense, senseIdx) => (
              <div
                key={senseIdx}
                className="flex items-start gap-2.5 text-xs sm:text-sm leading-relaxed text-[var(--text-primary)]"
              >
                {sec.senses.length > 1 && (
                  <span className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-mono font-semibold bg-[color-mix(in_srgb,var(--text-primary)_8%,var(--bg-secondary))] text-[var(--text-secondary)] shrink-0 mt-0.5 border border-[color-mix(in_srgb,var(--ui-border)_60%,transparent)]">
                    {senseIdx + 1}
                  </span>
                )}
                <span className="flex-1 font-serif text-[13.5px] sm:text-[14.5px] leading-relaxed">
                  {sense}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function VocabularyReviewModal({
  bookId,
  bookTitle,
  isOpen,
  onClose,
}: VocabularyReviewModalProps) {
  const readerTheme = useReadingSettings((s) => s.theme);
  const themeVars = (READER_THEME_COLORS[readerTheme] || READER_THEME_COLORS.paper) as React.CSSProperties;

  const {
    dueWords,
    words,
    stats,
    isLoading,
    reviewIndex,
    showAnswer,
    isReviewCompleted,
    loadDueWords,
    loadWords,
    loadStats,
    submitReview,
    deleteWord,
    exportAnki,
    setShowAnswer,
    resetReview,
  } = useVocabularyStore();

  const [activeTab, setActiveTab] = useState<'review' | 'deck'>('review');
  const [searchTerm, setSearchTerm] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      void loadDueWords(bookId);
      void loadWords(bookId);
      void loadStats(bookId);
    }
  }, [isOpen, bookId, loadDueWords, loadWords, loadStats]);

  const currentCard: VocabularyWord | undefined = dueWords[reviewIndex];

  const handleSpeak = useCallback((text: string) => {
    if (!text || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(utterance);
  }, []);

  const handleGrade = async (grade: number) => {
    if (!currentCard) return;
    await submitReview(currentCard.id, grade);
  };

  const handleExportAnki = async () => {
    setIsExporting(true);
    try {
      const tsv = await exportAnki(bookId);
      const blob = new Blob([tsv], { type: 'text/tab-separated-values;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `shiori-vocabulary-${bookTitle ? bookTitle.replace(/[^a-zA-Z0-9_-]/g, '_') : 'deck'}.tsv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      useToastStore.getState().addToast({
        title: 'Exported for Anki',
        description: 'TSV file ready for 1-click Anki import',
        variant: 'success',
        duration: 3000,
      });
    } catch (err) {
      useToastStore.getState().addToast({
        title: 'Export failed',
        description: String(err),
        variant: 'error',
      });
    } finally {
      setIsExporting(false);
    }
  };

  // Keyboard shortcut listener for review (Space to flip, 1-4 for grading)
  useEffect(() => {
    if (!isOpen || activeTab !== 'review' || !currentCard || isReviewCompleted) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === 'Space') {
        e.preventDefault();
        setShowAnswer(!showAnswer);
      } else if (showAnswer) {
        if (e.key === '1') {
          e.preventDefault();
          void handleGrade(1);
        } else if (e.key === '2') {
          e.preventDefault();
          void handleGrade(2);
        } else if (e.key === '3') {
          e.preventDefault();
          void handleGrade(3);
        } else if (e.key === '4') {
          e.preventDefault();
          void handleGrade(4);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, activeTab, currentCard, showAnswer, isReviewCompleted, setShowAnswer]);

  const filteredWords = words.filter(
    (w) =>
      w.word.toLowerCase().includes(searchTerm.toLowerCase()) ||
      w.definition.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (w.reading && w.reading.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div
        data-reader-theme={readerTheme}
        style={themeVars}
        onClick={onClose}
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/90 backdrop-blur-md font-sans select-none"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="relative flex flex-col w-full max-w-2xl max-h-[90vh] bg-[var(--bg-elevated)] border border-[color-mix(in_srgb,var(--ui-border)_80%,transparent)] rounded-2xl shadow-2xl overflow-hidden text-[var(--text-primary)] isolate"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-[color-mix(in_srgb,var(--ui-border)_70%,transparent)] bg-[var(--bg-secondary)] shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-[color-mix(in_srgb,var(--ui-focus)_12%,var(--bg-secondary))] text-[var(--ui-focus)] border border-[color-mix(in_srgb,var(--ui-focus)_25%,transparent)] shrink-0 shadow-2xs">
                <BookA size={18} strokeWidth={2.2} />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-bold leading-tight truncate">
                  Vocabulary Deck & Spaced Repetition
                </h3>
                <p className="text-xs text-[var(--text-tertiary)] truncate mt-0.5">
                  {bookTitle ? `Book: ${bookTitle}` : 'All Saved Vocabulary'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleExportAnki}
                disabled={isExporting || words.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[color-mix(in_srgb,var(--text-primary)_6%,var(--bg-secondary))] hover:bg-[color-mix(in_srgb,var(--text-primary)_10%,var(--bg-secondary))] text-[var(--text-primary)] border border-[color-mix(in_srgb,var(--ui-border)_75%,transparent)] transition-all cursor-pointer disabled:opacity-40 shadow-2xs active:scale-[0.98]"
                title="Export directly to Anki TSV format"
              >
                <Download size={13} strokeWidth={2.2} />
                <span className="hidden sm:inline">Anki Export</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full flex items-center justify-center bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)] hover:bg-[color-mix(in_srgb,var(--text-primary)_12%,transparent)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer active:scale-95"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Navigation Tabs (Deep Inset Pill Switcher matching TranslationPopup) */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 sm:px-6 py-3 border-b border-[color-mix(in_srgb,var(--ui-border)_60%,transparent)] bg-[var(--bg-primary)] shrink-0">
            {/* Local Segmented Control Switcher */}
            <div className="relative grid grid-cols-2 p-1 bg-[color-mix(in_srgb,var(--text-primary)_8%,var(--bg-secondary))] border border-[color-mix(in_srgb,var(--ui-border)_75%,transparent)] rounded-2xl h-10 w-full sm:w-[320px] shadow-[inset_0_2px_4px_rgba(0,0,0,0.1)]">
              <motion.div
                className="absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-xl bg-gradient-to-b from-[var(--ui-focus)] via-[var(--ui-focus)] to-[color-mix(in_srgb,var(--ui-focus)_88%,black)] shadow-[0_2px_8px_rgba(0,0,0,0.22),0_1px_3px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.3)] border-t border-white/25 z-0 pointer-events-none"
                initial={false}
                animate={{ x: activeTab === 'review' ? '0%' : '100%' }}
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              />

              <button
                type="button"
                onClick={() => setActiveTab('review')}
                className={cn(
                  'relative z-10 flex items-center justify-center gap-1.5 h-full text-xs font-bold rounded-xl transition-colors duration-200 cursor-pointer select-none px-3',
                  activeTab === 'review'
                    ? '!text-white font-extrabold drop-shadow-[0_1px_1px_rgba(0,0,0,0.25)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                )}
              >
                <BookA size={14} strokeWidth={2.2} />
                <span>Daily Review ({dueWords.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('deck')}
                className={cn(
                  'relative z-10 flex items-center justify-center gap-1.5 h-full text-xs font-bold rounded-xl transition-colors duration-200 cursor-pointer select-none px-3',
                  activeTab === 'deck'
                    ? '!text-white font-extrabold drop-shadow-[0_1px_1px_rgba(0,0,0,0.25)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                )}
              >
                <Layers size={14} strokeWidth={2.4} />
                <span>All Cards ({words.length})</span>
              </button>
            </div>

            {/* Deck Summary Stats */}
            {stats && (
              <div className="flex items-center gap-3 text-[11px] text-[var(--text-tertiary)] self-end sm:self-center font-medium">
                <span className="flex items-center gap-1">
                  Due:
                  <strong className="text-[var(--ui-focus)] font-mono font-bold">
                    {stats.dueToday}
                  </strong>
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  Learned:
                  <strong className="text-emerald-500 font-mono font-bold">
                    {stats.learned}
                  </strong>
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  Total:
                  <strong className="font-mono text-[var(--text-primary)] font-bold">
                    {stats.totalCards}
                  </strong>
                </span>
              </div>
            )}
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 min-h-[390px] flex flex-col justify-center">
            {activeTab === 'review' ? (
              isLoading ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-[var(--text-tertiary)]">
                  <div className="w-8 h-8 border-2 border-[var(--ui-focus)] border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm">Loading review cards...</p>
                </div>
              ) : isReviewCompleted || !currentCard ? (
                <div className="flex flex-col items-center justify-center text-center py-10 px-4">
                  <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/15 text-emerald-500 mb-4 shadow-lg shadow-emerald-500/10 border border-emerald-500/25">
                    <Award size={36} strokeWidth={2.2} />
                  </div>
                  <h4 className="text-xl font-bold mb-1.5 text-[var(--text-primary)]">
                    Queue Cleared!
                  </h4>
                  <p className="text-sm text-[var(--text-secondary)] max-w-md mb-6 leading-relaxed">
                    You've reviewed all scheduled vocabulary cards for today. Consistent spaced repetition transforms passive reading into active fluency.
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        resetReview();
                        void loadDueWords(bookId);
                      }}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-[color-mix(in_srgb,var(--text-primary)_6%,var(--bg-secondary))] hover:bg-[color-mix(in_srgb,var(--text-primary)_12%,var(--bg-secondary))] text-[var(--text-primary)] border border-[color-mix(in_srgb,var(--ui-border)_70%,transparent)] transition-all cursor-pointer shadow-2xs"
                    >
                      <RotateCcw size={14} />
                      <span>Review Deck Again</span>
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-5 py-2 rounded-xl text-xs font-bold bg-gradient-to-b from-[var(--ui-focus)] via-[var(--ui-focus)] to-[color-mix(in_srgb,var(--ui-focus)_88%,black)] text-white hover:brightness-105 transition-all cursor-pointer shadow-md border-t border-white/20"
                    >
                      Continue Reading
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col h-full justify-between gap-5">
                  {/* Progress indicator */}
                  <div className="flex items-center justify-between text-xs text-[var(--text-tertiary)]">
                    <span className="font-medium">
                      Card {reviewIndex + 1} of {dueWords.length}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-[color-mix(in_srgb,var(--text-primary)_6%,var(--bg-secondary))] border border-[color-mix(in_srgb,var(--ui-border)_60%,transparent)] font-mono text-[11px] text-[var(--text-secondary)]">
                      Ease: {currentCard.easeFactor.toFixed(1)}x • Reps: {currentCard.reps}
                    </span>
                  </div>

                  {/* Flashcard container */}
                  <div
                    className={cn(
                      'relative flex flex-col p-6 rounded-2xl border transition-all cursor-pointer select-text shadow-md',
                      showAnswer
                        ? 'bg-[var(--bg-elevated)] border-[color-mix(in_srgb,var(--ui-focus)_70%,transparent)] shadow-lg'
                        : 'bg-[var(--bg-elevated)] border-[color-mix(in_srgb,var(--ui-border)_80%,transparent)] hover:border-[color-mix(in_srgb,var(--ui-focus)_50%,transparent)]'
                    )}
                    onClick={() => {
                      if (!showAnswer) setShowAnswer(true);
                    }}
                  >
                    {/* Front: Word & Reading & Context */}
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div>
                        <div className="flex items-baseline gap-3">
                          <h2 className="text-3xl sm:text-4xl font-serif font-black tracking-tight text-[var(--text-primary)]">
                            {currentCard.word}
                          </h2>
                          {currentCard.reading && (
                            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-[var(--ui-focus)]/10 text-[var(--ui-focus)] border border-[var(--ui-focus)]/20">
                              /{currentCard.reading}/
                            </span>
                          )}
                        </div>
                        {currentCard.chapterTitle && (
                          <span className="inline-block text-[11px] font-medium text-[var(--text-tertiary)] mt-1">
                            Source: {currentCard.chapterTitle}
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSpeak(currentCard.cleanWord || currentCard.word);
                        }}
                        className="w-9 h-9 rounded-xl flex items-center justify-center bg-[color-mix(in_srgb,var(--text-primary)_6%,var(--bg-secondary))] hover:bg-[color-mix(in_srgb,var(--text-primary)_12%,var(--bg-secondary))] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[color-mix(in_srgb,var(--ui-border)_60%,transparent)] transition-all cursor-pointer shadow-2xs active:scale-95"
                        title="Pronounce word"
                      >
                        <Volume2 size={16} />
                      </button>
                    </div>

                    {/* In-Book Sentence Context with highlighted target word */}
                    {currentCard.sentenceContext && (
                      <div className="p-4 rounded-xl bg-[color-mix(in_srgb,var(--text-primary)_3%,var(--bg-secondary))] border border-[color-mix(in_srgb,var(--ui-border)_60%,transparent)] border-l-4 border-l-[var(--ui-focus)] text-sm sm:text-base font-serif italic leading-relaxed text-[var(--text-primary)] shadow-2xs">
                        <span className="text-[var(--ui-focus)] font-sans font-bold not-italic mr-1.5 text-base">“</span>
                        {renderHighlightedSentence(currentCard.sentenceContext, currentCard.cleanWord || currentCard.word)}
                        <span className="text-[var(--ui-focus)] font-sans font-bold not-italic ml-1.5 text-base">”</span>
                      </div>
                    )}

                    {/* Back: Revealed Formatted Definition */}
                    <AnimatePresence>
                      {showAnswer && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                          className="mt-5 pt-4 border-t border-[color-mix(in_srgb,var(--ui-border)_60%,transparent)] overflow-hidden"
                        >
                          <FormattedDefinitionView rawDefinition={currentCard.definition} />
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {!showAnswer && (
                      <div className="mt-4 pt-3 text-center border-t border-dashed border-[color-mix(in_srgb,var(--ui-border)_45%,transparent)] text-xs text-[var(--text-tertiary)] flex items-center justify-center gap-1.5">
                        <span>Click card or press</span>
                        <kbd className="px-2 py-0.5 rounded-md bg-[color-mix(in_srgb,var(--text-primary)_8%,var(--bg-secondary))] border border-[color-mix(in_srgb,var(--ui-border)_60%,transparent)] font-mono text-[10px] text-[var(--text-secondary)] shadow-2xs font-semibold">
                          Space
                        </kbd>
                        <span>to reveal definition</span>
                      </div>
                    )}
                  </div>

                  {/* Actions / Grading Controls */}
                  <div className="pt-2">
                    {showAnswer ? (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
                        {/* 1: Again */}
                        <button
                          type="button"
                          onClick={() => void handleGrade(1)}
                          className="group relative flex flex-col items-center justify-center py-3 px-3 rounded-2xl bg-rose-500/10 hover:bg-rose-500/18 text-rose-600 dark:text-rose-400 border border-rose-500/30 hover:border-rose-500/50 transition-all cursor-pointer shadow-2xs active:scale-[0.97]"
                        >
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-xs sm:text-sm font-bold tracking-tight">Again</span>
                            <kbd className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded-md bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/25">
                              1
                            </kbd>
                          </div>
                          <span className="text-[10px] font-mono text-rose-500/80 font-medium">&lt; 1 day</span>
                        </button>

                        {/* 2: Hard */}
                        <button
                          type="button"
                          onClick={() => void handleGrade(2)}
                          className="group relative flex flex-col items-center justify-center py-3 px-3 rounded-2xl bg-amber-500/10 hover:bg-amber-500/18 text-amber-600 dark:text-amber-400 border border-amber-500/30 hover:border-amber-500/50 transition-all cursor-pointer shadow-2xs active:scale-[0.97]"
                        >
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-xs sm:text-sm font-bold tracking-tight">Hard</span>
                            <kbd className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded-md bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/25">
                              2
                            </kbd>
                          </div>
                          <span className="text-[10px] font-mono text-amber-500/80 font-medium">1 day</span>
                        </button>

                        {/* 3: Good (Recommended / Highlighted) */}
                        <button
                          type="button"
                          onClick={() => void handleGrade(3)}
                          className="group relative flex flex-col items-center justify-center py-3 px-3 rounded-2xl bg-gradient-to-b from-emerald-500/15 via-emerald-500/12 to-emerald-500/8 hover:from-emerald-500/25 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 hover:border-emerald-500/70 transition-all cursor-pointer shadow-xs active:scale-[0.97] ring-1 ring-emerald-500/20"
                        >
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-xs sm:text-sm font-bold tracking-tight">Good</span>
                            <kbd className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded-md bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                              3
                            </kbd>
                          </div>
                          <span className="text-[10px] font-mono text-emerald-500/90 font-medium">3 days</span>
                        </button>

                        {/* 4: Easy */}
                        <button
                          type="button"
                          onClick={() => void handleGrade(4)}
                          className="group relative flex flex-col items-center justify-center py-3 px-3 rounded-2xl bg-sky-500/10 hover:bg-sky-500/18 text-sky-600 dark:text-sky-400 border border-sky-500/30 hover:border-sky-500/50 transition-all cursor-pointer shadow-2xs active:scale-[0.97]"
                        >
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-xs sm:text-sm font-bold tracking-tight">Easy</span>
                            <kbd className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded-md bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-500/25">
                              4
                            </kbd>
                          </div>
                          <span className="text-[10px] font-mono text-sky-500/80 font-medium">7 days</span>
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowAnswer(true)}
                        className="w-full py-3.5 rounded-xl bg-gradient-to-b from-[var(--ui-focus)] via-[var(--ui-focus)] to-[color-mix(in_srgb,var(--ui-focus)_88%,black)] text-white font-bold text-sm tracking-wide shadow-md hover:brightness-105 active:scale-[0.99] transition-all cursor-pointer border-t border-white/20"
                      >
                        Show Answer
                      </button>
                    )}
                  </div>
                </div>
              )
            ) : (
              /* All Cards Deck Tab */
              <div className="flex flex-col h-full gap-3">
                <div className="relative">
                  <Search
                    size={14}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]"
                  />
                  <input
                    type="text"
                    placeholder="Search vocabulary words or definitions..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[color-mix(in_srgb,var(--ui-border)_70%,transparent)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--ui-focus)] transition-colors shadow-2xs"
                  />
                </div>

                {filteredWords.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-[var(--text-tertiary)] text-sm">
                    <p>No vocabulary words found.</p>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[460px]">
                    {filteredWords.map((card) => {
                      const parsed = parseDictionaryDefinition(card.definition);
                      const primaryPos = parsed.find((p) => p.partOfSpeech)?.partOfSpeech;
                      const primarySense = parsed[0]?.senses[0] || card.definition;

                      return (
                        <div
                          key={card.id}
                          className="flex items-start justify-between gap-3 p-4 rounded-xl bg-[var(--bg-secondary)] border border-[color-mix(in_srgb,var(--ui-border)_65%,transparent)] hover:border-[color-mix(in_srgb,var(--ui-focus)_50%,transparent)] transition-colors shadow-2xs"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2 mb-1">
                              <span className="font-serif font-bold text-base text-[var(--text-primary)]">
                                {card.word}
                              </span>
                              {card.reading && (
                                <span className="text-xs font-mono font-semibold text-[var(--ui-focus)]">
                                  /{card.reading}/
                                </span>
                              )}
                              <span className="text-[10px] font-mono text-[var(--text-tertiary)]">
                                • Due: {card.dueDate}
                              </span>
                            </div>

                            {card.sentenceContext && (
                              <p className="text-xs text-[var(--text-secondary)] italic mb-1.5 line-clamp-2 font-serif">
                                "{card.sentenceContext}"
                              </p>
                            )}

                            <div className="flex items-baseline gap-1.5 mt-0.5">
                              {primaryPos && (
                                <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded bg-[var(--ui-focus)]/10 text-[var(--ui-focus)] shrink-0">
                                  {primaryPos}
                                </span>
                              )}
                              <p className="text-xs text-[var(--text-primary)] line-clamp-2 font-serif opacity-90 leading-relaxed">
                                {primarySense}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleSpeak(card.cleanWord || card.word)}
                              className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,var(--bg-secondary))] transition-colors cursor-pointer"
                              title="Pronounce"
                            >
                              <Volume2 size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => void deleteWord(card.id)}
                              className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                              title="Delete card"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
