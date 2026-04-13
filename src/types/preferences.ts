import { DEFAULT_READING_FONT_ID } from '@/lib/readingFonts';

/**
 * Preference Types for Shiori v2.0
 * Matches Rust backend types in src-tauri/src/commands/preferences.rs
 */

export type Theme = 'white' | 'black' | 'light' | 'dark' | 'system' | 'sepia' | 'high-contrast' | 'rose-pine-moon' | 'catppuccin-mocha' | 'nord' | 'dracula' | 'tokyo-night';
export type ScrollMode = 'paged' | 'continuous';
export type Justification = 'left' | 'justify';
export type MangaMode = 'long-strip' | 'single' | 'double' | 'webtoon' | 'manhwa' | 'comic';
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

export interface TtsPreferences {
  voice: string;
  rate: number;
  autoAdvance: boolean;
  highlightColor: string;
}

export type CoverSize = 'small' | 'medium' | 'large';
export type SortOrder = 'title-asc' | 'title-desc' | 'author-asc' | 'date-added-desc' | 'date-added-asc' | 'last-read-desc';
export type ViewMode = 'grid' | 'list' | 'table';
export type LibraryDensity = 'compact' | 'comfortable' | 'spacious';
export type DuplicateHandling = 'skip' | 'overwrite' | 'keep-both' | 'ask';
export type MetadataMode = 'auto' | 'embedded-only' | 'manual' | 'online';
export type CacheClearPolicy = 'manual' | 'on-startup' | 'weekly' | 'monthly';

export interface WatchFolder {
  path: string;
  enabled: boolean;
}

export interface UserPreferences {
  theme: Theme;
  book: BookPreferences;
  manga: MangaPreferences;
  tts: TtsPreferences;
  autoStart: boolean;
  defaultImportPath: string;
  uiDensity: UIDensity;
  accentColor: string;
  uiScale: number;
  preferredContentType: string;
  performanceMode: string;
  metadataMode: string;
  autoScanEnabled: boolean;
  defaultMangaPath: string | null;
  translationTargetLanguage: string;
  autoGroupManga: boolean;
  dailyReadingGoalMinutes?: number;
  debugLogging?: boolean;
  uiFontFamily?: string;
  coverSize?: CoverSize;
  defaultSortOrder?: SortOrder;
  defaultViewMode?: ViewMode;
  libraryDensity?: LibraryDensity;
  duplicateHandling?: DuplicateHandling;
  autoFetchCovers?: boolean;
  autoScanIntervalMinutes?: number;
  cacheSizeLimitMB?: number;
  cacheClearPolicy?: CacheClearPolicy;
  sendAnalytics?: boolean;
  sendCrashReports?: boolean;
  historyRetentionDays?: number;
  watchFolders?: WatchFolder[];
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
  fontFamily: DEFAULT_READING_FONT_ID,
  fontSize: 18,
  lineHeight: 1.6,
  pageWidth: 720,
  scrollMode: 'paged',
  justification: 'left',
  paragraphSpacing: 1.0,
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

export const DEFAULT_TTS_PREFERENCES: TtsPreferences = {
  voice: 'default',
  rate: 1.0,
  autoAdvance: true,
  highlightColor: '#f3a6a68c',
};

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  theme: 'light',
  book: DEFAULT_BOOK_PREFERENCES,
  manga: DEFAULT_MANGA_PREFERENCES,
  tts: DEFAULT_TTS_PREFERENCES,
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
  translationTargetLanguage: 'en',
  autoGroupManga: true,
  dailyReadingGoalMinutes: 30,
  debugLogging: false,
  uiFontFamily: 'system',
  coverSize: 'medium',
  defaultSortOrder: 'title-asc',
  defaultViewMode: 'grid',
  libraryDensity: 'comfortable',
  duplicateHandling: 'skip',
  autoFetchCovers: true,
  autoScanIntervalMinutes: 60,
  cacheSizeLimitMB: 500,
  cacheClearPolicy: 'manual',
  sendAnalytics: false,
  sendCrashReports: false,
  historyRetentionDays: -1,
};
