import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Moon, Timer, X, Plus, Check, Play, Square } from 'lucide-react';
import { useSleepTimerStore, type SleepTimerDuration } from '@/store/sleepTimerStore';
import {
  useReadingSettings,
  applyReaderThemeToElement,
  removeReaderThemeFromElement,
} from '@/store/premiumReaderStore';

interface SleepTimerDialogProps {
  open: boolean;
  onClose: () => void;
  buttonRef?: React.RefObject<HTMLElement | null>;
}

const PRESET_OPTIONS: { duration: SleepTimerDuration; label: string; sub: string }[] = [
  { duration: 15, label: '15 min', sub: 'Quick rest' },
  { duration: 30, label: '30 min', sub: 'Standard bedtime' },
  { duration: 45, label: '45 min', sub: 'Deep reading' },
  { duration: 60, label: '60 min', sub: 'Full hour' },
  { duration: 'chapter', label: 'End of Chapter', sub: 'Natural break' },
];

export function SleepTimerDialog({ open, onClose, buttonRef }: SleepTimerDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const { theme: readerTheme } = useReadingSettings();
  const {
    isActive,
    duration,
    remainingSeconds,
    startTimer,
    extendTimer,
    cancelTimer,
  } = useSleepTimerStore();

  // Dynamically apply current reader theme (paper, sepia, black, dark, light) directly to the panel
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    applyReaderThemeToElement(el, readerTheme || 'light');
  }, [readerTheme, open]);

  useEffect(() => () => {
    const el = panelRef.current;
    if (el) removeReaderThemeFromElement(el);
  }, []);

  // Handle outside clicks and escape key to close cleanly without any dimming backdrop
  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        panelRef.current &&
        !panelRef.current.contains(target) &&
        (!buttonRef?.current || !buttonRef.current.contains(target))
      ) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose, buttonRef]);

  if (!open) return null;

  // Format MM:SS for countdown
  const formattedCountdown =
    remainingSeconds !== null
      ? `${Math.floor(remainingSeconds / 60)}:${(remainingSeconds % 60).toString().padStart(2, '0')}`
      : duration === 'chapter'
      ? 'At chapter end'
      : '';

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, y: -6, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.96 }}
          transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          className="premium-sleep-timer-panel"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-[color-mix(in_srgb,var(--ui-border)_70%,transparent)]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[color-mix(in_srgb,var(--ui-focus)_16%,transparent)] text-[var(--ui-focus)] flex items-center justify-center shrink-0 shadow-2xs">
                <Moon size={16} strokeWidth={2.2} />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[var(--text-primary)] leading-tight tracking-tight">
                    Sleep Timer
                  </span>
                  {isActive && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-extrabold bg-[var(--ui-focus)] text-white shadow-xs leading-none">
                      <span className="w-1 h-1 rounded-full bg-white animate-pulse" />
                      Active
                    </span>
                  )}
                </div>
                <span className="text-[10.5px] text-[var(--text-secondary)] font-medium mt-0.5">
                  Fades audio & dims screen
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 rounded-xl flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[color-mix(in_srgb,var(--text-primary)_8%,transparent)] transition-colors cursor-pointer outline-none focus:outline-none"
              aria-label="Close"
            >
              <X size={15} />
            </button>
          </div>

          {/* Active Timer State */}
          {isActive && (
            <div className="p-3.5 rounded-2xl border border-[color-mix(in_srgb,var(--ui-focus)_40%,transparent)] bg-[color-mix(in_srgb,var(--ui-focus)_10%,var(--bg-secondary))] flex flex-col items-center justify-center text-center shadow-xs">
              <div className="w-10 h-10 rounded-full bg-[color-mix(in_srgb,var(--ui-focus)_20%,transparent)] text-[var(--ui-focus)] flex items-center justify-center mb-1.5 shadow-2xs">
                <Timer size={20} className="animate-pulse" />
              </div>
              <div className="text-2xl font-black tabular-nums tracking-tight text-[var(--text-primary)] font-mono">
                {formattedCountdown}
              </div>
              <p className="text-[11px] text-[var(--text-secondary)] mt-0.5 mb-3 font-medium">
                {duration === 'chapter'
                  ? 'Stops at end of chapter'
                  : 'Audio will smoothly fade to zero'}
              </p>

              {/* Action buttons */}
              <div className="flex items-center gap-2 w-full">
                <button
                  type="button"
                  onClick={() => extendTimer(10)}
                  className="flex-1 py-1.5 px-3 rounded-xl border border-[color-mix(in_srgb,var(--ui-border)_80%,transparent)] bg-[var(--bg-elevated)] hover:bg-[color-mix(in_srgb,var(--text-primary)_6%,var(--bg-elevated))] text-xs font-bold text-[var(--text-primary)] transition-all flex items-center justify-center gap-1.5 shadow-2xs active:scale-97 cursor-pointer outline-none focus:outline-none"
                >
                  <Plus size={13} strokeWidth={2.5} />
                  <span>+10 min</span>
                </button>
                <button
                  type="button"
                  onClick={cancelTimer}
                  className="flex-1 py-1.5 px-3 rounded-xl border border-rose-500/25 bg-rose-500/10 hover:bg-rose-500/20 text-xs font-bold text-rose-600 dark:text-rose-400 transition-all flex items-center justify-center gap-1.5 shadow-2xs active:scale-97 cursor-pointer outline-none focus:outline-none"
                >
                  <Square size={11} className="fill-current" />
                  <span>Cancel</span>
                </button>
              </div>
            </div>
          )}

          {/* Timer Preset Options */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between px-0.5">
              <span className="text-[11px] font-bold text-[var(--text-primary)]">
                {isActive ? 'Change Duration' : 'Choose Duration'}
              </span>
              <span className="text-[10px] text-[var(--text-tertiary)] font-medium">
                {isActive ? 'Select new time' : 'Tap to start'}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-1.5">
              {PRESET_OPTIONS.map((opt) => {
                const isSelected = isActive && duration === opt.duration;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => {
                      startTimer(opt.duration);
                    }}
                    className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer text-left group outline-none focus:outline-none active:scale-98 ${
                      isSelected
                        ? 'border-[var(--ui-focus)] bg-[color-mix(in_srgb,var(--ui-focus)_12%,var(--bg-secondary))] shadow-xs'
                        : 'border-[color-mix(in_srgb,var(--ui-border)_65%,transparent)] bg-[color-mix(in_srgb,var(--text-primary)_3%,var(--bg-secondary))] hover:border-[color-mix(in_srgb,var(--ui-focus)_60%,transparent)] hover:bg-[color-mix(in_srgb,var(--ui-focus)_8%,var(--bg-secondary))]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                          isSelected
                            ? 'bg-[var(--ui-focus)] text-white shadow-2xs'
                            : 'bg-[color-mix(in_srgb,var(--text-primary)_6%,transparent)] text-[var(--text-secondary)] group-hover:text-[var(--ui-focus)] group-hover:bg-[color-mix(in_srgb,var(--ui-focus)_14%,transparent)]'
                        }`}
                      >
                        <Timer size={14} strokeWidth={2} />
                      </div>
                      <div className="min-w-0">
                        <div
                          className={`text-xs font-bold leading-snug transition-colors ${
                            isSelected
                              ? 'text-[var(--ui-focus)]'
                              : 'text-[var(--text-primary)] group-hover:text-[var(--ui-focus)]'
                          }`}
                        >
                          {opt.label}
                        </div>
                        <div className="text-[10px] text-[var(--text-tertiary)] font-medium">
                          {opt.sub}
                        </div>
                      </div>
                    </div>

                    {isSelected ? (
                      <div className="w-5 h-5 rounded-full bg-[var(--ui-focus)] text-white flex items-center justify-center shrink-0 shadow-2xs">
                        <Check size={12} strokeWidth={2.6} />
                      </div>
                    ) : (
                      <Play
                        size={12}
                        className="text-[var(--text-tertiary)] group-hover:text-[var(--ui-focus)] opacity-0 group-hover:opacity-100 transition-all -translate-x-1 group-hover:translate-x-0 shrink-0"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Footer note */}
          <div className="text-center pt-1 border-t border-[color-mix(in_srgb,var(--ui-border)_50%,transparent)]">
            <p className="text-[10px] text-[var(--text-tertiary)] font-medium">
              Coordinates with Ambient Sounds & TTS
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
