import { useEffect, useRef, useState } from 'react';
import { useOnboardingState } from './hooks/useOnboardingState';
import { THEME_OPTIONS } from '@/store/onboardingStore';
import OnboardingProgress from '@/components/onboarding/OnboardingProgress';
import { WelcomeStep } from './steps/WelcomeStep';
import { ImportStep } from './steps/ImportStep';
import { ThemeStep } from './steps/ThemeStep';
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
    completeOnboarding,
  } = useOnboardingState();

  const [renderedStep, setRenderedStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
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
      <div className="min-h-screen w-full bg-slate-950 px-4 py-4 text-white md:px-6 md:py-6 lg:px-8 lg:py-8">
        <div className="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-6xl items-center justify-center rounded-3xl border border-white/5 bg-slate-950 p-3 md:min-h-[calc(100vh-3rem)] md:p-6">
          <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-white/70"></div>
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

  // Apply 80% scale only for steps 2-6, keep step 1 at 100%
  const scaleStyle = state.currentStep === 1 
    ? {} 
    : { transform: 'scale(0.8)', transformOrigin: 'top center' };

  return (
    <div className="min-h-screen w-full bg-slate-950 px-4 py-4 text-white md:px-6 md:py-6 lg:px-8 lg:py-8">
      <div 
        className="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-6xl flex-col overflow-y-auto rounded-3xl border border-white/5 bg-slate-950 p-3 md:min-h-[calc(100vh-3rem)] md:p-6"
        style={scaleStyle}
      >
        <OnboardingProgress currentStep={state.currentStep as 1 | 2 | 3 | 4 | 5 | 6} />

        <div className={`flex-1 transition-all duration-300 ease-out ${transitionClass}`}>
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
          {renderedStep === 3 ? <ImportStep libraryPath={state.libraryPath} onSelectPath={setLibraryPath} onNext={nextStep} /> : null}
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
            <AppSettingsStep
              onBack={prevStep}
              onNext={nextStep}
            />
          ) : null}
          {renderedStep === 6 ? (
            <FinishStep
              libraryPath={state.libraryPath}
              selectedTheme={state.selectedTheme}
              mangaPrefs={state.mangaPrefs}
              bookPrefs={state.bookPrefs}
              onBack={prevStep}
              onOpenLibrary={handleFinish}
              isFinishing={isFinishing}
              onFinished={handleFinish}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
