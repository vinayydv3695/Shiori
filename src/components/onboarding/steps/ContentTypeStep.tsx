import { Book, ImageIcon, Layers, CheckCircle2, Shapes } from 'lucide-react';
import GlowButton from '../components/GlowButton';
import { OnboardingMotionStyles } from '../components';
import { useOnboardingState } from '../hooks/useOnboardingState';

type ContentTypeStepProps = {
  onBack: () => void;
  onNext: () => void;
};

export function ContentTypeStep({ onBack, onNext }: ContentTypeStepProps) {
  const { state, setPreferredContentType } = useOnboardingState();
  const { preferredContentType } = state;

  return (
    <section className="relative flex h-full min-h-0 w-full flex-col overflow-hidden px-4 py-4 md:px-8 md:py-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(161,161,170,0.14),transparent_70%)]" />
      <OnboardingMotionStyles />

      <div className="relative z-10 mx-auto flex h-full min-h-0 w-full max-w-7xl flex-1 flex-col overflow-hidden rounded-[1.6rem] border border-border/40 bg-card/60 p-4 text-card-foreground backdrop-blur-xl md:p-6 shadow-2xl">
        <header className="onb-fade-up mb-6 flex shrink-0 flex-col gap-4 md:mb-8">
          <div className="flex items-center gap-3">
            <div className="onb-icon-badge flex h-11 w-11 items-center justify-center rounded-xl border border-border/50 bg-primary/5 text-primary shadow-sm">
              <Shapes size={20} strokeWidth={1.7} />
            </div>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-foreground md:text-3xl">What will you read?</h2>
              <p className="text-sm text-muted-foreground mt-1">Select the content you plan to read to tailor your experience.</p>
            </div>
          </div>
        </header>

        <div className="onb-fade-up onb-delay-100 mt-4 flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden">
          <div className="w-full max-w-2xl space-y-4 px-2 pb-2">
            {/* Books Card */}
            <button
              onClick={() => {
                if (navigator.vibrate) navigator.vibrate(30);
                setPreferredContentType('books');
              }}
              className={`w-full text-left flex items-center justify-between p-5 sm:p-6 rounded-2xl border transition-all duration-200 group active:scale-[0.98] ${
                preferredContentType === 'books'
                  ? 'bg-card border-primary/50 ring-2 ring-primary/20 shadow-md'
                  : 'bg-card/30 border-border/30 hover:bg-card/60 hover:border-border/50'
              }`}
            >
              <div className="flex items-center gap-4 sm:gap-6">
                <div className={`p-3 rounded-xl transition-colors ${preferredContentType === 'books' ? 'bg-primary/10 text-primary' : 'bg-muted/40 text-muted-foreground group-hover:text-foreground'}`}>
                  <Book size={26} strokeWidth={1.8} />
                </div>
                <span className={`text-lg sm:text-xl font-semibold tracking-tight ${preferredContentType === 'books' ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'}`}>Books</span>
              </div>
              <CheckCircle2 size={22} className={`transition-opacity duration-200 ${preferredContentType === 'books' ? 'opacity-100 text-primary' : 'opacity-0'}`} />
            </button>

            {/* Manga Card */}
            <button
              onClick={() => {
                if (navigator.vibrate) navigator.vibrate(30);
                setPreferredContentType('manga');
              }}
              className={`w-full text-left flex items-center justify-between p-5 sm:p-6 rounded-2xl border transition-all duration-200 group active:scale-[0.98] ${
                preferredContentType === 'manga'
                  ? 'bg-card border-primary/50 ring-2 ring-primary/20 shadow-md'
                  : 'bg-card/30 border-border/30 hover:bg-card/60 hover:border-border/50'
              }`}
            >
              <div className="flex items-center gap-4 sm:gap-6">
                <div className={`p-3 rounded-xl transition-colors ${preferredContentType === 'manga' ? 'bg-primary/10 text-primary' : 'bg-muted/40 text-muted-foreground group-hover:text-foreground'}`}>
                  <ImageIcon size={26} strokeWidth={1.8} />
                </div>
                <span className={`text-lg sm:text-xl font-semibold tracking-tight ${preferredContentType === 'manga' ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'}`}>Manga & Comics</span>
              </div>
              <CheckCircle2 size={22} className={`transition-opacity duration-200 ${preferredContentType === 'manga' ? 'opacity-100 text-primary' : 'opacity-0'}`} />
            </button>

            {/* Both Card */}
            <button
              onClick={() => {
                if (navigator.vibrate) navigator.vibrate(30);
                setPreferredContentType('both');
              }}
              className={`w-full text-left flex items-center justify-between p-5 sm:p-6 rounded-2xl border transition-all duration-200 group active:scale-[0.98] ${
                preferredContentType === 'both'
                  ? 'bg-card border-primary/50 ring-2 ring-primary/20 shadow-md'
                  : 'bg-card/30 border-border/30 hover:bg-card/60 hover:border-border/50'
              }`}
            >
              <div className="flex items-center gap-4 sm:gap-6">
                <div className={`p-3 rounded-xl transition-colors ${preferredContentType === 'both' ? 'bg-primary/10 text-primary' : 'bg-muted/40 text-muted-foreground group-hover:text-foreground'}`}>
                  <Layers size={26} strokeWidth={1.8} />
                </div>
                <span className={`text-lg sm:text-xl font-semibold tracking-tight ${preferredContentType === 'both' ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'}`}>Both</span>
              </div>
              <CheckCircle2 size={22} className={`transition-opacity duration-200 ${preferredContentType === 'both' ? 'opacity-100 text-primary' : 'opacity-0'}`} />
            </button>
          </div>
        </div>

        <div className="onb-fade-up onb-delay-200 mt-6 sm:mt-8 flex shrink-0 items-center justify-between pt-4 border-t border-border/40">
          <GlowButton onClick={onBack} variant="secondary">
            ← Back
          </GlowButton>

          <GlowButton onClick={onNext} className="min-w-[120px] shadow-lg">
            Continue →
          </GlowButton>
        </div>
      </div>
    </section>
  );
}
