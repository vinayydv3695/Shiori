import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Users, Sparkles, Loader2, BookOpen, Maximize2, X } from 'lucide-react';
import { scanBookCharacters, type TrackedCharacter } from '@/lib/characterTracker';
import { useCharacterPortrait, type CharacterPortrait } from '@/lib/characterImageService';
import { useAIStore } from '@/store/aiStore';
import { getCharacterRecap } from '@/lib/ai/aiClient';
import { useToastStore } from '@/store/toastStore';
import { api } from '@/lib/tauri';
import { ReaderTooltip } from './ReaderTooltip';
import {
  useReadingSettings,
  READER_THEME_COLORS,
  applyReaderThemeToElement,
  removeReaderThemeFromElement,
} from '@/store/premiumReaderStore';

interface CharacterDirectoryPanelProps {
  bookId: number;
  totalChapters: number;
  onNavigateToFirstMention: (chapterIndex: number, characterName: string) => void;
  bookTitle?: string;
}

interface CharacterDetailModalProps {
  char: TrackedCharacter;
  portrait: CharacterPortrait;
  onClose: () => void;
  onNavigateToFirstMention: (chapterIndex: number, characterName: string) => void;
  aiEnabled: boolean;
}

/**
 * Convert character biography text into clean, digestible bullet points.
 */
export function formatDescriptionToPoints(description?: string): string[] {
  if (!description) return [];

  const text = description.trim();
  if (!text) return [];

  // If text already has linebreaks with bullets or distinct items
  if (text.includes('\n')) {
    const rawLines = text
      .split(/\r?\n+/)
      .map((l) => l.replace(/^[\s*•\-–—\d.)]+\s*/, '').trim())
      .filter((l) => l.length >= 8);
    if (rawLines.length >= 2) {
      return rawLines;
    }
  }

  // Protect honorifics, titles, abbreviations, and single initials before sentence splitting
  // e.g. "Monkey D. Dragon", "Dr. Kureha", "Capt. Kid", "Vol. 1"
  const protectedText = text
    .replace(/\b(Mr|Mrs|Ms|Dr|Prof|Capt|Gen|St|vs|Vol|Ch)\.\s+/gi, '$1__DOT__ ')
    .replace(/\b([A-Z])\.\s+(?=[A-Z])/g, '$1__DOT__ ');

  // Split on sentence boundary punctuation: period, exclamation, question mark
  const sentences = protectedText
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“'‘])/g)
    .map((s) => s.replace(/__DOT__/g, '.').trim())
    .map((s) => s.replace(/^[\s*•\-–—\d.)]+\s*/, '').trim())
    .filter((s) => s.length >= 10);

  if (sentences.length >= 2) {
    return sentences;
  }

  return [text];
}

