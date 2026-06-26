import { BookOpen, Image, Radio, Zap } from 'lucide-react';

type WelcomeStepProps = {
  appVersion: string;
  onStart: () => void;
};

export function WelcomeStep({ appVersion, onStart }: WelcomeStepProps) {
  const logoSrc = `${import.meta.env.BASE_URL}logo.png`;

  return (
    <section className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-zinc-950 px-6 py-6 text-white md:px-10 md:py-8">
      <style>{`
        @keyframes shiori-logo-in {
          0% { opacity: 0; transform: translateY(14px) scale(0.9); filter: blur(10px); }
          100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
        @keyframes shiori-logo-pulse {
          0%, 100% { transform: scale(1); opacity: 0.35; box-shadow: 0 0 20px rgba(255,255,255,0.05); }
          50% { transform: scale(1.07); opacity: 0.6; box-shadow: 0 0 40px rgba(255,255,255,0.1); }
        }
        @keyframes ambient-glow {
          0%, 100% { opacity: 0.3; transform: translate(-50%, -50%) scale(1); }
          50% { opacity: 0.5; transform: translate(-50%, -50%) scale(1.1); }
        }
        @keyframes fade-up {
          0% { opacity: 0; transform: translateY(15px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-up { animation: fade-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .delay-100 { animation-delay: 100ms; }
        .delay-200 { animation-delay: 200ms; }
        .delay-300 { animation-delay: 300ms; }
      `}</style>

      {/* Ambient Background Glow */}
      <div className="absolute left-1/2 top-1/2 z-0 h-[120vh] w-[120vw] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-900/30 via-zinc-950/80 to-zinc-950 [animation:ambient-glow_8s_ease-in-out_infinite] pointer-events-none" />
      
      {/* Subtle Noise Texture */}
      <div className="absolute inset-0 z-0 opacity-[0.04] mix-blend-overlay pointer-events-none" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.8%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }} />



      <div className="relative z-10 mx-auto flex h-full w-full max-w-6xl flex-col items-center justify-center text-center">
        <p className="animate-fade-up mb-6 text-[10px] font-semibold uppercase tracking-[0.6em] text-zinc-400/80 opacity-0 md:mb-8 ml-[0.6em]">
          Welcome To
        </p>

        <div className="animate-fade-up delay-100 relative mb-10 opacity-0 md:mb-12">
          <span className="absolute inset-0 rounded-full border border-white/20 [animation:shiori-logo-pulse_4s_ease-in-out_infinite]" />
          <span className="absolute -inset-6 rounded-full border border-white/5 blur-[2px] [animation:shiori-logo-pulse_4s_ease-in-out_infinite_reverse]" />
          <div className="relative flex h-48 w-48 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-zinc-900/80 shadow-[0_0_50px_rgba(255,255,255,0.08)] backdrop-blur-md [animation:shiori-logo-in_1s_cubic-bezier(0.16,1,0.3,1)_forwards] md:h-64 md:w-64">
            <img src={logoSrc} alt="Shiori Logo" className="h-full w-full object-cover scale-105" />
          </div>
        </div>

        <h1 className="animate-fade-up delay-200 mb-6 max-w-4xl text-3xl font-extralight tracking-[0.45em] text-white/90 opacity-0 md:text-5xl ml-[0.45em]">
          SHIORI
        </h1>

        <div className="animate-fade-up delay-200 mb-12 flex flex-wrap justify-center gap-3 opacity-0 max-w-2xl px-4">
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-zinc-300 backdrop-blur-md">
            <BookOpen className="h-3.5 w-3.5 text-zinc-400" />
            <span>LibGen & Project Gutenberg</span>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-zinc-300 backdrop-blur-md">
            <Image className="h-3.5 w-3.5 text-zinc-400" />
            <span>Manga Reader Options</span>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-zinc-300 backdrop-blur-md">
            <Radio className="h-3.5 w-3.5 text-zinc-400" />
            <span>Direct Torrent Streaming</span>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-zinc-300 backdrop-blur-md">
            <Zap className="h-3.5 w-3.5 text-zinc-400" />
            <span>Premium Fullscreen Reader</span>
          </div>
        </div>

        <button
          type="button"
          onClick={onStart}
          className="animate-fade-up delay-300 group relative overflow-hidden rounded-full border border-white/20 bg-zinc-100 px-9 py-3.5 text-sm font-bold uppercase tracking-[0.14em] text-zinc-950 opacity-0 transition-all hover:scale-105 hover:bg-white hover:shadow-[0_0_40px_-8px_rgba(255,255,255,0.38)] focus:outline-none focus-visible:ring-4 focus-visible:ring-white/20 active:scale-95"
        >
          <span className="relative z-10 flex items-center gap-2">Start Setup →</span>
          <div className="absolute inset-0 z-0 bg-gradient-to-r from-transparent via-white/70 to-transparent translate-x-[-100%] transition-transform duration-700 ease-in-out group-hover:translate-x-[100%]" />
        </button>
      </div>
    </section>
  );
}

export default WelcomeStep;
