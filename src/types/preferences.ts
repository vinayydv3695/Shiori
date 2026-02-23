/**
 * Preference Types for Shiori v2.0
 * Matches Rust backend types in src-tauri/src/commands/preferences.rs
 */

export type Theme = 'black' | 'white';
export type ScrollMode = 'paged' | 'continuous';
export type Justification = 'left' | 'justify';
export type MangaMode = 'long-strip' | 'single' | 'double';
export type Direction = 'ltr' | 'rtl';
export type ProgressBarPosition = 'top' | 'bottom' | 'hidden';
export type UIDensity = 'compact' | 'comfortable';

export interface BookPreferences {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  pageWidth: number;
  scrollMode: ScrollMode;
  justification: Justification;
  paragraphSpacing: number;
  animationSpeed: number;
  hyphenation: boolean;
  customCSS: string;
}

export interface MangaPreferences {
  mode: MangaMode;
  direction: Direction;
  marginSize: number;
  fitWidth: boolean;
  backgroundColor: string;
  progressBar: ProgressBarPosition;
  imageSmoothing: boolean;
  preloadCount: number;
  gpuAcceleration: boolean;
}

export interface UserPreferences {
  theme: Theme;
  book: BookPreferences;
  manga: MangaPreferences;
  autoStart: boolean;
  defaultImportPath: string;
  uiDensity: UIDensity;
  accentColor: string;
  /** Global UI scale factor: 0.75 – 1.5. Applied as font-size on <html>. */
  uiScale: number;
  preferredContentType: string;
  performanceMode: string;
  metadataMode: string;
  autoScanEnabled: boolean;
  defaultMangaPath: string | null;
}

export interface PreferenceOverride {
  bookId: number;
  preferences: Partial<BookPreferences> | Partial<MangaPreferences>;
}

export interface OnboardingState {
  completed: boolean;
  completedAt: string | null;
  version: number;
  skippedSteps: string[];
}

// Default preferences for initialization
export const DEFAULT_BOOK_PREFERENCES: BookPreferences = {
  fontFamily: 'Georgia, serif',
  fontSize: 18,
  lineHeight: 1.6,
  pageWidth: 720,
  scrollMode: 'paged',
  justification: 'left',
  paragraphSpacing: 16,
  animationSpeed: 250,
  hyphenation: false,
  customCSS: '',
};

export const DEFAULT_MANGA_PREFERENCES: MangaPreferences = {
  mode: 'single',
  direction: 'ltr',
  marginSize: 0,
  fitWidth: true,
  backgroundColor: '#000000',
  progressBar: 'bottom',
  imageSmoothing: true,
  preloadCount: 3,
  gpuAcceleration: true,
};

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  theme: 'white',
  book: DEFAULT_BOOK_PREFERENCES,
  manga: DEFAULT_MANGA_PREFERENCES,
  autoStart: false,
  defaultImportPath: '',
  uiDensity: 'comfortable',
  accentColor: '#3B82F6',
  uiScale: 1.0,
  preferredContentType: 'both',
  performanceMode: 'standard',
  metadataMode: 'online',
  autoScanEnabled: true,
  defaultMangaPath: null,
};
