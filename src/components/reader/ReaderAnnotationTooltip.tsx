import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookmarkPlus, Volume2, StickyNote, Languages, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useReadingSettings, READER_THEME_COLORS } from '@/store/premiumReaderStore';

interface TooltipData {
  targetRect: DOMRect;
  noteRaw: string;
  annotationId?: string;
  annotationType?: string;
}

export function ReaderAnnotationTooltip() {
  const [tooltipData, setTooltipData] = useState<TooltipData | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const hoverTimeoutRef = useRef<number | null>(null);
  const closeTimeoutRef = useRef<number | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const isOverTooltipRef = useRef(false);

  // Subscribe to the active reader theme
  const readerTheme = useReadingSettings((state) => state.theme) || 'paper';
  const colors = READER_THEME_COLORS[readerTheme] || READER_THEME_COLORS.paper;
  const accentColor = colors['--text-link'] || colors['--ui-focus'] || '#8B6914';

  const clearTimers = useCallback(() => {
    if (hoverTimeoutRef.current) {
      window.clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    if (closeTimeoutRef.current) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }, []);

  const handleOpen = useCallback((mark: HTMLElement) => {
    clearTimers();
    const noteRaw = mark.dataset.noteContent || mark.getAttribute('data-note-content');
    if (!noteRaw) return;

    // Suppress native browser title to avoid double tooltips
    if (mark.title) {
      mark.dataset.originalTitle = mark.title;
      mark.removeAttribute('title');
    }

    hoverTimeoutRef.current = window.setTimeout(() => {
      const rect = mark.getBoundingClientRect();
      setTooltipData({
        targetRect: rect,
        noteRaw,
        annotationId: mark.dataset.annotationId,
        annotationType: mark.dataset.annotationType,
      });
    }, 120);
  }, [clearTimers]);

  const handleClose = useCallback((delay = 200) => {
    clearTimers();
    closeTimeoutRef.current = window.setTimeout(() => {
      if (!isOverTooltipRef.current) {
        setTooltipData(null);
      }
    }, delay);
  }, [clearTimers]);

  useEffect(() => {
    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const mark = target.closest('mark.epub-highlight, mark.pdf-highlight, [data-note-content]') as HTMLElement | null;
      if (mark && mark.dataset.hasNote === 'true') {
        handleOpen(mark);
      }
    };

    const handleMouseOut = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const mark = target.closest('mark.epub-highlight, mark.pdf-highlight, [data-note-content]') as HTMLElement | null;
      if (mark) {
        // Restore title if needed
        if (mark.dataset.originalTitle && !mark.title) {
          mark.title = mark.dataset.originalTitle;
        }
        handleClose(250);
      }
    };

    document.addEventListener('mouseover', handleMouseOver);
    document.addEventListener('mouseout', handleMouseOut);

    return () => {
      document.removeEventListener('mouseover', handleMouseOver);
      document.removeEventListener('mouseout', handleMouseOut);
      clearTimers();
    };
  }, [handleOpen, handleClose, clearTimers]);

  if (!tooltipData) return null;

  // Parse note content (JSON if vocabulary/translation, string if regular note)
  let parsedJson: any = null;
  try {
    parsedJson = JSON.parse(tooltipData.noteRaw);
  } catch {
    // Plain text note
  }

  const isDefinition = parsedJson?.type === 'define' && parsedJson?.data;
  const isTranslation = parsedJson?.type === 'translate' && parsedJson?.data;
  const defData = isDefinition ? parsedJson.data : null;
  const transData = isTranslation ? parsedJson.data : null;

  // Calculate coordinates (place above target with fallback below if near screen top)
  const rect = tooltipData.targetRect;
  const tooltipWidth = Math.min(380, window.innerWidth - 32);
  const left = Math.max(16, Math.min(window.innerWidth - tooltipWidth - 16, rect.left + rect.width / 2 - tooltipWidth / 2));
  
  const estimatedHeight = isDefinition ? 220 : isTranslation ? 140 : 120;
  const showBelow = rect.top < estimatedHeight + 60;
  const top = showBelow ? rect.bottom + 8 : Math.max(16, rect.top - 8);

  const playAudio = (url: string) => {
    if (!url) return;
    try {
      setIsPlayingAudio(true);
      const audio = new Audio(url);
      audio.onended = () => setIsPlayingAudio(false);
      audio.onerror = () => setIsPlayingAudio(false);
      audio.play();
    } catch {
      setIsPlayingAudio(false);
    }
  };

  return (
    <AnimatePresence>
      <div
        ref={tooltipRef}
        onMouseEnter={() => {
          isOverTooltipRef.current = true;
          clearTimers();
        }}
        onMouseLeave={() => {
          isOverTooltipRef.current = false;
          handleClose(150);
        }}
        style={{
          position: 'fixed',
          top: showBelow ? `${top}px` : undefined,
          bottom: showBelow ? undefined : `${window.innerHeight - top}px`,
          left: `${left}px`,
          width: `${tooltipWidth}px`,
          zIndex: 9999,
          pointerEvents: 'auto',
        }}
        className="isolation-isolate select-text"
      >
        <motion.div
          initial={{ opacity: 0, y: showBelow ? -8 : 8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: showBelow ? -6 : 6, scale: 0.96 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          className="rounded-2xl shadow-2xl overflow-hidden p-4 text-left border"
          style={{
            backgroundColor: colors['--bg-elevated'] || '#1e1e1e',
            borderColor: colors['--ui-border'] || 'rgba(255,255,255,0.12)',
            color: colors['--text-primary'] || '#ffffff',
            boxShadow: `0 22px 45px -12px ${colors['--shadow'] || 'rgba(0,0,0,0.6)'}, 0 0 0 1px ${colors['--ui-border'] || 'rgba(255,255,255,0.08)'}`,
          }}
        >
          {/* Header Row */}
          <div
            className="flex items-center justify-between gap-2 pb-2.5 mb-2.5 border-b"
            style={{ borderColor: colors['--ui-divider'] || colors['--ui-border'] }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <div
                className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: `color-mix(in srgb, ${accentColor} 18%, transparent)`,
                  color: accentColor,
                }}
              >
                {isDefinition ? (
                  <BookmarkPlus size={13} />
                ) : isTranslation ? (
                  <Languages size={13} />
                ) : (
                  <StickyNote size={13} />
                )}
              </div>
              <span
                className="text-[11px] font-black uppercase tracking-[0.14em]"
                style={{ color: accentColor }}
              >
                {isDefinition ? 'Vocabulary' : isTranslation ? 'Translation' : 'Note'}
              </span>
            </div>

            <button
              onClick={() => setTooltipData(null)}
              className="w-6 h-6 rounded-full flex items-center justify-center transition-colors hover:opacity-80"
              style={{
                backgroundColor: colors['--bg-secondary'],
                color: colors['--text-tertiary'],
              }}
              title="Dismiss"
            >
              <X size={12} />
            </button>
          </div>

          {/* Definition Content */}
          {isDefinition && defData && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <h4
                    className="text-base font-bold font-serif tracking-tight"
                    style={{ color: colors['--text-primary'] }}
                  >
                    {defData.word}
                  </h4>
                  {defData.phonetic && (
                    <span
                      className="text-xs font-mono px-1.5 py-0.5 rounded-md"
                      style={{
                        backgroundColor: colors['--bg-secondary'],
                        color: colors['--text-secondary'],
                      }}
                    >
                      {defData.phonetic}
                    </span>
                  )}
                </div>

                {defData.audio_url && (
                  <button
                    onClick={() => playAudio(defData.audio_url)}
                    disabled={isPlayingAudio}
                    className="p-1.5 rounded-full transition-colors active:scale-95 shrink-0"
                    style={{
                      backgroundColor: `color-mix(in srgb, ${accentColor} 18%, transparent)`,
                      color: accentColor,
                    }}
                    title="Pronounce"
                  >
                    <Volume2 size={14} className={isPlayingAudio ? 'animate-pulse' : ''} />
                  </button>
                )}
              </div>

              {/* Meanings */}
              <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1 no-scrollbar text-xs">
                {defData.meanings?.map((meaning: any, i: number) => (
                  <div
                    key={i}
                    className="space-y-1.5 p-2.5 rounded-xl border"
                    style={{
                      backgroundColor: colors['--bg-secondary'],
                      borderColor: colors['--ui-border'],
                    }}
                  >
                    <span
                      className="inline-block px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider"
                      style={{
                        backgroundColor: `color-mix(in srgb, ${accentColor} 18%, transparent)`,
                        color: accentColor,
                      }}
                    >
                      {meaning.part_of_speech}
                    </span>
                    {meaning.definitions?.slice(0, 2).map((def: any, dIdx: number) => (
                      <div key={dIdx} className="space-y-1">
                        <p
                          className="font-medium leading-relaxed"
                          style={{ color: colors['--text-primary'] }}
                        >
                          {def.definition}
                        </p>
                        {def.example && (
                          <p
                            className="italic pl-2 border-l-2 text-[11px] leading-normal"
                            style={{
                              color: colors['--text-secondary'],
                              borderLeftColor: accentColor,
                            }}
                          >
                            "{def.example}"
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Translation Content */}
          {isTranslation && transData && (
            <div className="space-y-2 text-xs">
              <div
                className="p-3 rounded-xl border"
                style={{
                  backgroundColor: colors['--bg-secondary'],
                  borderColor: colors['--ui-border'],
                }}
              >
                <p
                  className="text-sm font-semibold leading-snug"
                  style={{ color: colors['--text-primary'] }}
                >
                  {transData.translated_text}
                </p>
                {transData.source_text && (
                  <p
                    className="text-[11px] mt-1.5 italic"
                    style={{ color: colors['--text-secondary'] }}
                  >
                    Original: {transData.source_text}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Regular User Note Content */}
          {!isDefinition && !isTranslation && (
            <div
              className="text-xs max-w-none font-serif leading-relaxed max-h-48 overflow-y-auto no-scrollbar"
              style={{ color: colors['--text-primary'] }}
            >
              <ReactMarkdown>{tooltipData.noteRaw}</ReactMarkdown>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
