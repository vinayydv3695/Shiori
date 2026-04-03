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
  viewMode: 'single' | 'double' | 'scroll';
  autoGroupVolumes: boolean;
}

export interface BookPrefs {
  fontSize: number;
  lineSpacing: 'compact' | 'comfortable' | 'relaxed';
  pageMode: 'paginated' | 'scroll';
}

export interface OnboardingWizardState {
  onboardingComplete: boolean;
  currentStep: 1 | 2 | 3 | 4 | 5;
  libraryPath: string | null;
  selectedTheme: ThemeName;
  mangaPrefs: MangaPrefs;
  bookPrefs: BookPrefs;
  isHydrated: boolean;
  isInitializing: boolean;
}

interface OnboardingStore extends OnboardingWizardState {
  initialize: () => Promise<void>;
  setCurrentStep: (step: 1 | 2 | 3 | 4 | 5) => void;
  nextStep: () => void;
  prevStep: () => void;
  setLibraryPath: (path: string | null) => void;
  setSelectedTheme: (theme: ThemeName) => void;
  setMangaPrefs: (updates: Partial<MangaPrefs>) => void;
  setBookPrefs: (updates: Partial<BookPrefs>) => void;
  completeOnboarding: () => Promise<void>;
  resetOnboarding: () => void;
}

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

const mapBookLineHeightToSpacing = (lineHeight: number): BookPrefs['lineSpacing'] => {
  if (lineHeight >= 1.75) return 'relaxed';
  if (lineHeight <= 1.45) return 'compact';
  return 'comfortable';
};

const mapBookSpacingToLineHeight = (lineSpacing: BookPrefs['lineSpacing']): number => {
  if (lineSpacing === 'compact') return 1.4;
  if (lineSpacing === 'relaxed') return 1.8;
  return 1.6;
};

const mapMangaModeToViewMode = (mode: string): MangaPrefs['viewMode'] => {
  if (mode === 'double') return 'double';
  if (mode === 'webtoon') return 'scroll';
  return 'single';
};

const mapViewModeToMangaMode = (viewMode: MangaPrefs['viewMode']): 'single' | 'double' | 'webtoon' => {
  if (viewMode === 'double') return 'double';
  if (viewMode === 'scroll') return 'webtoon';
  return 'single';
};

const createDefaultState = (): OnboardingWizardState => ({
  onboardingComplete: false,
  currentStep: 1,
  libraryPath: null,
  selectedTheme: getDefaultThemeName(),
  mangaPrefs: {
    readingDirection: 'rtl',
    viewMode: 'single',
    autoGroupVolumes: true,
  },
  bookPrefs: {
    fontSize: 18,
    lineSpacing: 'comfortable',
    pageMode: 'paginated',
  },
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
      mode: mapViewModeToMangaMode(prefs.viewMode),
    }),
    usePreferencesStore.getState().updateGeneralSettings({
      autoGroupManga: prefs.autoGroupVolumes,
    }),
  ]);
};

const pushBookPrefs = async (prefs: BookPrefs): Promise<void> => {
  await usePreferencesStore.getState().updateBookDefaults({
    fontSize: prefs.fontSize,
    lineHeight: mapBookSpacingToLineHeight(prefs.lineSpacing),
    scrollMode: prefs.pageMode === 'scroll' ? 'continuous' : 'paged',
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
                  viewMode: mapMangaModeToViewMode(preferences.manga.mode),
                  autoGroupVolumes: preferences.autoGroupManga,
                },
                bookPrefs: {
                  fontSize: preferences.book.fontSize,
                  lineSpacing: mapBookLineHeightToSpacing(preferences.book.lineHeight),
                  pageMode: preferences.book.scrollMode === 'continuous' ? 'scroll' : 'paginated',
                },
                onboardingComplete: true,
                currentStep: 5,
              }));
            } else {
              set({ onboardingComplete: true, currentStep: 5 });
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
        set((state) => ({ currentStep: Math.min(5, state.currentStep + 1) as 1 | 2 | 3 | 4 | 5 })),

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
        const merged = { ...get().bookPrefs, ...updates };
        set({ bookPrefs: merged });
        void pushBookPrefs(merged).catch((error) => {
          logger.error('Failed to persist book preferences:', error);
        });
      },

      completeOnboarding: async () => {
        const state = get();

        await pushLibraryPath(state.libraryPath);
        await pushTheme(state.selectedTheme);
        await pushMangaPrefs(state.mangaPrefs);
        await pushBookPrefs(state.bookPrefs);

        await api.completeOnboarding([]);
        set({ onboardingComplete: true, currentStep: 5 });
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
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.isHydrated = true;
        }
      },
    }
  )
);
