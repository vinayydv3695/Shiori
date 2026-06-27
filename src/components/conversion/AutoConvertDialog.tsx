import React, { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, BookOpen, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';

interface AutoConvertDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  bookTitle: string;
  currentFormat: string;
  onConfirm: () => void;
  isConverting: boolean;
}

const FORMAT_LABELS: Record<string, string> = {
  mobi: 'MOBI',
  azw3: 'AZW3',
  pdf: 'PDF',
  txt: 'TXT',
  docx: 'DOCX',
  fb2: 'FB2',
  html: 'HTML',
};

export const AutoConvertDialog: React.FC<AutoConvertDialogProps> = ({
  isOpen,
  onOpenChange,
  bookTitle,
  currentFormat,
  onConfirm,
  isConverting,
}) => {
  const formatLabel = FORMAT_LABELS[currentFormat.toLowerCase()] ?? currentFormat.toUpperCase();
  const [fakeProgress, setFakeProgress] = useState(0);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    
    if (isOpen) {
      import('@tauri-apps/api/event').then(({ listen }) => {
        listen('conversion:progress', (event: any) => {
          const payload = event.payload;
          if (payload && payload.id === 'direct' && typeof payload.progress === 'number') {
            setFakeProgress(payload.progress);
          }
        }).then(fn => {
          unlisten = fn;
        });
      });
    }
    
    return () => {
      if (unlisten) unlisten();
    };
  }, [isOpen]);

  // Reset progress when conversion starts
  useEffect(() => {
    if (isConverting) {
      setFakeProgress(0);
    } else {
      setFakeProgress(100);
    }
  }, [isConverting]);

  // Reset when dialog opens
  useEffect(() => {
    if (isOpen && !isConverting) {
      setFakeProgress(0);
    }
  }, [isOpen, isConverting]);

  return (
    <Dialog.Root open={isOpen} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 bg-black/50 backdrop-blur-sm z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          className="dialog-content fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background border border-border rounded-xl shadow-lg w-[90vw] max-w-md z-50 duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]"
          aria-describedby="auto-convert-description"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-border bg-muted/20">
            <Dialog.Title className="text-lg font-semibold text-foreground flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <BookOpen className="h-5 w-5 text-primary" />
              </div>
              Convert to EPUB
            </Dialog.Title>
            <Dialog.Close asChild>
              <button 
                className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50" 
                title="Close"
                disabled={isConverting}
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          {/* Content */}
          <div className="p-6">
            <p className="text-sm text-foreground mb-4">
              Are you sure you want to convert <span className="font-semibold">"{bookTitle}"</span>?
            </p>
            <p 
              id="auto-convert-description"
              className="text-sm text-muted-foreground mb-6"
            >
              The original {formatLabel} file will be permanently deleted after successful conversion. This action is irreversible.
            </p>
            
            {/* Progress Section */}
            {isConverting && (
              <div className="space-y-2 mt-4 p-4 bg-muted/20 border border-border rounded-lg">
                <div className="flex justify-between text-sm font-medium text-muted-foreground">
                  <span>Converting...</span>
                  <span className="text-primary">{fakeProgress}%</span>
                </div>
                <div className="w-full h-2 bg-border rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500 ease-out"
                    style={{
                      width: `${fakeProgress}%`,
                      background: 'linear-gradient(90deg, hsl(var(--primary)), hsl(var(--primary) / 0.6))',
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-6 border-t border-border bg-muted/10">
            <Dialog.Close asChild>
              <Button variant="outline" disabled={isConverting}>
                Keep Original
              </Button>
            </Dialog.Close>
            <Button
              onClick={onConfirm}
              disabled={isConverting}
              className="min-w-[140px]"
            >
              {isConverting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Converting...
                </>
              ) : (
                'Convert to EPUB'
              )}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
