import { useMemo, useState, type CSSProperties } from 'react';
import { FolderOpen, Palette, Settings } from 'lucide-react';
import { useOnboardingState } from '../hooks/useOnboardingState';
import { useOnboardingStore } from '@/store/onboardingStore';
import type { BookPrefs, MangaPrefs, ThemeName } from '../../../store/onboardingStore';
import GlowButton from '../components/GlowButton';
import { OnboardingMotionStyles } from '../components';
import { ShioriMark } from '@/components/icons/ShioriIcons';

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
    <section className="relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[2rem] border border-white/5 bg-slate-950 p-8 text-white shadow-xl shadow-black/40 md:p-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(79,70,229,0.15),transparent_70%)]" />
      <OnboardingMotionStyles />

      <style>{`
        @keyframes burst {
          0% { transform: translate(-50%, -50%) rotate(0deg) scale(0); opacity: 1; }
          50% { opacity: 1; }
          100% { transform: translate(calc(-50% + var(--tx)), calc(-50% + var(--ty))) rotate(var(--rot)) scale(var(--scale)); opacity: 0; }
        }
      `}</style>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center overflow-hidden">
        <div className="w-full flex-1 overflow-y-auto pr-2 pb-4 [scrollbar-gutter:stable] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/20 hover:[&::-webkit-scrollbar-thumb]:bg-white/30 flex flex-col items-center">
        <div className="onb-fade-up mt-2 flex justify-center">
          <p className="text-xs font-semibold uppercase tracking-[0.4em] text-indigo-300/80">
            Shiori
          </p>
        </div>
        
        <div className="onb-fade-up my-6 select-none text-center text-[100px] leading-none text-white/95 mix-blend-plus-lighter drop-shadow-[0_0_30px_rgba(79,70,229,0.3)] md:text-[120px]">
          栞
        </div>

        <h2 className="onb-fade-up onb-delay-100 mt-2 text-center text-4xl font-light tracking-tight text-white md:text-5xl">
          Setup <span className="font-semibold text-transparent bg-clip-text bg-gradient-to-r from-white to-white/60">Complete</span>
        </h2>
        <p className="onb-fade-up onb-delay-100 mt-4 text-center text-lg text-white/60 md:text-xl">All 8 steps are done — your reading space is ready.</p>

        <div className="onb-fade-up onb-delay-200 mt-12 grid w-full max-w-4xl grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-6">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-white/65">
              <span className="onb-icon-badge inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-indigo-200">
                <Palette className="onb-icon-inner h-4 w-4" />
              </span>
              Theme
            </div>
            <div className="flex items-center gap-3">
              <span className="h-4 w-4 rounded-full ring-2 ring-white/20" style={{ background: themePreview[selectedTheme] }} />
              <p className="text-base font-semibold text-white">{selectedTheme}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-6">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-white/65">
              <span className="onb-icon-badge inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-indigo-200">
                <FolderOpen className="onb-icon-inner h-4 w-4" />
              </span>
              Library
            </div>
            <p className="text-base font-semibold text-white">
              {libraryPath ? '1 source connected' : 'Setup skipped'}
            </p>
            <p className="mt-1 truncate text-xs text-white/60" title={libraryPath ?? undefined}>
              {libraryPath ?? 'Import books later from Settings'}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-6">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-white/65">
              <span className="onb-icon-badge inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-indigo-200">
                <Settings className="onb-icon-inner h-4 w-4" />
              </span>
              Reader Preferences
            </div>
            <ul className="space-y-1.5 text-sm text-white/65">
              {readerHighlights.map((item) => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-6">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-white/65">
              <span className="onb-icon-badge inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-indigo-200">
                <Settings className="onb-icon-inner h-4 w-4" />
              </span>
              App Settings
            </div>
            <ul className="space-y-1.5 text-sm text-white/65">
              {appHighlights.map((item) => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
          </div>
        </div>

                </div>
        <div className="onb-fade-up onb-delay-300 mt-4 flex w-full shrink-0 flex-col items-center justify-center gap-4 border-t border-white/10 bg-slate-950/95 pt-5 pb-1 backdrop-blur z-20">
          <div className="relative">
            {burst ? (
              <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 z-50">
                {particles.map((p) => (
                  <span
                    key={p.id}
                    className="absolute h-2 w-2 rounded-full bg-foreground [animation:burst_1s_cubic-bezier(0.16,1,0.3,1)_forwards] shadow-[0_0_10px_rgba(99,102,241,0.6)]"
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
              className="onb-cta-glow px-10 py-4 text-lg font-bold"
            >
              {isFinishing ? 'Launching Shiori...' : 'Launch Shiori'}
              <ShioriMark size={24} className="ml-2 text-white" aria-hidden="true" />
            </GlowButton>
          </div>

          <button
            type="button"
            onClick={resetOnboarding}
            className="text-sm text-white/55 underline underline-offset-4 transition-colors hover:text-white"
          >
            Start from scratch
          </button>
        </div>
      </div>
    </section>
  );
}

export default FinishStep;
