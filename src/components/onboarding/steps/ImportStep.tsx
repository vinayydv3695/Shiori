import { useMemo, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import FormatBadge from '../components/FormatBadge';

type ImportStepProps = {
  libraryPath: string | null;
  onSelectPath: (path: string | null) => void;
  onNext: () => void;
};

const formats = ['EPUB', 'PDF', 'MOBI', 'CBZ', 'CBR', 'AZW3'] as const;

export function ImportStep({ libraryPath, onSelectPath, onNext }: ImportStepProps) {
  const [choseLater, setChoseLater] = useState(false);
  const canContinue = Boolean(libraryPath) || choseLater;

  const selectionLabel = useMemo(() => {
    if (libraryPath) return libraryPath;
    if (choseLater) return 'Not set — you can add it later in settings.';
    return null;
  }, [libraryPath, choseLater]);

  const handlePickFolder = async () => {
    const selected = await open({ directory: true, multiple: false });
    const resolved = typeof selected === 'string' ? selected : null;
    onSelectPath(resolved);
    if (resolved) setChoseLater(false);
  };

  return (
    <section className="relative w-full overflow-hidden rounded-[2rem] border border-border/50 bg-card/50 p-8 shadow-xl backdrop-blur-xl md:p-12">
      <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/5 blur-[80px]" />
      
      <div className="relative z-10">
        <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Bring Your Collection</h2>
        <p className="mt-3 text-lg text-muted-foreground">
          Point Shiori to your books, manga, and comics — it handles the rest.
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={handlePickFolder}
            className="group relative flex items-center gap-3 overflow-hidden rounded-2xl bg-primary px-6 py-4 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-0"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            Choose Library Folder
            <div className="absolute inset-0 z-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] transition-transform duration-700 ease-in-out group-hover:translate-x-[100%]" />
          </button>

          <button
            type="button"
            onClick={() => {
              setChoseLater(true);
              onSelectPath(null);
            }}
            className="rounded-2xl border border-transparent px-5 py-4 text-sm font-medium text-muted-foreground transition-all hover:border-border/50 hover:bg-muted/30 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-muted-foreground/40"
          >
            I&apos;ll do this later
          </button>
        </div>

        <div className="mt-8 min-h-[80px]">
          {selectionLabel ? (
            <div className="animate-in fade-in slide-in-from-bottom-2 flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-500 shadow-inner">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/20">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span className="font-medium">{selectionLabel}</span>
            </div>
          ) : null}

          {libraryPath ? (
            <div className="animate-in fade-in relative mt-4 h-16 overflow-hidden rounded-2xl border border-border/50 bg-muted/20">
              <div className="absolute inset-0 w-[200%] -translate-x-full bg-gradient-to-r from-transparent via-primary/10 to-transparent [animation:shimmer_2s_infinite]" />
              <div className="flex h-full items-center px-5 gap-3 text-sm font-medium text-muted-foreground">
                <svg className="h-5 w-5 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Scanning preview… indexing files
              </div>
              <style>{`@keyframes shimmer { 100% { transform: translateX(50%); } }`}</style>
            </div>
          ) : null}
        </div>

        <div className="mt-10">
          <p className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Supported Formats</p>
          <div className="flex w-full overflow-x-auto pb-2">
            <div className="flex min-w-max gap-2">
              {formats.map((fmt) => (
                <FormatBadge key={fmt} format={fmt} />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-12 flex justify-end border-t border-border/30 pt-8">
          <button
            type="button"
            onClick={onNext}
            disabled={!canContinue}
            className="group flex items-center gap-2 rounded-full bg-foreground px-8 py-3.5 text-sm font-bold text-background transition-all hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Continue
            <svg className="h-4 w-4 transition-transform group-hover:translate-x-1 group-disabled:translate-x-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  );
}

export default ImportStep;
