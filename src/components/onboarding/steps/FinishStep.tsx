import { useMemo, useState, type CSSProperties } from 'react';
import { CheckCircle2, FolderOpen, Palette, Settings } from 'lucide-react';
import { useOnboardingState } from '../hooks/useOnboardingState';
import { useOnboardingStore } from '@/store/onboardingStore';
import type { BookPrefs, MangaPrefs, ThemeName } from '../../../store/onboardingStore';

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
  const [burst, setBurst] = useState(false);
  const { completeOnboarding } = useOnboardingState();

  const translationLanguage = useOnboardingStore((s) => s.translationLanguage);
  const uiScale = useOnboardingStore((s) => s.uiScale);
  const autoTranslate = useOnboardingStore((s) => s.autoTranslate);
  const enableNotifications = useOnboardingStore((s) => s.enableNotifications);
  const resetOnboarding = useOnboardingStore((s) => s.resetOnboarding);

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
    if (isFinishing) return;
    setBurst(true);
    window.setTimeout(() => setBurst(false), 1000);

    try {
      if (onOpenLibrary) {
        await onOpenLibrary();
      } else {
        await completeOnboarding();
      }
    } finally {
      // no-op
    }
  };

  const themePreview: Record<ThemeName, string> = {
    White: '#ffffff',
    Black: '#09090b',
    'Rose Pine Moon': '#232136',
    'Catppuccin Mocha': '#1e1e2e',
    Nord: '#2e3440',
    Dracula: '#282a36',
    'Tokyo Night': '#1a1b26',
  };

  const readerHighlights = [
    `Manga: ${mangaPrefs.readingDirection.toUpperCase()} ${mangaPrefs.readingMode} mode`,
    `EPUB: ${bookPrefs.fontSize}px ${bookPrefs.scrollMode}`,
    `Line height: ${bookPrefs.lineHeight}`,
  ];

  const appHighlights = [
    `UI Scale: ${uiScale}%`,
    `Translation: ${translationLanguage.toUpperCase()}${autoTranslate ? ' (Auto)' : ''}`,
    `Notifications: ${enableNotifications ? 'On' : 'Off'}`,
  ];

  return (
    <section className="relative w-full overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950 p-8 text-white shadow-2xl md:p-12">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.03),transparent_70%)]" />

      <div className="relative z-10 flex flex-col items-center">
        <div className="mb-8 flex justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-white/20 bg-slate-900/50">
            <CheckCircle2 className="h-10 w-10 text-white" />
          </div>
        </div>

        <h2 className="mt-4 text-center text-5xl font-black tracking-tight text-white md:text-6xl">
          Setup Complete
        </h2>
        <p className="mt-4 text-center text-lg text-white/60 md:text-xl">Your reading space is ready</p>

        <div className="mt-10 grid w-full max-w-4xl grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-6">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-white/80">
              <Palette className="h-4 w-4" /> Theme
            </div>
            <div className="flex items-center gap-3">
              <span className="h-4 w-4 rounded-full ring-2 ring-white/30" style={{ background: themePreview[selectedTheme] }} />
              <p className="text-base font-semibold text-white">{selectedTheme}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-6">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-white/80">
              <FolderOpen className="h-4 w-4" /> Library
            </div>
            <p className="text-base font-semibold text-white">
              {libraryPath ? '1 source connected' : 'Setup skipped'}
            </p>
            <p className="mt-1 truncate text-xs text-white/50" title={libraryPath ?? undefined}>
              {libraryPath ?? 'Import books later from Settings'}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-6">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-white/80">
              <Settings className="h-4 w-4" /> Reader Preferences
            </div>
            <ul className="space-y-1.5 text-sm text-white/70">
              {readerHighlights.map((item) => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-6">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-white/80">
              <Settings className="h-4 w-4" /> App Settings
            </div>
            <ul className="space-y-1.5 text-sm text-white/70">
              {appHighlights.map((item) => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 flex w-full max-w-4xl flex-col items-center justify-center gap-4 border-t border-white/10 pt-8">
          <div className="relative">
            {burst ? (
              <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 z-50">
                {particles.map((p) => (
                  <span
                    key={p.id}
                    className="absolute h-2 w-2 rounded-full bg-white [animation:burst_1s_cubic-bezier(0.16,1,0.3,1)_forwards] shadow-[0_0_10px_rgba(255,255,255,0.8)]"
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
              disabled={Boolean(isFinishing)}
              className="inline-flex items-center justify-center rounded-2xl border border-white/20 bg-black px-10 py-4 text-lg font-bold text-white shadow-lg transition hover:bg-slate-950 hover:border-white/30 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isFinishing ? 'Launching Shiori...' : 'Launch Shiori'}
            </button>
          </div>

          <button
            type="button"
            onClick={resetOnboarding}
            className="text-sm text-white/50 underline underline-offset-4 transition-colors hover:text-white/80"
          >
            Start from scratch
          </button>
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
