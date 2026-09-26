import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}

/**
 * Shared destructive-action confirmation dialog.
 * Built on Radix Dialog (already a dependency): Escape cancels, focus is
 * placed on the Cancel button by default. window.confirm() is blocked in the
 * Android WebView, so all confirmations must go through this component.
 */
export const ConfirmDialog = ({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = true,
  onConfirm,
}: ConfirmDialogProps) => {
  const handleConfirm = () => {
    // Close first (mirrors window.confirm resolving), then run the action.
    onOpenChange(false);
    onConfirm();
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 z-[200] bg-black/60 backdrop-blur-xl transition-all data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-200" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-32px)] max-w-md max-h-[85vh] bg-popover dark:bg-card/98 backdrop-blur-3xl border border-border/80 rounded-3xl shadow-2xl z-[210] flex flex-col overflow-hidden focus:outline-none transition-all duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-border">
            <Dialog.Title className="text-lg font-semibold text-foreground flex items-center gap-2">
              <AlertTriangle className={cn('h-5 w-5', destructive ? 'text-destructive' : 'text-primary')} />
              {title}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </Dialog.Close>
          </div>

          {/* Content */}
          <div className="p-6 flex flex-col gap-6">
            {description && (
              <p className="text-sm text-foreground">{description}</p>
            )}
            <div className="flex items-center justify-end gap-3">
              <Button variant="outline" autoFocus onClick={() => onOpenChange(false)}>
                {cancelLabel}
              </Button>
              <Button
                variant={destructive ? 'destructive' : 'default'}
                className="min-w-24"
                onClick={handleConfirm}
              >
                {confirmLabel}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};