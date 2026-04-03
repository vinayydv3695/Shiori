import type { ThemeName } from '../../../store/onboardingStore';
import ThemeSwatch from '../components/ThemeSwatch';

type ThemeStepProps = {
  selectedTheme: ThemeName;
  themes: { name: ThemeName; value: string }[];
  onSelectTheme: (theme: ThemeName) => void;
  onBack: () => void;
  onNext: () => void;
};

export function ThemeStep({ selectedTheme, themes, onSelectTheme, onBack, onNext }: ThemeStepProps) {
  const previews: Record<ThemeName, { background: string; text: string; accent: string }> = {
    White: { background: '#ffffff', text: '#111', accent: '#d4d4d4' },
    Black: { background: '#09090b', text: '#fafafa', accent: '#333' },
    'Rose Pine Moon': { background: '#232136', text: '#e0def4', accent: '#c4a7e7' },
    'Catppuccin Mocha': { background: '#1e1e2e', text: '#cdd6f4', accent: '#cba6f7' },
    Nord: { background: '#2e3440', text: '#eceff4', accent: '#88c0d0' },
    Dracula: { background: '#282a36', text: '#f8f8f2', accent: '#bd93f9' },
    'Tokyo Night': { background: '#1a1b26', text: '#c0caf5', accent: '#7aa2f7' },
  };

  return (
    <section className="relative w-full overflow-hidden rounded-[2rem] border border-border/50 bg-card/50 p-8 shadow-xl backdrop-blur-xl md:p-12">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-50" />
      
      <div className="relative z-10">
        <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Make It Yours</h2>
        <p className="mt-3 text-lg text-muted-foreground">
          Choose a theme that fits your reading environment.
        </p>

        <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-3">
          {themes.map((theme, index) => (
            <div key={theme.name} className={index === 6 ? 'col-span-2 md:col-start-2 md:col-span-1' : ''}>
              <ThemeSwatch
                name={theme.name}
                selected={selectedTheme === theme.name}
                onSelect={onSelectTheme}
                preview={previews[theme.name]}
              />
            </div>
          ))}
        </div>

        <div className="mt-12 flex items-center justify-between border-t border-border/30 pt-8">
          <button
            type="button"
            onClick={onBack}
            className="rounded-full px-6 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-muted"
          >
            ← Back
          </button>
          <button
            type="button"
            onClick={onNext}
            className="group flex items-center gap-2 rounded-full bg-foreground px-8 py-3.5 text-sm font-bold text-background transition-all hover:bg-foreground/90 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Continue
            <svg className="h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  );
}

export default ThemeStep;
