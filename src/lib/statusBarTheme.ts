import { READER_THEME_COLORS, type ReaderTheme } from '@/store/premiumReaderStore';
import { syncThemeColorHex, syncThemeColor, usePreferencesStore } from '@/store/preferencesStore';

/** Android system-bar background per reader theme (the paper color). */
export const READER_THEME_BG: Record<ReaderTheme, string> = {
  light: READER_THEME_COLORS.light['--bg-primary'],
  black: READER_THEME_COLORS.black['--bg-primary'],
  paper: READER_THEME_COLORS.paper['--bg-primary'],
  'paper-dark': READER_THEME_COLORS['paper-dark']['--bg-primary'],
  sepia: READER_THEME_COLORS.sepia['--bg-primary'],
  dark: READER_THEME_COLORS.dark['--bg-primary'],
};

/** Push the reader paper color to the Android system bars + theme-color meta. */
export function syncReaderStatusBar(theme: ReaderTheme): void {
  try {
    syncThemeColorHex(READER_THEME_BG[theme]);
  } catch (e) {
    console.warn('Failed to sync reader status bar color', e);
  }
}

/** Restore the app-level theme on the system bars (call after reader unmounts). */
export function restoreAppStatusBar(): void {
  try {
    const theme = usePreferencesStore.getState().preferences?.theme;
    if (!theme) return;
    syncThemeColor(theme);
  } catch (e) {
    console.warn('Failed to restore app status bar color', e);
  }
}