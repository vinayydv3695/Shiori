type OnboardingProgressProps = {
  currentStep: 2 | 3 | 4 | 5;
};

export function OnboardingProgress({ currentStep }: OnboardingProgressProps) {
  const totalDots = 4;
  const filledDots = Math.min(totalDots, Math.max(1, currentStep - 1));

  return (
    <div className="mb-4 flex items-center justify-center gap-2 py-1">
      {Array.from({ length: totalDots }, (_, index) => {
        const dot = index + 1;
        const active = dot <= filledDots;
        return (
          <span
            key={dot}
            aria-hidden="true"
            className={`h-2.5 w-2.5 rounded-full transition-all duration-300 ${
              active ? 'bg-primary shadow-[0_0_0_4px_hsl(var(--primary)/0.16)]' : 'bg-muted-foreground/30'
            }`}
          />
        );
      })}
    </div>
  );
}

export default OnboardingProgress;
