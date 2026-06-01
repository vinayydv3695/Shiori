import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOnboardingState } from './hooks/useOnboardingState';
import { THEME_OPTIONS } from '@/store/onboardingStore';
import { useLibraryStore } from '@/store/libraryStore';
import { api } from '@/lib/tauri';
import { ParticleCanvas } from '@/components/onboarding/components';
import { WelcomeStep } from './steps/WelcomeStep';
import { ImportStep } from './steps/ImportStep';
import { ThemeStep } from './steps/ThemeStep';
import { TorboxIntegrationStep } from './steps/TorboxIntegrationStep';
import { CloudIntegrationStep } from './steps/CloudIntegrationStep';
import { PreferencesStep } from './steps/PreferencesStep';
import { AppSettingsStep } from './steps/AppSettingsStep';
import { FinishStep } from './steps/FinishStep';

interface OnboardingWizardProps {
  onComplete?: () => void | Promise<void>;
}

type TransitionPhase = 'idle' | 'exiting' | 'entering';
const TRANSITION_MS = 300;

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const {
    state,
    isHydrated,
    isInitializing,
    nextStep,
    prevStep,
    setLibraryPath,
    setSelectedTheme,
    setMangaPrefs,
    setBookPrefs,
    setCurrentStep,
    completeOnboarding,
  } = useOnboardingState();
  const loadInitialBooks = useLibraryStore((s) => s.loadInitialBooks);

  const [isFinishing, setIsFinishing] = useState(false);
  const [hasTorboxKey, setHasTorboxKey] = useState<boolean | null>(null);

  const handleFinish = async () => {
    if (isFinishing) return;
    setIsFinishing(true);
    try {
      await completeOnboarding();
      await loadInitialBooks();
      await onComplete?.();
    } finally {
      setIsFinishing(false);
    }
  };

  const handleImportNext = () => {
    if (!state.libraryPath?.trim()) return;
    nextStep();
  };

  const resolveTorboxKeyPresence = useCallback(async () => {
    try {
      const key = await api.getTorboxKey();
      const hasKey = Boolean(key?.trim());
      setHasTorboxKey(hasKey);
      return hasKey;
    } catch {
      setHasTorboxKey(false);
      return false;
    }
  }, []);

  useEffect(() => {
    void resolveTorboxKeyPresence();
  }, [resolveTorboxKeyPresence]);

  useEffect(() => {
    if (state.currentStep !== 5) return;
    if (hasTorboxKey === null) return;
    if (!hasTorboxKey) {
      setCurrentStep(6);
    }
  }, [hasTorboxKey, setCurrentStep, state.currentStep]);

  const handleTorboxNext = async () => {
    const hasKey = await resolveTorboxKeyPresence();
    if (hasKey) {
      nextStep();
      return;
    }
    setCurrentStep(6);
  };

  const handlePreferencesBack = () => {
    if (hasTorboxKey === false) {
      setCurrentStep(4);
      return;
    }
    prevStep();
  };

  const appVersion = import.meta.env.VITE_APP_VERSION ?? '1.0.2';



  if (!isHydrated || isInitializing) {
    return (
      <div className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-zinc-950 text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_10%,rgba(255,255,255,0.08),transparent_60%)]" />
        <div className="h-12 w-12 animate-spin rounded-full border border-white/20 border-b-zinc-200" />
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-zinc-950 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.08),transparent_62%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.2),rgba(0,0,0,0.55))]" />
      <ParticleCanvas />

      <div className="relative z-10 flex h-full min-h-0 w-full flex-col overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={state.currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="flex h-full w-full flex-col"
          >
            {state.currentStep === 1 ? <WelcomeStep appVersion={appVersion} onStart={nextStep} /> : null}
            {state.currentStep === 2 ? (
              <ThemeStep
                selectedTheme={state.selectedTheme}
                themes={THEME_OPTIONS}
                onSelectTheme={setSelectedTheme}
                onBack={prevStep}
                onNext={nextStep}
              />
            ) : null}
            {state.currentStep === 3 ? <ImportStep libraryPath={state.libraryPath} onSelectPath={setLibraryPath} onBack={prevStep} onNext={handleImportNext} /> : null}
            {state.currentStep === 4 ? (
              <TorboxIntegrationStep
                onBack={prevStep}
                onNext={() => {
                  void handleTorboxNext();
                }}
              />
            ) : null}
            {state.currentStep === 5 && hasTorboxKey !== false ? (
              <CloudIntegrationStep
                onBack={prevStep}
                onNext={nextStep}
              />
            ) : null}
            {state.currentStep === 6 ? (
              <PreferencesStep
                mangaPrefs={state.mangaPrefs}
                bookPrefs={state.bookPrefs}
                onMangaChange={setMangaPrefs}
                onBookChange={setBookPrefs}
                onBack={handlePreferencesBack}
                onNext={nextStep}
              />
            ) : null}
            {state.currentStep === 7 ? (
              <AppSettingsStep
                onBack={prevStep}
                onNext={nextStep}
              />
            ) : null}
            {state.currentStep === 8 ? (
              <FinishStep
                libraryPath={state.libraryPath}
                selectedTheme={state.selectedTheme}
                mangaPrefs={state.mangaPrefs}
                bookPrefs={state.bookPrefs}
                onBack={prevStep}
                onOpenLibrary={handleFinish}
                isFinishing={isFinishing}
              />
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
