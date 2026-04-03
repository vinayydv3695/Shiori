import { useEffect, useRef, useState } from 'react';
import { useOnboardingState } from './hooks/useOnboardingState';
import { THEME_OPTIONS } from '@/store/onboardingStore';
import OnboardingProgress from '@/components/onboarding/OnboardingProgress';
import { WelcomeStep } from './steps/WelcomeStep';
import { ImportStep } from './steps/ImportStep';
import { ThemeStep } from './steps/ThemeStep';
import { PreferencesStep } from './steps/PreferencesStep';
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
    completeOnboarding,
  } = useOnboardingState();

  const [renderedStep, setRenderedStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [phase, setPhase] = useState<TransitionPhase>('idle');
  const [isFinishing, setIsFinishing] = useState(false);
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

  if (!isHydrated || isInitializing) {
    return (
      <div className="min-h-screen w-full bg-background px-4 py-4 md:px-6 md:py-6 lg:px-8 lg:py-8">
        <div className="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-6xl items-center justify-center rounded-3xl border border-border/60 bg-card/30 p-3 backdrop-blur-sm md:min-h-[calc(100vh-3rem)] md:p-6">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  const handleFinish = async () => {
    if (isFinishing) return;
    setIsFinishing(true);
    try {
      await completeOnboarding();
      await onComplete?.();
    } finally {
      setIsFinishing(false);
    }
  };

  const appVersion = import.meta.env.VITE_APP_VERSION ?? '1.0.2';

  const transitionClass =
    phase === 'exiting'
      ? '-translate-x-8 opacity-0'
      : phase === 'entering'
        ? 'translate-x-8 opacity-0'
        : 'translate-x-0 opacity-100';

  return (
    <div className="min-h-screen w-full bg-background px-4 py-4 md:px-6 md:py-6 lg:px-8 lg:py-8">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-6xl flex-col rounded-3xl border border-border/60 bg-card/30 p-3 backdrop-blur-sm md:min-h-[calc(100vh-3rem)] md:p-6">
        {state.currentStep > 1 ? <OnboardingProgress currentStep={state.currentStep as 2 | 3 | 4 | 5} /> : null}

        <div className={`flex-1 transition-all duration-300 ease-out ${transitionClass}`}>
          {renderedStep === 1 ? <WelcomeStep appVersion={appVersion} onStart={nextStep} /> : null}
          {renderedStep === 2 ? <ImportStep libraryPath={state.libraryPath} onSelectPath={setLibraryPath} onNext={nextStep} /> : null}
          {renderedStep === 3 ? (
            <ThemeStep
              selectedTheme={state.selectedTheme}
              themes={THEME_OPTIONS}
              onSelectTheme={setSelectedTheme}
              onBack={prevStep}
              onNext={nextStep}
            />
          ) : null}
          {renderedStep === 4 ? (
            <PreferencesStep
              mangaPrefs={state.mangaPrefs}
              bookPrefs={state.bookPrefs}
              onMangaChange={setMangaPrefs}
              onBookChange={setBookPrefs}
              onBack={prevStep}
              onNext={nextStep}
            />
          ) : null}
          {renderedStep === 5 ? (
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
    </div>
  );
}
