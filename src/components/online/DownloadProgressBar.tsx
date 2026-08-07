import { CheckCircle2, AlertCircle, Loader2, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DownloadProgress } from '@/store/onlineDownloadStore';

interface DownloadProgressBarProps {
  bookTitle: string;
  progress: DownloadProgress | undefined;
}

/** Format bytes as "X.X MB" (1 decimal). */
function formatMb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

export function DownloadProgressBar({ bookTitle, progress }: DownloadProgressBarProps) {
  if (!progress) return null;

  const hasTotal = progress.total_bytes !== null && progress.total_bytes > 0;
  const totalBytes = progress.total_bytes;
  const percent = hasTotal && totalBytes !== null
    ? Math.min(100, Math.round((progress.downloaded_bytes / totalBytes) * 100))
    : null;

  const downloaded = formatMb(progress.downloaded_bytes);
  const total = totalBytes !== null ? formatMb(totalBytes) : null;

  const isDone = progress.status === 'completed';
  const isError = progress.status === 'error';

  return (
    <div className="p-4 rounded-2xl bg-card/80 border border-border/60 hover:border-primary/40 transition-all duration-300 shadow-md backdrop-blur-xl animate-in fade-in slide-in-from-bottom-1">
      <div className="flex items-center justify-between gap-3 mb-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/25 flex items-center justify-center shrink-0">
            <BookOpen className="w-3.5 h-3.5 text-primary" />
          </div>
          <p className="text-xs font-bold text-foreground truncate">{bookTitle}</p>
        </div>
        {isDone ? (
          <div className="flex items-center gap-1 text-[11px] font-extrabold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Done</span>
          </div>
        ) : isError ? (
          <div className="flex items-center gap-1 text-[11px] font-extrabold text-destructive bg-destructive/10 px-2 py-0.5 rounded-full border border-destructive/20 shrink-0">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Failed</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-[11px] font-extrabold text-primary bg-primary/10 px-2.5 py-0.5 rounded-full border border-primary/20 shrink-0">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>{percent !== null ? `${percent}%` : 'In Flight'}</span>
          </div>
        )}
      </div>

      {/* Modern Gradient Progress Bar */}
      <div
        data-testid="download-progress-bar"
        className="h-2 rounded-full bg-secondary/80 overflow-hidden border border-border/40 shadow-inner"
      >
        {isDone ? (
          <div className="h-full rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)] transition-all duration-300" style={{ width: '100%' }} />
        ) : isError ? (
          <div className="h-full rounded-full bg-destructive shadow-[0_0_8px_rgba(239,68,68,0.5)]" style={{ width: '100%' }} />
        ) : percent !== null ? (
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary via-indigo-500 to-purple-400 shadow-[0_0_10px_rgba(147,51,234,0.5)] transition-all duration-300 ease-out"
            style={{ width: `${percent}%` }}
          />
        ) : (
          <div className="h-full w-2/5 rounded-full bg-gradient-to-r from-primary to-indigo-500 animate-pulse shadow-[0_0_8px_rgba(147,51,234,0.5)]" />
        )}
      </div>

      <div className="flex items-center justify-between mt-2.5">
        <span
          className={cn(
            'text-[11px] font-semibold tracking-tight',
            isDone ? 'text-emerald-400' : isError ? 'text-destructive' : 'text-muted-foreground'
          )}
        >
          {isDone
            ? 'Added to library'
            : isError
              ? 'Download failed'
              : percent !== null ? 'Downloading book content…' : 'Connecting to mirror…'}
        </span>
        <span className="text-[11px] font-bold text-muted-foreground tabular-nums bg-secondary/40 px-2 py-0.5 rounded-md border border-border/30">
          {isDone ? `${downloaded} MB` : total ? `${downloaded} / ${total} MB` : `${downloaded} MB`}
        </span>
      </div>
    </div>
  );
}
