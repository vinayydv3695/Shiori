import { Check, Moon, Palette, Sun } from 'lucide-react';
import type { ThemeName } from '../../../store/onboardingStore';
import GlowButton from '../components/GlowButton';
import { OnboardingMotionStyles } from '../components';

type ThemeStepProps = {
  selectedTheme: ThemeName;
  themes: { name: ThemeName; value: string }[];
  onSelectTheme: (theme: ThemeName) => void;
  onBack: () => void;
  onNext: () => void;
};

const previews: Record<ThemeName, { background: string; text: string; accent: string; surface: string; border: string }> = {
  White: { background: '#f8fafc', surface: '#e4e4e7', text: '#18181b', accent: '#52525b', border: '#d4d4d8' },
  Black: { background: '#09090b', surface: '#18181b', text: '#f4f4f5', accent: '#a1a1aa', border: '#3f3f46' },
  'Rose Pine Moon': { background: '#232136', surface: '#2a273f', text: '#e0def4', accent: '#b8b0d9', border: '#524f67' },
  'Catppuccin Mocha': { background: '#1e1e2e', surface: '#181825', text: '#cdd6f4', accent: '#b8bed8', border: '#45475a' },
  Nord: { background: '#2e3440', surface: '#3b4252', text: '#eceff4', accent: '#c4ccd8', border: '#4c566a' },
  Dracula: { background: '#282a36', surface: '#44475a', text: '#f8f8f2', accent: '#d4d1df', border: '#6272a4' },
  'Tokyo Night': { background: '#1a1b26', surface: '#24283b', text: '#c0caf5', accent: '#c2c8de', border: '#414868' },
};

const isLightTheme = (themeName: ThemeName) => themeName === 'White';

export function ThemeStep({ selectedTheme, themes, onSelectTheme, onBack, onNext }: ThemeStepProps) {
  return (
    <section className="relative flex h-full min-h-0 w-full flex-col overflow-hidden px-4 py-4 text-white md:px-8 md:py-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(161,161,170,0.16),transparent_65%)]" />
      <OnboardingMotionStyles />

      <div className="relative z-10 mx-auto flex h-full min-h-0 w-full max-w-7xl flex-col overflow-hidden rounded-[1.6rem] border border-white/10 bg-zinc-950/70 p-4 backdrop-blur-xl md:p-6">
        <header className="onb-fade-up mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3 md:mb-5">
          <div className="flex items-center gap-3">
            <div className="onb-icon-badge flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-400/35 bg-zinc-400/10 text-zinc-300 shadow-[0_0_14px_rgba(255,255,255,0.1)]">
              <Palette size={20} strokeWidth={1.7} />
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">Theme Selection</h2>
              <p className="text-sm text-zinc-400">Choose default look. You can change later.</p>
            </div>
          </div>

          <div className="inline-flex items-center gap-2 rounded-xl border border-zinc-400/25 bg-zinc-500/10 px-3 py-1.5 text-sm text-zinc-200">
            <span className="text-zinc-300/80">Selected:</span>
            <span className="font-semibold text-white">{selectedTheme}</span>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-gutter:stable] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/20 hover:[&::-webkit-scrollbar-thumb]:bg-white/30">
          <div className="onb-fade-up onb-delay-100 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {themes.map((theme) => {
              const isSelected = selectedTheme === theme.name;
              const colors = previews[theme.name];

              return (
                <button
                  key={theme.name}
                  type="button"
                  onClick={() => onSelectTheme(theme.name)}
                  className="group relative w-full rounded-2xl text-left outline-none transition-all duration-300 ease-out focus-visible:ring-2 focus-visible:ring-zinc-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
                  aria-pressed={isSelected}
                  aria-label={`Select ${theme.name} theme`}
                >
                  <div
                    className={`relative overflow-hidden rounded-2xl border transition-all duration-300 ${
                      isSelected
                        ? 'border-zinc-300/90 bg-zinc-500/10 shadow-[0_0_30px_-8px_rgba(255,255,255,0.23)] ring-1 ring-zinc-200/70'
                        : 'border-white/10 bg-zinc-900/50 hover:border-white/20 hover:bg-zinc-900/70'
                    }`}
                  >
                    <div
                      className="relative h-28 w-full overflow-hidden border-b border-black/30 px-3 py-2.5 transition-transform duration-500 group-hover:scale-[1.03]"
                      style={{ background: colors.background }}
                    >
                      <div className="absolute inset-0 opacity-90">
                        <div className="flex h-6 items-center gap-2 border-b px-2" style={{ borderColor: colors.border, background: colors.surface }}>
                          <div className="h-1.5 w-1.5 rounded-full opacity-50" style={{ background: colors.text }} />
                          <div className="h-1.5 w-1.5 rounded-full opacity-35" style={{ background: colors.text }} />
                          <div className="ml-auto h-1.5 w-10 rounded-full opacity-25" style={{ background: colors.text }} />
                        </div>

                        <div className="flex h-[calc(100%-1.5rem)] gap-2 p-2">
                          <div className="w-8 rounded-md opacity-55" style={{ background: colors.surface }} />
                          <div className="flex-1 space-y-1.5">
                            <div className="h-2.5 w-16 rounded-full" style={{ background: colors.text, opacity: 0.8 }} />
                            <div className="h-1.5 w-full rounded-full" style={{ background: colors.text, opacity: 0.35 }} />
                            <div className="h-1.5 w-5/6 rounded-full" style={{ background: colors.text, opacity: 0.25 }} />
                            <div className="mt-2 h-4 w-14 rounded-md" style={{ background: colors.accent, opacity: 0.9 }} />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="relative flex items-center justify-between px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${isSelected ? 'bg-zinc-400/20 text-zinc-200' : 'bg-zinc-800 text-zinc-400 group-hover:text-zinc-300'}`}>
                          {isLightTheme(theme.name) ? <Sun size={14} /> : <Moon size={14} />}
                        </span>
                        <span className={`text-sm font-medium ${isSelected ? 'text-white' : 'text-zinc-300 group-hover:text-white'}`}>
                          {theme.name}
                        </span>
                      </div>

                      <span
                        className={`inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px] transition-all ${
                          isSelected
                            ? 'border-zinc-200/80 bg-zinc-200 text-zinc-900'
                            : 'border-white/15 bg-zinc-900 text-transparent opacity-0 group-hover:opacity-100'
                        }`}
                      >
                        <Check size={11} strokeWidth={3} />
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="onb-fade-up onb-delay-200 mt-3 flex shrink-0 items-center justify-between border-t border-white/10 pt-3">
          <GlowButton
            theme="dark"
            variant="secondary"
            onClick={onBack}
            className="border border-white/10 bg-zinc-900/70 px-5 text-zinc-200 hover:bg-zinc-800"
          >
            ← Back
          </GlowButton>
          <GlowButton theme="dark" variant="primary" onClick={onNext} className="onb-cta-glow px-8">
            Continue →
          </GlowButton>
        </div>
      </div>
    </section>
  );
}

export default ThemeStep;
