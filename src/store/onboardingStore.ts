import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { logger } from '@/lib/logger';
import { api } from '@/lib/tauri';
import type { Theme } from '@/types/preferences';
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
  theme: 'light' | 'dark' | 'sepia';
  backgroundColor: string;
  textColor: string;
  margin: number;
  letterSpacing: number;
  readingWidth: number;
  brightness: number;
  textAlignment: 'left' | 'center' | 'right' | 'justify';
  twoPageView: boolean;
  pageTransitionEnabled: boolean;
  pageTransitionStyle: 'slide' | 'fade' | 'curl' | 'none';
  pageTransitionSpeed: number;
  paperTextureIntensity: number;
  uiScale: number;
}

export interface OnboardingWizardState {
  onboardingComplete: boolean;
  currentStep: 1 | 2 | 3 | 4 | 5 | 6;
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
  isHydrated: boolean;
  isInitializing: boolean;
}

interface OnboardingStore extends OnboardingWizardState {
  initialize: () => Promise<void>;
  setCurrentStep: (step: 1 | 2 | 3 | 4 | 5 | 6) => void;
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
  completeOnboarding: () => Promise<void>;
  resetOnboarding: () => void;
}

const TOTAL_STEPS = 6;

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
    readingMode: 'single',
    fitMode: 'width',
    stripMargin: 0,
    progressBarPosition: 'bottom',
    stickyHeader: true,
    showNavigationTips: true,
    autoGroupVolumes: true,
    theme: 'dark',
    imageQuality: 'high',
    preloadIntensity: 3,
  },
  bookPrefs: {
    fontFamily: 'Georgia, serif',
    fontSize: 18,
    lineHeight: 1.6,
    pageWidth: 720,
    scrollMode: 'paged',
    textJustification: 'off',
    hyphenation: false,
    animationSpeed: 250,
    paragraphSpacing: 1,
    customCSS: '',
    theme: 'light',
    backgroundColor: '#ffffff',
    textColor: '#111111',
    margin: 24,
    letterSpacing: 0,
    readingWidth: 720,
    brightness: 1,
    textAlignment: 'left',
    twoPageView: false,
    pageTransitionEnabled: true,
    pageTransitionStyle: 'slide',
    pageTransitionSpeed: 250,
    paperTextureIntensity: 0,
    uiScale: 1,
  },
  translationLanguage: 'en',
  autoTranslate: false,
  cacheSizeMB: 500,
  librarySizeLimit: 10000,
  sendAnalytics: false,
  sendCrashReports: false,
  debugLogging: false,
  uiScale: 80,
  enableCloudSync: false,
  enableNotifications: true,
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
    fontFamily: prefs.fontFamily,
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

export const useOnboardingStore = create<OnboardingStore>()(
  persist(
    (set, get) => ({
      ...createDefaultState(),

      initialize: async () => {
        set({ isInitializing: true });
        try {
          const backendState = await api.getOnboardingState();
          const preferencesStore = usePreferencesStore.getState();

          if (!preferencesStore.isLoaded) {
            await preferencesStore.loadPreferences();
          }

          const preferences = usePreferencesStore.getState().preferences;
          if (backendState.completed) {
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
                  fontFamily: preferences.book.fontFamily,
                  fontSize: preferences.book.fontSize,
                  lineHeight: preferences.book.lineHeight,
                  pageWidth: preferences.book.pageWidth,
                  scrollMode: preferences.book.scrollMode,
                  textJustification: preferences.book.justification === 'justify' ? 'on' : 'off',
                  hyphenation: preferences.book.hyphenation,
                  animationSpeed: preferences.book.animationSpeed,
                  paragraphSpacing: preferences.book.paragraphSpacing,
                  customCSS: preferences.book.customCSS,
                  theme: preferences.theme === 'black' || preferences.theme === 'dark' ? 'dark' : 'light',
                  backgroundColor: '#ffffff',
                  textColor: '#111111',
                  margin: 24,
                  letterSpacing: 0,
                  readingWidth: preferences.book.pageWidth,
                  brightness: 1,
                  textAlignment: 'left',
                  twoPageView: false,
                  pageTransitionEnabled: true,
                  pageTransitionStyle: 'slide',
                  pageTransitionSpeed: preferences.book.animationSpeed,
                  paperTextureIntensity: 0,
                  uiScale: preferences.uiScale ?? 1,
                },
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
                onboardingComplete: false,
                currentStep: 1,
              }));
            } else {
              set({ onboardingComplete: false, currentStep: 1 });
            }
          }
        } catch (error) {
          logger.error('Failed to initialize onboarding state:', error);
        } finally {
          set({ isInitializing: false });
        }
      },

      setCurrentStep: (step) => set({ currentStep: step }),

      nextStep: () =>
        set((state) => ({ currentStep: Math.min(TOTAL_STEPS, state.currentStep + 1) as 1 | 2 | 3 | 4 | 5 | 6 })),

      prevStep: () =>
        set((state) => ({ currentStep: Math.max(1, state.currentStep - 1) as 1 | 2 | 3 | 4 | 5 | 6 })),

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
        const merged = { ...get().bookPrefs, ...updates };
        set({ bookPrefs: merged });
        void pushBookPrefs(merged).catch((error) => {
          logger.error('Failed to persist book preferences:', error);
        });
      },

      setTranslationLanguage: (translationLanguage) => set({ translationLanguage }),

      setAutoTranslate: (autoTranslate) => set({ autoTranslate }),

      setCacheSizeMB: (cacheSizeMB) => set({ cacheSizeMB }),

      setLibrarySizeLimit: (librarySizeLimit) => set({ librarySizeLimit }),

      setSendAnalytics: (sendAnalytics) => set({ sendAnalytics }),

      setSendCrashReports: (sendCrashReports) => set({ sendCrashReports }),

      setDebugLogging: (debugLogging) => set({ debugLogging }),

      setUiScale: (uiScale) => set({ uiScale }),

      setEnableCloudSync: (enableCloudSync) => set({ enableCloudSync }),

      setEnableNotifications: (enableNotifications) => set({ enableNotifications }),

      completeOnboarding: async () => {
        const state = get();

        await pushLibraryPath(state.libraryPath);
        await pushTheme(state.selectedTheme);
        await pushMangaPrefs(state.mangaPrefs);
        await pushBookPrefs(state.bookPrefs);

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
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.isHydrated = true;
        }
      },
    }
  )
);
