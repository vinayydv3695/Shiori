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
import { cn } from '@/lib/utils';

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
        {/* Unified Floating Top Header & Progress Indicator */}
        {state.currentStep > 1 && (
          <>
            <div 
              className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3 sm:px-8 sm:py-4 bg-background/70 backdrop-blur-xl border-b border-border/40 shadow-sm"
              style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 12px)' }}
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
                  Step {visualStep} of {totalSteps}
                </span>
              </div>

              {/* Interactive Step Pill Dots */}
              <div className="hidden sm:flex items-center gap-2">
                {Array.from({ length: totalSteps }).map((_, idx) => {
                  const stepNum = idx + 1;
                  const isActive = visualStep === stepNum;
                  const isPassed = visualStep > stepNum;
                  return (
                    <div
                      key={idx}
                      className={cn(
                        "h-2 rounded-full transition-all duration-300",
                        isActive ? "w-8 bg-primary shadow-[0_0_10px_rgba(var(--primary-rgb),0.5)]" : isPassed ? "w-3 bg-primary/40" : "w-2 bg-muted/40"
                      )}
                    />
                  );
                })}
              </div>

              {/* Skip to Library Button */}
              <button
                type="button"
                onClick={handleFinish}
                className="text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1 px-3 py-1.5 rounded-full hover:bg-card/80 border border-transparent hover:border-border/40 transition-all active:scale-95"
              >
                Skip Setup →
              </button>
            </div>

            {/* Top Linear Progress Bar */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-border/20 z-50">
              <motion.div
                className="h-full bg-primary"
                initial={{ width: 0 }}
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 0.4, ease: 'easeInOut' }}
              />
            </div>
          </>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={state.currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className={cn(
              "flex h-full w-full flex-col",
              state.currentStep > 1 && "pt-14 sm:pt-20"
            )}
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
