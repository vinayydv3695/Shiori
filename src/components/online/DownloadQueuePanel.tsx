import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { create } from 'zustand';
import { Download, X, Inbox, CheckCircle2, Loader2 } from 'lucide-react';
import { useOnlineDownloadStore, type DownloadProgress } from '@/store/onlineDownloadStore';
import { DownloadProgressBar } from './DownloadProgressBar';
import { cn } from '@/lib/utils';

// Stable empty sentinel: DownloadQueuePanel is mounted globally (GlobalDialogs)
// but only needs the live downloads object while open — progress ticks replace
// the object every time and would re-render the hidden panel at tick rate.
const EMPTY_DOWNLOADS: Record<string, DownloadProgress> = {};

// ──────────────────────────────────────────────────────────────────────────
// Shared open-state for the queue panel (button lives in OnlineBooksView,
// the panel itself is mounted globally in GlobalDialogs so it works from
// anywhere a download can start).
// ──────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line react-refresh/only-export-components -- shared UI open-state, co-located with the panel
interface DownloadQueueUIState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

// eslint-disable-next-line react-refresh/only-export-components -- shared UI open-state, co-located with the panel
export const useDownloadQueueUI = create<DownloadQueueUIState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

// ──────────────────────────────────────────────────────────────────────────
// DownloadsButton — icon + active-count badge; opens the queue panel.
// ──────────────────────────────────────────────────────────────────────────

