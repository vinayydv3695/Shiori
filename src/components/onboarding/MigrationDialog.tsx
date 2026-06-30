import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, FolderSync, AlertTriangle } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { usePreferencesStore } from '@/store/preferencesStore';
import { toast } from 'sonner';

interface MigrationResult {
  success: boolean;
  moved_count: number;
  failed_count: number;
  errors: string[];
}

interface MigrationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MigrationDialog({ open, onOpenChange }: MigrationDialogProps) {
  const [isMigrating, setIsMigrating] = useState(false);
  const [progress, setProgress] = useState<{ moved: number; failed: number } | null>(null);
  const { updateGeneralSettings } = usePreferencesStore();

  const handleMigrate = async () => {
    setIsMigrating(true);
    setProgress({ moved: 0, failed: 0 });

    try {
      const result = await invoke<MigrationResult>('migrate_library');
      
      setProgress({ moved: result.moved_count, failed: result.failed_count });

      if (result.success || result.moved_count > 0) {
        await updateGeneralSettings({ legacyLibraryMigrationStatus: 'migrated' });
        toast.success(`Successfully migrated ${result.moved_count} books.`);
        setTimeout(() => onOpenChange(false), 2000);
      } else {
        toast.error(`Migration finished with ${result.failed_count} errors.`);
      }
    } catch (e) {
      toast.error(`Migration failed: ${e}`);
    } finally {
      setIsMigrating(false);
    }
  };

  const handleSkip = async () => {
    await updateGeneralSettings({ legacyLibraryMigrationStatus: 'migrated' });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(val) => {
      if (!isMigrating) onOpenChange(val);
    }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderSync className="w-5 h-5 text-blue-500" />
            Library Migration
          </DialogTitle>
          <DialogDescription className="space-y-3 pt-3 text-sm">
            <p>
              Shiori 2.0 now manages books inside an isolated application data directory instead of keeping them wherever they were imported from.
            </p>
            <div className="bg-amber-500/10 border border-amber-500/20 rounded p-3 flex gap-3 text-amber-500">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <p className="text-xs">
                We recommend migrating your existing books to the new centralized library to ensure features like the Recycle Bin and seamless cloud sync function properly.
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        {progress && (
          <div className="text-sm mt-4 p-3 bg-muted rounded-md flex justify-between">
            <span className="text-green-500">Moved: {progress.moved}</span>
            <span className="text-red-500">Failed: {progress.failed}</span>
          </div>
        )}

        <DialogFooter className="mt-6 sm:justify-between">
          <Button
            variant="ghost"
            onClick={handleSkip}
            disabled={isMigrating}
          >
            Skip for now
          </Button>
          <Button
            onClick={handleMigrate}
            disabled={isMigrating}
            className="gap-2"
          >
            {isMigrating && <Loader2 className="w-4 h-4 animate-spin" />}
            {isMigrating ? 'Migrating...' : 'Migrate Library'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
