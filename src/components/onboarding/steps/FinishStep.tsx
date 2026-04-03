import { useMemo, useState, type CSSProperties } from 'react';
import { AnimatedCheckmark } from '../components/index';
import type { BookPrefs, MangaPrefs, ThemeName } from '../../../store/onboardingStore';

type FinishStepProps = {
  libraryPath: string | null;
  selectedTheme: ThemeName;
  mangaPrefs: MangaPrefs;
  bookPrefs: BookPrefs;
  onBack: () => void;
  onOpenLibrary: () => Promise<void>;
  isFinishing: boolean;
};

export function FinishStep({
  libraryPath,
  selectedTheme,
  mangaPrefs,
  bookPrefs,
  onBack,
  onOpenLibrary,
  isFinishing,
}: FinishStepProps) {
  const [burst, setBurst] = useState(false);

  const particles = useMemo(
    () =>
      Array.from({ length: 24 }).map((_, i) => ({
        id: `confetti-${i}`,
        x: (Math.random() - 0.5) * 200,
        y: (Math.random() - 0.5) * 200,
        rot: Math.random() * 360,
        delay: Math.random() * 200,
        scale: Math.random() * 0.5 + 0.5,
      })),
    [],
  );

  const handleOpen = async () => {
    setBurst(true);
    window.setTimeout(() => setBurst(false), 1000);
    await onOpenLibrary();
  };

  return (
    <section className="relative w-full overflow-hidden rounded-[2rem] border border-border/50 bg-card/50 p-8 shadow-xl backdrop-blur-xl md:p-12">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(16,185,129,0.1),transparent_70%)]" />

      <div className="relative z-10 flex flex-col items-center">
        <div className="mb-8 flex justify-center drop-shadow-[0_0_15px_rgba(16,185,129,0.3)]">
          <AnimatedCheckmark className="h-32 w-32 md:h-40 md:w-40" />
        </div>

        <h2 className="text-center text-4xl font-bold tracking-tight md:text-5xl">Shiori is Ready</h2>
        <p className="mt-4 text-center text-lg text-muted-foreground md:text-xl">Your library awaits.</p>

        <div className="mt-10 w-full max-w-2xl overflow-hidden rounded-[1.5rem] border border-border/40 bg-background/50 backdrop-blur-md transition-all hover:border-border/60 hover:shadow-md">
          <div className="grid grid-cols-1 divide-y divide-border/30 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <div className="p-6 text-center transition-colors hover:bg-muted/20">
              <span className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-2">Library</span>
              <span className="block truncate text-sm font-medium text-foreground" title={libraryPath || 'Not set — add later'}>
                {libraryPath || 'Not set — add later'}
              </span>
            </div>
            
            <div className="p-6 text-center transition-colors hover:bg-muted/20">
              <span className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-2">Theme</span>
              <span className="block truncate text-sm font-medium text-foreground">
                {selectedTheme}
              </span>
            </div>
            
            <div className="p-6 text-center transition-colors hover:bg-muted/20">
              <span className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-2">Modes</span>
              <span className="block text-sm font-medium text-foreground">
                M: {mangaPrefs.viewMode} / B: {bookPrefs.pageMode}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-12 flex w-full max-w-2xl items-center justify-center border-t border-border/30 pt-8">
          <div className="relative">
            {burst ? (
              <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 z-50">
                {particles.map((p) => (
                  <span
                    key={p.id}
                    className="absolute h-2 w-2 rounded-full bg-emerald-400 [animation:burst_1s_cubic-bezier(0.16,1,0.3,1)_forwards] shadow-[0_0_10px_rgba(52,211,153,0.8)]"
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
              onClick={handleOpen}
              disabled={isFinishing}
              className="group relative overflow-hidden rounded-full bg-primary px-10 py-4 text-base font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:scale-105 hover:shadow-xl hover:shadow-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-95 disabled:pointer-events-none disabled:opacity-60"
            >
              <span className="relative z-10 flex items-center gap-2">
                {isFinishing ? 'Opening...' : 'Open My Library →'}
              </span>
              <div className="absolute inset-0 z-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] transition-transform duration-700 ease-in-out group-hover:translate-x-[100%]" />
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes burst {
          0% { transform: translate(-50%, -50%) rotate(0deg) scale(0); opacity: 1; }
          50% { opacity: 1; }
          100% { transform: translate(calc(-50% + var(--tx)), calc(-50% + var(--ty))) rotate(var(--rot)) scale(var(--scale)); opacity: 0; }
        }
      `}</style>
    </section>
  );
}

export default FinishStep;
