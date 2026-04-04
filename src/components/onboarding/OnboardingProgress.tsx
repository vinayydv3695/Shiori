type OnboardingProgressProps = {
  currentStep: 1 | 2 | 3 | 4 | 5 | 6;
};

export function OnboardingProgress({ currentStep }: OnboardingProgressProps) {
  const totalDots = 6;
  const activeDot = Math.min(totalDots, Math.max(1, currentStep));

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
                  ? 'h-2.5 w-2.5 sm:h-3 sm:w-3 border-white/90 bg-white shadow-[0_0_10px_rgba(99,102,241,0.8),0_0_22px_rgba(99,102,241,0.45)]'
                  : active
                    ? 'h-3.5 w-3.5 sm:h-4 sm:w-4 border-indigo-400/80 bg-indigo-500 shadow-[0_0_14px_rgba(99,102,241,0.95),0_0_28px_rgba(99,102,241,0.55)]'
                    : 'h-2.5 w-2.5 sm:h-3 sm:w-3 border-white/60 bg-white/60'
              }`}
            />

            {dotNumber < totalDots ? (
              <span
                aria-hidden="true"
                className={`mx-1.5 h-px w-4 transition-all duration-500 sm:mx-2 sm:w-6 ${
                  dotNumber < activeDot ? 'bg-white/10' : 'bg-white/10'
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
