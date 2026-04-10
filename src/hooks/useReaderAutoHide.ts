import { useEffect, useRef, useCallback } from 'react';
import { useReaderUIStore } from '@/store/premiumReaderStore';

/**
 * Shared auto-hide logic for the reader top bar.
 * Replaces ~50 lines of duplicated code in MobiReader, GenericHtmlReader,
 * PdfReader, and PremiumEpubReader.
 *
 * When the user moves the mouse, touches, or presses a key, the top bar
 * becomes visible and resets a 3-second hide timer.
 * In focus mode the bar stays hidden. In shortcut-only mode visibility
 * is controlled exclusively by keyboard shortcuts.
 */
export function useReaderAutoHide() {
  const isFocusMode = useReaderUIStore(state => state.isFocusMode);
  const isTopBarShortcutOnly = useReaderUIStore(state => state.isTopBarShortcutOnly);
  const setTopBarVisible = useReaderUIStore(state => state.setTopBarVisible);
  const autoHideTimerRef = useRef<number | null>(null);

  const resetAutoHideTimer = useCallback(() => {
    if (isTopBarShortcutOnly) return;
    if (!isFocusMode) {
      setTopBarVisible(true);
      if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
      autoHideTimerRef.current = window.setTimeout(() => setTopBarVisible(false), 3000);
    }
  }, [isTopBarShortcutOnly, isFocusMode, setTopBarVisible]);

  // Listen for user interaction
  useEffect(() => {
    let throttleTimeout: number | null = null;

    const handleMouseMove = () => {
      if (!throttleTimeout) {
        resetAutoHideTimer();
        throttleTimeout = window.setTimeout(() => { throttleTimeout = null; }, 100);
      }
    };
    const handleTouch = () => resetAutoHideTimer();
    const handleKeyDown = () => resetAutoHideTimer();

    document.addEventListener('mousemove', handleMouseMove, { passive: true });
    document.addEventListener('touchstart', handleTouch, { passive: true });
    document.addEventListener('keydown', handleKeyDown, { passive: true });

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('touchstart', handleTouch);
      document.removeEventListener('keydown', handleKeyDown);
      if (throttleTimeout) clearTimeout(throttleTimeout);
      if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
    };
  }, [resetAutoHideTimer]);

  // Sync with focus mode / shortcut-only mode changes
  useEffect(() => {
    if (isFocusMode) {
      setTopBarVisible(false);
      if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
    } else if (isTopBarShortcutOnly) {
      setTopBarVisible(false);
    } else {
      setTopBarVisible(true);
      resetAutoHideTimer();
    }
  }, [isFocusMode, setTopBarVisible, isTopBarShortcutOnly, resetAutoHideTimer]);

  return { isFocusMode, isTopBarShortcutOnly, setTopBarVisible };
}
