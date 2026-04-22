import { useRef, useState } from 'react';
import { CheckCircle, Database, FileSearch, FolderPlus, Upload, XCircle } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import FormatBadge from '../components/FormatBadge';
import { useImport } from '../hooks/useImport';

type ImportStepProps = {
  libraryPath: string | null;
  onSelectPath: (path: string | null) => void;
  onNext: () => void;
};

const formats = ['epub', 'pdf', 'mobi', 'cbz', 'cbr', 'azw3'] as const;

const normalizeToFolderPath = (path: string) => path.replace(/[/\\][^/\\]+$/, '');

export function ImportStep({ libraryPath: _libraryPath, onSelectPath, onNext }: ImportStepProps) {
  const [choseLater, setChoseLater] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { status, progress, results, currentFile, error, importFromPath, reset } = useImport();

  const canContinue = choseLater || status === 'completed';
  const showDropZone = status === 'idle' || status === 'error';

  const runImport = async (path: string | null) => {
    if (!path) return;
    onSelectPath(path);
    setChoseLater(false);
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

  const activateFilePicker = () => fileInputRef.current?.click();

  const clampedProgress = Math.min(100, Math.max(0, progress));

  return (
    <section className="w-full overflow-hidden rounded-3xl border border-white/5 bg-slate-950 p-8 md:p-12">
      <div>
        <div className="flex items-center gap-3">
          <FolderPlus className="h-7 w-7 text-indigo-400" />
          <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">Import Your Collection</h2>
        </div>

        <div className="mt-6 rounded-2xl border border-white/5 bg-slate-900/40 p-5">
          <p className="text-sm text-white/60 md:text-base">
            Drop your library folder or browse to import books, manga, and comics now. Shiori scans and imports your
            collection with live progress.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {formats.map((fmt) => (
              <FormatBadge key={fmt} format={`.${fmt}`} />
            ))}
          </div>
        </div>

        <div className="mt-8 min-h-[260px]">
          {showDropZone ? (
            <div
              className={`flex min-h-[240px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed bg-slate-900/50 transition-colors duration-200 ${
                isDragOver
                  ? 'border-indigo-400/60 bg-slate-900/80'
                  : 'border-white/10 hover:border-indigo-400/45'
              }`}
            >
              <button
                type="button"
                className="flex w-full flex-1 cursor-pointer flex-col items-center justify-center"
                onClick={activateFilePicker}
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
                <Upload className="h-12 w-12 text-indigo-400" />
                <p className="mt-4 text-center text-base font-semibold text-white">Drag & drop your library folder</p>
                <p className="mt-1 text-center text-sm text-white/60">or click to browse for folder</p>

                <div className="mt-6">
                  <button
                    type="button"
                    onClick={handlePickFolder}
                    className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:border-indigo-400/40 hover:bg-slate-800"
                  >
                    <FolderPlus className="h-4 w-4" />
                    Browse Folder
                  </button>
                </div>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={async (event) => {
                  const files = Array.from(event.currentTarget.files ?? []);
                  const firstFilePath = (files[0] as File & { path?: string })?.path;
                  await runImport(firstFilePath ? normalizeToFolderPath(firstFilePath) : null);
                }}
                {...({ webkitdirectory: '', directory: '' } as unknown as Record<string, string>)}
              />
            </div>
          ) : (
            <div className="rounded-2xl border border-white/5 bg-slate-900/50 p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-white">
                {status === 'completed' ? (
                  <CheckCircle className="h-4 w-4 text-emerald-400" />
                ) : (
                  <Upload className="h-4 w-4 text-indigo-400" />
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

              <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-indigo-500 transition-[width] duration-500 ease-out"
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
                <p className="mt-3 truncate rounded-lg border border-white/5 bg-slate-900 px-3 py-2 text-xs text-white/70" title={currentFile}>
                  {currentFile}
                </p>
              ) : null}
            </div>
          )}

          {status === 'completed' && results ? (
            <div className="mt-4 rounded-2xl border border-white/5 bg-slate-900/50 p-4">
              <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
                <div className="rounded-xl border border-white/5 bg-slate-900 p-3 text-white">
                  <div className="mb-1 flex items-center gap-2">
                    <Database className="h-4 w-4 text-emerald-400" />
                    <span className="font-semibold">Success</span>
                  </div>
                  <p className="text-lg font-bold">{results.success}</p>
                </div>
                <div className="rounded-xl border border-white/5 bg-slate-900 p-3 text-white">
                  <div className="mb-1 flex items-center gap-2">
                    <FileSearch className="h-4 w-4 text-amber-400" />
                    <span className="font-semibold">Duplicates</span>
                  </div>
                  <p className="text-lg font-bold">{results.duplicates}</p>
                </div>
                <div className="rounded-xl border border-white/5 bg-slate-900 p-3 text-white">
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

        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-8">
          <div className="flex flex-wrap gap-2">
            <FormatBadge format="Books" />
            <FormatBadge format="Manga" />
            <FormatBadge format="Comics" />
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                setChoseLater(true);
                onSelectPath(null);
                reset();
              }}
              className="rounded-lg border border-white/10 bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:border-white/20 hover:bg-slate-800"
            >
              Skip for now
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={!canContinue}
              className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white border border-white/20 transition-colors hover:bg-slate-950 hover:border-white/30 disabled:cursor-not-allowed disabled:bg-black/40 disabled:text-white/60"
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

export default ImportStep;
