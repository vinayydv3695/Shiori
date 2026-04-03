import type { ThemeName } from '../../../store/onboardingStore';

type ThemeSwatchProps = {
  name: ThemeName;
  selected: boolean;
  onSelect: (theme: ThemeName) => void;
  preview: { background: string; text: string; accent: string };
};

export default function ThemeSwatch({ name, selected, onSelect, preview }: ThemeSwatchProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(name)}
      className={`group relative flex w-full flex-col overflow-hidden rounded-2xl border text-left transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
        selected
          ? 'scale-[1.02] border-primary bg-primary/5 shadow-xl shadow-primary/20'
          : 'scale-100 border-border/40 bg-card/40 hover:scale-[1.01] hover:border-border hover:bg-muted/20 hover:shadow-md'
      }`}
      aria-pressed={selected}
      aria-label={`Select ${name} theme`}
    >
      <div className="relative h-28 w-full overflow-hidden p-3" style={{ background: preview.background }}>
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
        
        <div className="relative z-10 flex h-full flex-col justify-between">
          <div className="flex gap-2">
            <div className="h-3 w-3 rounded-full shadow-sm" style={{ background: preview.accent }} />
            <div className="h-3 w-16 rounded-full shadow-sm" style={{ background: preview.text, opacity: 0.8 }} />
          </div>
          <div className="space-y-2">
            <div className="h-2 w-full rounded-full" style={{ background: preview.text, opacity: 0.3 }} />
            <div className="h-2 w-4/5 rounded-full" style={{ background: preview.text, opacity: 0.2 }} />
            <div className="h-2 w-5/6 rounded-full" style={{ background: preview.text, opacity: 0.25 }} />
          </div>
        </div>

        {selected && (
          <div className="absolute inset-0 border-4 border-primary/20 transition-all duration-500" />
        )}
      </div>

      <div className="flex items-center justify-between border-t border-border/10 bg-card/60 p-4 backdrop-blur-md">
        <span className={`text-sm font-semibold transition-colors ${selected ? 'text-primary' : 'text-foreground group-hover:text-foreground/80'}`}>
          {name}
        </span>
        
        <div className={`flex h-5 w-5 items-center justify-center rounded-full border transition-all duration-300 ${
          selected ? 'scale-100 border-primary bg-primary text-primary-foreground' : 'scale-90 border-muted-foreground/30 opacity-0 group-hover:opacity-100'
        }`}>
          {selected && (
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      </div>
    </button>
  );
}
