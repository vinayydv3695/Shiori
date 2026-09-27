import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Moon, ArrowLeft, Plus } from 'lucide-react';
import { useSleepTimerStore } from '@/store/sleepTimerStore';
import {
  useReadingSettings,
  applyReaderThemeToElement,
  removeReaderThemeFromElement,
} from '@/store/premiumReaderStore';

interface BedtimeNightVeilProps {
  onCloseReader: () => void;
}

export function BedtimeNightVeil({ onCloseReader }: BedtimeNightVeilProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const { theme: readerTheme } = useReadingSettings();
  const { isNightVeilActive, extendTimer, dismissNightVeil } = useSleepTimerStore();

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    applyReaderThemeToElement(el, readerTheme || 'sepia');
  }, [readerTheme, isNightVeilActive]);

  useEffect(() => () => {
    const el = panelRef.current;
    if (el) removeReaderThemeFromElement(el);
  }, []);

  return (
    <AnimatePresence>
      {isNightVeilActive && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: 'easeInOut' }}
          className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/50 backdrop-blur-md select-none"
        >
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, scale: 0.9, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 15 }}
            transition={{ duration: 0.35, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
            className="premium-night-veil-card w-full max-w-sm rounded-3xl p-6 text-center relative overflow-hidden"
          >
            {/* Ambient Accent Glow */}
            <div
              className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 rounded-full blur-3xl pointer-events-none opacity-25"
              style={{ background: 'var(--ui-focus)' }}
            />

            {/* Moon Icon Container */}
            <div
              className="relative mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-4 transition-all shadow-md"
              style={{
                background: 'color-mix(in srgb, var(--ui-focus) 14%, var(--bg-secondary))',
                border: '1px solid color-mix(in srgb, var(--ui-focus) 30%, transparent)',
                color: 'var(--ui-focus)',
                boxShadow: '0 8px 24px -4px color-mix(in srgb, var(--ui-focus) 25%, transparent)',
              }}
            >
              <Moon size={28} className="animate-pulse" strokeWidth={2.2} />
            </div>

            <h2 className="text-xl font-black tracking-tight text-[var(--text-primary)] mb-1.5 font-outfit">
              Time for Sleep
            </h2>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed max-w-xs mx-auto mb-6 font-medium">
              Your sleep timer ended. Audio has faded out and your reading progress is saved.
            </p>

            {/* Action Buttons */}
            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => extendTimer(10)}
                className="w-full py-3 px-4 rounded-2xl text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md active:scale-98 cursor-pointer"
                style={{
                  background: 'var(--ui-focus)',
                  boxShadow: '0 4px 14px color-mix(in srgb, var(--ui-focus) 35%, transparent)',
                }}
              >
                <Plus size={15} strokeWidth={2.5} />
                <span>Read for 10 more minutes</span>
              </button>

              <button
                type="button"
                onClick={dismissNightVeil}
                className="w-full py-2.5 px-4 rounded-2xl border text-xs font-semibold transition-all active:scale-98 cursor-pointer"
                style={{
                  borderColor: 'color-mix(in srgb, var(--ui-border) 75%, transparent)',
                  background: 'color-mix(in srgb, var(--text-primary) 5%, var(--bg-secondary))',
                  color: 'var(--text-primary)',
                }}
              >
                Keep reading without timer
              </button>

              <button
                type="button"
                onClick={() => {
                  dismissNightVeil();
                  onCloseReader();
                }}
                className="w-full py-2 px-4 rounded-2xl text-xs font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer opacity-70 hover:opacity-100"
                style={{ color: 'var(--text-tertiary)' }}
              >
                <ArrowLeft size={13} />
                <span>Close reader & sleep</span>
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
