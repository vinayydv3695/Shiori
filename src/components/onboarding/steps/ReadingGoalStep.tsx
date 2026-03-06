import { useOnboardingStore } from '../../../store/onboardingStore';
import { cn } from '../../../lib/utils';

export function ReadingGoalStep() {
  const { draftConfig, setDraftValue } = useOnboardingStore();
  const goal = draftConfig.dailyReadingGoalMinutes ?? 30;

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDraftValue('dailyReadingGoalMinutes', parseInt(e.target.value, 10));
  };

  const presets = [
    { label: '15 min', sub: 'Casual', value: 15 },
    { label: '30 min', sub: 'Regular', value: 30 },
    { label: '60 min', sub: 'Bookworm', value: 60 },
  ];

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold tracking-tight text-foreground">Set Your Reading Goal</h2>
        <p className="text-muted-foreground max-w-lg mx-auto">
          A small daily commitment builds a lasting reading habit.
        </p>
      </div>

      <div className="max-w-md mx-auto space-y-8">
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-6">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Daily Target</span>
            <span className="font-mono bg-primary/10 text-primary px-3 py-1.5 rounded-md font-bold text-lg">
              {goal} <span className="text-xs font-sans font-medium text-primary/70 uppercase tracking-widest">MIN</span>
            </span>
          </div>

          <div className="space-y-4 pt-4">
            <input
              type="range"
              min="5"
              max="120"
              step="5"
              value={goal}
              onChange={handleSliderChange}
              className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            
            <p className="text-center text-sm text-muted-foreground font-medium">
              That's about <span className="text-foreground font-semibold">{Math.round(goal / 2)} pages</span> per day
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {presets.map((preset) => {
            const isSelected = goal === preset.value;
            return (
              <button
                key={preset.value}
                onClick={() => setDraftValue('dailyReadingGoalMinutes', preset.value)}
                className={cn(
                  "flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all duration-300 text-center relative overflow-hidden group",
                  isSelected
                    ? "border-primary bg-primary/5 shadow-sm scale-[1.02]"
                    : "border-border hover:border-primary/40 hover:bg-accent/50"
                )}
              >
                {isSelected && (
                  <div className="absolute inset-x-0 top-0 h-1 bg-primary w-full animate-in fade-in" />
                )}
                <span className={cn("font-bold text-lg mb-1", isSelected ? "text-primary" : "text-foreground group-hover:text-primary transition-colors")}>
                  {preset.label}
                </span>
                <span className={cn("text-xs font-medium uppercase tracking-wider", isSelected ? "text-primary/70" : "text-muted-foreground")}>
                  {preset.sub}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}