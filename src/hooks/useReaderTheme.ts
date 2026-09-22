import { useEffect, type RefObject } from 'react';
import { applyReaderThemeToElement, removeReaderThemeFromElement, type ReaderTheme } from '@/store/premiumReaderStore';
import { syncReaderStatusBar, restoreAppStatusBar } from '@/lib/statusBarTheme';

/**
 * Applies and cleans up the reader theme on a container element.
 * Replaces 5 identical lines duplicated across all reader components.
 */
export function useReaderTheme(
  containerRef: RefObject<HTMLDivElement | null>,
  theme: ReaderTheme
) {
  // Apply on theme change only — no cleanup, so re-applies just overwrite the
  // vars instead of stripping them first (which caused an unthemed flash).
  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      applyReaderThemeToElement(el, theme);
      syncReaderStatusBar(theme);
    }
  }, [theme, containerRef]);

  // Unmount-only cleanup: `containerRef` is a stable useRef object in every
  // caller, so this removes the theme only when the hook unmounts.
  useEffect(() => () => {
    const el = containerRef.current;
    if (el) {
      removeReaderThemeFromElement(el);
      restoreAppStatusBar();
    }
  }, [containerRef]);
}
