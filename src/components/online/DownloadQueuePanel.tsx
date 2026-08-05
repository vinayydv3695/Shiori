import * as Dialog from '@radix-ui/react-dialog';
import { create } from 'zustand';
import { Download, X, Inbox } from 'lucide-react';
import { useOnlineDownloadStore } from '@/store/onlineDownloadStore';
import { DownloadProgressBar } from './DownloadProgressBar';
import { cn } from '@/lib/utils';

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
  const downloads = useOnlineDownloadStore((s) => s.downloads);
  const setOpen = useDownloadQueueUI((s) => s.setOpen);

  const activeCount = Object.values(downloads).filter(
    (d) => d.status === 'downloading'
  ).length;
  const totalCount = Object.keys(downloads).length;

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      title={totalCount > 0 ? `Downloads (${totalCount})` : 'Downloads'}
      className={cn(
        "relative flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all border shadow-sm outline-none",
        activeCount > 0 
          ? "bg-primary text-primary-foreground border-primary/40 shadow-primary/20 animate-pulse" 
          : "bg-secondary/70 hover:bg-secondary text-foreground border-border/60"
      )}
    >
      <Download className="w-4 h-4 text-primary" />
      <span className="hidden sm:inline">Downloads</span>
      {totalCount > 0 && (
        <span className="min-w-[20px] h-[20px] px-1.5 rounded-full bg-primary/20 text-primary text-[10px] font-extrabold flex items-center justify-center border border-primary/30">
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
  const downloads = useOnlineDownloadStore((s) => s.downloads);

  const entries = Object.values(downloads);
  const activeCount = entries.filter((d) => d.status === 'downloading').length;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-background/70 backdrop-blur-md z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby="download-queue-description"
          className="shiori-select-content fixed right-0 top-0 h-full w-full max-w-sm border-l border-border shadow-2xl z-50 flex flex-col data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right duration-300 overflow-hidden"
        >
          <Dialog.Description id="download-queue-description" className="sr-only">
            Active downloads and their progress.
          </Dialog.Description>

          {/* Header */}
          <div className="flex-none flex items-center justify-between px-5 py-4 border-b border-border/50 bg-secondary/30">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center shadow-sm">
                <Download className="w-4.5 h-4.5 text-primary" />
              </div>
              <div>
                <Dialog.Title className="text-sm font-extrabold text-foreground tracking-tight leading-none">
                  Download Queue
                </Dialog.Title>
                <p className="text-[11px] font-bold text-muted-foreground mt-1">
                  {entries.length === 0
                    ? 'Nothing in flight'
                    : `${activeCount} active · ${entries.length} total`}
                </p>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                className="p-1.5 bg-secondary/60 hover:bg-secondary border border-border/50 rounded-xl transition-all text-muted-foreground hover:text-foreground"
                title="Close downloads"
              >
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
            {entries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <Inbox className="w-12 h-12 mb-3 opacity-25 text-primary" />
                <p className="text-sm font-extrabold text-foreground">No downloads yet</p>
                <p className="text-xs text-muted-foreground mt-1 text-center max-w-[220px]">
                  Downloads started from Online Library or Manga will appear here.
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
