import { Book, ImageIcon, Sparkles, CheckCircle2, Shapes } from 'lucide-react';
import { motion } from 'framer-motion';
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
              onClick={() => setPreferredContentType('books')}
              className={`w-full text-left flex items-center justify-between p-6 rounded-2xl border transition-all duration-200 group ${
                preferredContentType === 'books'
                  ? 'bg-card border-primary/40 ring-1 ring-primary/20 shadow-sm'
                  : 'bg-transparent border-border/20 hover:bg-card/40 hover:border-border/40'
              }`}
            >
              <div className="flex items-center gap-6">
                <Book size={32} className={preferredContentType === 'books' ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'} strokeWidth={1.5} />
                <span className={`text-xl font-medium tracking-tight ${preferredContentType === 'books' ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'}`}>Books</span>
              </div>
              <CheckCircle2 size={24} className={`transition-opacity duration-200 ${preferredContentType === 'books' ? 'opacity-100 text-primary' : 'opacity-0'}`} />
            </button>

            {/* Manga Card */}
            <button
              onClick={() => setPreferredContentType('manga')}
              className={`w-full text-left flex items-center justify-between p-6 rounded-2xl border transition-all duration-200 group ${
                preferredContentType === 'manga'
                  ? 'bg-card border-primary/40 ring-1 ring-primary/20 shadow-sm'
                  : 'bg-transparent border-border/20 hover:bg-card/40 hover:border-border/40'
              }`}
            >
              <div className="flex items-center gap-6">
                <ImageIcon size={32} className={preferredContentType === 'manga' ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'} strokeWidth={1.5} />
                <span className={`text-xl font-medium tracking-tight ${preferredContentType === 'manga' ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'}`}>Manga & Comics</span>
              </div>
              <CheckCircle2 size={24} className={`transition-opacity duration-200 ${preferredContentType === 'manga' ? 'opacity-100 text-primary' : 'opacity-0'}`} />
            </button>

            {/* Both Card */}
            <button
              onClick={() => setPreferredContentType('both')}
              className={`w-full text-left flex items-center justify-between p-6 rounded-2xl border transition-all duration-200 group ${
                preferredContentType === 'both'
                  ? 'bg-card border-primary/40 ring-1 ring-primary/20 shadow-sm'
                  : 'bg-transparent border-border/20 hover:bg-card/40 hover:border-border/40'
              }`}
            >
              <div className="flex items-center gap-6">
                <Sparkles size={32} className={preferredContentType === 'both' ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'} strokeWidth={1.5} />
                <span className={`text-xl font-medium tracking-tight ${preferredContentType === 'both' ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'}`}>Both</span>
              </div>
              <CheckCircle2 size={24} className={`transition-opacity duration-200 ${preferredContentType === 'both' ? 'opacity-100 text-primary' : 'opacity-0'}`} />
            </button>
          </div>
        </div>

        <div className="onb-fade-up onb-delay-200 mt-8 flex shrink-0 items-center justify-between pt-4 border-t border-border/40">
          <button
            onClick={onBack}
            className="rounded-xl px-5 py-2.5 text-sm font-medium text-foreground/80 hover:bg-muted hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            ← Back
          </button>

          <GlowButton onClick={onNext} className="min-w-[120px] shadow-lg">
            Continue →
          </GlowButton>
        </div>
      </div>
    </section>
  );
}
