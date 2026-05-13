import { useCallback, useEffect, useRef, useState } from 'react';
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

  const [renderedStep, setRenderedStep] = useState<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8>(1);
  const [phase, setPhase] = useState<TransitionPhase>('idle');
  const [isFinishing, setIsFinishing] = useState(false);
  const [hasTorboxKey, setHasTorboxKey] = useState<boolean | null>(null);
  const transitionTimerRef = useRef<number | null>(null);
  const enterAnimationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (state.currentStep === renderedStep) return;
    setPhase('exiting');

    if (transitionTimerRef.current !== null) {
      window.clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }
    if (enterAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(enterAnimationFrameRef.current);
      enterAnimationFrameRef.current = null;
    }

    transitionTimerRef.current = window.setTimeout(() => {
      setRenderedStep(state.currentStep);
      setPhase('entering');
      enterAnimationFrameRef.current = window.requestAnimationFrame(() => {
        setPhase('idle');
        enterAnimationFrameRef.current = null;
      });
      transitionTimerRef.current = null;
    }, TRANSITION_MS);

    return () => {
      if (transitionTimerRef.current !== null) {
        window.clearTimeout(transitionTimerRef.current);
        transitionTimerRef.current = null;
      }
      if (enterAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(enterAnimationFrameRef.current);
        enterAnimationFrameRef.current = null;
      }
    };
  }, [renderedStep, state.currentStep]);

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

  const transitionClass =
    phase === 'exiting'
      ? '-translate-x-10 opacity-0'
      : phase === 'entering'
        ? 'translate-x-10 opacity-0'
        : 'translate-x-0 opacity-100';

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

      <div className={`relative z-10 flex h-full min-h-0 w-full flex-col overflow-hidden transition-all duration-300 ease-out ${transitionClass}`}>
        {renderedStep === 1 ? <WelcomeStep appVersion={appVersion} onStart={nextStep} /> : null}
        {renderedStep === 2 ? (
          <ThemeStep
            selectedTheme={state.selectedTheme}
            themes={THEME_OPTIONS}
            onSelectTheme={setSelectedTheme}
            onBack={prevStep}
            onNext={nextStep}
          />
        ) : null}
        {renderedStep === 3 ? <ImportStep libraryPath={state.libraryPath} onSelectPath={setLibraryPath} onBack={prevStep} onNext={handleImportNext} /> : null}
        {renderedStep === 4 ? (
          <TorboxIntegrationStep
            onBack={prevStep}
            onNext={() => {
              void handleTorboxNext();
            }}
          />
        ) : null}
        {renderedStep === 5 && hasTorboxKey !== false ? (
          <CloudIntegrationStep
            onBack={prevStep}
            onNext={nextStep}
          />
        ) : null}
        {renderedStep === 6 ? (
          <PreferencesStep
            mangaPrefs={state.mangaPrefs}
            bookPrefs={state.bookPrefs}
            onMangaChange={setMangaPrefs}
            onBookChange={setBookPrefs}
            onBack={handlePreferencesBack}
            onNext={nextStep}
          />
        ) : null}
        {renderedStep === 7 ? (
          <AppSettingsStep
            onBack={prevStep}
            onNext={nextStep}
          />
        ) : null}
        {renderedStep === 8 ? (
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
      </div>
    </div>
  );
}
