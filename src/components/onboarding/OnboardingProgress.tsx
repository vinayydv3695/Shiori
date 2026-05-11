type OnboardingProgressProps = {
  currentStep: number;
  totalSteps?: number;
};

export function OnboardingProgress({ currentStep, totalSteps = 8 }: OnboardingProgressProps) {
  const totalDots = Math.max(1, totalSteps);
  const activeDot = Math.min(totalDots, Math.max(1, Math.floor(currentStep)));

  return (
    <div className="mb-4 flex items-center justify-center px-3 py-2 sm:px-0">
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
  );
}

export default OnboardingProgress;
