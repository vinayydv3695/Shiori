import { useState } from 'react';
import { CheckCircle, Database, FileSearch, FolderPlus, Upload, XCircle } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import FormatBadge from '../components/FormatBadge';
import GlowButton from '../components/GlowButton';
import { OnboardingMotionStyles } from '../components';
import { useImport } from '../hooks/useImport';

type ImportStepProps = {
  libraryPath: string | null;
  onSelectPath: (path: string | null) => void;
  onBack: () => void;
  onNext: () => void;
};

const formats = ['epub', 'pdf', 'mobi', 'cbz', 'cbr', 'azw3'] as const;

const normalizeToFolderPath = (path: string) => path.replace(/[/\\][^/\\]+$/, '');

export function ImportStep({ libraryPath, onSelectPath, onBack, onNext }: ImportStepProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const { status, progress, results, currentFile, error, importFromPath, reset } = useImport();

  const canContinue = Boolean(libraryPath?.trim());
  const showDropZone = status === 'idle' || status === 'error';

  const runImport = async (path: string | null) => {
    if (!path) return;
    onSelectPath(path);
    await importFromPath(path);
  };

  const handlePickFolder = async () => {
    const selected = await open({ directory: true, multiple: false });
    const resolved = typeof selected === 'string' ? selected : null;
    await runImport(resolved);
  };

  const getDroppedPath = (event: React.DragEvent<HTMLElement>) => {
    const files = Array.from(event.dataTransfer.files ?? []);
    for (const file of files) {
      const path = (file as File & { path?: string }).path;
      if (path) {
        return normalizeToFolderPath(path);
      }
    }
    return null;
  };

  const clampedProgress = Math.min(100, Math.max(0, progress));

  return (
    <section className="relative flex h-full min-h-0 w-full flex-col overflow-hidden px-4 py-4 text-white md:px-8 md:py-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(161,161,170,0.14),transparent_70%)]" />
      <OnboardingMotionStyles />

      <div className="relative z-10 mx-auto flex min-h-0 h-full w-full max-w-7xl flex-1 flex-col overflow-hidden rounded-[1.6rem] border border-white/10 bg-zinc-950/70 p-4 backdrop-blur-xl md:p-6">
        <div className="onb-fade-up flex shrink-0 items-center gap-3">
          <div className="onb-icon-badge flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-200">
            <FolderPlus className="onb-icon-inner h-5 w-5" />
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">Import Your Collection</h2>
        </div>

        <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-y-auto pr-2 pb-4 [scrollbar-gutter:stable] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/20 hover:[&::-webkit-scrollbar-thumb]:bg-white/30">
            <div className="mt-4 rounded-2xl border border-white/5 bg-zinc-900/40 p-5">
              <p className="text-sm text-white/60 md:text-base">
                Import your local library folder now to get instant scan + progress feedback. If you skip, your library stays empty until you import from Settings.
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 font-semibold uppercase tracking-wide text-emerald-200">
                  Required step
                </span>
                <span className="rounded-full border border-white/10 bg-zinc-900/70 px-2.5 py-1 text-white/70">
                  Continue unlocks after import completes or after you choose “Skip for now”
                </span>
              </div>

              <p className="mt-3 truncate rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-2 text-xs text-white/70" title={libraryPath ?? undefined}>
                {libraryPath ? `Selected folder: ${libraryPath}` : 'No folder selected yet'}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {formats.map((fmt) => (
                  <FormatBadge key={fmt} format={`.${fmt}`} />
                ))}
              </div>
            </div>

            <div className="mt-4 min-h-[220px]">
              {showDropZone ? (
                <div
                  className={`flex min-h-[240px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed bg-zinc-900/50 transition-colors duration-200 ${
                    isDragOver
                      ? 'border-zinc-400/60 bg-zinc-900/80'
                      : 'border-white/10 hover:border-zinc-400/45'
                  }`}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    className="flex w-full flex-1 cursor-pointer flex-col items-center justify-center"
                    onClick={handlePickFolder}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        void handlePickFolder();
                      }
                    }}
                    onDragEnter={(event) => {
                      event.preventDefault();
                      setIsDragOver(true);
                    }}
                    onDragLeave={(event) => {
                      event.preventDefault();
                      setIsDragOver(false);
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setIsDragOver(true);
                    }}
                    onDrop={async (event) => {
                      event.preventDefault();
                      setIsDragOver(false);
                      await runImport(getDroppedPath(event));
                    }}
                  >
                    <Upload className="h-12 w-12 text-zinc-400" />
                    <p className="mt-4 text-center text-base font-semibold text-white">Drag & drop your library folder</p>
                    <p className="mt-1 text-center text-sm text-white/60">or click to browse for folder</p>

                    <div className="mt-6">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handlePickFolder();
                        }}
                        className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:border-zinc-400/40 hover:bg-zinc-800"
                      >
                        <FolderPlus className="h-4 w-4" />
                        Browse Folder
                      </button>
                    </div>
                  </div>


                </div>
              ) : (
                <div className="rounded-2xl border border-white/5 bg-zinc-900/50 p-5">
                  <div className="mb-3 flex items-center gap-2 text-sm font-medium text-white">
                    {status === 'completed' ? (
                      <CheckCircle className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <Upload className="h-4 w-4 text-zinc-400" />
                    )}
                    <span>
                      {status === 'scanning'
                        ? 'Scanning files...'
                        : status === 'importing'
                          ? 'Importing your library...'
                          : status === 'completed'
                            ? 'Import completed'
                            : 'Preparing import...'}
                    </span>
                  </div>

                  <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-zinc-500 transition-[width] duration-500 ease-out"
                      style={{ width: `${clampedProgress}%` }}
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={clampedProgress}
                      aria-label="Import progress"
                    />
                  </div>

                  <div className="mt-2 text-right text-xs text-white/60">{Math.round(clampedProgress)}%</div>

                  {currentFile ? (
                    <p className="mt-3 truncate rounded-lg border border-white/5 bg-zinc-900 px-3 py-2 text-xs text-white/70" title={currentFile}>
                      {currentFile}
                    </p>
                  ) : null}
                </div>
              )}

              {status === 'completed' && results ? (
                <div className="mt-4 rounded-2xl border border-white/5 bg-zinc-900/50 p-4">
                  <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
                    <div className="rounded-xl border border-white/5 bg-zinc-900 p-3 text-white">
                      <div className="mb-1 flex items-center gap-2">
                        <Database className="h-4 w-4 text-emerald-400" />
                        <span className="font-semibold">Success</span>
                      </div>
                      <p className="text-lg font-bold">{results.success}</p>
                    </div>
                    <div className="rounded-xl border border-white/5 bg-zinc-900 p-3 text-white">
                      <div className="mb-1 flex items-center gap-2">
                        <FileSearch className="h-4 w-4 text-amber-400" />
                        <span className="font-semibold">Duplicates</span>
                      </div>
                      <p className="text-lg font-bold">{results.duplicates}</p>
                    </div>
                    <div className="rounded-xl border border-white/5 bg-zinc-900 p-3 text-white">
                      <div className="mb-1 flex items-center gap-2">
                        <XCircle className="h-4 w-4 text-rose-400" />
                        <span className="font-semibold">Failed</span>
                      </div>
                      <p className="text-lg font-bold">{results.failed}</p>
                    </div>
                  </div>
                </div>
              ) : null}

              {error ? <p className="mt-3 flex items-center gap-2 text-sm text-rose-300"><XCircle className="h-4 w-4" />{error}</p> : null}
            </div>
          </div>
        </div>

        <div className="mt-3 flex shrink-0 items-center justify-between border-t border-white/10 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <GlowButton theme="dark" variant="secondary" onClick={onBack} className="px-5">
              ← Back
            </GlowButton>
            <button
              type="button"
              onClick={() => {
                onSelectPath(null);
                reset();
              }}
              className="rounded-xl border border-white/10 bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:border-white/20 hover:bg-zinc-800"
            >
              Clear selection
            </button>
          </div>

          <GlowButton
            theme="dark"
            variant="primary"
            onClick={onNext}
            disabled={!canContinue}
            className="onb-cta-glow px-8"
          >
            Continue →
          </GlowButton>
        </div>
      </div>
    </section>
  );
}

export default ImportStep;
