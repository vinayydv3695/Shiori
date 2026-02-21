import React, { useEffect, useRef } from 'react';
import {
  X, Loader2, CheckCircle, Clock, XCircle, AlertCircle, Minimize2, Maximize2, RefreshCw,
} from 'lucide-react';
import { useConversionStore, type ConversionJob } from '../../store/conversionStore';

interface ConversionJobTrackerProps {
  /** Bottom toolbar integration: show as compact strip instead of floating panel */
  compact?: boolean;
}

const STATUS_CONFIG: Record<
  ConversionJob['status'],
  { icon: React.ReactNode; label: string; color: string; bg: string }
> = {
  Queued: { icon: <Clock className="w-4 h-4" />, label: 'Queued', color: 'text-blue-500', bg: 'bg-blue-500/10' },
  Processing: { icon: <Loader2 className="w-4 h-4 animate-spin" />, label: 'Converting', color: 'text-amber-500', bg: 'bg-amber-500/10' },
  Completed: { icon: <CheckCircle className="w-4 h-4" />, label: 'Done', color: 'text-green-500', bg: 'bg-green-500/10' },
  Failed: { icon: <AlertCircle className="w-4 h-4" />, label: 'Failed', color: 'text-destructive', bg: 'bg-destructive/10' },
  Cancelled: { icon: <XCircle className="w-4 h-4" />, label: 'Cancelled', color: 'text-muted-foreground', bg: 'bg-muted' },
};

const JobRow: React.FC<{ job: ConversionJob; onCancel: (id: string) => void }> = ({ job, onCancel }) => {
  const cfg = STATUS_CONFIG[job.status];
  const filename = job.source_path.split('/').pop() ?? 'Unknown';

  return (
    <div className={`p-3 rounded-lg border border-border ${cfg.bg} space-y-2`}>
      {/* Top row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cfg.color}>{cfg.icon}</span>
          <span className="text-sm font-medium text-foreground truncate" title={filename}>
            {filename}
          </span>
        </div>
        {(job.status === 'Queued' || job.status === 'Processing') && (
          <button
            onClick={() => onCancel(job.id)}
            title="Cancel"
            className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Meta: format + status badge */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {job.source_format.toUpperCase()} → {job.target_format.toUpperCase()}
        </span>
        <span className={`px-2 py-0.5 rounded-full font-medium text-xs ${cfg.bg} ${cfg.color}`}>
          {cfg.label}
        </span>
      </div>

      {/* Progress bar — only shown while active, uses real progress value */}
      {(job.status === 'Queued' || job.status === 'Processing') && (
        <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.max(job.progress, job.status === 'Processing' ? 8 : 2)}%`,
              background: 'linear-gradient(90deg, hsl(var(--primary)), hsl(var(--primary) / 0.6))',
            }}
          />
        </div>
      )}

      {/* Error message */}
      {job.status === 'Failed' && job.error && (
        <p className="text-xs text-destructive bg-destructive/10 rounded px-2 py-1 leading-relaxed">
          {job.error}
        </p>
      )}

      {/* Output path on success */}
      {job.status === 'Completed' && job.target_path && (
        <p className="text-xs text-muted-foreground truncate" title={job.target_path}>
          → {job.target_path.split('/').pop()}
        </p>
      )}
    </div>
  );
};

const ConversionJobTracker: React.FC<ConversionJobTrackerProps> = ({ compact = false }) => {
  const { jobs, loadJobs, cancelJob, clearCompletedJobs } = useConversionStore();
  const [minimized, setMinimized] = React.useState(false);
  const [visible, setVisible] = React.useState(true);

  // Initial load
  useEffect(() => { loadJobs(); }, []);

  // Auto-show/hide
  useEffect(() => {
    if (jobs.length > 0) setVisible(true);
  }, [jobs.length]);

  const activeCount = jobs.filter(j => j.status === 'Queued' || j.status === 'Processing').length;
  const hasJobs = jobs.length > 0;
  const hasDone = jobs.some(j => j.status === 'Completed' || j.status === 'Failed' || j.status === 'Cancelled');

  if (!visible || !hasJobs) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[22rem] flex flex-col rounded-xl border border-border bg-background shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-surface-1 border-b border-border">
        <div className="flex items-center gap-2">
          <Loader2
            className={`w-4 h-4 ${activeCount > 0 ? 'animate-spin text-primary' : 'text-muted-foreground'}`}
          />
          <span className="text-sm font-semibold text-foreground">Conversions</span>
          {jobs.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground text-xs font-medium leading-none">
              {jobs.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => loadJobs()}
            title="Refresh"
            className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setMinimized(m => !m)}
            title={minimized ? 'Expand' : 'Minimize'}
            className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            {minimized ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => setVisible(false)}
            title="Close"
            className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Job list */}
      {!minimized && (
        <>
          <div className="overflow-y-auto max-h-[400px] p-3 space-y-2">
            {jobs.map(job => (
              <JobRow key={job.id} job={job} onCancel={id => cancelJob(id).catch(console.error)} />
            ))}
          </div>

          {hasDone && (
            <div className="px-3 pb-3">
              <button
                onClick={clearCompletedJobs}
                className="w-full py-2 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                Clear completed
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ConversionJobTracker;
