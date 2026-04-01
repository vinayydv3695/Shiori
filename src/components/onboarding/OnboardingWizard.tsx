import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { logger } from '@/lib/logger';
import { useOnboardingStore } from '../../store/onboardingStore';
import { useToast } from '../../store/toastStore';
import { Skeleton } from '../ui/skeleton';
import { OnboardingShell } from './OnboardingShell';

const stepNames = [
  'WelcomeStep',
  'ContentSetupStep',
  'ImportBooksStep',
  'ImportMangaStep',
  'ImportComicsStep',
  'ReadingPrefsStep',
  'OptionalFeaturesStep',
  'ScanProgressStep',
  'DoneStep',
] as const;

const stepLoaders = {
  WelcomeStep: () => import('./steps/new/WelcomeStep'),
  ContentSetupStep: () => import('./steps/new/ContentSetupStep'),
  ImportBooksStep: () => import('./steps/new/ImportBooksStep'),
  ImportMangaStep: () => import('./steps/new/ImportMangaStep'),
  ImportComicsStep: () => import('./steps/new/ImportComicsStep'),
  ReadingPrefsStep: () => import('./steps/new/ReadingPrefsStep'),
  OptionalFeaturesStep: () => import('./steps/new/OptionalFeaturesStep'),
  ScanProgressStep: () => import('./steps/new/ScanProgressStep'),
  DoneStep: () => import('./steps/new/DoneStep'),
} as const;

const stepComponents = stepNames.map((name) => lazy(stepLoaders[name]));

interface OnboardingWizardProps {
  onComplete: () => void;
}

type StepNavConfig = {
  nextDisabled?: boolean;
  nextLabel?: string;
  onNext?: () => void | boolean | Promise<void | boolean>;
};

function StepSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
    </div>
  );
}

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [stepConfig, setStepConfig] = useState<StepNavConfig>({});
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);
  const isHandlingNextRef = useRef(false);
  const commit = useOnboardingStore((state) => state.commit);
  const isCommitting = useOnboardingStore((state) => state.isCommitting);
  const setSkipped = useOnboardingStore((state) => state.setSkipped);
  const toast = useToast();

  const isLastStep = currentStep === stepNames.length - 1;
  const CurrentStep = stepComponents[currentStep];

  const stepLabels = useMemo(
    () => [
      'Welcome',
      'Content Setup',
      'Import Books',
      'Import Manga',
      'Import Comics',
      'Reading Preferences',
      'Optional Features',
      'Library Scan',
      'Done',
    ],
    [],
  );

  useEffect(() => {
    const next = stepNames[currentStep + 1];
    if (next) void stepLoaders[next]();
  }, [currentStep]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setShowSkipConfirm(true);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleComplete = async () => {
    try {
      await commit();
      toast.success('Setup Complete!', 'Your preferences have been saved. Ready to explore Shiori!');
      onComplete();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to commit onboarding', error);
      toast.error('Setup Failed', `Unable to save your preferences: ${errorMessage}`);
    }
  };

  const handleNext = async () => {
    if (isCommitting || isHandlingNextRef.current) return;

    isHandlingNextRef.current = true;

    try {
      if (stepConfig.onNext) {
        const result = await stepConfig.onNext();
        if (result === false) return;
      }

      if (isLastStep) {
        await handleComplete();
        return;
      }

      setStepConfig({});
      setCurrentStep((prev) => Math.min(prev + 1, stepNames.length - 1));
    } finally {
      isHandlingNextRef.current = false;
    }
  };

  const handleSkipConfirm = async () => {
    if (isCommitting) return;
    setSkipped(true);
    setShowSkipConfirm(false);
    await handleComplete();
  };

  const registerStep = useCallback((config: StepNavConfig) => {
    setStepConfig(config);
  }, []);

  // Removed framer-motion: caused
  // layout thrash across 26 mounted step components. Simple opacity fade instead.
  return (
    <>
      <OnboardingShell
        currentStep={currentStep}
        totalSteps={stepNames.length}
        onBack={() => {
          setStepConfig({});
          setCurrentStep((prev) => Math.max(0, prev - 1));
        }}
        onNext={handleNext}
        nextLabel={stepConfig.nextLabel}
        nextDisabled={Boolean(isCommitting || stepConfig.nextDisabled)}
        stepNames={stepLabels}
      >
        <Suspense fallback={<StepSkeleton />}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            >
              <CurrentStep
                onNext={handleNext}
                onComplete={handleComplete}
                registerStep={registerStep}
              />
            </motion.div>
          </AnimatePresence>
        </Suspense>
      </OnboardingShell>

      {showSkipConfirm ? (
        <div className="fixed inset-0 z-[var(--z-modal,900)] flex items-center justify-center bg-black/65 p-4">
          <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#16161a] p-5 text-white shadow-xl">
            <h2 className="text-lg font-semibold">Skip onboarding?</h2>
            <p className="mt-2 text-sm text-zinc-300">You can change everything later from Settings.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowSkipConfirm(false)}
                className="rounded-md border border-white/20 px-3 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSkipConfirm}
                className="rounded-md bg-[var(--ob-accent,#7c3aed)] px-3 py-2 text-sm font-medium text-white"
              >
                Skip & finish
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
