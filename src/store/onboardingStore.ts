import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { logger } from '@/lib/logger';
import { api } from '@/lib/tauri';
import { normalizeLegacyFontPreference } from '@/lib/readingFonts';
import type { Theme, UserPreferences } from '@/types/preferences';
import { usePreferencesStore } from './preferencesStore';

export type ThemeName =
  | 'White'
  | 'Black'
  | 'Rose Pine Moon'
  | 'Catppuccin Mocha'
  | 'Nord'
  | 'Dracula'
  | 'Tokyo Night';

export interface MangaPrefs {
  readingDirection: 'rtl' | 'ltr';
  readingMode: 'single' | 'strip' | 'webtoon' | 'manhwa' | 'comic';
  fitMode: 'width' | 'height' | 'contain';
  stripMargin: number;
  progressBarPosition: 'top' | 'bottom' | 'hidden';
  stickyHeader: boolean;
  showNavigationTips: boolean;
  autoGroupVolumes: boolean;
  theme: 'light' | 'dark';
  imageQuality: 'low' | 'medium' | 'high' | 'original';
  preloadIntensity: number;
}

export interface BookPrefs {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  pageWidth: number;
  scrollMode: 'paged' | 'continuous';
  textJustification: 'off' | 'on' | 'auto';
  hyphenation: boolean;
  animationSpeed: number;
  paragraphSpacing: number;
  customCSS: string;
}

export interface OnboardingWizardState {
  onboardingComplete: boolean;
  currentStep: 1 | 2 | 3 | 4 | 5;
  libraryPath: string | null;
  selectedTheme: ThemeName;
  mangaPrefs: MangaPrefs;
  bookPrefs: BookPrefs;
  translationLanguage: string;
  autoTranslate: boolean;
  cacheSizeMB: number;
  librarySizeLimit: number;
  sendAnalytics: boolean;
  sendCrashReports: boolean;
  debugLogging: boolean;
  uiScale: number;
  enableCloudSync: boolean;
  enableNotifications: boolean;
  defaultMangaSource: string;
  defaultBookSource: string;
  isHydrated: boolean;
  isInitializing: boolean;
}

interface OnboardingStore extends OnboardingWizardState {
  initialize: () => Promise<void>;
  setCurrentStep: (step: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8) => void;
  nextStep: () => void;
  prevStep: () => void;
  setLibraryPath: (path: string | null) => void;
  setSelectedTheme: (theme: ThemeName) => void;
  setMangaPrefs: (updates: Partial<MangaPrefs>) => void;
  setBookPrefs: (updates: Partial<BookPrefs>) => void;
  setTranslationLanguage: (translationLanguage: string) => void;
  setAutoTranslate: (autoTranslate: boolean) => void;
  setCacheSizeMB: (cacheSizeMB: number) => void;
  setLibrarySizeLimit: (librarySizeLimit: number) => void;
  setSendAnalytics: (sendAnalytics: boolean) => void;
  setSendCrashReports: (sendCrashReports: boolean) => void;
  setDebugLogging: (debugLogging: boolean) => void;
  setUiScale: (uiScale: number) => void;
  setEnableCloudSync: (enableCloudSync: boolean) => void;
  setEnableNotifications: (enableNotifications: boolean) => void;
  setDefaultMangaSource: (source: string) => void;
  setDefaultBookSource: (source: string) => void;
  completeOnboarding: () => Promise<void>;
  resetOnboarding: () => void;
}

const TOTAL_STEPS = 5;
const DEFAULT_TRANSLATION_LANGUAGE = 'en';
const DEFAULT_CACHE_SIZE_MB = 500;
const DEFAULT_LIBRARY_SIZE_LIMIT = 10000;
const UI_SCALE_PERCENT_MIN = 75;
const UI_SCALE_PERCENT_MAX = 150;
const SUPPORTED_TRANSLATION_LANGUAGES = new Set([
  'en',
  'es',
  'fr',
  'de',
  'it',
  'pt',
  'ru',
  'ja',
  'ko',
  'zh',
  'ar',
  'hi',
]);
const SUPPORTED_CACHE_SIZES_MB = new Set([100, 250, 500, 1000, 2000, -1]);

