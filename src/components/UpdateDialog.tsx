import React, { useState } from 'react';
import { useUpdateStore } from '@/store/updateStore';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import ReactMarkdown from 'react-markdown';
import { relaunch } from '@tauri-apps/plugin-process';
import { open } from '@tauri-apps/plugin-shell';
import { isAndroid } from '@/lib/tauri';
import { Download, RefreshCw, X } from 'lucide-react';
import { logger } from '@/lib/logger';

export function UpdateDialog() {
  const { isUpdateDialogOpen, setIsUpdateDialogOpen, updateInfo } = useUpdateStore();
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!updateInfo) return null;

  const handleUpdate = async () => {
    try {
      setIsUpdating(true);
      setError(null);

      if (isAndroid) {
        // For Android, we open the URL in the browser
        if (updateInfo.apkUrl) {
          await open(updateInfo.apkUrl);
          setIsUpdateDialogOpen(false);
        } else {
          setError('No APK download URL available.');
        }
      } else {
        // For Desktop, we download and install via Tauri updater
        if (updateInfo.desktopUpdate) {
          await updateInfo.desktopUpdate.downloadAndInstall();
          // After successful installation, restart the app
          await relaunch();
        } else {
          setError('Invalid update object.');
        }
      }
    } catch (err) {
      logger.error('[UpdateDialog] Failed to update:', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <Dialog open={isUpdateDialogOpen} onOpenChange={setIsUpdateDialogOpen}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Download className="w-5 h-5 text-primary" />
            Update Available
          </DialogTitle>
          <DialogDescription>
            Version {updateInfo.version} is now available.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4">
          <h3 className="text-sm font-semibold mb-2">Release Notes:</h3>
          <ScrollArea className="h-[250px] w-full rounded-md border p-4 bg-muted/30">
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown>{updateInfo.notes}</ReactMarkdown>
            </div>
          </ScrollArea>

          {error && (
            <div className="mt-4 p-3 rounded-md bg-destructive/15 text-destructive text-sm">
              {error}
            </div>
          )}
        </div>
        
        <DialogFooter className="flex-col sm:flex-row gap-2 sm:space-x-0">
          <Button 
            variant="outline" 
            onClick={() => setIsUpdateDialogOpen(false)}
            disabled={isUpdating}
            className="w-full sm:w-auto"
          >
            <X className="w-4 h-4 mr-2" />
            Later
          </Button>
          <Button 
            onClick={handleUpdate}
            disabled={isUpdating}
            className="w-full sm:w-auto"
          >
            {isUpdating ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                {isAndroid ? 'Opening Browser...' : 'Downloading...'}
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                {isAndroid ? 'Download APK' : 'Install & Restart'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
