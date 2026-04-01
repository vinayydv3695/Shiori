import { useEffect } from "react";

interface WelcomeStepProps {
  onNext?: () => void;
  onComplete?: () => void;
  registerStep?: (config: {
    nextDisabled?: boolean;
    nextLabel?: string;
    onNext?: () => void | boolean | Promise<void | boolean>;
  }) => void;
}

export default function WelcomeStep({ onComplete, registerStep }: WelcomeStepProps) {
  useEffect(() => {
    registerStep?.({ nextDisabled: false });
  }, [registerStep]);

  const headlineWords = ["Your", "reading", "life,", "organised."];
  const featurePills = ["10,000+ book library support", "Fully offline & private"];

  return (
    <section className="ob-step-wrap ob-step-card">
      <div aria-hidden="true" className="ob-step-index">
        01
      </div>

      <div className="relative z-10 flex min-h-[460px] flex-col items-center justify-center text-center">
        <div className="w-full max-w-[620px] space-y-6">
          <div className="ob-step-head">
            <p className="ob-step-kicker">Welcome to</p>
            <h1 className="ob-step-title font-light" aria-label="Your reading life, organised.">
              {headlineWords.map((word, index) => (
                <span
                  key={word}
                  className="mr-2 inline-block"
                  style={{
                    animation: "ob-word-in 520ms ease-out forwards",
                    animationDelay: `${index * 60}ms`,
                    opacity: 0,
                  }}
                >
                  {word}
                </span>
              ))}
            </h1>
            <p className="ob-step-subtitle mx-auto" style={{ animation: "ob-word-in 480ms ease-out 200ms forwards", opacity: 0 }}>
              Shiori brings your manga, comics, and books into one beautiful library — offline, private, and completely yours.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            {featurePills.map((pill, index) => (
              <span
                key={pill}
                className="rounded-full border border-[hsl(var(--foreground)/0.16)] bg-[hsl(var(--foreground)/0.04)] px-4 py-2 text-[13px] text-[hsl(var(--foreground)/0.78)]"
                style={{
                  animation: "ob-word-in 460ms ease-out forwards",
                  animationDelay: `${400 + index * 80}ms`,
                  opacity: 0,
                }}
              >
                {pill}
              </span>
            ))}
          </div>

          <div className="pt-4">
            <button
              type="button"
              onClick={() => onComplete?.()}
              className="text-[12px] text-[hsl(var(--foreground)/0.3)] transition-colors duration-[120ms] hover:text-[hsl(var(--foreground)/0.7)]"
            >
              Already know your way around? Skip setup →
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