function CharacterDetailModal({
  char,
  portrait,
  onClose,
  onNavigateToFirstMention,
  aiEnabled,
}: CharacterDetailModalProps) {
  const [aiRecapLoading, setAiRecapLoading] = useState(false);
  const [aiRecap, setAiRecap] = useState<string | null>(null);
  const [modalAspectRatio, setModalAspectRatio] = useState<number | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const readerTheme = useReadingSettings((s) => s.theme) || 'paper';

  // Apply reader theme to the portalled modal DOM node
  useEffect(() => {
    const el = modalRef.current;
    if (!el) return;
    applyReaderThemeToElement(el, readerTheme);
    return () => {
      removeReaderThemeFromElement(el);
    };
  }, [readerTheme]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const themeVars = (READER_THEME_COLORS[readerTheme] || READER_THEME_COLORS.paper) as React.CSSProperties;

  const points = useMemo(() => {
    return formatDescriptionToPoints(portrait.description);
  }, [portrait.description]);

  const handleAIRecap = async () => {
    if (aiRecapLoading) return;
    setAiRecapLoading(true);
    try {
      const recap = await getCharacterRecap(char.name);
      setAiRecap(recap);
    } catch (err) {
      useToastStore.getState().addToast({
        title: 'Could not fetch character recap',
        description: String(err),
        variant: 'error',
      });
    } finally {
      setAiRecapLoading(false);
    }
  };

  const modalContent = (
    <div
      ref={modalRef}
      data-reader-theme={readerTheme}
      style={themeVars}
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 bg-black/65 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 12 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg max-h-[90vh] flex flex-col rounded-3xl bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[color-mix(in_srgb,var(--ui-border)_85%,transparent)] shadow-2xl overflow-hidden font-sans"
      >
        {/* Header / Close button */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 shrink-0 border-b border-[color-mix(in_srgb,var(--ui-border)_50%,transparent)]">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold tracking-wider uppercase text-[var(--ui-focus)] flex items-center gap-1.5">
              <Users size={14} />
              Character Dossier
            </span>
            {portrait.source && (
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[color-mix(in_srgb,var(--ui-focus)_12%,var(--bg-secondary))] text-[var(--ui-focus)] border border-[color-mix(in_srgb,var(--ui-focus)_25%,transparent)] capitalize">
                {portrait.source === 'anilist' ? 'AniList' : portrait.source === 'fandom' ? 'Fandom' : 'Wikipedia'}
              </span>
            )}
          </div>
          <ReaderTooltip content="Close (Esc)" side="bottom">
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </ReaderTooltip>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Full Portrait Stage (Adaptive Box Sized to Picture Layout, NO CUTOFF) */}
          {portrait.imageUrl ? (
            <div className="flex justify-center w-full my-1">
              <div
                className="relative rounded-2xl bg-gradient-to-b from-[color-mix(in_srgb,var(--ui-focus)_10%,var(--bg-secondary))] to-[var(--bg-secondary)] border border-[color-mix(in_srgb,var(--ui-border)_65%,transparent)] flex items-center justify-center p-3 shadow-inner overflow-hidden transition-all duration-300"
                style={{
                  maxHeight: '315px',
                  width: modalAspectRatio
                    ? `${Math.min(380, Math.max(160, Math.round(290 * Math.max(0.42, Math.min(1.4, modalAspectRatio)))))}px`
                    : '220px',
                }}
              >
                <img
                  src={portrait.imageUrl}
                  alt={char.name}
                  referrerPolicy="no-referrer"
                  onLoad={(e) => {
                    const { naturalWidth, naturalHeight } = e.currentTarget;
                    if (naturalWidth && naturalHeight) {
                      setModalAspectRatio(naturalWidth / naturalHeight);
                    }
                  }}
                  className="max-h-[290px] w-auto max-w-full object-contain mx-auto drop-shadow-lg select-none"
                />
              </div>
            </div>
          ) : (
            <div
              className="w-full h-32 rounded-2xl flex items-center justify-center text-3xl font-serif font-black select-none text-[var(--text-primary)] shadow-inner"
              style={{ background: char.avatarColor }}
            >
              {char.name.slice(0, 2).toUpperCase()}
            </div>
          )}

          {/* Names and Statistics */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-2xl font-bold font-serif text-[var(--text-primary)] my-0 tracking-tight">
                {char.name}
              </h3>
              {portrait.nativeName && (
                <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] text-[var(--text-secondary)] select-none">
                  {portrait.nativeName}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap text-xs text-[var(--text-secondary)] font-medium">
              <span className="px-2.5 py-1 rounded-xl bg-[color-mix(in_srgb,var(--bg-secondary)_90%,var(--bg-elevated))] border border-[color-mix(in_srgb,var(--ui-border)_50%,transparent)]">
                <strong className="text-[var(--text-primary)] font-semibold">{char.totalMentions}</strong> {char.totalMentions === 1 ? 'mention' : 'mentions'}
              </span>
              <span className="px-2.5 py-1 rounded-xl bg-[color-mix(in_srgb,var(--bg-secondary)_90%,var(--bg-elevated))] border border-[color-mix(in_srgb,var(--ui-border)_50%,transparent)]">
                <strong className="text-[var(--text-primary)] font-semibold">{char.chapters.length}</strong> {char.chapters.length === 1 ? 'chapter' : 'chapters'}
              </span>
              <span className="px-2.5 py-1 rounded-xl bg-[color-mix(in_srgb,var(--bg-secondary)_90%,var(--bg-elevated))] border border-[color-mix(in_srgb,var(--ui-border)_50%,transparent)]">
                First in <strong className="text-[var(--text-primary)] font-semibold">Ch. {char.firstMention.chapterIndex + 1}</strong>
              </span>
            </div>
          </div>

          {/* Description / Biography in Points */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-1.5">
                <Sparkles size={13} className="text-[var(--ui-focus)]" />
                Key Details & Overview
              </h4>
              {points.length > 1 && (
                <span className="text-[10px] font-semibold text-[var(--text-tertiary)] px-2 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)]">
                  {points.length} points
                </span>
              )}
            </div>

            {points.length > 0 ? (
              <div className="p-4 rounded-2xl bg-[color-mix(in_srgb,var(--bg-secondary)_75%,var(--bg-elevated))] border border-[color-mix(in_srgb,var(--ui-border)_65%,transparent)] shadow-2xs">
                <ul className="space-y-3">
                  {points.map((point, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-2.5 text-[12.5px] leading-relaxed text-[var(--text-primary)] font-sans"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--ui-focus)] shrink-0 mt-2 ring-3 ring-[color-mix(in_srgb,var(--ui-focus)_25%,transparent)]" />
                      <span className="flex-1">{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-[var(--bg-secondary)] border border-[color-mix(in_srgb,var(--ui-border)_50%,transparent)] text-xs text-[var(--text-tertiary)] italic flex items-center justify-between gap-2">
                <span>No description available online for this character.</span>
                {aiEnabled && (
                  <button
                    type="button"
                    onClick={handleAIRecap}
                    disabled={aiRecapLoading}
                    className="shrink-0 px-2.5 py-1 rounded-xl text-xs font-semibold bg-[var(--ui-focus)] text-white hover:opacity-90 transition-opacity flex items-center gap-1 cursor-pointer"
                  >
                    {aiRecapLoading ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                    AI Recap
                  </button>
                )}
              </div>
            )}
          </div>

          {/* AI Memory Recall (if triggered) */}
          {aiRecap && (
            <div className="p-3.5 rounded-2xl bg-[color-mix(in_srgb,var(--ui-focus)_10%,var(--bg-elevated))] border border-[var(--ui-focus)] text-xs leading-relaxed text-[var(--text-primary)] font-serif italic space-y-1.5 shadow-xs">
              <div className="flex items-center gap-1.5 text-[var(--ui-focus)] font-bold font-sans not-italic text-[11px]">
                <Sparkles size={12} /> AI Memory Recall:
              </div>
              <p className="my-0 leading-relaxed">{aiRecap}</p>
            </div>
          )}

          {/* Book Introduction Quote */}
          {char.firstMention?.sentenceSnippet && (
            <div className="space-y-1.5 pt-1">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-1.5">
                <BookOpen size={12} className="text-[var(--ui-focus)]" />
                First Mention in Book
              </h4>
              <div className="relative p-3.5 rounded-2xl bg-[color-mix(in_srgb,var(--bg-secondary)_70%,var(--bg-elevated))] border-l-4 border-[var(--ui-focus)] border-y border-r border-[color-mix(in_srgb,var(--ui-border)_50%,transparent)] text-xs leading-relaxed text-[var(--text-primary)] font-serif italic shadow-2xs">
                “{char.firstMention.sentenceSnippet.replace(/^[\s"“'‘]+|[\s"”'’]+$/g, '')}”
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 shrink-0 border-t border-[color-mix(in_srgb,var(--ui-border)_50%,transparent)] bg-[color-mix(in_srgb,var(--bg-secondary)_50%,var(--bg-elevated))] flex items-center justify-between gap-3">
          {aiEnabled && (
            <button
              type="button"
              onClick={handleAIRecap}
              disabled={aiRecapLoading}
              className="text-xs text-[var(--ui-focus)] hover:underline flex items-center gap-1.5 font-semibold cursor-pointer disabled:opacity-50"
            >
              {aiRecapLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              {aiRecap ? 'Regenerate Recap' : `Ask AI about ${char.name}`}
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              onNavigateToFirstMention(char.firstMention.chapterIndex, char.name);
              onClose();
            }}
            className="px-4 py-2.5 rounded-xl text-xs font-bold bg-[var(--ui-focus)] text-white hover:opacity-90 shadow-sm transition-all cursor-pointer flex items-center gap-2 ml-auto active:scale-98"
          >
            <BookOpen size={13} />
            Jump to First Mention (Ch. {char.firstMention.chapterIndex + 1})
          </button>
        </div>
      </motion.div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : null;
}

function CharacterItem({
  char,
  bookTitle,
  aiEnabled,
  aiRecapLoading,
  onAIRecap,
  onNavigateToFirstMention,
  onOpenDetail,
}: {
  char: TrackedCharacter;
  bookTitle?: string;
  aiEnabled: boolean;
  aiRecapLoading: boolean;
  onAIRecap: (name: string, e: React.MouseEvent) => void;
  onNavigateToFirstMention: (chapterIndex: number, characterName: string) => void;
  onOpenDetail: (char: TrackedCharacter, portrait: CharacterPortrait) => void;
}) {
  const { portrait, isLoading: isPortraitLoading } = useCharacterPortrait(
    char.name,
    char.firstMention?.sentenceSnippet,
    bookTitle
  );
  const [imageError, setImageError] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);

  const containerStyle = useMemo(() => {
    if (!aspectRatio) return { width: '48px', height: '52px' };
    const clampedRatio = Math.max(0.48, Math.min(1.35, aspectRatio));
    const width = Math.round(52 * clampedRatio);
    return {
      width: `${Math.max(30, Math.min(68, width))}px`,
      height: '52px',
    };
  }, [aspectRatio]);

  const getInitials = (name: string): string => {
    const parts = name.replace(/^(Mr|Mrs|Ms|Miss|Dr|Lord|Lady|Sir|Captain|Professor)\.?\s+/i, '').split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return (name[0] || '?').toUpperCase();
  };

  const hasImage = Boolean(portrait.imageUrl && !imageError);

  return (
    <motion.div
      key={char.name}
      className="group p-3 rounded-2xl bg-[var(--bg-elevated)] border border-[color-mix(in_srgb,var(--ui-border)_70%,transparent)] hover:border-[color-mix(in_srgb,var(--ui-focus)_60%,transparent)] hover:bg-[color-mix(in_srgb,var(--ui-focus)_3%,var(--bg-elevated))] transition-all shadow-2xs space-y-2.5"
      whileHover={{ y: -1 }}
    >
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-center gap-3 min-w-0">
          {/* Character Portrait (Adaptive Box Sized to Picture Layout with Tooltip) */}
          <ReaderTooltip content="View full portrait & biography" side="top">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenDetail(char, portrait);
              }}
              style={containerStyle}
              className="relative shrink-0 overflow-hidden shadow-2xs border border-[color-mix(in_srgb,var(--ui-border)_80%,transparent)] bg-[color-mix(in_srgb,var(--bg-secondary)_70%,var(--bg-elevated))] flex items-center justify-center p-1 rounded-2xl cursor-pointer hover:ring-2 hover:ring-[color-mix(in_srgb,var(--ui-focus)_70%,transparent)] hover:scale-[1.03] transition-all group/avatar"
            >
              {hasImage ? (
                <>
                  <img
                    src={portrait.imageUrl!}
                    alt={char.name}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onLoad={(e) => {
                      const { naturalWidth, naturalHeight } = e.currentTarget;
                      if (naturalWidth && naturalHeight) {
                        setAspectRatio(naturalWidth / naturalHeight);
                      }
                    }}
                    onError={() => setImageError(true)}
                    className="w-full h-full object-contain drop-shadow-xs group-hover/avatar:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-[color-mix(in_srgb,var(--ui-focus)_12%,transparent)] opacity-0 group-hover/avatar:opacity-100 flex items-center justify-center transition-opacity rounded-2xl pointer-events-none">
                    <Maximize2 size={11} className="text-[var(--ui-focus)] drop-shadow" />
                  </div>
                </>
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center text-xs font-serif font-black select-none text-[var(--text-primary)] transition-all rounded-xl"
                  style={{
                    background: `linear-gradient(135deg, color-mix(in srgb, var(--ui-focus) 18%, var(--bg-secondary)), color-mix(in srgb, var(--ui-focus) 6%, var(--bg-elevated)))`,
                  }}
                >
                  {getInitials(char.name)}
                </div>
              )}
              {isPortraitLoading && !hasImage && (
                <div className="absolute inset-0 bg-[color-mix(in_srgb,var(--ui-focus)_12%,transparent)] animate-pulse" />
              )}
            </button>
          </ReaderTooltip>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => onOpenDetail(char, portrait)}
                className="text-[13px] font-bold text-[var(--text-primary)] group-hover:text-[var(--ui-focus)] transition-colors truncate my-0 text-left cursor-pointer hover:underline"
              >
                {char.name}
              </button>
              {portrait.nativeName && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)] text-[var(--text-tertiary)] shrink-0 select-none">
                  {portrait.nativeName}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-[var(--text-tertiary)] font-medium">
              <span className="px-1.5 py-0.5 rounded-md bg-[color-mix(in_srgb,var(--text-primary)_5%,var(--bg-secondary))] text-[10px] font-semibold text-[var(--text-secondary)]">
                {char.totalMentions} {char.totalMentions === 1 ? 'mention' : 'mentions'}
              </span>
              <span>·</span>
              <span>
                {char.chapters.length} {char.chapters.length === 1 ? 'chapter' : 'chapters'}
              </span>
            </div>
          </div>
        </div>

        {/* AI Recap button if AI is enabled */}
        {aiEnabled && (
          <ReaderTooltip content="No-spoiler character recall" side="top">
            <button
              type="button"
              onClick={(e) => onAIRecap(char.name, e)}
              disabled={aiRecapLoading}
              className="px-2 py-1 rounded-xl text-[10px] font-bold text-[var(--ui-focus)] bg-[color-mix(in_srgb,var(--ui-focus)_12%,transparent)] hover:bg-[color-mix(in_srgb,var(--ui-focus)_20%,transparent)] transition-all flex items-center gap-1 cursor-pointer shrink-0 active:scale-95"
            >
              {aiRecapLoading ? (
                <Loader2 size={11} className="animate-spin" />
              ) : (
                <Sparkles size={11} />
              )}
              <span>Recap</span>
            </button>
          </ReaderTooltip>
        )}
      </div>

      {/* Introduction Quote */}
      {char.firstMention?.sentenceSnippet && (
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-[10px] font-bold text-[var(--ui-focus)] uppercase tracking-wider">
            <BookOpen size={10} />
            <span>Introduction</span>
          </div>
          <div className="relative pl-3 pr-2.5 py-2 rounded-xl bg-[color-mix(in_srgb,var(--text-primary)_3%,var(--bg-secondary))] border-l-2 border-[color-mix(in_srgb,var(--ui-focus)_70%,transparent)] text-[11px] text-[var(--text-secondary)] font-serif italic leading-relaxed line-clamp-2 select-text">
            <span className="opacity-60 text-xs mr-0.5 font-sans">“</span>
            {char.firstMention.sentenceSnippet.replace(/^[\s"“'‘]+|[\s"”'’]+$/g, '')}
            <span className="opacity-60 text-xs ml-0.5 font-sans">”</span>
          </div>
        </div>
      )}

      {/* Jump to first mention button */}
      <button
        type="button"
        onClick={() => onNavigateToFirstMention(char.firstMention.chapterIndex, char.name)}
        className="w-full py-1.5 px-3 rounded-xl bg-[color-mix(in_srgb,var(--text-primary)_4%,var(--bg-secondary))] hover:bg-[var(--ui-focus)] hover:text-white border border-[color-mix(in_srgb,var(--ui-border)_60%,transparent)] hover:border-transparent text-xs font-semibold text-[var(--text-primary)] transition-all flex items-center justify-between cursor-pointer shadow-2xs group/btn active:scale-98"
      >
        <span className="flex items-center gap-1.5">
          <BookOpen size={12} className="text-[var(--ui-focus)] group-hover/btn:text-white transition-colors" />
          <span>Jump to First Mention</span>
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)] group-hover/btn:bg-white/20 font-mono">
          Ch. {char.firstMention.chapterIndex + 1}
        </span>
      </button>
    </motion.div>
  );
}

export function CharacterDirectoryPanel({
  bookId,
  totalChapters,
  onNavigateToFirstMention,
  bookTitle: initialBookTitle,
}: CharacterDirectoryPanelProps) {
  const [characters, setCharacters] = useState<TrackedCharacter[]>([]);
  const [bookTitle, setBookTitle] = useState<string>(initialBookTitle || '');
  const [isLoading, setIsLoading] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [aiRecapLoading, setAiRecapLoading] = useState<string | null>(null);
  const [aiRecapResult, setAiRecapResult] = useState<{ name: string; text: string } | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<{
    char: TrackedCharacter;
    portrait: CharacterPortrait;
  } | null>(null);

  const aiEnabled = useAIStore((s) => s.enabled);

  useEffect(() => {
    if (initialBookTitle) {
      setBookTitle(initialBookTitle);
      return;
    }
    api.getBook(bookId)
      .then((b) => {
        if (b?.title) setBookTitle(b.title);
      })
      .catch(() => {});
  }, [bookId, initialBookTitle]);

  useEffect(() => {
    setIsLoading(true);
    scanBookCharacters(bookId, totalChapters, setScanProgress)
      .then((chars) => {
        setCharacters(chars);
        setIsLoading(false);
      })
      .catch(() => {
        setIsLoading(false);
      });
  }, [bookId, totalChapters]);

  const filteredCharacters = useMemo(() => {
    if (!searchQuery.trim()) return characters;
    const q = searchQuery.toLowerCase();
    return characters.filter((c) => c.name.toLowerCase().includes(q));
  }, [characters, searchQuery]);

  const handleAIRecap = async (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (aiRecapLoading) return;

    setAiRecapLoading(name);
    try {
      const recap = await getCharacterRecap(name);
      setAiRecapResult({ name, text: recap });
    } catch (err) {
      useToastStore.getState().addToast({
        title: 'Could not fetch character recap',
        description: String(err),
        variant: 'error',
      });
    } finally {
      setAiRecapLoading(null);
    }
  };

  return (
    <div className="premium-sidebar-panel space-y-3">
      {/* Search Input */}
      <div className="premium-search-input-container !mb-1">
        <Search className="premium-search-icon" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={`Search ${characters.length} characters...`}
          className="premium-search-input"
        />
      </div>

      {/* Loading Bar if indexing */}
      {isLoading && (
        <div className="p-3 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--ui-border)] space-y-2">
          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
            <span className="flex items-center gap-1.5 font-medium">
              <Loader2 size={13} className="animate-spin text-[var(--ui-focus)]" />
              Indexing characters...
            </span>
            <span className="font-mono text-[11px] font-bold">{scanProgress}%</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-[var(--ui-border)] overflow-hidden">
            <div
              className="h-full bg-[var(--ui-focus)] transition-all duration-300 rounded-full"
              style={{ width: `${scanProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* AI Recap Modal / Popover */}
      <AnimatePresence>
        {aiRecapResult && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="p-3 rounded-2xl bg-[color-mix(in_srgb,var(--ui-focus)_10%,var(--bg-elevated))] border border-[var(--ui-focus)] shadow-lg space-y-2"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--ui-focus)]">
                <Sparkles size={13} />
                <span>Recall: {aiRecapResult.name}</span>
              </div>
              <button
                type="button"
                onClick={() => setAiRecapResult(null)}
                className="text-[11px] font-semibold text-[var(--text-tertiary)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                Dismiss
              </button>
            </div>
            <p className="text-xs leading-relaxed text-[var(--text-primary)] font-serif italic">
              {aiRecapResult.text}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Character List */}
      {!isLoading && filteredCharacters.length === 0 ? (
        <div className="text-center py-10 space-y-2">
          <Users size={32} className="mx-auto text-[var(--text-tertiary)] opacity-40" />
          <p className="text-xs text-[var(--text-tertiary)]">
            {searchQuery ? `No characters matched "${searchQuery}".` : 'No distinct characters found.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 pb-4">
          {filteredCharacters.map((char) => (
            <CharacterItem
              key={char.name}
              char={char}
              bookTitle={bookTitle}
              aiEnabled={aiEnabled}
              aiRecapLoading={aiRecapLoading === char.name}
              onAIRecap={handleAIRecap}
              onNavigateToFirstMention={onNavigateToFirstMention}
              onOpenDetail={(c, p) => setSelectedDetail({ char: c, portrait: p })}
            />
          ))}
        </div>
      )}

      {/* Character Detail Modal (Full Picture & Description) */}
      <AnimatePresence>
        {selectedDetail && (
          <CharacterDetailModal
            char={selectedDetail.char}
            portrait={selectedDetail.portrait}
            onClose={() => setSelectedDetail(null)}
            onNavigateToFirstMention={onNavigateToFirstMention}
            aiEnabled={aiEnabled}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
