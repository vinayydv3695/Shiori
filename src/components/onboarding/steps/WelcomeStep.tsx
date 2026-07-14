import { BookOpen, Image, Radio, Zap } from 'lucide-react';
import { useOnboardingState } from '../hooks/useOnboardingState';

type WelcomeStepProps = {
  appVersion: string;
  onStart: () => void;
};

export function WelcomeStep({ onStart }: WelcomeStepProps) {
  const logoSrc = `${import.meta.env.BASE_URL}logo.png`;
  const { setOnboardingPath } = useOnboardingState();

  const handleStart = () => {
    setOnboardingPath('local'); // Default to local so we don't skip import step, preserving old behavior
    onStart();
  };

  return (
    <section className="relative flex h-full min-h-0 w-full flex-col overflow-hidden px-6 py-6 text-foreground md:px-10 md:py-8">
      {/* Ambient Background Glow */}
      <div className="absolute left-1/2 top-1/2 z-0 h-[120vh] w-[120vw] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/20 via-background/80 to-background [animation:ambient-glow_8s_ease-in-out_infinite] pointer-events-none" />



      <div className="relative z-10 mx-auto flex h-full w-full max-w-6xl flex-col items-center justify-center text-center">
        <p className="animate-fade-up mb-6 text-[10px] font-semibold uppercase tracking-[0.6em] text-muted-foreground/80 opacity-0 md:mb-8 ml-[0.6em]">
          Welcome To
        </p>

        <div className="animate-fade-up delay-100 relative mb-10 opacity-0 md:mb-12">
          <span className="absolute inset-0 rounded-full border border-primary/20 [animation:shiori-logo-pulse_4s_ease-in-out_infinite]" />
          <span className="absolute -inset-6 rounded-full border border-primary/10 [animation:shiori-logo-pulse_4s_ease-in-out_infinite_reverse]" />
          <div className="relative flex h-48 w-48 items-center justify-center overflow-hidden rounded-full border border-border/40 bg-card/90 shadow-2xl [animation:shiori-logo-in_1s_cubic-bezier(0.16,1,0.3,1)_forwards] md:h-64 md:w-64">
            <img src={logoSrc} alt="Shiori Logo" className="h-full w-full object-contain p-4 md:p-6" />
          </div>
        </div>

        <h1 className="animate-fade-up delay-200 mb-6 max-w-4xl text-3xl font-extralight tracking-[0.45em] text-foreground/90 opacity-0 md:text-5xl ml-[0.45em]">
          SHIORI
        </h1>

        <div className="animate-fade-up delay-200 mb-12 flex flex-wrap justify-center gap-3 opacity-0 max-w-2xl px-4">
          <div className="flex items-center gap-2 rounded-full border border-border/40 bg-card/40 px-4 py-2 text-xs font-medium text-muted-foreground backdrop-blur-md">
            <BookOpen className="h-3.5 w-3.5" />
            <span>LibGen & Project Gutenberg</span>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-border/40 bg-card/40 px-4 py-2 text-xs font-medium text-muted-foreground backdrop-blur-md">
            <Image className="h-3.5 w-3.5" />
            <span>Manga Reader</span>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-border/40 bg-card/40 px-4 py-2 text-xs font-medium text-muted-foreground backdrop-blur-md">
            <Radio className="h-3.5 w-3.5" />
            <span> Torbox Support</span>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-border/40 bg-card/40 px-4 py-2 text-xs font-medium text-muted-foreground backdrop-blur-md">
            <Zap className="h-3.5 w-3.5" />
            <span>Premium Epub Reader</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleStart}
          className="animate-fade-up delay-300 group relative overflow-hidden rounded-full border border-primary/20 bg-primary px-9 py-3.5 text-sm font-bold uppercase tracking-[0.14em] text-primary-foreground opacity-0 transition-all hover:scale-105 hover:bg-primary/90 hover:shadow-lg focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 active:scale-95"
        >
          <span className="relative z-10 flex items-center gap-2">Start Setup →</span>
          <div className="absolute inset-0 z-0 bg-gradient-to-r from-transparent via-primary-foreground/20 to-transparent translate-x-[-100%] transition-transform duration-700 ease-in-out group-hover:translate-x-[100%]" />
        </button>
      </div>
    </section>
  );
}

export default WelcomeStep;