type ThemeOption = { name: ThemeName; value: Theme };

export const THEME_OPTIONS: ThemeOption[] = [
  { name: 'White', value: 'white' },
  { name: 'Black', value: 'black' },
  { name: 'Rose Pine Moon', value: 'rose-pine-moon' },
  { name: 'Catppuccin Mocha', value: 'catppuccin-mocha' },
  { name: 'Nord', value: 'nord' },
  { name: 'Dracula', value: 'dracula' },
  { name: 'Tokyo Night', value: 'tokyo-night' },
];

const THEME_NAME_TO_VALUE: Record<ThemeName, Theme> = Object.fromEntries(
  THEME_OPTIONS.map((item) => [item.name, item.value])
) as Record<ThemeName, Theme>;

const THEME_VALUE_TO_NAME = Object.fromEntries(
  THEME_OPTIONS.map((item) => [item.value, item.name])
) as Record<Theme, ThemeName>;

const getDefaultThemeName = (): ThemeName => {
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'Black';
  }
  return 'White';
};

const mapMangaMode = (mode: string): MangaPrefs['readingMode'] => {
  if (mode === 'webtoon' || mode === 'manhwa' || mode === 'comic' || mode === 'single') return mode;
  if (mode === 'long-strip') return 'strip';
  return 'single';
};

const createDefaultState = (): OnboardingWizardState => ({
  onboardingComplete: false,
  currentStep: 1,
  libraryPath: null,
  selectedTheme: getDefaultThemeName(),
  mangaPrefs: {
    readingDirection: 'rtl',
    readingMode: 'strip',
    fitMode: 'width',
    stripMargin: 0,
    progressBarPosition: 'bottom',
    stickyHeader: true,
    showNavigationTips: true,
    autoGroupVolumes: true,
    theme: 'dark',
    imageQuality: 'high',
    preloadIntensity: 5,
  },
  bookPrefs: {
    fontFamily: 'EB Garamond',
    fontSize: 24,
    lineHeight: 1.6,
    pageWidth: 1200,
    scrollMode: 'paged',
    textJustification: 'on',
    hyphenation: false,
    animationSpeed: 250,
    paragraphSpacing: 1,
    customCSS: '',
  },
  translationLanguage: 'en',
  autoTranslate: false,
  cacheSizeMB: 500,
  librarySizeLimit: 10000,
  sendAnalytics: false,
  sendCrashReports: false,
  debugLogging: false,
  uiScale: 100,
  enableCloudSync: false,
  enableNotifications: true,
  defaultMangaSource: 'mangadex',
  defaultBookSource: 'libgen',
  isHydrated: false,
  isInitializing: false,
});

const pushLibraryPath = async (libraryPath: string | null): Promise<void> => {
  await usePreferencesStore.getState().updateGeneralSettings({
    defaultImportPath: libraryPath ?? '',
    defaultMangaPath: libraryPath,
  });
};

const pushTheme = async (selectedTheme: ThemeName): Promise<void> => {
  await usePreferencesStore.getState().updateTheme(THEME_NAME_TO_VALUE[selectedTheme]);
};

const pushMangaPrefs = async (prefs: MangaPrefs): Promise<void> => {
  await Promise.all([
    usePreferencesStore.getState().updateMangaDefaults({
      direction: prefs.readingDirection,
      mode: prefs.readingMode === 'strip' ? 'long-strip' : prefs.readingMode,
      marginSize: prefs.stripMargin,
      fitWidth: prefs.fitMode === 'width',
      progressBar: prefs.progressBarPosition,
      imageSmoothing: prefs.imageQuality !== 'low',
      preloadCount: prefs.preloadIntensity,
    }),
    usePreferencesStore.getState().updateGeneralSettings({
      autoGroupManga: prefs.autoGroupVolumes,
    }),
  ]);
};

