import { useMemo } from 'react';
import {
  type BookPrefs,
  type MangaPrefs,
  type ThemeName,
  useOnboardingStore,
} from '@/store/onboardingStore';

export interface OnboardingState {
  currentStep: 1 | 2 | 3 | 4 | 5;
  libraryPath: string | null;
  selectedTheme: ThemeName;
  mangaPrefs: {
    readingDirection: 'rtl' | 'ltr';
    viewMode: 'single' | 'double' | 'scroll';
    autoGroupVolumes: boolean;
  };
  bookPrefs: {
    fontSize: number;
    lineSpacing: 'compact' | 'comfortable' | 'relaxed';
    pageMode: 'paginated' | 'scroll';
  };
}

interface UseOnboardingStateResult {
  state: OnboardingState;
  onboardingComplete: boolean;
  isHydrated: boolean;
  isInitializing: boolean;
  nextStep: () => void;
  prevStep: () => void;
  setCurrentStep: (step: 1 | 2 | 3 | 4 | 5) => void;
  setLibraryPath: (path: string | null) => void;
  setSelectedTheme: (theme: ThemeName) => void;
  setMangaPrefs: (updates: Partial<MangaPrefs>) => void;
  setBookPrefs: (updates: Partial<BookPrefs>) => void;
  completeOnboarding: () => Promise<void>;
  initialize: () => Promise<void>;
  canGoBack: boolean;
  canGoNext: boolean;
}

export function useOnboardingState(): UseOnboardingStateResult {
  const currentStep = useOnboardingStore((s) => s.currentStep);
  const libraryPath = useOnboardingStore((s) => s.libraryPath);
  const selectedTheme = useOnboardingStore((s) => s.selectedTheme);
  const mangaPrefs = useOnboardingStore((s) => s.mangaPrefs);
  const bookPrefs = useOnboardingStore((s) => s.bookPrefs);
  const onboardingComplete = useOnboardingStore((s) => s.onboardingComplete);
  const isHydrated = useOnboardingStore((s) => s.isHydrated);
  const isInitializing = useOnboardingStore((s) => s.isInitializing);

  const nextStep = useOnboardingStore((s) => s.nextStep);
  const prevStep = useOnboardingStore((s) => s.prevStep);
  const setCurrentStep = useOnboardingStore((s) => s.setCurrentStep);
  const setLibraryPath = useOnboardingStore((s) => s.setLibraryPath);
  const setSelectedTheme = useOnboardingStore((s) => s.setSelectedTheme);
  const setMangaPrefs = useOnboardingStore((s) => s.setMangaPrefs);
  const setBookPrefs = useOnboardingStore((s) => s.setBookPrefs);
  const completeOnboarding = useOnboardingStore((s) => s.completeOnboarding);
  const initialize = useOnboardingStore((s) => s.initialize);

  const state = useMemo<OnboardingState>(
    () => ({
      currentStep,
      libraryPath,
      selectedTheme,
      mangaPrefs,
      bookPrefs,
    }),
    [currentStep, libraryPath, selectedTheme, mangaPrefs, bookPrefs]
  );

  return {
    state,
    onboardingComplete,
    isHydrated,
    isInitializing,
    nextStep,
    prevStep,
    setCurrentStep,
    setLibraryPath,
    setSelectedTheme,
    setMangaPrefs,
    setBookPrefs,
    completeOnboarding,
    initialize,
    canGoBack: currentStep > 1,
    canGoNext: currentStep < 5,
  };
}
