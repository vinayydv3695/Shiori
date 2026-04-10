import { useEffect, type RefObject } from 'react';
import { applyReaderThemeToElement, removeReaderThemeFromElement, type ReaderTheme } from '@/store/premiumReaderStore';

/**
 * Applies and cleans up the reader theme on a container element.
 * Replaces 5 identical lines duplicated across all reader components.
 */
export function useReaderTheme(
  containerRef: RefObject<HTMLDivElement | null>,
  theme: ReaderTheme
) {
  useEffect(() => {
    const el = containerRef.current;
    if (el) applyReaderThemeToElement(el, theme);
    return () => { if (el) removeReaderThemeFromElement(el); };
  }, [theme, containerRef]);
}
