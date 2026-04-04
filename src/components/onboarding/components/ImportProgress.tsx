import {
  AlertCircle,
  CheckCircle2,
  Copy,
  FileText,
  Loader2,
  Search,
  Check,
  Upload,
  type LucideIcon,
} from 'lucide-react';

export type ImportStatus = 'idle' | 'scanning' | 'importing' | 'completed' | 'error';

export type ImportResults = {
  success: number;
  failed: number;
  duplicates: number;
};

type ImportProgressProps = {
  status: ImportStatus;
  progress: number;
  results?: ImportResults;
  currentFile?: string;
};

const STATUS_CONFIG: Record<ImportStatus, { label: string; icon: LucideIcon; colorClass: string }> = {
  idle: {
    label: 'Ready to import',
    icon: Upload,
    colorClass: 'text-white/60',
  },
  scanning: {
    label: 'Scanning files...',
    icon: Search,
    colorClass: 'text-indigo-400',
  },
  importing: {
    label: 'Importing your library...',
    icon: Loader2,
    colorClass: 'text-indigo-400',
  },
  completed: {
    label: 'Import completed successfully',
    icon: CheckCircle2,
    colorClass: 'text-emerald-400',
  },
  error: {
    label: 'Import failed',
    icon: AlertCircle,
    colorClass: 'text-rose-400',
  },
};

export default function ImportProgress({ status, progress, results, currentFile }: ImportProgressProps) {
  const clampedProgress = Math.min(100, Math.max(0, progress));
  const statusInfo = STATUS_CONFIG[status];
  const isLoading = status === 'scanning' || status === 'importing';

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-5 shadow-xl">
      <div className="mb-4 flex items-center gap-2.5">
        <statusInfo.icon
          size={20}
          className={`${statusInfo.colorClass} ${isLoading ? 'animate-spin' : ''}`}
        />
        <p className="text-sm font-semibold tracking-wide text-white">{statusInfo.label}</p>
      </div>

      <div className="relative h-3 overflow-hidden rounded-full border border-white/20 bg-slate-950/50">
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-indigo-600 transition-[width] duration-500 ease-out"
          style={{ width: `${clampedProgress}%` }}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={clampedProgress}
          aria-label="Import progress"
        />
        <div
          className="pointer-events-none absolute top-0 h-full w-24 -translate-x-full bg-gradient-to-r from-transparent via-white/35 to-transparent animate-[shimmer_1.8s_linear_infinite]"
          style={{ left: `${clampedProgress}%` }}
        />
      </div>

      <div className="mt-2 text-right text-xs font-medium text-white/60">{Math.round(clampedProgress)}%</div>

      {currentFile ? (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2 text-xs text-white/80">
          <FileText size={15} className="text-white/60" />
          <span className="truncate" title={currentFile}>
            {currentFile}
          </span>
        </div>
      ) : null}

      {status === 'completed' && results ? (
        <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-emerald-100">
            <div className="mb-1 flex items-center gap-1.5">
              <Check size={14} />
              <span className="font-medium">Success</span>
            </div>
            <div className="text-sm font-bold">{results.success}</div>
          </div>
          <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-rose-100">
            <div className="mb-1 flex items-center gap-1.5">
              <AlertCircle size={14} />
              <span className="font-medium">Failed</span>
            </div>
            <div className="text-sm font-bold">{results.failed}</div>
          </div>
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-amber-100">
            <div className="mb-1 flex items-center gap-1.5">
              <Copy size={14} />
              <span className="font-medium">Duplicates</span>
            </div>
            <div className="text-sm font-bold">{results.duplicates}</div>
          </div>
        </div>
      ) : null}

      {status === 'error' ? (
        <div className="mt-4 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
          An error occurred while importing. Please review your files and try again.
        </div>
      ) : null}

      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
      `}</style>
    </div>
  );
}
