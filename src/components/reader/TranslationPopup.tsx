import React, { useState, useCallback, useRef } from 'react';
import type { DictionaryResponse, TranslationResponse } from '@/lib/tauri';
import {
  Languages,
  BookOpen,
  Volume2,
  BookmarkPlus,
  Copy,
  Check,
  X,
  Quote,
  AlertCircle,
  RefreshCw,
  Loader2,
  VolumeX,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { useToastStore } from '@/store/toastStore';

interface TranslationPopupProps {
  mode: 'translate' | 'define';
  loading: boolean;
  selectedText: string;
  dictionaryResult: DictionaryResponse | null;
  translationResult: TranslationResponse | null;
  error: string | null;
  onClose: () => void;
  onSwitchMode: (mode: 'translate' | 'define') => void;
  onAddVocabulary?: () => void;
  onRetry?: () => void;
}

function cleanDefinition(text: string): string {
  if (!text) return '';
  return text
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\.mw-parser-output[^{]*\{[^}]*\}/gi, '')
    .replace(/\{[^}]*font-size:[^}]*\}/gi, '')
    .replace(/\{[^}]*:[^}]*\}/gi, '')
    .replace(/&(?:nbsp|#160|ensp|emsp);/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function TranslationPopup({
  mode,
  loading,
  selectedText,
  dictionaryResult,
  translationResult,
  error,
  onClose,
  onSwitchMode,
  onAddVocabulary,
  onRetry,
}: TranslationPopupProps) {
  const [copied, setCopied] = useState(false);
  const [isSavedToVocab, setIsSavedToVocab] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const audioInstanceRef = useRef<HTMLAudioElement | null>(null);

  const handleCopy = useCallback((textToCopy: string) => {
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    useToastStore.getState().addToast({
      title: 'Copied to clipboard',
      variant: 'info',
      duration: 1500,
    });
    setTimeout(() => setCopied(false), 2000);
  }, []);

  const handleSpeak = useCallback((text: string, audioUrl?: string | null) => {
    if (isPlayingAudio) {
      if (audioInstanceRef.current) {
        audioInstanceRef.current.pause();
        audioInstanceRef.current = null;
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      setIsPlayingAudio(false);
      return;
    }

    if (audioUrl) {
      try {
        const audio = new Audio(audioUrl);
        audioInstanceRef.current = audio;
        setIsPlayingAudio(true);
        audio.onended = () => {
          setIsPlayingAudio(false);
          audioInstanceRef.current = null;
        };
        audio.onerror = () => {
          setIsPlayingAudio(false);
          audioInstanceRef.current = null;
          // Fallback to speech synthesis
          if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.onend = () => setIsPlayingAudio(false);
            utterance.onerror = () => setIsPlayingAudio(false);
            setIsPlayingAudio(true);
            window.speechSynthesis.speak(utterance);
          }
        };
        audio.play().catch(() => {
          setIsPlayingAudio(false);
          audioInstanceRef.current = null;
        });
        return;
      } catch {
        // Fall through to speechSynthesis
      }
    }

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      if (mode === 'translate' && translationResult?.target_language) {
        utterance.lang = translationResult.target_language;
      }
      utterance.onend = () => setIsPlayingAudio(false);
      utterance.onerror = () => setIsPlayingAudio(false);
      setIsPlayingAudio(true);
      window.speechSynthesis.speak(utterance);
    }
  }, [isPlayingAudio, mode, translationResult]);

  const handleCopyAll = useCallback(() => {
    if (mode === 'translate' && translationResult?.translated_text) {
      handleCopy(translationResult.translated_text);
    } else if (mode === 'define' && dictionaryResult) {
      const formatted = `${dictionaryResult.word}${dictionaryResult.phonetic ? ` /${dictionaryResult.phonetic.replace(/^\/+|\/+$/g, '')}/` : ''}\n\n` +
        dictionaryResult.meanings
          .map((m) => `[${m.part_of_speech.toUpperCase()}]\n` + m.definitions.map((d, i) => `${i + 1}. ${cleanDefinition(d.definition)}`).join('\n'))
          .join('\n\n');
      handleCopy(formatted);
    }
  }, [mode, translationResult, dictionaryResult, handleCopy]);

  const handleSaveVocab = useCallback(() => {
    if (!onAddVocabulary) return;
    setIsSavedToVocab(true);
    onAddVocabulary();
  }, [onAddVocabulary]);

  const cleanedText = selectedText?.trim() || '';
  const isContextPassage =
    cleanedText.length > 0 &&
    (!dictionaryResult || cleanedText.toLowerCase() !== dictionaryResult.word.toLowerCase());

  return (
    <motion.div
      className="translation-popup select-none flex flex-col h-full max-h-[min(calc(100vh-48px),640px)]"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* ── CARD HEADER (Always pinned at top) ── */}
      <div className="shrink-0 flex items-center justify-between pb-3 border-b border-[color-mix(in_srgb,var(--ui-border)_70%,transparent)]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[color-mix(in_srgb,var(--ui-focus)_12%,var(--bg-secondary))] text-[var(--ui-focus)] border border-[color-mix(in_srgb,var(--ui-focus)_25%,transparent)] flex items-center justify-center shrink-0 shadow-2xs">
            {mode === 'translate' ? (
              <Languages size={15} strokeWidth={2.4} />
            ) : (
              <BookOpen size={15} strokeWidth={2.4} />
            )}
          </div>
          <div>
            <h3 className="font-bold text-sm tracking-tight text-[var(--text-primary)] leading-tight">
              {mode === 'translate' ? 'Translation' : 'Dictionary'}
            </h3>
            <span className="text-[10px] font-medium text-[var(--text-tertiary)] block leading-none mt-0.5">
              {mode === 'translate' ? 'Instant language translation' : 'Definition & vocabulary'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Segmented Control Pill Switcher (Deep Inset Track & Elevated Pill like Fig 2) */}
          <div className="relative grid grid-cols-2 p-1 bg-[color-mix(in_srgb,var(--text-primary)_9%,var(--bg-secondary))] border border-[color-mix(in_srgb,var(--ui-border)_75%,transparent)] rounded-2xl h-9 w-[210px] shadow-[inset_0_2px_4px_rgba(0,0,0,0.14),inset_0_1px_2px_rgba(0,0,0,0.08)]">
            {/* Smooth Local Sliding Pill Indicator (Never flies from outside) */}
            <motion.div
              className="absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-xl bg-gradient-to-b from-[var(--ui-focus)] via-[var(--ui-focus)] to-[color-mix(in_srgb,var(--ui-focus)_90%,black)] shadow-[0_2px_8px_rgba(0,0,0,0.25),0_1px_3px_rgba(0,0,0,0.14),inset_0_1px_0_rgba(255,255,255,0.3)] border-t border-white/25 z-0 pointer-events-none"
              initial={false}
              animate={{ x: mode === 'translate' ? '0%' : '100%' }}
              transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            />

            <button
              type="button"
              onClick={() => onSwitchMode('translate')}
              className={cn(
                "relative z-10 flex items-center justify-center gap-1.5 h-full text-xs font-bold rounded-xl transition-colors duration-200 cursor-pointer select-none px-2.5",
                mode === 'translate'
                  ? "!text-white font-extrabold drop-shadow-[0_1px_1px_rgba(0,0,0,0.25)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              )}
            >
              <Languages size={13} strokeWidth={2.4} />
              <span>Translate</span>
            </button>

            <button
              type="button"
              onClick={() => onSwitchMode('define')}
              className={cn(
                "relative z-10 flex items-center justify-center gap-1.5 h-full text-xs font-bold rounded-xl transition-colors duration-200 cursor-pointer select-none px-2.5",
                mode === 'define'
                  ? "!text-white font-extrabold drop-shadow-[0_1px_1px_rgba(0,0,0,0.25)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              )}
            >
              <BookOpen size={13} strokeWidth={2.4} />
              <span>Define</span>
            </button>
          </div>

          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-xl flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] transition-all cursor-pointer"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* ── SCROLLABLE BODY CONTENT (Autoscales to content, scrolls if large) ── */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-3 py-1 pr-0.5 translation-popup-scroll">
        {/* Context passage quote card */}
        {isContextPassage && (
          <div className="relative rounded-2xl border border-[color-mix(in_srgb,var(--ui-border)_65%,transparent)] bg-[color-mix(in_srgb,var(--text-primary)_3%,var(--bg-secondary))] px-4 py-2.5 transition-all select-none shadow-2xs">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5 text-[var(--ui-focus)]">
                <Quote size={11} className="rotate-180 shrink-0 opacity-80" />
                <span className="text-[9.5px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                  Selected Passage
                </span>
              </div>
              {mode === 'translate' && translationResult && (
                <span className="text-[9.5px] font-bold text-[var(--ui-focus)] uppercase tracking-wider bg-[color-mix(in_srgb,var(--ui-focus)_12%,transparent)] px-2 py-0.5 rounded-md border border-[color-mix(in_srgb,var(--ui-focus)_24%,transparent)] shadow-2xs">
                  {translationResult.source_language || 'Auto'} → {translationResult.target_language}
                </span>
              )}
            </div>
            <div className="max-h-[85px] overflow-y-auto pr-1 select-text translation-popup-scroll">
              <p className="font-serif italic text-xs leading-relaxed text-[var(--text-primary)] opacity-90 whitespace-pre-wrap">
                “{cleanedText}”
              </p>
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-10 text-[var(--text-tertiary)] gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[color-mix(in_srgb,var(--ui-focus)_10%,var(--bg-secondary))] border border-[color-mix(in_srgb,var(--ui-focus)_20%,transparent)] flex items-center justify-center shadow-2xs">
              <Loader2 size={20} className="animate-spin text-[var(--ui-focus)]" />
            </div>
            <div className="text-center">
              <p className="text-xs font-semibold text-[var(--text-primary)]">
                {mode === 'translate' ? 'Translating text...' : 'Looking up definition...'}
              </p>
              <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">
                Fetching lexical definitions and pronunciations
              </p>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="rounded-2xl border border-red-500/25 bg-red-500/10 p-4 flex items-start gap-3 text-red-600 dark:text-red-400 shadow-2xs">
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
            <div className="flex-1 text-xs">
              <p className="font-bold text-[13px] mb-1">Lookup unavailable</p>
              <p className="opacity-90 leading-relaxed">{error}</p>
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="mt-2.5 px-3 py-1 rounded-lg bg-red-500/15 border border-red-500/30 text-xs font-bold cursor-pointer inline-flex items-center gap-1.5 hover:bg-red-500/25 active:scale-95 transition-all shadow-2xs"
                >
                  <RefreshCw size={11} /> Try again
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── TRANSLATE MODE RESULT ── */}
        {!loading && !error && mode === 'translate' && translationResult && (
          <div className="relative rounded-2xl border border-[color-mix(in_srgb,var(--ui-border)_70%,transparent)] bg-[color-mix(in_srgb,var(--bg-secondary)_75%,var(--bg-elevated))] p-4 shadow-[0_3px_12px_-2px_rgba(0,0,0,0.06),0_1px_3px_-1px_rgba(0,0,0,0.04)] space-y-2.5">
            <div className="flex items-center justify-between pb-2 border-b border-[color-mix(in_srgb,var(--ui-border)_45%,transparent)]">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--ui-focus)]" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--ui-focus)]">
                  Translation
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleSpeak(translationResult.translated_text)}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer shadow-2xs active:scale-95",
                    isPlayingAudio
                      ? "bg-[var(--ui-focus)] text-white border-transparent shadow-xs animate-pulse"
                      : "bg-[color-mix(in_srgb,var(--ui-focus)_12%,var(--bg-elevated))] text-[var(--ui-focus)] border-[color-mix(in_srgb,var(--ui-focus)_25%,transparent)] hover:bg-[var(--ui-focus)] hover:text-white"
                  )}
                  title="Listen to translation"
                >
                  {isPlayingAudio ? <VolumeX size={12} strokeWidth={2.2} /> : <Volume2 size={12} strokeWidth={2.2} />}
                  <span className="text-[11px]">{isPlayingAudio ? 'Stop' : 'Listen'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleCopy(translationResult.translated_text)}
                  className="p-1 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition-all cursor-pointer"
                  title="Copy translation"
                >
                  {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                </button>
              </div>
            </div>

            <div className="max-h-[260px] overflow-y-auto pr-1 select-text translation-popup-scroll">
              <p className="text-[14px] leading-relaxed text-[var(--text-primary)] font-normal whitespace-pre-wrap">
                {translationResult.translated_text}
              </p>
            </div>

            <div className="pt-2 flex items-center justify-between text-[10px] font-medium text-[var(--text-tertiary)] border-t border-[color-mix(in_srgb,var(--ui-border)_30%,transparent)]">
              <span className="uppercase tracking-wider">Target: {translationResult.target_language}</span>
              <span>via {translationResult.provider}</span>
            </div>
          </div>
        )}

        {/* ── DEFINE MODE RESULT ── */}
        {!loading && !error && mode === 'define' && dictionaryResult && (
          <div className="space-y-3">
            {/* Word Hero Card (Deep, layered, prominent) */}
            <div className="relative rounded-2xl border border-[color-mix(in_srgb,var(--ui-border)_65%,transparent)] bg-[color-mix(in_srgb,var(--bg-secondary)_70%,var(--bg-elevated))] p-3.5 shadow-[0_3px_10px_-2px_rgba(0,0,0,0.06),0_1px_3px_-1px_rgba(0,0,0,0.03)]">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-baseline gap-2.5 flex-wrap">
                  <h4 className="font-serif text-2xl font-bold tracking-tight text-[var(--text-primary)] capitalize">
                    {dictionaryResult.word}
                  </h4>
                  {dictionaryResult.phonetic && (
                    <span className="text-xs font-mono text-[var(--text-secondary)] px-2.5 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--text-primary)_6%,var(--bg-elevated))] border border-[color-mix(in_srgb,var(--ui-border)_50%,transparent)] shadow-2xs select-text">
                      /{dictionaryResult.phonetic.replace(/^\/+|\/+$/g, '')}/
                    </span>
                  )}
                </div>

                {/* Pronunciation & Quick Audio Action */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleSpeak(dictionaryResult.word, dictionaryResult.audio_url)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer shadow-2xs active:scale-95",
                      isPlayingAudio
                        ? "bg-[var(--ui-focus)] text-white border-transparent shadow-xs animate-pulse"
                        : "bg-[color-mix(in_srgb,var(--ui-focus)_12%,var(--bg-elevated))] text-[var(--ui-focus)] border-[color-mix(in_srgb,var(--ui-focus)_25%,transparent)] hover:bg-[var(--ui-focus)] hover:text-white"
                    )}
                    title="Listen to pronunciation"
                  >
                    {isPlayingAudio ? <VolumeX size={13} strokeWidth={2.4} /> : <Volume2 size={13} strokeWidth={2.4} />}
                    <span>{isPlayingAudio ? 'Stop' : 'Pronounce'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCopyAll}
                    className="p-1.5 rounded-xl border border-[color-mix(in_srgb,var(--ui-border)_60%,transparent)] bg-[color-mix(in_srgb,var(--text-primary)_4%,var(--bg-elevated))] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--ui-focus)] active:scale-95 transition-all shadow-2xs cursor-pointer"
                    title="Copy full definition"
                  >
                    {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                  </button>
                </div>
              </div>
            </div>

            {/* Meanings Scroll Area with Visual Depth */}
            <div className="rounded-2xl border border-[color-mix(in_srgb,var(--ui-border)_60%,transparent)] bg-[color-mix(in_srgb,var(--text-primary)_2%,var(--bg-elevated))] p-3.5 max-h-[280px] overflow-y-auto space-y-4 select-text translation-popup-scroll shadow-inner">
              {dictionaryResult.meanings && dictionaryResult.meanings.length > 0 ? (
                dictionaryResult.meanings.map((meaning, i) => (
                  <div key={i} className="space-y-2.5">
                    {/* Part of Speech Pill Header */}
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-[color-mix(in_srgb,var(--ui-focus)_12%,var(--bg-secondary))] text-[var(--ui-focus)] border border-[color-mix(in_srgb,var(--ui-focus)_24%,transparent)] shadow-2xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--ui-focus)]" />
                        {meaning.part_of_speech}
                      </span>
                      <div className="h-px flex-1 bg-[color-mix(in_srgb,var(--ui-border)_45%,transparent)]" />
                    </div>

                    {/* Definitions List */}
                    <div className="space-y-2.5 pl-0.5">
                      {meaning.definitions?.map((def, j) => {
                        const cleanDef = cleanDefinition(def.definition);
                        if (!cleanDef) return null;
                        return (
                          <div key={j} className="flex items-start gap-2.5 text-xs leading-relaxed group">
                            {/* Circular Index Badge */}
                            <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 bg-[color-mix(in_srgb,var(--ui-focus)_10%,var(--bg-secondary))] border border-[color-mix(in_srgb,var(--ui-focus)_20%,transparent)] text-[var(--ui-focus)] text-[11px] font-bold shadow-2xs mt-0.5 select-none">
                              {j + 1}
                            </span>

                            <div className="flex-1 space-y-1.5">
                              {/* Definition text */}
                              <p className="text-[13.5px] leading-relaxed text-[var(--text-primary)] font-normal">
                                {cleanDef}
                              </p>

                              {/* Example Quote Cardlet */}
                              {def.example && (
                                <div className="rounded-xl bg-[color-mix(in_srgb,var(--text-primary)_3.5%,var(--bg-secondary))] border border-[color-mix(in_srgb,var(--ui-border)_45%,transparent)] border-l-2 border-l-[var(--ui-focus)] px-3 py-2 shadow-2xs">
                                  <p className="font-serif italic text-xs leading-relaxed text-[var(--text-secondary)]">
                                    “{cleanDefinition(def.example)}”
                                  </p>
                                </div>
                              )}

                              {/* Synonym Chips */}
                              {def.synonyms && def.synonyms.length > 0 && (
                                <div className="flex flex-wrap gap-1 pt-0.5">
                                  {def.synonyms.map((syn, k) => (
                                    <span
                                      key={k}
                                      className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-[color-mix(in_srgb,var(--text-primary)_5%,var(--bg-secondary))] text-[var(--text-secondary)] border border-[color-mix(in_srgb,var(--ui-border)_40%,transparent)] shadow-2xs hover:border-[var(--ui-focus)] hover:text-[var(--text-primary)] transition-all cursor-default"
                                    >
                                      {syn}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-[var(--text-secondary)] text-center py-6">
                  No lexical definitions found for this word.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── FOOTER ACTIONS (Pinned at bottom, ALWAYS 100% visible) ── */}
      <div className="shrink-0 flex items-center justify-between pt-2.5 mt-auto border-t border-[color-mix(in_srgb,var(--ui-border)_40%,transparent)]">
        <div className="flex items-center gap-1.5 text-[10.5px] text-[var(--text-tertiary)] hidden sm:flex select-none">
          <kbd className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)] border border-[color-mix(in_srgb,var(--ui-border)_60%,transparent)] shadow-2xs">
            esc
          </kbd>
          <span>to close</span>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {/* Secondary Action: Copy Button with Instant Feedback */}
          <button
            type="button"
            className={cn(
              "px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed",
              copied
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "border-[color-mix(in_srgb,var(--ui-border)_70%,transparent)] bg-[color-mix(in_srgb,var(--text-primary)_4%,var(--bg-secondary))] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--ui-focus)] hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)]"
            )}
            onClick={handleCopyAll}
            disabled={loading || !!error || (!translationResult && !dictionaryResult)}
          >
            {copied ? <Check size={13} strokeWidth={2.5} className="text-emerald-500" /> : <Copy size={13} strokeWidth={2} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>

          {/* Primary Action: Save to Vocabulary */}
          {onAddVocabulary && (
            <button
              type="button"
              className={cn(
                "text-selection-toolbar-btn--save-note px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-[0_3px_10px_-1px_rgba(0,0,0,0.22)] active:scale-95 hover:brightness-105 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:brightness-100 disabled:shadow-none",
                isSavedToVocab ? "bg-emerald-600 !text-white border-transparent" : ""
              )}
              onClick={handleSaveVocab}
              disabled={loading || !!error || (!translationResult && !dictionaryResult)}
            >
              {isSavedToVocab ? (
                <>
                  <Check size={13} strokeWidth={2.5} className="text-white" />
                  <span>Saved to Vocab</span>
                </>
              ) : (
                <>
                  <BookmarkPlus size={13} strokeWidth={2.5} className="text-white" />
                  <span>Save to Vocabulary</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
