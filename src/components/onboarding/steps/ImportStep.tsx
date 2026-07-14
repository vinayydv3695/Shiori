import { useState } from 'react';
import { CheckCircle, Database, FileSearch, FolderPlus, Upload, XCircle } from 'lucide-react';
import FormatBadge from '../components/FormatBadge';
import GlowButton from '../components/GlowButton';
import { OnboardingMotionStyles } from '../components';
import { useImport } from '../hooks/useImport';
import { useToast } from '@/store/toastStore';
import { api } from '@/lib/tauri';

type ImportStepProps = {
  libraryPath: string | null;
  onSelectPath: (path: string | null) => void;
  onBack: () => void;
  onNext: () => void;
};

const formats = ['epub', 'pdf', 'mobi', 'cbz', 'cbr', 'azw3'] as const;

const normalizeToFolderPath = (path: string) => path.replace(/[/\\][^/\\]+$/, '');

function isPermissionDeniedError(error: unknown) {
  if (typeof error === 'string') {
    return error.toLowerCase().includes('permission denied');
  }

  if (error instanceof Error) {
    return error.message.toLowerCase().includes('permission denied');
  }

  return false;
}

export function ImportStep({ libraryPath, onSelectPath, onBack, onNext }: ImportStepProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const toast = useToast();

  const { status, progress, results, currentFile, error, importFromPath, reset } = useImport();

  const canContinue = Boolean(libraryPath?.trim());
  const showDropZone = status === 'idle' || status === 'error';

  const runImport = async (path: string | null) => {
    if (!path) return;
    onSelectPath(path);
    await importFromPath(path);
  };

  const handlePickFolder = async () => {
    try {
      const resolved = await api.openFolderDialog();
      await runImport(resolved);
    } catch (e: unknown) {
      console.warn("Folder picker cancelled or failed:", e);
      if (isPermissionDeniedError(e)) {
        toast.error('Permission denied', 'Please grant "All files access" or storage permissions in Android Settings to import your library.');
      } else if (typeof e === 'string' && !e.toLowerCase().includes('cancelled')) {
        toast.error('Failed to select folder', 'Could not open folder selection dialog');
      }
    }
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
    <section className="relative flex h-full min-h-0 w-full flex-col overflow-hidden px-4 py-4 text-foreground md:px-8 md:py-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(161,161,170,0.14),transparent_70%)]" />
      <OnboardingMotionStyles />

      <div className="relative z-10 mx-auto flex min-h-0 h-full w-full max-w-7xl flex-1 flex-col overflow-hidden rounded-[1.6rem] border border-border/40 bg-card/60 p-4 backdrop-blur-xl md:p-6">
        <div className="onb-fade-up flex shrink-0 items-center gap-3">
          <div className="onb-icon-badge flex h-11 w-11 items-center justify-center rounded-xl border border-border/40 bg-primary/5 text-foreground">
            <FolderPlus className="onb-icon-inner h-5 w-5" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground md:text-4xl">Import Your Collection</h2>
        </div>

        <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-y-auto pr-2 pb-4 [scrollbar-gutter:stable] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/20 hover:[&::-webkit-scrollbar-thumb]:bg-white/30">
            <div className="mt-4 rounded-2xl border border-border/20 bg-card/40 p-5">
              <p className="text-sm text-foreground/60 md:text-base">
                Import your local library folder now to get instant scan + progress feedback. If you skip, your library stays empty until you import from Settings.
              </p>

              <div className="mt-3 flex items-center justify-between rounded-lg border border-border/40 bg-card/60 px-3 py-2">
                <p className="truncate text-xs text-foreground/70" title={libraryPath ?? undefined}>
                  {libraryPath ? `Selected folder: ${libraryPath}` : 'No folder selected yet'}
                </p>
                {libraryPath && (
                  <button onClick={() => { onSelectPath(null); reset(); }} className="ml-2 shrink-0 rounded-md p-1 hover:bg-white/10" aria-label="Clear selection" title="Clear selection">
                    <XCircle className="h-4 w-4 text-foreground/60 hover:text-foreground" />
                  </button>
                )}
              </div>

              <div className="mt-2 md:mt-4 hidden md:flex flex-wrap gap-2">
                {formats.map((fmt) => (
                  <FormatBadge key={fmt} format={`.${fmt}`} />
                ))}
              </div>
            </div>

            <div className="mt-2 md:mt-4 min-h-[140px] md:min-h-[220px]">
              {showDropZone ? (
                <div
                  className={`group relative flex min-h-[140px] md:min-h-[300px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-[1.5rem] md:rounded-[2rem] border-2 border-dashed transition-all duration-500 ${
                    isDragOver
                      ? 'border-indigo-500/50 bg-indigo-500/10 shadow-[0_0_50px_rgba(99,102,241,0.15)]'
                      : 'border-border/40 bg-card/30 hover:border-border/60 hover:bg-card/50'
                  }`}
                >
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(255,255,255,0.03),transparent_60%)] pointer-events-none" />
                  <div
                    role="button"
                    tabIndex={0}
                    className="relative z-10 flex w-full flex-1 cursor-pointer flex-col items-center justify-center p-4 md:p-8"
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
                    <div className={`relative mb-3 md:mb-6 flex h-12 w-12 md:h-20 md:w-20 items-center justify-center rounded-full border border-border/40 bg-background/80 shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-md transition-all duration-500 ${isDragOver ? 'scale-110 border-indigo-500/30' : 'group-hover:-translate-y-1 group-hover:scale-105 group-hover:border-border/60'}`}>
                      <Upload className={`h-6 w-6 md:h-8 md:w-8 transition-colors duration-300 ${isDragOver ? 'text-indigo-400' : 'text-muted-foreground group-hover:text-foreground'}`} />
                    </div>
                    
                    <p className="text-center text-base md:text-xl font-medium tracking-tight text-foreground/90">
                      <span className="hidden md:inline">Drag & drop your library folder or click to browse</span>
                      <span className="md:hidden">Tap to browse your files</span>
                    </p>
                    <p className="mt-1 md:mt-2 text-center text-xs md:text-sm text-foreground/50 hidden md:block">
                      or click anywhere to browse
                    </p>

                    <div className="mt-8 hidden md:flex w-full max-w-md items-start gap-3 rounded-2xl border border-border/20 bg-background/40 p-4 text-left shadow-sm backdrop-blur-md">
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/5 text-muted-foreground">
                        <FolderPlus className="h-3.5 w-3.5" />
                      </div>
                      <p className="text-xs text-muted-foreground/80 leading-relaxed">
                        <strong className="font-semibold text-foreground">No local books?</strong> No problem! Skip this step to explore thousands of free books and manga from our built-in online catalogs inside the app.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-border/20 bg-card/50 p-5">
                  <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
                    {status === 'completed' ? (
                      <CheckCircle className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <Upload className="h-4 w-4 text-muted-foreground" />
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

                  <div className="h-2 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
                      style={{ width: `${clampedProgress}%` }}
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={clampedProgress}
                      aria-label="Import progress"
                    />
                  </div>

                  <div className="mt-2 text-right text-xs text-foreground/60">{Math.round(clampedProgress)}%</div>

                  {currentFile ? (
                    <p className="mt-3 truncate rounded-lg border border-border/20 bg-card px-3 py-2 text-xs text-foreground/70" title={currentFile}>
                      {currentFile}
                    </p>
                  ) : null}
                </div>
              )}

              {status === 'completed' && results ? (
                <div className="mt-4 rounded-2xl border border-border/20 bg-card/50 p-4">
                  <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
                    <div className="rounded-xl border border-border/20 bg-card p-3 text-foreground">
                      <div className="mb-1 flex items-center gap-2">
                        <Database className="h-4 w-4 text-emerald-400" />
                        <span className="font-semibold">Success</span>
                      </div>
                      <p className="text-lg font-bold">{results.success}</p>
                    </div>
                    <div className="rounded-xl border border-border/20 bg-card p-3 text-foreground">
                      <div className="mb-1 flex items-center gap-2">
                        <FileSearch className="h-4 w-4 text-amber-400" />
                        <span className="font-semibold">Duplicates</span>
                      </div>
                      <p className="text-lg font-bold">{results.duplicates}</p>
                    </div>
                    <div className="rounded-xl border border-border/20 bg-card p-3 text-foreground">
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

        <div className="mt-3 flex flex-col-reverse md:flex-row shrink-0 items-stretch md:items-center justify-between border-t border-border/40 pt-3 gap-3 md:gap-0">
          <div className="flex items-center justify-between md:justify-start gap-2">
            <GlowButton variant="secondary" onClick={onBack} className="flex-1 md:flex-none justify-center px-5">
              ← Back
            </GlowButton>
            <button
              type="button"
              onClick={onNext}
              className="flex-1 md:flex-none rounded-xl border border-border/40 bg-card/50 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-border/60 hover:bg-primary/5"
            >
              Skip for now
            </button>
          </div>

          <GlowButton
            variant="primary"
            onClick={onNext}
            disabled={!canContinue}
            className="w-full md:w-auto justify-center px-8"
          >
            Continue →
          </GlowButton>
        </div>
      </div>
    </section>
  );
}

export default ImportStep;
