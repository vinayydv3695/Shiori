import * as Dialog from '@radix-ui/react-dialog';
import { create } from 'zustand';
import { Download, X, Inbox } from 'lucide-react';
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

export function DownloadsButton() {
  const activeCount = useOnlineDownloadStore((s) => {
    let n = 0;
    for (const d of Object.values(s.downloads)) {
      if (d.status === 'downloading') n++;
    }
    return n;
  });
  const totalCount = useOnlineDownloadStore((s) => Object.keys(s.downloads).length);
  const setOpen = useDownloadQueueUI((s) => s.setOpen);

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      title={totalCount > 0 ? `Downloads (${totalCount})` : 'Downloads'}
      className={cn(
        "relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all duration-300 border shadow-xs outline-none group",
        activeCount > 0 
          ? "bg-primary text-primary-foreground border-primary/50 shadow-md shadow-primary/30 ring-1 ring-primary/40 scale-[1.02]" 
          : "bg-card/80 hover:bg-card text-foreground border-border/60 hover:border-primary/40"
      )}
    >
      <div className="relative flex items-center justify-center">
        <Download className={cn("w-4 h-4 transition-transform duration-300 group-hover:-translate-y-0.5", activeCount > 0 ? "text-primary-foreground" : "text-primary")} />
        {activeCount > 0 && (
          <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
        )}
      </div>
      <span className="hidden sm:inline">Downloads</span>
      {totalCount > 0 && (
        <span className={cn(
          "min-w-[20px] h-[20px] px-1.5 rounded-full text-[10px] font-extrabold flex items-center justify-center border",
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
  // Panel is mounted globally — only subscribe to the live object while open.
  const downloads = useOnlineDownloadStore((s) => (open ? s.downloads : EMPTY_DOWNLOADS));

  const entries = Object.values(downloads);
  const activeCount = entries.filter((d) => d.status === 'downloading').length;
  const finishedCount = entries.filter((d) => d.status === 'completed' || d.status === 'error').length;

  const handleClearFinished = () => {
    for (const d of entries) {
      if (d.status === 'completed' || d.status === 'error') {
        useOnlineDownloadStore.getState().clearDownload(d.target_id);
      }
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-background/80 backdrop-blur-md z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby="download-queue-description"
          className="shiori-select-content fixed right-0 top-0 h-full w-full max-w-md bg-card/95 backdrop-blur-2xl border-l border-border/70 shadow-2xl z-50 flex flex-col data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right duration-300 overflow-hidden"
        >
          <Dialog.Description id="download-queue-description" className="sr-only">
            Active downloads and their progress.
          </Dialog.Description>

          {/* Header */}
          <div className="flex-none flex items-center justify-between px-6 py-5 border-b border-border/50 bg-secondary/30 backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center shadow-xs">
                <Download className="w-5 h-5 text-primary" />
              </div>
              <div>
                <Dialog.Title className="text-base font-extrabold text-foreground tracking-tight leading-none">
                  Download Queue
                </Dialog.Title>
                <p className="text-xs font-bold text-muted-foreground mt-1">
                  {entries.length === 0
                    ? 'No downloads in progress'
                    : `${activeCount} in flight · ${entries.length} total`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {finishedCount > 0 && (
                <button
                  onClick={handleClearFinished}
                  className="px-2.5 py-1 text-[11px] font-extrabold rounded-lg bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground border border-border/50 transition-all"
                  title="Clear completed and failed downloads"
                >
                  Clear done
                </button>
              )}
              <Dialog.Close asChild>
                <button
                  className="p-2 bg-secondary/60 hover:bg-secondary border border-border/50 rounded-xl transition-all text-muted-foreground hover:text-foreground shadow-xs"
                  title="Close downloads"
                >
                  <X className="w-4 h-4" />
                </button>
              </Dialog.Close>
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-3">
            {entries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-muted-foreground text-center">
                <div className="w-16 h-16 rounded-3xl bg-secondary/50 border border-border/40 flex items-center justify-center mb-4 shadow-inner">
                  <Inbox className="w-8 h-8 opacity-30 text-primary" />
                </div>
                <p className="text-sm font-extrabold text-foreground">No downloads in flight</p>
                <p className="text-xs text-muted-foreground mt-1.5 max-w-[240px] leading-relaxed">
                  Books and manga downloaded from online catalogs will appear here with live speed and progress.
                </p>
              </div>
            ) : (
              entries.map((entry) => (
                <DownloadProgressBar
                  key={entry.target_id}
                  bookTitle={entry.title || entry.target_id}
                  progress={entry}
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
