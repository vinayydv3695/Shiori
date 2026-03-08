import { useOnboardingStore } from '../../../store/onboardingStore';
import { cn } from '../../../lib/utils';

export function TranslationStep() {
  const draftConfig = useOnboardingStore(state => state.draftConfig);
  const setDraftValue = useOnboardingStore(state => state.setDraftValue);
  const targetLang = draftConfig.translationTargetLanguage || 'en';

  const languages = [
    { code: 'en', name: 'English', flag: '🇬🇧' },
    { code: 'es', name: 'Spanish', flag: '🇪🇸' },
    { code: 'fr', name: 'French', flag: '🇫🇷' },
    { code: 'de', name: 'German', flag: '🇩🇪' },
    { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
    { code: 'zh', name: 'Chinese', flag: '🇨🇳' },
    { code: 'ko', name: 'Korean', flag: '🇰🇷' },
    { code: 'pt', name: 'Portuguese', flag: '🇵🇹' },
    { code: 'ru', name: 'Russian', flag: '🇷🇺' },
    { code: 'ar', name: 'Arabic', flag: '🇸🇦' },
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold tracking-tight text-foreground">Translation Language</h2>
        <p className="text-muted-foreground max-w-lg mx-auto">
          Choose your preferred language for instant text translation while reading.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 max-w-4xl mx-auto">
        {languages.map((lang, idx) => {
          const isSelected = targetLang === lang.code;
          return (
            <button
              key={lang.code}
              onClick={() => setDraftValue('translationTargetLanguage', lang.code)}
              className={cn(
                "flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all duration-300 text-center relative overflow-hidden group",
                isSelected
                  ? "border-primary bg-primary/5 shadow-sm scale-[1.02]"
                  : "border-border hover:border-primary/40 hover:bg-accent/50 hover:shadow-sm"
              )}
              style={{ animationDelay: `${idx * 50}ms` }}
            >
              {isSelected && (
                <div className="absolute inset-x-0 top-0 h-1 bg-primary w-full animate-in fade-in" />
              )}
              <span className="text-3xl mb-2 group-hover:scale-110 transition-transform duration-300">
                {lang.flag}
              </span>
              <span className={cn("font-semibold text-sm mb-0.5", isSelected ? "text-primary" : "text-foreground")}>
                {lang.name}
              </span>
              <span className="text-xs text-muted-foreground font-mono uppercase tracking-wider">
                {lang.code}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}