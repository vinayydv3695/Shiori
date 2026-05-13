type WelcomeStepProps = {
  appVersion: string;
  onStart: () => void;
};

export function WelcomeStep({ appVersion, onStart }: WelcomeStepProps) {
  return (
    <section className="relative flex h-full min-h-0 w-full flex-col overflow-hidden px-6 py-6 text-white md:px-10 md:py-8">
      <style>{`
        @keyframes shiori-logo-in {
          0% { opacity: 0; transform: translateY(14px) scale(0.9); filter: blur(10px); }
          100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
        @keyframes shiori-logo-pulse {
          0%, 100% { transform: scale(1); opacity: 0.35; }
          50% { transform: scale(1.07); opacity: 0.6; }
        }
        @keyframes fade-up {
          0% { opacity: 0; transform: translateY(15px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-up { animation: fade-up 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .delay-100 { animation-delay: 100ms; }
        .delay-200 { animation-delay: 200ms; }
        .delay-300 { animation-delay: 300ms; }
      `}</style>

      <div className="absolute right-4 top-4 z-10 rounded-full border border-white/10 bg-black/35 px-3 py-1 text-[11px] font-semibold tracking-[0.18em] text-zinc-300 backdrop-blur-md md:right-7 md:top-6">
        v{appVersion}
      </div>

      <div className="relative z-10 mx-auto flex h-full w-full max-w-6xl flex-col items-center justify-center text-center">
        <p className="animate-fade-up mb-4 text-[11px] font-semibold uppercase tracking-[0.5em] text-zinc-400/85 opacity-0 md:mb-5">
          Shiori Onboarding
        </p>

        <div className="animate-fade-up delay-100 relative mb-8 opacity-0 md:mb-10">
          <span className="absolute inset-0 rounded-full border border-zinc-400/35 [animation:shiori-logo-pulse_3.5s_ease-in-out_infinite]" />
          <span className="absolute -inset-4 rounded-full border border-zinc-500/20 blur-[1px]" />
          <div className="relative rounded-full border border-white/15 bg-zinc-900/70 p-6 shadow-[0_0_35px_rgba(255,255,255,0.08)] [animation:shiori-logo-in_0.9s_cubic-bezier(0.16,1,0.3,1)_forwards] md:p-8">
            <img src="/logo.png" alt="Shiori Logo" className="h-20 w-20 object-contain md:h-24 md:w-24" />
          </div>
        </div>

        <h1 className="animate-fade-up delay-200 mb-3 max-w-4xl text-3xl font-light tracking-tight opacity-0 md:text-5xl">
          Build your <span className="font-semibold text-zinc-100">private reading base</span>
        </h1>

        <p className="animate-fade-up delay-200 mb-9 max-w-2xl text-base text-white/60 opacity-0 md:mb-10 md:text-lg">
          Fast setup. Dark mono vibe. Full-screen flow.
        </p>

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
