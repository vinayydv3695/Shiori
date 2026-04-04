import { ParticleCanvas } from '../components/index';

type WelcomeStepProps = {
  appVersion: string;
  onStart: () => void;
};

export function WelcomeStep({ appVersion, onStart }: WelcomeStepProps) {
  return (
    <section className="relative min-h-[560px] w-full overflow-hidden rounded-[2rem] border border-white/5 bg-slate-950 text-white shadow-2xl shadow-black/50">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(79,70,229,0.15),transparent_70%)]" />
      <ParticleCanvas />

      <style>{`
        @keyframes shiori-kanji-in {
          0% { opacity: 0; transform: translateY(20px) scale(0.95); filter: blur(10px); }
          100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0px); }
        }
        @keyframes shiori-kanji-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
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

      <div className="absolute right-6 top-6 z-10 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium tracking-wider text-white/50 backdrop-blur-md">
        v{appVersion}
      </div>

      <div className="relative z-10 flex min-h-[560px] flex-col items-center justify-center px-6 py-16 text-center">
        <p className="animate-fade-up mb-6 text-xs font-semibold uppercase tracking-[0.4em] text-indigo-300/80 opacity-0">
          Shiori
        </p>

        <div className="mb-10 select-none text-[140px] leading-none text-white/95 mix-blend-plus-lighter [animation:shiori-kanji-in_1s_cubic-bezier(0.16,1,0.3,1)_forwards,shiori-kanji-float_6s_ease-in-out_infinite_1s] md:text-[180px] drop-shadow-[0_0_30px_rgba(255,255,255,0.1)]">
          栞
        </div>

        <h1 className="animate-fade-up delay-100 mb-4 text-4xl font-light tracking-tight opacity-0 md:text-5xl">
          Welcome to your <span className="font-semibold text-transparent bg-clip-text bg-gradient-to-r from-white to-white/60">private reading home</span>
        </h1>

        <p className="animate-fade-up delay-200 mb-12 max-w-2xl text-lg font-medium tracking-wide text-white/60 opacity-0 md:text-xl">
          Your library. Your rules. Offline forever.
        </p>

        <button
          type="button"
          onClick={onStart}
          className="animate-fade-up delay-300 group relative overflow-hidden rounded-full bg-white px-8 py-4 text-sm font-bold uppercase tracking-wider text-slate-950 opacity-0 transition-all hover:scale-105 hover:bg-white/90 hover:shadow-[0_0_40px_-10px_rgba(255,255,255,0.5)] focus:outline-none focus-visible:ring-4 focus-visible:ring-white/20 active:scale-95"
        >
          <span className="relative z-10 flex items-center gap-2">
            Get Started →
          </span>
          <div className="absolute inset-0 z-0 bg-gradient-to-r from-transparent via-slate-100 to-transparent translate-x-[-100%] transition-transform duration-700 ease-in-out group-hover:translate-x-[100%]" />
        </button>
      </div>
    </section>
  );
}

export default WelcomeStep;
