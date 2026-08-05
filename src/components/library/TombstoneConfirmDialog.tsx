import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from '../ui/button';

interface TombstoneConfirmDialogProps {
  paths: string[];
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirm dialog shown when the user explicitly imports files that were
 * previously deleted (tombstoned). "Import anyway" clears the tombstones
 * and re-imports; Cancel leaves them skipped.
 */
export function TombstoneConfirmDialog({ paths, onConfirm, onCancel }: TombstoneConfirmDialogProps) {
  const count = paths.length;

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 grid w-[92vw] sm:w-full max-w-md translate-x-[-50%] translate-y-[-50%] gap-4 border border-border/50 bg-background/95 backdrop-blur-2xl p-5 sm:p-6 shadow-2xl rounded-3xl min-w-0 duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <div className="flex items-center justify-between pb-1 min-w-0">
            <Dialog.Title className="text-lg font-bold tracking-tight text-foreground flex items-center gap-3 min-w-0">
              <div className="p-2 bg-amber-500/10 rounded-xl text-amber-500 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <span className="truncate">Previously Deleted Files</span>
            </Dialog.Title>
            <Dialog.Close className="rounded-full p-2 bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground transition-all shrink-0 ml-2">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <p className="text-sm text-foreground/90 leading-relaxed">
            {count} file{count !== 1 ? 's' : ''} were previously deleted. Import them anyway?
          </p>

          <div className="bg-secondary/30 backdrop-blur-sm rounded-2xl p-3 border border-border/40 max-h-[30vh] overflow-y-auto custom-scrollbar space-y-1.5 min-w-0">
            {paths.map((path, index) => (
              <div key={index} className="text-xs font-mono text-muted-foreground truncate" title={path}>
                {path.split('/').pop()}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-border/30">
            <Button variant="ghost" onClick={onCancel} className="rounded-xl px-5 hover:bg-secondary/60">
              Cancel
            </Button>
            <Button onClick={onConfirm} className="gap-2 rounded-xl px-6 shadow-lg shadow-primary/20">
              Import anyway
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
