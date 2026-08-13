import { CheckCircle2, AlertCircle, Loader2, BookOpen, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DownloadProgress } from '@/store/onlineDownloadStore';

interface DownloadProgressBarProps {
  bookTitle: string;
  progress: DownloadProgress | undefined;
  onClear?: () => void;
}

/** Format bytes as "X.X MB" (1 decimal). */
function formatMb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

export function DownloadProgressBar({ bookTitle, progress, onClear }: DownloadProgressBarProps) {
  if (!progress) return null;

  const hasTotal = progress.total_bytes !== null && progress.total_bytes > 0;
  const totalBytes = progress.total_bytes;
  const percent = hasTotal && totalBytes !== null
    ? Math.min(100, Math.round((progress.downloaded_bytes / totalBytes) * 100))
    : null;

  const isPages = progress.unit === 'pages';

  const downloaded = isPages ? `${progress.downloaded_bytes}` : formatMb(progress.downloaded_bytes);
  const total = totalBytes !== null ? (isPages ? `${totalBytes}` : formatMb(totalBytes)) : null;

  const isDone = progress.status === 'completed';
  const isError = progress.status === 'error';

  return (
    <div className="p-4 rounded-2xl bg-card/90 border border-border/60 hover:border-primary/40 transition-all duration-300 shadow-sm backdrop-blur-xl group">
      <div className="flex items-center justify-between gap-3 mb-2.5">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 shadow-xs">
            <BookOpen className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-foreground truncate">{bookTitle}</p>
            <span
              className={cn(
                'text-[10px] font-semibold tracking-tight block mt-0.5',
                isDone ? 'text-emerald-500' : isError ? 'text-destructive' : 'text-muted-foreground'
              )}
            >
              {isDone
                ? 'Ready in library'
                : isError
                  ? 'Download failed'
                  : isPages
                    ? (hasTotal ? `Downloading page ${progress.downloaded_bytes} of ${totalBytes}…` : 'Fetching chapter pages…')
                    : percent !== null ? 'Downloading content…' : 'Connecting to source…'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isDone ? (
            <div className="flex items-center gap-1 text-[10px] font-extrabold text-emerald-500 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Done</span>
            </div>
          ) : isError ? (
            <div className="flex items-center gap-1 text-[10px] font-extrabold text-destructive bg-destructive/10 px-2.5 py-1 rounded-full border border-destructive/20">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Failed</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-[10px] font-extrabold text-primary bg-primary/10 px-2.5 py-1 rounded-full border border-primary/20">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>{percent !== null ? `${percent}%` : 'Active'}</span>
            </div>
          )}

          {(isDone || isError) && onClear && (
            <button
              onClick={onClear}
              aria-label="Dismiss item"
              className="p-1 rounded-full text-muted-foreground/60 hover:text-foreground hover:bg-secondary/80 transition-colors cursor-pointer"
              title="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Progress Track */}
      <div
        data-testid="download-progress-bar"
        className="h-1.5 rounded-full bg-secondary overflow-hidden border border-border/40"
      >
        {isDone ? (
          <div className="h-full rounded-full bg-emerald-500 transition-all duration-300" style={{ width: '100%' }} />
        ) : isError ? (
          <div className="h-full rounded-full bg-destructive" style={{ width: '100%' }} />
        ) : percent !== null ? (
          <div
            className="h-full rounded-full bg-primary shadow-sm shadow-primary/30 transition-all duration-300 ease-out"
            style={{ width: `${percent}%` }}
          />
        ) : (
          <div className="h-full w-1/3 rounded-full bg-primary animate-pulse" />
        )}
      </div>

      <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground font-semibold">
        <span className="tabular-nums">
          {isPages
            ? (isDone ? `${totalBytes || downloaded} pages` : hasTotal ? `${downloaded} / ${total} pages` : 'Connecting…')
            : (isDone ? `${downloaded} MB` : total ? `${downloaded} / ${total} MB` : `${downloaded} MB`)}
        </span>
        {!isDone && !isError && percent !== null && (
          <span className="font-bold text-primary">{percent}%</span>
        )}
      </div>
    </div>
  );
}