const pushBookPrefs = async (prefs: BookPrefs): Promise<void> => {
  await usePreferencesStore.getState().updateBookDefaults({
    fontFamily: normalizeLegacyFontPreference(prefs.fontFamily),
    fontSize: prefs.fontSize,
    lineHeight: prefs.lineHeight,
    pageWidth: prefs.pageWidth,
    scrollMode: prefs.scrollMode,
    justification: prefs.textJustification === 'on' ? 'justify' : 'left',
    paragraphSpacing: prefs.paragraphSpacing,
    animationSpeed: prefs.animationSpeed,
    hyphenation: prefs.hyphenation,
    customCSS: prefs.customCSS,
  });
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const sanitizeTranslationLanguage = (language: string): string => {
  const normalized = language.trim().toLowerCase();
  return SUPPORTED_TRANSLATION_LANGUAGES.has(normalized)
    ? normalized
    : DEFAULT_TRANSLATION_LANGUAGE;
};

const sanitizeCacheSizeMB = (value: number): number => {
  const normalized = Number.isFinite(value) ? Math.round(value) : DEFAULT_CACHE_SIZE_MB;
  return SUPPORTED_CACHE_SIZES_MB.has(normalized) ? normalized : DEFAULT_CACHE_SIZE_MB;
};

const sanitizeLibrarySizeLimit = (value: number): number => {
  if (!Number.isFinite(value)) return DEFAULT_LIBRARY_SIZE_LIMIT;
  const normalized = Math.round(value);
  if (normalized === -1) return -1;
  return clamp(normalized, 1, 1_000_000);
};

const sanitizeUiScalePercent = (value: number): number => {
  if (!Number.isFinite(value)) return 100;
  return Math.round(clamp(value, UI_SCALE_PERCENT_MIN, UI_SCALE_PERCENT_MAX));
};

const persistGeneralSettings = async (
  updates: Partial<UserPreferences>,
  context: string,
): Promise<void> => {
  try {
    await usePreferencesStore.getState().updateGeneralSettings(updates);
  } catch (error) {
    logger.error(`Failed to persist onboarding ${context}:`, error);
  }
};

const pushOnboardingGeneralSettings = async (state: OnboardingWizardState): Promise<void> => {
  await persistGeneralSettings(
    {
      translationTargetLanguage: sanitizeTranslationLanguage(state.translationLanguage),
      cacheSizeLimitMB: sanitizeCacheSizeMB(state.cacheSizeMB),
      sendAnalytics: state.sendAnalytics,
      sendCrashReports: state.sendCrashReports,
      debugLogging: state.debugLogging,
      uiScale: sanitizeUiScalePercent(state.uiScale) / 100,
    },
    'app settings',
  );
};

export const useOnboardingStore = create<OnboardingStore>()(
  persist(
    (set, get) => ({
      ...createDefaultState(),

      initialize: async () => {
        set({ isInitializing: true });
        try {
          const preferencesStore = usePreferencesStore.getState();
          if (!preferencesStore.isLoaded) {
            await preferencesStore.loadPreferences();
          }

          const completed = usePreferencesStore.getState()._cachedOnboardingCompleted ?? false;
          const preferences = usePreferencesStore.getState().preferences;
          
          if (completed) {
            if (preferences) {
              set((state) => ({
                selectedTheme: THEME_VALUE_TO_NAME[preferences.theme] ?? state.selectedTheme,
                libraryPath: preferences.defaultImportPath ?? preferences.defaultMangaPath ?? state.libraryPath ?? null,
                mangaPrefs: {
                  readingDirection: preferences.manga.direction,
                  readingMode: mapMangaMode(preferences.manga.mode),
                  fitMode: preferences.manga.fitWidth ? 'width' : 'contain',
                  stripMargin: preferences.manga.marginSize,
                  progressBarPosition: preferences.manga.progressBar,
                  stickyHeader: true,
                  showNavigationTips: preferences.autoGroupManga,
                  autoGroupVolumes: preferences.autoGroupManga,
                  theme: preferences.theme === 'black' || preferences.theme === 'dark' ? 'dark' : 'light',
                  imageQuality: preferences.manga.imageSmoothing ? 'high' : 'low',
                  preloadIntensity: preferences.manga.preloadCount,
                },
                bookPrefs: {
                  fontFamily: normalizeLegacyFontPreference(preferences.book.fontFamily),
                  fontSize: preferences.book.fontSize,
                  lineHeight: preferences.book.lineHeight,
                  pageWidth: preferences.book.pageWidth,
                  scrollMode: preferences.book.scrollMode,
                  textJustification: preferences.book.justification === 'justify' ? 'on' : 'off',
                  hyphenation: preferences.book.hyphenation,
                  animationSpeed: preferences.book.animationSpeed,
                  paragraphSpacing: preferences.book.paragraphSpacing,
                  customCSS: preferences.book.customCSS,
                },
                defaultMangaSource: 'mangadex',
                defaultBookSource: 'libgen',
                onboardingComplete: true,
                currentStep: TOTAL_STEPS,
              }));
            } else {
              set({ onboardingComplete: true, currentStep: TOTAL_STEPS });
            }
          } else {
            if (preferences) {
              set((state) => ({
                libraryPath: state.libraryPath ?? preferences.defaultImportPath ?? preferences.defaultMangaPath ?? null,
                defaultMangaSource: 'mangadex',
                defaultBookSource: 'libgen',
                onboardingComplete: false,
                currentStep: 1,
              }));
            } else {
              set({ onboardingComplete: false, currentStep: 1, defaultMangaSource: 'mangadex', defaultBookSource: 'libgen' });
            }
          }
        } catch (error) {
          logger.error('Failed to initialize onboarding state:', error);
        } finally {
          set({ isInitializing: false, isHydrated: true });
        }
      },

      setCurrentStep: (step) => set({ currentStep: step }),

      nextStep: () =>
        set((state) => ({ currentStep: Math.min(TOTAL_STEPS, state.currentStep + 1) as 1 | 2 | 3 | 4 | 5 })),

      prevStep: () =>
        set((state) => ({ currentStep: Math.max(1, state.currentStep - 1) as 1 | 2 | 3 | 4 | 5 })),

      setLibraryPath: (path) => {
        set({ libraryPath: path });
        void pushLibraryPath(path).catch((error) => {
          logger.error('Failed to persist library path:', error);
        });
      },

      setSelectedTheme: (theme) => {
        set({ selectedTheme: theme });
        void pushTheme(theme).catch((error) => {
          logger.error('Failed to persist selected theme:', error);
        });
      },

      setMangaPrefs: (updates) => {
        const merged = { ...get().mangaPrefs, ...updates };
        set({ mangaPrefs: merged });
        void pushMangaPrefs(merged).catch((error) => {
          logger.error('Failed to persist manga preferences:', error);
        });
      },

      setBookPrefs: (updates) => {
        const merged = {
          ...get().bookPrefs,
          ...updates,
          ...(updates.fontFamily ? { fontFamily: normalizeLegacyFontPreference(updates.fontFamily) } : {}),
        };
        set({ bookPrefs: merged });
        void pushBookPrefs(merged).catch((error) => {
          logger.error('Failed to persist book preferences:', error);
        });
      },

      setTranslationLanguage: (translationLanguage) => {
        const normalizedLanguage = sanitizeTranslationLanguage(translationLanguage);
        set({ translationLanguage: normalizedLanguage });
        void persistGeneralSettings(
          { translationTargetLanguage: normalizedLanguage },
          'translation language',
        );
      },

      setAutoTranslate: (autoTranslate) => {
        set({ autoTranslate });
        void persistGeneralSettings({ autoTranslate }, 'auto translate');
      },

      setCacheSizeMB: (cacheSizeMB) => {
        const normalizedCacheSizeMB = sanitizeCacheSizeMB(cacheSizeMB);
        set({ cacheSizeMB: normalizedCacheSizeMB });
        void persistGeneralSettings(
          { cacheSizeLimitMB: normalizedCacheSizeMB },
          'cache size',
        );
      },

      setLibrarySizeLimit: (librarySizeLimit) => {
        const normalizedLibrarySizeLimit = sanitizeLibrarySizeLimit(librarySizeLimit);
        set({ librarySizeLimit: normalizedLibrarySizeLimit });
        void persistGeneralSettings({ librarySizeLimit: normalizedLibrarySizeLimit }, 'library size limit');
      },

      setSendAnalytics: (sendAnalytics) => {
        set({ sendAnalytics });
        void persistGeneralSettings({ sendAnalytics }, 'analytics preference');
      },

      setSendCrashReports: (sendCrashReports) => {
        set({ sendCrashReports });
        void persistGeneralSettings({ sendCrashReports }, 'crash reporting preference');
      },

      setDebugLogging: (debugLogging) => {
        set({ debugLogging });
        void persistGeneralSettings({ debugLogging }, 'debug logging preference');
      },

      setUiScale: (uiScale) => {
        const normalizedUiScale = sanitizeUiScalePercent(uiScale);
        set({ uiScale: normalizedUiScale });
        void persistGeneralSettings({ uiScale: normalizedUiScale / 100 }, 'ui scale');
      },

      setEnableCloudSync: (enableCloudSync) => {
        set({ enableCloudSync });
        void persistGeneralSettings({ enableCloudSync }, 'cloud sync');
      },

      setEnableNotifications: (enableNotifications) => {
        set({ enableNotifications });
        void persistGeneralSettings({ enableNotifications }, 'notifications');
      },

      setDefaultMangaSource: (defaultMangaSource) => set({ defaultMangaSource }),
      setDefaultBookSource: (defaultBookSource) => set({ defaultBookSource }),

      completeOnboarding: async () => {
        const state = get();

        await Promise.all([
          pushLibraryPath(state.libraryPath),
          pushTheme(state.selectedTheme),
          pushMangaPrefs(state.mangaPrefs),
          pushBookPrefs(state.bookPrefs),
          pushOnboardingGeneralSettings(state),
        ]);

        if (state.defaultMangaSource) {
          localStorage.setItem('shiori_default_manga_source', state.defaultMangaSource);
        }
        if (state.defaultBookSource) {
          localStorage.setItem('shiori_default_book_source', state.defaultBookSource);
        }

        await api.completeOnboarding([]);
        set({ onboardingComplete: true, currentStep: TOTAL_STEPS });
      },

      resetOnboarding: () => {
        set({ ...createDefaultState(), isHydrated: true });
      },
    }),
    {
      name: 'shiori-onboarding-v2',
      partialize: (state) => ({
        onboardingComplete: state.onboardingComplete,
        currentStep: state.currentStep,
        libraryPath: state.libraryPath,
        selectedTheme: state.selectedTheme,
        mangaPrefs: state.mangaPrefs,
        bookPrefs: state.bookPrefs,
        translationLanguage: state.translationLanguage,
        autoTranslate: state.autoTranslate,
        cacheSizeMB: state.cacheSizeMB,
        librarySizeLimit: state.librarySizeLimit,
        sendAnalytics: state.sendAnalytics,
        sendCrashReports: state.sendCrashReports,
        debugLogging: state.debugLogging,
        uiScale: state.uiScale,
        enableCloudSync: state.enableCloudSync,
        enableNotifications: state.enableNotifications,
        defaultMangaSource: state.defaultMangaSource,
        defaultBookSource: state.defaultBookSource,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          logger.error('Failed to hydrate onboarding store:', error);
        }
        if (state) {
          state.isHydrated = true;
        }
      },
    }
  )
);
