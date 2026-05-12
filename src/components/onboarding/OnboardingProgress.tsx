type OnboardingProgressProps = {
  currentStep: number;
  totalSteps?: number;
};

const FULL_ONBOARDING_STEPS = [
  { title: 'Welcome', required: true },
  { title: 'Theme', required: true },
  { title: 'Import Library', required: true },
  { title: 'Torbox Integration', required: false },
  { title: 'Cloud Integrations', required: false },
  { title: 'Reader Preferences', required: true },
  { title: 'App Settings', required: true },
  { title: 'Finish', required: true },
] as const;

export function OnboardingProgress({ currentStep, totalSteps = FULL_ONBOARDING_STEPS.length }: OnboardingProgressProps) {
  const totalDots = Math.max(1, Math.min(totalSteps, FULL_ONBOARDING_STEPS.length));
  const visibleSteps =
    totalDots === 7
      ? FULL_ONBOARDING_STEPS.filter((step) => step.title !== 'Cloud Integrations')
      : FULL_ONBOARDING_STEPS;

  const activeDot = Math.min(totalDots, Math.max(1, Math.floor(currentStep)));
  const activeStep = visibleSteps[activeDot - 1] ?? visibleSteps[visibleSteps.length - 1];

  return (
    <div className="mb-4 px-3 py-2 sm:px-0">
      <div className="mb-3 flex flex-wrap items-center justify-center gap-2 text-xs sm:text-sm">
        <span className="rounded-full border border-white/10 bg-slate-900/70 px-3 py-1 font-semibold tracking-wide text-white/85">
          Step {activeDot} of {totalDots}
        </span>
        <span className="rounded-full border border-white/10 bg-slate-900/50 px-3 py-1 font-medium text-white/80">
          {activeStep.title}
        </span>
        <span
          className={`rounded-full border px-3 py-1 font-semibold tracking-wide ${
            activeStep.required
              ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
              : 'border-amber-400/30 bg-amber-500/10 text-amber-200'
          }`}
        >
          {activeStep.required ? 'Required' : 'Optional'}
        </span>
      </div>

      <div className="flex items-center justify-center">
        <div className="flex items-center rounded-full bg-transparent px-3 py-2">
          {Array.from({ length: totalDots }, (_, index) => {
            const dotNumber = index + 1;
            const completed = dotNumber < activeDot;
            const active = dotNumber === activeDot;

            return (
              <div key={dotNumber} className="flex items-center">
                <span
                  aria-hidden="true"
                  className={`rounded-full border transition-all duration-500 ease-out ${
                    completed
                      ? 'h-2.5 w-2.5 border-indigo-300/80 bg-indigo-300 shadow-[0_0_10px_rgba(99,102,241,0.45),0_0_22px_rgba(99,102,241,0.25)] sm:h-3 sm:w-3'
                      : active
                        ? 'h-3.5 w-3.5 border-indigo-400/90 bg-indigo-400 shadow-[0_0_14px_rgba(99,102,241,0.95),0_0_28px_rgba(99,102,241,0.55)] sm:h-4 sm:w-4'
                        : 'h-2.5 w-2.5 border-border bg-muted sm:h-3 sm:w-3'
                  }`}
                />

                {dotNumber < totalDots ? (
                  <span
                    aria-hidden="true"
                    className={`mx-1.5 h-px w-4 transition-all duration-500 sm:mx-2 sm:w-6 ${
                      dotNumber < activeDot ? 'bg-indigo-400/40' : 'bg-border'
                    }`}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default OnboardingProgress;
