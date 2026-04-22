import { Check, Layout, Moon, Palette, Sun } from 'lucide-react';
import type { ThemeName } from '../../../store/onboardingStore';
import GlowButton from '../components/GlowButton';

type ThemeStepProps = {
  selectedTheme: ThemeName;
  themes: { name: ThemeName; value: string }[];
  onSelectTheme: (theme: ThemeName) => void;
  onBack: () => void;
  onNext: () => void;
};

const previews: Record<ThemeName, { background: string; text: string; accent: string; surface: string; border: string }> = {
  White: { background: '#ffffff', surface: '#f4f4f5', text: '#18181b', accent: '#4f46e5', border: '#e4e4e7' },
  Black: { background: '#09090b', surface: '#18181b', text: '#fafafa', accent: '#6366f1', border: '#27272a' },
  'Rose Pine Moon': { background: '#232136', surface: '#2a273f', text: '#e0def4', accent: '#c4a7e7', border: '#393552' },
  'Catppuccin Mocha': { background: '#1e1e2e', surface: '#181825', text: '#cdd6f4', accent: '#cba6f7', border: '#313244' },
  Nord: { background: '#2e3440', surface: '#3b4252', text: '#eceff4', accent: '#88c0d0', border: '#4c566a' },
  Dracula: { background: '#282a36', surface: '#44475a', text: '#f8f8f2', accent: '#bd93f9', border: '#6272a4' },
  'Tokyo Night': { background: '#1a1b26', surface: '#24283b', text: '#c0caf5', accent: '#7aa2f7', border: '#414868' },
};