export function DownloadsButton({ className, iconOnly }: { className?: string; iconOnly?: boolean } = {}) {
  const activeCount = useOnlineDownloadStore((s) => {
    let n = 0;
    for (const d of Object.values(s.downloads)) {
      if (d.status === 'downloading') n++;
    }
    return n;
  });
  const totalCount = useOnlineDownloadStore((s) => Object.keys(s.downloads).length);
  const setOpen = useDownloadQueueUI((s) => s.setOpen);

  if (iconOnly) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={totalCount > 0 ? `Downloads (${totalCount})` : 'Downloads'}
        className={cn(
          "relative w-8 h-8 rounded-xl flex items-center justify-center transition-all shrink-0 active:scale-95 border border-border/50",
          activeCount > 0 
            ? "bg-primary text-primary-foreground border-primary/40 shadow-xs" 
            : "bg-secondary/40 hover:bg-secondary/80 text-muted-foreground hover:text-foreground",
          className
        )}
      >
        {activeCount > 0 ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Download className="w-3.5 h-3.5" />
        )}
        {totalCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-1 rounded-full text-[9px] font-black bg-primary text-primary-foreground flex items-center justify-center border border-background shadow-xs">
            {activeCount > 0 ? activeCount : totalCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      title={totalCount > 0 ? `Downloads (${totalCount})` : 'Downloads'}
      className={cn(
        "relative flex items-center gap-2.5 px-5 py-2 h-11 rounded-full text-xs sm:text-sm font-bold transition-all duration-200 border shadow-xs outline-none group cursor-pointer select-none active:scale-95",
        activeCount > 0 
          ? "bg-gradient-to-r from-primary via-primary/95 to-primary/85 text-primary-foreground border-primary/40 shadow-md shadow-primary/25 scale-[1.02]" 
          : "bg-card/75 hover:bg-card text-foreground border-border/50 hover:border-primary/40 backdrop-blur-xl",
        className
      )}
    >
      <div className="relative flex items-center justify-center">
        {activeCount > 0 ? (
          <Loader2 className="w-4 h-4 animate-spin text-primary-foreground" />
        ) : (
          <Download className="w-4 h-4 transition-transform duration-200 group-hover:translate-y-[1px] text-primary" />
        )}
        {activeCount > 0 && (
          <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
        )}
      </div>
      <span className="tracking-tight">Downloads</span>
      {totalCount > 0 && (
        <span className={cn(
          "min-w-[20px] h-[20px] px-1.5 rounded-full text-[11px] font-black flex items-center justify-center border shadow-2xs",
          activeCount > 0
            ? "bg-primary-foreground/20 text-primary-foreground border-primary-foreground/30"
            : "bg-primary/15 text-primary border-primary/25"
        )}>
          {activeCount > 0 ? activeCount : totalCount}
        </span>
      )}
    </button>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// DownloadQueuePanel — right-hand slide-over listing every tracked download
// ──────────────────────────────────────────────────────────────────────────

export function DownloadQueuePanel() {
  const open = useDownloadQueueUI((s) => s.open);
  const setOpen = useDownloadQueueUI((s) => s.setOpen);
  const [filter, setFilter] = useState<'all' | 'active' | 'done'>('all');
  
  // Panel is mounted globally — only subscribe to the live object while open.
  const downloads = useOnlineDownloadStore((s) => (open ? s.downloads : EMPTY_DOWNLOADS));

  const entries = Object.values(downloads);
  const activeCount = entries.filter((d) => d.status === 'downloading').length;
  const finishedCount = entries.filter((d) => d.status === 'completed' || d.status === 'error').length;

  const filteredEntries = entries.filter((d) => {
    if (filter === 'active') return d.status === 'downloading';
    if (filter === 'done') return d.status === 'completed' || d.status === 'error';
    return true;
  });

  const handleClearFinished = () => {
    for (const d of entries) {
      if (d.status === 'completed' || d.status === 'error') {
        useOnlineDownloadStore.getState().clearDownload(d.target_id);
      }
    }
  };

  const handleClearItem = (targetId: string) => {
    useOnlineDownloadStore.getState().clearDownload(targetId);
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby="download-queue-description"
          className="shiori-select-content fixed right-0 top-0 h-full w-full max-w-md bg-card/95 backdrop-blur-2xl border-l border-border/70 shadow-2xl z-50 flex flex-col data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right duration-300 overflow-hidden"
        >
          <Dialog.Description id="download-queue-description" className="sr-only">
            Active downloads and their progress.
          </Dialog.Description>

          {/* Header */}
          <div className="flex-none px-6 py-5 border-b border-border/50 bg-secondary/30 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-primary/10 border border-primary/25 flex items-center justify-center shadow-xs text-primary">
                  <Download className="w-5 h-5" />
                </div>
                <div>
                  <Dialog.Title className="text-base font-bold text-foreground tracking-tight leading-none">
                    Download Queue
                  </Dialog.Title>
                  <p className="text-xs font-semibold text-muted-foreground mt-1">
                    {entries.length === 0
                      ? 'No active downloads'
                      : activeCount > 0
                        ? `${activeCount} active · ${entries.length} total`
                        : `${entries.length} completed`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {finishedCount > 0 && (
                  <button
                    onClick={handleClearFinished}
                    className="px-3 py-1 text-xs font-bold rounded-full bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground border border-border/50 transition-all cursor-pointer shadow-xs"
                    title="Clear completed and failed downloads"
                  >
                    Clear done
                  </button>
                )}
                <Dialog.Close asChild>
                  <button
                    className="p-2 bg-secondary/60 hover:bg-secondary border border-border/50 rounded-full transition-all text-muted-foreground hover:text-foreground shadow-xs cursor-pointer"
                    title="Close downloads"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </Dialog.Close>
              </div>
            </div>

            {/* Filter Tabs if items exist */}
            {entries.length > 0 && (
              <div className="flex items-center gap-1.5 mt-4 pt-3 border-t border-border/40">
                <button
                  onClick={() => setFilter('all')}
                  className={cn(
                    "px-3 py-1 rounded-full text-xs font-bold transition-all shadow-xs",
                    filter === 'all'
                      ? "bg-primary text-primary-foreground shadow-sm shadow-primary/25"
                      : "bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground border border-border/40"
                  )}
                >
                  All ({entries.length})
                </button>
                <button
                  onClick={() => setFilter('active')}
                  className={cn(
                    "px-3 py-1 rounded-full text-xs font-bold transition-all shadow-xs",
                    filter === 'active'
                      ? "bg-primary text-primary-foreground shadow-sm shadow-primary/25"
                      : "bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground border border-border/40"
                  )}
                >
                  Active ({activeCount})
                </button>
                <button
                  onClick={() => setFilter('done')}
                  className={cn(
                    "px-3 py-1 rounded-full text-xs font-bold transition-all shadow-xs",
                    filter === 'done'
                      ? "bg-primary text-primary-foreground shadow-sm shadow-primary/25"
                      : "bg-secondary/60 hover:bg-secondary text-muted-foreground hover:text-foreground border border-border/40"
                  )}
                >
                  Done ({finishedCount})
                </button>
              </div>
            )}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-3">
            {filteredEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-muted-foreground text-center">
                <div className="w-16 h-16 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4 shadow-lg shadow-primary/5 text-primary">
                  <Inbox className="w-7 h-7" />
                </div>
                <p className="text-sm font-bold text-foreground">
                  {entries.length === 0 ? 'Queue is Empty' : 'No items match filter'}
                </p>
                <p className="text-xs text-muted-foreground mt-1.5 max-w-[240px] leading-relaxed">
                  {entries.length === 0
                    ? 'Books and manga downloaded from online catalogs will appear here with live speed and progress.'
                    : 'Switch back to "All" to view your downloads.'}
                </p>
              </div>
            ) : (
              filteredEntries.map((entry) => (
                <DownloadProgressBar
                  key={entry.target_id}
                  bookTitle={entry.title || entry.target_id}
                  progress={entry}
                  onClear={() => handleClearItem(entry.target_id)}
                />
              ))
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default DownloadQueuePanel;
