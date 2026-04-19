import { useEffect, useRef, useState } from 'react';
import { useOnboardingState } from './hooks/useOnboardingState';
import { THEME_OPTIONS } from '@/store/onboardingStore';
import { useLibraryStore } from '@/store/libraryStore';
import { ShioriMark } from '@/components/icons/ShioriIcons';
import { ParticleCanvas } from '@/components/onboarding/components';
import OnboardingProgress from '@/components/onboarding/OnboardingProgress';
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
    completeOnboarding,
  } = useOnboardingState();
  const loadInitialBooks = useLibraryStore((s) => s.loadInitialBooks);

  const [renderedStep, setRenderedStep] = useState<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8>(1);
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
          <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-indigo-300/80"></div>
        </div>
      </div>
    );
  }

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

  const appVersion = import.meta.env.VITE_APP_VERSION ?? '1.0.2';

  const transitionClass =
    phase === 'exiting'
      ? '-translate-x-8 opacity-0'
      : phase === 'entering'
        ? 'translate-x-8 opacity-0'
        : 'translate-x-0 opacity-100';

  return (
    <div className="relative flex h-screen w-full flex-col bg-slate-950 p-4 text-white md:p-6 lg:p-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(79,70,229,0.15),transparent_70%)]" />
      <ParticleCanvas />

      <div className="relative z-10 mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col overflow-hidden rounded-3xl border border-white/5 bg-slate-950 p-3 md:p-6">
        <header className="mb-2 flex shrink-0 items-center gap-2 border-b border-white/5 px-2 pb-4 pt-1">
          <ShioriMark size={28} className="text-white" aria-hidden="true" />
          <span className="text-lg font-semibold tracking-tight text-white">Shiori</span>
        </header>

        <div className="shrink-0">
          <OnboardingProgress currentStep={state.currentStep as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8} />
        </div>

        <div className={`flex flex-1 min-h-0 flex-col overflow-hidden transition-all duration-300 ease-out ${transitionClass}`}>
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
          {renderedStep === 3 ? <ImportStep libraryPath={state.libraryPath} onSelectPath={setLibraryPath} onBack={prevStep} onNext={nextStep} /> : null}
          {renderedStep === 4 ? (
            <TorboxIntegrationStep
              onBack={prevStep}
              onNext={nextStep}
            />
          ) : null}
          {renderedStep === 5 ? (
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
              onBack={prevStep}
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
    </div>
  );
}
