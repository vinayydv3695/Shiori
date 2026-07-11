import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOnboardingState } from './hooks/useOnboardingState';
import { useLibraryStore } from '@/store/libraryStore';
import { ParticleCanvas } from '@/components/onboarding/components';
import { WelcomeStep } from './steps/WelcomeStep';
import { ContentTypeStep } from './steps/ContentTypeStep';
import { AppCustomizationStep } from './steps/AppCustomizationStep';
import { ImportStep } from './steps/ImportStep';
import { CloudIntegrationStep } from './steps/CloudIntegrationStep';
import { IntegrationsStep } from './steps/IntegrationsStep';
import { FinishStep } from './steps/FinishStep';

interface OnboardingWizardProps {
  onComplete?: () => void | Promise<void>;
}

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const {
    state,
    isHydrated,
    isInitializing,
    nextStep,
    prevStep,
    setLibraryPath,
    completeOnboarding,
  } = useOnboardingState();
  const loadInitialBooks = useLibraryStore((s) => s.loadInitialBooks);

  const [isFinishing, setIsFinishing] = useState(false);

  // If path is cloud, we skip step 4, so total steps is 6, else 7
  const totalSteps = state.onboardingPath === 'cloud' ? 6 : 7;
  
  // Calculate visual step based on current step and path
  let visualStep = state.currentStep;
  if (state.onboardingPath === 'cloud' && state.currentStep > 4) {
    visualStep -= 1;
  }
  const progressPercent = ((visualStep - 1) / (totalSteps - 1)) * 100;

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
    if (!state.libraryPath?.trim()) {
      // You can skip this step, but typically handled inside ImportStep.
    }
    nextStep();
  };

  const appVersion = import.meta.env.VITE_APP_VERSION ?? '1.0.2';

  if (!isHydrated || isInitializing) {
    return (
      <div className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-background text-foreground">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_10%,hsl(var(--foreground)/0.08),transparent_60%)]" />
        <div className="h-12 w-12 animate-spin rounded-full border border-foreground/20 border-b-foreground/80" />
      </div>
    );
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background text-foreground transition-colors duration-500">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,hsl(var(--foreground)/0.08),transparent_62%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,hsl(var(--background)/0.2),hsl(var(--background)/0.55))]" />
      <ParticleCanvas />

      <div className="relative z-10 flex h-full min-h-0 w-full flex-col overflow-hidden">
        {/* Unified Top Progress Indicator */}
        {state.currentStep > 1 && (
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-border/20 z-50">
            <motion.div
              className="h-full bg-primary"
              initial={{ width: 0 }}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 0.5, ease: 'easeInOut' }}
            />
          </div>
        )}

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
              <ContentTypeStep
                onBack={prevStep}
                onNext={nextStep}
              />
            ) : null}
            {state.currentStep === 3 ? (
              <AppCustomizationStep
                onBack={prevStep}
                onNext={nextStep}
              />
            ) : null}
            {state.currentStep === 4 ? (
              <ImportStep 
                libraryPath={state.libraryPath} 
                onSelectPath={setLibraryPath} 
                onBack={prevStep} 
                onNext={handleImportNext} 
              />
            ) : null}
            {state.currentStep === 5 ? (
              <CloudIntegrationStep
                onBack={prevStep}
                onNext={nextStep}
              />
            ) : null}
            {state.currentStep === 6 ? (
              <IntegrationsStep
                onBack={prevStep}
                onNext={nextStep}
              />
            ) : null}
            {state.currentStep === 7 ? (
              <FinishStep
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

export default OnboardingWizard;