export function ThemeStep({ selectedTheme, themes, onSelectTheme, onBack, onNext }: ThemeStepProps) {
  const isLightTheme = (themeName: ThemeName) => themeName === 'White';

  return (
    <div className="flex h-full flex-col bg-slate-950">
      <section className="flex w-full flex-col flex-1 rounded-[2rem] border border-white/5 bg-slate-950 p-6 sm:p-8 md:p-12 shadow-2xl">
        <div className="flex-1 flex flex-col max-w-5xl mx-auto w-full">
          <header className="flex flex-col gap-4 mb-8">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.2)]">
                <Palette size={26} strokeWidth={1.5} />
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-white md:text-5xl">Make It Yours</h2>
            </div>
            <p className="text-lg text-slate-400 max-w-2xl leading-relaxed">
              Choose a theme for your reading environment. You can fine-tune app appearance later in Settings.
            </p>
            <div className="inline-flex w-fit items-center gap-2 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-sm text-indigo-200">
              <span className="text-indigo-300/80">Current selection:</span>
              <span className="font-semibold text-white">{selectedTheme}</span>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto pr-2 pb-4 max-h-[60vh] [scrollbar-gutter:stable] [&::-webkit-scrollbar]:w-3 [&::-webkit-scrollbar-track]:bg-slate-900/50 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/20 hover:[&::-webkit-scrollbar-thumb]:bg-white/30">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {themes.map((theme) => {
                const isSelected = selectedTheme === theme.name;
                const colors = previews[theme.name];
                
                return (
                  <button
                    key={theme.name}
                    type="button"
                    onClick={() => onSelectTheme(theme.name)}
                    className="group relative w-full rounded-2xl text-left outline-none transition-all duration-300 ease-out focus-visible:ring-2 focus-visible:ring-indigo-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                    aria-pressed={isSelected}
                    aria-label={`Select ${theme.name} theme`}
                  >
                    <div
                      className={`relative overflow-hidden rounded-2xl border transition-all duration-300 ${
                        isSelected
                          ? 'border-indigo-400/90 bg-indigo-500/10 shadow-[0_0_36px_-5px_rgba(99,102,241,0.45)] ring-2 ring-indigo-400/70 scale-[1.02]'
                          : 'border-white/10 bg-slate-900/40 hover:border-white/20 hover:bg-slate-900/60 hover:scale-[1.01]'
                       }`}
                    >
                      {/* Theme Preview Window */}
                      <div 
                        className="relative h-40 w-full overflow-hidden border-b border-black/20 p-4 transition-transform duration-500 group-hover:scale-105" 
                        style={{ background: colors.background }}
                      >
                        {/* Mini UI Layout representation */}
                        <div className="absolute inset-0 flex flex-col opacity-90">
                          {/* Header */}
                          <div className="flex h-8 items-center gap-2 px-3 border-b" style={{ borderColor: colors.border, background: colors.surface }}>
                            <div className="flex gap-1.5">
                              <div className="h-2 w-2 rounded-full opacity-40" style={{ background: colors.text }} />
                              <div className="h-2 w-2 rounded-full opacity-40" style={{ background: colors.text }} />
                            </div>
                            <div className="ml-auto h-2 w-12 rounded-full opacity-20" style={{ background: colors.text }} />
                          </div>
                          
                          {/* Body */}
                          <div className="flex flex-1 p-3 gap-3">
                            {/* Sidebar */}
                            <div className="w-12 h-full rounded-md opacity-50 flex flex-col gap-2" style={{ background: colors.surface }}>
                              <div className="h-2 w-8 mx-auto mt-2 rounded-full" style={{ background: colors.text, opacity: 0.3 }} />
                              <div className="h-2 w-6 mx-auto rounded-full" style={{ background: colors.text, opacity: 0.2 }} />
                              <div className="h-2 w-8 mx-auto rounded-full" style={{ background: colors.text, opacity: 0.2 }} />
                            </div>
                            
                            {/* Main Content */}
                            <div className="flex-1 flex flex-col gap-2">
                              <div className="flex items-center justify-between">
                                <div className="h-3 w-20 rounded-md" style={{ background: colors.text, opacity: 0.8 }} />
                                <div className="h-5 w-5 rounded-md flex items-center justify-center" style={{ background: colors.accent }}>
                                  <Layout size={10} color={colors.background} />
                                </div>
                              </div>
                              <div className="h-2 w-full rounded-full mt-1" style={{ background: colors.text, opacity: 0.4 }} />
                              <div className="h-2 w-3/4 rounded-full" style={{ background: colors.text, opacity: 0.3 }} />
                              <div className="h-2 w-5/6 rounded-full" style={{ background: colors.text, opacity: 0.3 }} />
                              
                              <div className="mt-auto flex gap-2">
                                <div className="h-6 w-16 rounded-md opacity-80" style={{ background: colors.accent }} />
                                <div className="h-6 w-16 rounded-md opacity-40 border" style={{ borderColor: colors.border, background: colors.surface }} />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Theme Info & Selection State */}
                      <div className="relative flex items-center justify-between px-5 py-4 bg-slate-950/80 backdrop-blur-sm">
                        <div className="flex items-center gap-3">
                          <div 
                            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors duration-300 ${
                              isSelected ? 'bg-indigo-500/20 text-indigo-400' : 'bg-slate-800 text-slate-400 group-hover:text-slate-300'
                            }`}
                          >
                            {isLightTheme(theme.name) ? <Sun size={16} /> : <Moon size={16} />}
                          </div>
                          <span className={`text-base font-medium transition-colors duration-300 ${
                            isSelected ? 'text-white' : 'text-slate-300 group-hover:text-white'
                          }`}>
                            {theme.name}
                          </span>
                        </div>

                        <div
                          className={`flex h-6 w-6 items-center justify-center rounded-full transition-all duration-300 ${
                            isSelected
                              ? 'scale-100 bg-indigo-500 text-white shadow-[0_0_10px_rgba(99,102,241,0.5)]'
                              : 'scale-75 bg-slate-800/50 text-transparent opacity-0 group-hover:scale-100 group-hover:opacity-100'
                          }`}
                        >
                          <Check size={14} strokeWidth={3} />
                        </div>

                        {isSelected ? (
                          <span className="absolute right-4 top-3 rounded-full border border-indigo-300/40 bg-indigo-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-100">
                            Selected
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between border-t border-white/5 pt-6">
            <GlowButton 
              theme="dark" 
              variant="secondary" 
              onClick={onBack} 
              icon={<span aria-hidden>←</span>} 
              className="border border-white/10 bg-slate-900/50 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
            >
              Back
            </GlowButton>
            <GlowButton 
              theme="dark" 
              variant="primary" 
              onClick={onNext} 
              icon={<span aria-hidden>→</span>}
              className="bg-indigo-600 hover:bg-indigo-500 text-white shadow-[0_0_20px_rgba(99,102,241,0.3)]"
            >
              Continue
            </GlowButton>
          </div>
        </div>
      </section>
    </div>
  );
}

export default ThemeStep;
