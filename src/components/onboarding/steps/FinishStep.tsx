import { useMemo, useState, type CSSProperties } from 'react';
import { CheckCircle2, BookOpen, Palette } from 'lucide-react';
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
    <section className="relative flex h-full min-h-0 w-full flex-col overflow-hidden px-6 py-6 text-foreground md:px-10 md:py-8">
      <OnboardingMotionStyles />

      {/* Ambient Background Glow */}
      <div className="absolute left-1/2 top-1/2 z-0 h-[120vh] w-[120vw] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/20 via-background/80 to-background [animation:ambient-glow_8s_ease-in-out_infinite] pointer-events-none" />

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
      `}</style>

      <div className="relative z-10 mx-auto flex h-full w-full max-w-6xl flex-col items-center justify-center text-center">
        <p className="animate-fade-up mb-6 text-[10px] font-semibold uppercase tracking-[0.6em] text-muted-foreground/80 opacity-0 md:mb-8 ml-[0.6em]">
          Your Reading Sanctuary
        </p>

        <div className="animate-fade-up delay-100 relative mb-8 opacity-0 md:mb-10">
          <span className="absolute inset-0 rounded-full border border-primary/20 [animation:shiori-logo-pulse_4s_ease-in-out_infinite]" />
          <span className="absolute -inset-6 rounded-full border border-primary/10 [animation:shiori-logo-pulse_4s_ease-in-out_infinite_reverse]" />
          <div className="relative flex h-44 w-44 items-center justify-center overflow-hidden rounded-full border border-border/40 bg-card/90 shadow-2xl [animation:finish-logo-in_1s_cubic-bezier(0.16,1,0.3,1)_forwards] md:h-60 md:w-60">
            <img src={logoSrc} alt="Shiori Logo" className="h-full w-full object-contain p-4 md:p-6" />
          </div>
        </div>

        <h1 className="animate-fade-up delay-200 mb-4 max-w-4xl text-3xl font-extralight tracking-[0.4em] text-foreground/90 opacity-0 md:text-5xl ml-[0.4em]">
          SHIORI IS READY
        </h1>

        <p className="animate-fade-up delay-200 mb-8 max-w-md text-xs sm:text-sm text-muted-foreground/80 leading-relaxed opacity-0 px-4">
          Your personalized reading environment, custom theme, and content integrations are fully configured.
        </p>

        <div className="animate-fade-up delay-200 mb-10 flex flex-wrap justify-center gap-3 opacity-0 max-w-2xl px-4">
          <div className="flex items-center gap-2 rounded-full border border-border/40 bg-card/40 px-4 py-2 text-xs font-medium text-muted-foreground backdrop-blur-md">
            <BookOpen className="h-3.5 w-3.5 text-primary" />
            <span>Library Engine Ready</span>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-border/40 bg-card/40 px-4 py-2 text-xs font-medium text-muted-foreground backdrop-blur-md">
            <Palette className="h-3.5 w-3.5 text-primary" />
            <span>Sepia Theme Configured</span>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-border/40 bg-card/40 px-4 py-2 text-xs font-medium text-muted-foreground backdrop-blur-md">
            <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
            <span>Setup Verified</span>
          </div>
        </div>

        <div className="animate-fade-up delay-300 opacity-0 flex flex-col items-center gap-3">
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

            <button
              type="button"
              onClick={() => void handleOpen()}
              disabled={Boolean(isFinishing)}
              className="group relative overflow-hidden rounded-full border border-primary/20 bg-primary px-9 py-3.5 text-sm font-bold uppercase tracking-[0.14em] text-primary-foreground opacity-100 transition-all hover:scale-105 hover:bg-primary/90 hover:shadow-lg focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 active:scale-95 cursor-pointer"
            >
              <span className="relative z-10 flex items-center gap-2">
                {isFinishing ? 'Opening Library...' : 'Open Shiori Library →'}
              </span>
              <div className="absolute inset-0 z-0 bg-gradient-to-r from-transparent via-primary-foreground/20 to-transparent translate-x-[-100%] transition-transform duration-700 ease-in-out group-hover:translate-x-[100%]" />
            </button>
          </div>

          <button
            type="button"
            onClick={resetOnboarding}
            className="text-xs font-semibold text-muted-foreground/70 underline underline-offset-4 transition-colors hover:text-foreground cursor-pointer mt-1"
          >
            Restart onboarding
          </button>
        </div>
      </div>
    </section>
  );
}

export default FinishStep;
