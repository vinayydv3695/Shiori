import { useMemo, useState, type CSSProperties } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useOnboardingState } from '../hooks/useOnboardingState';
import { useOnboardingStore } from '@/store/onboardingStore';
import { OnboardingMotionStyles } from '../components';
import GlowButton from '../components/GlowButton';
type FinishStepProps = {
  onBack?: () => void;
  onOpenLibrary?: () => Promise<void>;
  isFinishing?: boolean;
};

export function FinishStep({
  onOpenLibrary,
  isFinishing,
}: FinishStepProps) {
  const logoSrc = `${import.meta.env.BASE_URL}logo.png`;
  const [burst, setBurst] = useState(false);
  const { completeOnboarding } = useOnboardingState();

  const resetOnboarding = useOnboardingStore((s) => s.resetOnboarding);

  const particles = useMemo(
    () =>
      Array.from({ length: 22 }).map((_, i) => {
        const t = i + 1;
        return {
          id: `confetti-${i}`,
          x: ((((t * 37) % 100) / 100) - 0.5) * 180,
          y: ((((t * 53) % 100) / 100) - 0.5) * 170,
          rot: (t * 67) % 360,
          delay: (t * 29) % 170,
          scale: 0.45 + (((t * 41) % 50) / 100),
        };
      }),
    [],
  );

  const handleOpen = async () => {
    if (isFinishing) return;
    setBurst(true);
    window.setTimeout(() => setBurst(false), 900);

    if (onOpenLibrary) {
      await onOpenLibrary();
      return;
    }

    await completeOnboarding();
  };

  return (
    <section className="relative flex h-full min-h-0 w-full flex-col overflow-hidden px-4 py-4 text-foreground md:px-8 md:py-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,hsl(var(--foreground)/0.06),transparent_66%)]" />
      <OnboardingMotionStyles />

      <style>{`
        @keyframes burst {
          0% { transform: translate(-50%, -50%) rotate(0deg) scale(0); opacity: 1; }
          50% { opacity: 1; }
          100% { transform: translate(calc(-50% + var(--tx)), calc(-50% + var(--ty))) rotate(var(--rot)) scale(var(--scale)); opacity: 0; }
        }

        @keyframes finish-logo-in {
          0% { opacity: 0; transform: translateY(10px) scale(0.92); filter: blur(8px); }
          100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }

        @keyframes finish-logo-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
      `}</style>

      <div className="relative z-10 mx-auto flex h-full min-h-0 w-full max-w-7xl flex-col overflow-hidden rounded-[1.6rem] border border-border/40 bg-card/60 p-4 backdrop-blur-xl md:p-6 shadow-2xl">
        <div className="onb-fade-up flex items-center gap-3">
          <span className="inline-flex h-10 w-10 md:h-11 md:w-11 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
            <CheckCircle2 className="h-4 w-4 md:h-5 md:w-5" />
          </span>
          <div>
            <h2 className="text-xl font-semibold tracking-tight md:text-2xl">Setup Complete</h2>
            <p className="text-xs text-muted-foreground md:text-sm">Everything ready. Launch now.</p>
          </div>
        </div>

        <div className="onb-fade-up onb-delay-100 relative mx-auto mb-6 mt-2 flex justify-center md:mb-8 md:mt-4">
          <div className="absolute inset-0 z-0 flex pointer-events-none items-center justify-center">
            <div className="h-40 w-40 rounded-full bg-indigo-500/20 blur-[50px] md:h-56 md:w-56" />
          </div>
          <div className="relative z-10 flex h-36 w-36 overflow-hidden rounded-full border border-border/50 bg-background/80 shadow-lg backdrop-blur-md md:h-48 md:w-48 items-center justify-center">
            <img
              src={logoSrc}
              alt="Shiori Logo"
              className="h-full w-full object-contain p-4 md:p-6 [animation:finish-logo-in_0.8s_cubic-bezier(0.16,1,0.3,1)_forwards,finish-logo-float_3.8s_ease-in-out_infinite_0.8s]"
            />
            <div className="absolute inset-0 rounded-full border border-primary/30 [animation:ping_3s_cubic-bezier(0,0,0.2,1)_infinite]" />
          </div>
        </div>

        <div className="onb-fade-up onb-delay-200 flex-1 flex flex-col items-center justify-center text-center pb-8">
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground md:text-base">
            Your personalized reading environment is ready. Discover books, organize your collection, and enjoy a seamless reading experience.
          </p>
        </div>

        <div className="onb-fade-up onb-delay-300 mt-2 flex shrink-0 flex-col items-center gap-3 border-t border-border/40 pt-3 md:mt-4 md:pt-4">
          <div className="relative">
            {burst ? (
              <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 z-50">
                {particles.map((p) => (
                  <span
                    key={p.id}
                    className="absolute h-2 w-2 rounded-full bg-primary [animation:burst_0.9s_cubic-bezier(0.16,1,0.3,1)_forwards] shadow-sm"
                    style={
                      {
                        '--tx': `${p.x}px`,
                        '--ty': `${p.y}px`,
                        '--rot': `${p.rot}deg`,
                        '--scale': p.scale,
                        animationDelay: `${p.delay}ms`,
                      } as CSSProperties
                    }
                  />
                ))}
              </div>
            ) : null}

            <GlowButton
              onClick={() => {
                void handleOpen();
              }}
              disabled={Boolean(isFinishing)}
              className="px-10 py-3.5 text-base"
            >
              {isFinishing ? 'Launching Shiori...' : 'Launch Shiori'}
            </GlowButton>
          </div>

          <button
            type="button"
            onClick={resetOnboarding}
            className="text-xs text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
          >
            Restart onboarding
          </button>
        </div>
      </div>
    </section>
  );
}

export default FinishStep;
