import { useMemo, useState, type CSSProperties } from 'react';
import { CheckCircle2, FolderOpen, Palette, Settings } from 'lucide-react';
import { useOnboardingState } from '../hooks/useOnboardingState';
import { useOnboardingStore } from '@/store/onboardingStore';
import type { BookPrefs, MangaPrefs, ThemeName } from '../../../store/onboardingStore';
import GlowButton from '../components/GlowButton';
import { OnboardingMotionStyles } from '../components';

type FinishStepProps = {
  libraryPath: string | null;
  selectedTheme: ThemeName;
  mangaPrefs: MangaPrefs;
  bookPrefs: BookPrefs;
  onBack?: () => void;
  onOpenLibrary?: () => Promise<void>;
  isFinishing?: boolean;
};

export function FinishStep({
  libraryPath,
  selectedTheme,
  mangaPrefs,
  bookPrefs,
  onOpenLibrary,
  isFinishing,
}: FinishStepProps) {
  const logoSrc = `${import.meta.env.BASE_URL}logo.png`;
  const [burst, setBurst] = useState(false);
  const { completeOnboarding } = useOnboardingState();

  const translationLanguage = useOnboardingStore((s) => s.translationLanguage);
  const uiScale = useOnboardingStore((s) => s.uiScale);
  const autoTranslate = useOnboardingStore((s) => s.autoTranslate);
  const enableNotifications = useOnboardingStore((s) => s.enableNotifications);
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

  const themePreview: Record<ThemeName, string> = {
    White: '#f4f4f5',
    Black: '#09090b',
    'Rose Pine Moon': '#232136',
    'Catppuccin Mocha': '#1e1e2e',
    Nord: '#2e3440',
    Dracula: '#282a36',
    'Tokyo Night': '#1a1b26',
  };

  const readerHighlights = [
    `Manga: ${mangaPrefs.readingDirection.toUpperCase()} ${mangaPrefs.readingMode}`,
    `EPUB: ${bookPrefs.fontSize}px ${bookPrefs.scrollMode}`,
    `Line height: ${bookPrefs.lineHeight}`,
  ];

  const appHighlights = [
    `UI Scale: ${uiScale}%`,
    `Translation: ${translationLanguage.toUpperCase()}${autoTranslate ? ' (Auto)' : ''}`,
    `Notifications: ${enableNotifications ? 'On' : 'Off'}`,
  ];

  return (
    <section className="relative flex h-full min-h-0 w-full flex-col overflow-hidden px-4 py-4 text-white md:px-8 md:py-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.06),transparent_66%)]" />
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

      <div className="relative z-10 mx-auto flex h-full min-h-0 w-full max-w-7xl flex-col overflow-hidden rounded-[1.6rem] border border-white/10 bg-zinc-950/70 p-4 backdrop-blur-xl md:p-6">
        <div className="onb-fade-up flex items-center gap-3">
          <span className="inline-flex h-10 w-10 md:h-11 md:w-11 items-center justify-center rounded-xl border border-zinc-300/40 bg-zinc-400/10 text-zinc-200">
            <CheckCircle2 className="h-4 w-4 md:h-5 md:w-5" />
          </span>
          <div>
            <h2 className="text-xl font-semibold tracking-tight md:text-2xl">Setup Complete</h2>
            <p className="text-xs text-zinc-400 md:text-sm">Everything ready. Launch now.</p>
          </div>
        </div>

        <div className="onb-fade-up onb-delay-100 flex justify-center mt-0 mb-4 md:mt-2 md:mb-5">
          <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-white/5 md:h-32 md:w-32 overflow-hidden border border-white/10">
            <img
              src={logoSrc}
              alt="Shiori Logo"
              className="h-full w-full object-cover [animation:finish-logo-in_0.8s_cubic-bezier(0.16,1,0.3,1)_forwards,finish-logo-float_3.8s_ease-in-out_infinite_0.8s]"
            />
            <div className="absolute inset-0 rounded-full border border-white/10 [animation:ping_3s_cubic-bezier(0,0,0.2,1)_infinite]" />
          </div>
        </div>

        <div className="onb-fade-up onb-delay-200 min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-gutter:stable] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/20 hover:[&::-webkit-scrollbar-thumb]:bg-white/30">
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 lg:gap-3">
            <div className="rounded-2xl border border-white/10 bg-zinc-900/55 p-3 md:p-4">
              <div className="mb-2 flex items-center gap-2 text-[10px] md:text-xs font-semibold uppercase tracking-[0.16em] text-zinc-300/85">
                <Palette className="h-3 w-3 md:h-4 md:w-4" /> Theme
              </div>
              <div className="flex items-center gap-3">
                <span className="h-3 w-3 md:h-4 md:w-4 rounded-full ring-2 ring-white/20" style={{ background: themePreview[selectedTheme] }} />
                <p className="text-sm md:text-base font-semibold text-white">{selectedTheme}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-zinc-900/55 p-3 md:p-4">
              <div className="mb-2 flex items-center gap-2 text-[10px] md:text-xs font-semibold uppercase tracking-[0.16em] text-zinc-300/85">
                <FolderOpen className="h-3 w-3 md:h-4 md:w-4" /> Library
              </div>
              <p className="text-xs md:text-sm font-medium text-white">{libraryPath ? '1 source connected' : 'Setup skipped'}</p>
              <p className="mt-1 truncate text-[10px] md:text-xs text-zinc-400" title={libraryPath ?? undefined}>
                {libraryPath ?? 'Import anytime from Settings'}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-zinc-900/55 p-3 md:p-4">
              <div className="mb-2 flex items-center gap-2 text-[10px] md:text-xs font-semibold uppercase tracking-[0.16em] text-zinc-300/85">
                <Settings className="h-3 w-3 md:h-4 md:w-4" /> Reader defaults
              </div>
              <ul className="space-y-1 text-xs md:text-sm text-zinc-300/85">
                {readerHighlights.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-white/10 bg-zinc-900/55 p-3 md:p-4">
              <div className="mb-2 flex items-center gap-2 text-[10px] md:text-xs font-semibold uppercase tracking-[0.16em] text-zinc-300/85">
                <Settings className="h-3 w-3 md:h-4 md:w-4" /> App defaults
              </div>
              <ul className="space-y-1 text-xs md:text-sm text-zinc-300/85">
                {appHighlights.map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="onb-fade-up onb-delay-300 mt-2 flex shrink-0 flex-col items-center gap-3 border-t border-white/10 pt-3 md:mt-4 md:pt-4">
          <div className="relative">
            {burst ? (
              <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 z-50">
                {particles.map((p) => (
                  <span
                    key={p.id}
                    className="absolute h-2 w-2 rounded-full bg-zinc-200 [animation:burst_0.9s_cubic-bezier(0.16,1,0.3,1)_forwards] shadow-[0_0_8px_rgba(255,255,255,0.35)]"
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
              theme="dark"
              variant="primary"
              onClick={() => {
                void handleOpen();
              }}
              disabled={Boolean(isFinishing)}
              className="onb-cta-glow px-10 py-3.5 text-base font-bold"
            >
              {isFinishing ? 'Launching Shiori...' : 'Launch Shiori'}
            </GlowButton>
          </div>

          <button
            type="button"
            onClick={resetOnboarding}
            className="text-xs text-zinc-400 underline underline-offset-4 transition-colors hover:text-zinc-100"
          >
            Restart onboarding
          </button>
        </div>
      </div>
    </section>
  );
}

export default FinishStep;
