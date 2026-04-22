import { useMemo } from 'react';
import {
  type BookPrefs,
  type MangaPrefs,
  type ThemeName,
  useOnboardingStore,
} from '@/store/onboardingStore';

export interface OnboardingState {
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
}

interface UseOnboardingStateResult {
  state: OnboardingState;
  onboardingComplete: boolean;
  isHydrated: boolean;
  isInitializing: boolean;
  nextStep: () => void;
  prevStep: () => void;
  setCurrentStep: (step: 1 | 2 | 3 | 4 | 5 | 6) => void;
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
  const translationLanguage = useOnboardingStore((s) => s.translationLanguage);
  const autoTranslate = useOnboardingStore((s) => s.autoTranslate);
  const cacheSizeMB = useOnboardingStore((s) => s.cacheSizeMB);
  const librarySizeLimit = useOnboardingStore((s) => s.librarySizeLimit);
  const sendAnalytics = useOnboardingStore((s) => s.sendAnalytics);
  const sendCrashReports = useOnboardingStore((s) => s.sendCrashReports);
  const debugLogging = useOnboardingStore((s) => s.debugLogging);
  const uiScale = useOnboardingStore((s) => s.uiScale);
  const enableCloudSync = useOnboardingStore((s) => s.enableCloudSync);
  const enableNotifications = useOnboardingStore((s) => s.enableNotifications);
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
  const setTranslationLanguage = useOnboardingStore((s) => s.setTranslationLanguage);
  const setAutoTranslate = useOnboardingStore((s) => s.setAutoTranslate);
  const setCacheSizeMB = useOnboardingStore((s) => s.setCacheSizeMB);
  const setLibrarySizeLimit = useOnboardingStore((s) => s.setLibrarySizeLimit);
  const setSendAnalytics = useOnboardingStore((s) => s.setSendAnalytics);
  const setSendCrashReports = useOnboardingStore((s) => s.setSendCrashReports);
  const setDebugLogging = useOnboardingStore((s) => s.setDebugLogging);
  const setUiScale = useOnboardingStore((s) => s.setUiScale);
  const setEnableCloudSync = useOnboardingStore((s) => s.setEnableCloudSync);
  const setEnableNotifications = useOnboardingStore((s) => s.setEnableNotifications);
  const completeOnboarding = useOnboardingStore((s) => s.completeOnboarding);
  const initialize = useOnboardingStore((s) => s.initialize);

  const state = useMemo<OnboardingState>(
    () => ({
      currentStep,
      libraryPath,
      selectedTheme,
      mangaPrefs,
      bookPrefs,
      translationLanguage,
      autoTranslate,
      cacheSizeMB,
      librarySizeLimit,
      sendAnalytics,
      sendCrashReports,
      debugLogging,
      uiScale,
      enableCloudSync,
      enableNotifications,
    }),
    [
      currentStep,
      libraryPath,
      selectedTheme,
      mangaPrefs,
      bookPrefs,
      translationLanguage,
      autoTranslate,
      cacheSizeMB,
      librarySizeLimit,
      sendAnalytics,
      sendCrashReports,
      debugLogging,
      uiScale,
      enableCloudSync,
      enableNotifications,
    ]
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
    setTranslationLanguage,
    setAutoTranslate,
    setCacheSizeMB,
    setLibrarySizeLimit,
    setSendAnalytics,
    setSendCrashReports,
    setDebugLogging,
    setUiScale,
    setEnableCloudSync,
    setEnableNotifications,
    completeOnboarding,
    initialize,
    canGoBack: currentStep > 1,
    canGoNext: currentStep < 6,
  };
}
