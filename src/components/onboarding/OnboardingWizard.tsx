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
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.05),transparent_75%)]" />
      <ParticleCanvas />

      <div className="relative z-10 flex h-full min-h-0 w-full flex-col overflow-hidden">
        {/* Premium High-Contrast Integrated Top Header Bar */}
        {state.currentStep > 1 && (
          <header className="w-full shrink-0 border-b border-border/40 bg-background/80 backdrop-blur-2xl px-2 sm:px-10 py-2.5 sm:py-4 z-50 transition-colors duration-500">
            <div
              className="mx-auto flex w-full max-w-6xl items-center justify-between gap-1.5 sm:gap-4 h-12"
              style={{
                paddingTop: 'env(safe-area-inset-top, 0px)',
              }}
            >
              {/* Left: Step Counter Pill */}
              <div className="flex items-center shrink-0">
                <span className="text-[11px] sm:text-sm font-extrabold uppercase tracking-wider px-2.5 sm:px-4 py-1 sm:py-1.5 rounded-full bg-card text-foreground border border-border/80 sm:border-2 shadow-sm whitespace-nowrap">
                  Step <span className="text-primary">{visualStep}</span> of {totalSteps}
                </span>
              </div>

              {/* Center: Prominent Progress Dots */}
              <div className="flex items-center gap-1 sm:gap-2.5 shrink-0">
                {Array.from({ length: totalSteps }).map((_, idx) => {
                  const stepNum = idx + 1;
                  const isActive = visualStep === stepNum;
                  const isPassed = visualStep > stepNum;
                  return (
                    <div
                      key={idx}
                      className={cn(
                        "h-2 sm:h-3 rounded-full transition-all duration-300",
                        isActive
                          ? "w-6 sm:w-10 bg-primary shadow-md shadow-primary/40 ring-2 sm:ring-4 ring-primary/25"
                          : isPassed
                          ? "w-2 sm:w-4 bg-primary/60"
                          : "w-2 sm:w-3 bg-muted-foreground/30"
                      )}
                    />
                  );
                })}
              </div>

              {/* Right: Skip Setup Button Pill */}
              <div className="flex items-center shrink-0">
                <button
                  type="button"
                  onClick={handleFinish}
                  className="text-[11px] sm:text-sm font-bold text-foreground flex items-center gap-1 sm:gap-2 px-3 sm:px-5 py-1.5 sm:py-2.5 rounded-full bg-card hover:bg-muted text-foreground border border-border/80 sm:border-2 hover:border-primary/60 transition-all active:scale-95 shadow-sm hover:shadow-md cursor-pointer whitespace-nowrap"
                >
                  <span>Skip Setup</span>
                  <span className="text-xs sm:text-base leading-none">→</span>
                </button>
              </div>
            </div>
          </header>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={state.currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="flex flex-1 min-h-0 h-full w-full flex-col items-center justify-center p-3 sm:p-5 md:p-6 overflow-hidden"
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
