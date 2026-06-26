import { useMemo, useState, type CSSProperties } from 'react';
import { CheckCircle2, FolderOpen, Palette, Settings, Zap } from 'lucide-react';
import { useOnboardingState } from '../hooks/useOnboardingState';
import { useOnboardingStore } from '@/store/onboardingStore';
import type { BookPrefs, MangaPrefs, ThemeName } from '../../../store/onboardingStore';
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
  const defaultMangaSource = useOnboardingStore((s) => s.defaultMangaSource);
  const defaultBookSource = useOnboardingStore((s) => s.defaultBookSource);

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
    `Manga Source: ${defaultMangaSource.charAt(0).toUpperCase() + defaultMangaSource.slice(1)}`,
    `Book Source: ${defaultBookSource.charAt(0).toUpperCase() + defaultBookSource.slice(1)}`,
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

        <div className="onb-fade-up onb-delay-100 relative mx-auto mb-6 mt-2 flex justify-center md:mb-8 md:mt-4">
          <div className="absolute inset-0 z-0 flex pointer-events-none items-center justify-center">
            <div className="h-32 w-32 rounded-full bg-indigo-500/20 blur-[40px] md:h-48 md:w-48" />
          </div>
          <div className="relative z-10 flex h-28 w-28 overflow-hidden rounded-full border border-white/10 bg-zinc-950/80 shadow-[0_0_50px_rgba(255,255,255,0.05)] backdrop-blur-md md:h-36 md:w-36 items-center justify-center">
            <img
              src={logoSrc}
              alt="Shiori Logo"
              className="h-full w-full object-cover [animation:finish-logo-in_0.8s_cubic-bezier(0.16,1,0.3,1)_forwards,finish-logo-float_3.8s_ease-in-out_infinite_0.8s]"
            />
            <div className="absolute inset-0 rounded-full border border-white/20 [animation:ping_3s_cubic-bezier(0,0,0.2,1)_infinite]" />
          </div>
        </div>

        <div className="onb-fade-up onb-delay-200 min-h-0 flex-1 overflow-y-auto pr-2 [scrollbar-gutter:stable] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/20 hover:[&::-webkit-scrollbar-thumb]:bg-white/30">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4">
            <div className="group relative overflow-hidden rounded-2xl border border-white/5 bg-zinc-900/40 p-4 transition-colors hover:border-white/10 hover:bg-zinc-900/60 md:p-5">
              <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.15em] text-zinc-400 group-hover:text-zinc-300">
                <Palette className="h-4 w-4" /> Theme
              </div>
              <div className="flex items-center gap-3">
                <span className="h-5 w-5 rounded-full shadow-inner ring-1 ring-white/20" style={{ background: themePreview[selectedTheme] }} />
                <p className="text-base font-semibold text-white">{selectedTheme}</p>
              </div>
            </div>

            <div className="group relative overflow-hidden rounded-2xl border border-white/5 bg-zinc-900/40 p-4 transition-colors hover:border-white/10 hover:bg-zinc-900/60 md:p-5">
              <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.15em] text-zinc-400 group-hover:text-zinc-300">
                <FolderOpen className="h-4 w-4" /> Library
              </div>
              <p className="text-sm font-medium text-white">{libraryPath ? '1 source connected' : 'Setup skipped'}</p>
              <p className="mt-1 truncate text-xs text-zinc-500" title={libraryPath ?? undefined}>
                {libraryPath ?? 'Import anytime from Settings'}
              </p>
            </div>

            <div className="group relative overflow-hidden rounded-2xl border border-white/5 bg-zinc-900/40 p-4 transition-colors hover:border-white/10 hover:bg-zinc-900/60 md:p-5">
              <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.15em] text-zinc-400 group-hover:text-zinc-300">
                <Settings className="h-4 w-4" /> Reader defaults
              </div>
              <ul className="space-y-1.5 text-sm text-zinc-400">
                {readerHighlights.map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <div className="h-1 w-1 rounded-full bg-zinc-600" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="group relative overflow-hidden rounded-2xl border border-white/5 bg-zinc-900/40 p-4 transition-colors hover:border-white/10 hover:bg-zinc-900/60 md:p-5">
              <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.15em] text-zinc-400 group-hover:text-zinc-300">
                <Settings className="h-4 w-4" /> App defaults
              </div>
              <ul className="space-y-1.5 text-sm text-zinc-400">
                {appHighlights.map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <div className="h-1 w-1 rounded-full bg-zinc-600" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="relative mt-3 overflow-hidden rounded-2xl border border-white/5 bg-zinc-900/40 p-4 backdrop-blur-md lg:mt-4 md:p-5">
            <div className="absolute left-0 top-0 h-[1px] w-full bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.15em] text-zinc-300">
              <Zap className="h-4 w-4" /> Capabilities Unlocked
            </div>
            <ul className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm text-zinc-400 md:grid-cols-2">
              <li className="flex items-center gap-2"><div className="h-1.5 w-1.5 rounded-full bg-zinc-500" /> Seamless Window Fullscreen (F11)</li>
              <li className="flex items-center gap-2"><div className="h-1.5 w-1.5 rounded-full bg-zinc-500" /> Premium Glassmorphism Reader UI</li>
              <li className="flex items-center gap-2"><div className="h-1.5 w-1.5 rounded-full bg-zinc-500" /> Direct Torrent Streaming via Torbox</li>
              <li className="flex items-center gap-2"><div className="h-1.5 w-1.5 rounded-full bg-zinc-500" /> Built-in Catalogs (LibGen, MangaDex)</li>
            </ul>
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

            <button
              type="button"
              onClick={() => {
                void handleOpen();
              }}
              disabled={Boolean(isFinishing)}
              className="group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full bg-white px-10 py-3.5 text-base font-bold text-black transition-all duration-300 ease-out hover:scale-[1.02] hover:bg-zinc-200 hover:shadow-[0_0_30px_rgba(255,255,255,0.4)] focus:outline-none focus:ring-2 focus:ring-white/40 focus:ring-offset-0 focus:ring-offset-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              <div className="absolute inset-0 flex h-full w-full justify-center [transform:skew(-12deg)_translateX(-100%)] group-hover:duration-1000 group-hover:[transform:skew(-12deg)_translateX(100%)]">
                <div className="relative h-full w-8 bg-white/40" />
              </div>
              <span className="relative z-10">{isFinishing ? 'Launching Shiori...' : 'Launch Shiori'}</span>
            </button>
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
