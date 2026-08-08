import { logger } from '@/lib/logger';
import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Download, FileText, FileJson, FileCode, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { api, ExportOptions } from '../../lib/tauri';
import { useToast } from '../../store/toastStore';

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ExportFormat = 'csv' | 'json' | 'markdown';
type ExportStatus = 'idle' | 'exporting' | 'completed' | 'error';

export const ExportDialog = ({ open, onOpenChange }: ExportDialogProps) => {
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [includeMetadata, setIncludeMetadata] = useState(true);
  const [includeShelfs, setIncludeShelfs] = useState(true);
  const [includeReadingProgress, setIncludeReadingProgress] = useState(true);
  const [status, setStatus] = useState<ExportStatus>('idle');
  const [exportedPath, setExportedPath] = useState<string>('');
  const toast = useToast();

  const formatIcons = {
    csv: <FileText className="w-6 h-6" />,
    json: <FileJson className="w-6 h-6" />,
    markdown: <FileCode className="w-6 h-6" />,
  };

  const formatDescriptions = {
    csv: 'Comma-separated values for spreadsheet apps',
    json: 'Structured data format for developers',
    markdown: 'Human-readable documentation format',
  };

  const handleExport = async () => {
    try {
      // Open save file dialog
      const defaultFileName = `library-export.${format === 'markdown' ? 'md' : format}`;
      const filePath = await api.saveFileDialog(defaultFileName);
      
      if (!filePath) {
        return; // User cancelled
      }

      setStatus('exporting');

      const options: ExportOptions = {
        format,
        include_metadata: includeMetadata,
        include_shelves: includeShelfs,
        include_reading_progress: includeReadingProgress,
        file_path: filePath,
      };

      const result = await api.exportLibrary(options);
      
      setExportedPath(result);
      setStatus('completed');
      
      toast.success(
        'Library exported successfully',
        `Saved to ${result.split('/').pop()}`
      );
    } catch (error) {
      logger.error('Export failed:', error);
      setStatus('error');
      toast.error('Export failed', 'An error occurred during export');
    }
  };

  const handleClose = () => {
    setStatus('idle');
    setExportedPath('');
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 bg-background/80 backdrop-blur-md z-50" />
        <Dialog.Content aria-describedby={undefined} className="dialog-content fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card border border-border/60 rounded-2xl shadow-2xl w-[92vw] sm:w-[580px] max-h-[90vh] overflow-y-auto z-50 backdrop-blur-2xl">
          <div className="sticky top-0 bg-card/95 backdrop-blur-md border-b border-border/50 px-6 py-4 z-10 flex items-center justify-between">
            <Dialog.Title className="text-xl font-bold tracking-tight text-foreground">Export Library</Dialog.Title>
            <Dialog.Close asChild>
              <button className="p-2 hover:bg-secondary rounded-full text-muted-foreground hover:text-foreground transition-colors" title="Close">
                <X className="w-5 h-5" />
              </button>
            </Dialog.Close>
          </div>

          <div className="p-6 space-y-6">
            {status === 'idle' && (
              <>
                {/* Format Selection */}
                <div>
                  <label className="block text-sm font-semibold text-foreground mb-3">Export Format</label>
                  <div className="grid grid-cols-3 gap-3">
                    {(['csv', 'json', 'markdown'] as ExportFormat[]).map((fmt) => (
                      <button
                        key={fmt}
                        onClick={() => setFormat(fmt)}
                        className={`flex flex-col items-center gap-2 px-4 py-4 rounded-xl border-2 transition-all ${
                          format === fmt
                            ? 'border-primary bg-primary/10 shadow-sm'
                            : 'border-border/60 bg-secondary/30 hover:bg-secondary/60 hover:border-border'
                        }`}
                      >
                        <div className={format === fmt ? 'text-primary' : 'text-muted-foreground'}>
                          {formatIcons[fmt]}
                        </div>
                        <div className="text-center">
                          <div className={`font-bold uppercase text-xs ${format === fmt ? 'text-primary' : 'text-foreground'}`}>{fmt}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {formatDescriptions[format]}
                  </div>
                </div>

                {/* Export Options */}
                <div>
                  <label className="block text-sm font-semibold text-foreground mb-3">Include in Export</label>
                  <div className="space-y-3">
                    <label className="flex items-center gap-3 cursor-pointer p-2.5 rounded-xl hover:bg-secondary/40 transition-colors border border-border/30">
                      <input
                        type="checkbox"
                        checked={includeMetadata}
                        onChange={(e) => setIncludeMetadata(e.target.checked)}
                        className="w-4 h-4 rounded border-border text-primary focus:ring-2 focus:ring-primary/40"
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-foreground">Full Metadata</div>
                        <div className="text-xs text-muted-foreground">ISBN, publisher, publication date, etc.</div>
                      </div>
                    </label>
                    
                    <label className="flex items-center gap-3 cursor-pointer p-2.5 rounded-xl hover:bg-secondary/40 transition-colors border border-border/30">
                      <input
                        type="checkbox"
                        checked={includeShelfs}
                        onChange={(e) => setIncludeShelfs(e.target.checked)}
                        className="w-4 h-4 rounded border-border text-primary focus:ring-2 focus:ring-primary/40"
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-foreground">Shelfs</div>
                        <div className="text-xs text-muted-foreground">Which shelves each book belongs to</div>
                      </div>
                    </label>
                    
                    <label className="flex items-center gap-3 cursor-pointer p-2.5 rounded-xl hover:bg-secondary/40 transition-colors border border-border/30">
                      <input
                        type="checkbox"
                        checked={includeReadingProgress}
                        onChange={(e) => setIncludeReadingProgress(e.target.checked)}
                        className="w-4 h-4 rounded border-border text-primary focus:ring-2 focus:ring-primary/40"
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-foreground">Reading Progress</div>
                        <div className="text-xs text-muted-foreground">Current reading position and completion percentage</div>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Info Box */}
                <div className="bg-primary/10 border border-primary/20 rounded-xl p-4">
                  <div className="text-sm">
                    <div className="font-semibold text-primary mb-1">What's Exported:</div>
                    <ul className="text-xs text-muted-foreground space-y-1">
                      <li>• Book titles, authors, and tags</li>
                      <li>• File paths and formats</li>
                      <li>• Series information and ratings</li>
                      {includeMetadata && <li>• Publisher, ISBN, and publication dates</li>}
                      {includeShelfs && <li>• Shelf memberships</li>}
                      {includeReadingProgress && <li>• Reading progress and last read dates</li>}
                    </ul>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end gap-3 pt-4 border-t border-border/40">
                  <Dialog.Close asChild>
                    <button className="px-4 py-2 border border-border rounded-xl hover:bg-secondary text-foreground text-sm font-medium transition-colors">
                      Cancel
                    </button>
                  </Dialog.Close>
                  <button
                    onClick={handleExport}
                    className="px-4 py-2 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 transition-colors flex items-center gap-2 shadow-md"
                  >
                    <Download className="w-4 h-4" />
                    Export Library
                  </button>
                </div>
              </>
            )}

            {/* Exporting Status */}
            {status === 'exporting' && (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="w-16 h-16 text-primary animate-spin mb-4" />
                <div className="text-lg font-bold text-foreground">Exporting library...</div>
                <div className="text-sm text-muted-foreground mt-1">Creating {format.toUpperCase()} file</div>
              </div>
            )}

            {/* Export Complete */}
            {status === 'completed' && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 pb-3 border-b border-border">
                  <CheckCircle className="w-8 h-8 text-emerald-500" />
                  <div>
                    <div className="text-lg font-bold text-foreground">Export Complete</div>
                    <div className="text-sm text-muted-foreground">Your library has been exported successfully</div>
                  </div>
                </div>

                <div className="bg-muted/40 border border-border/50 rounded-xl p-4">
                  <div className="text-xs text-muted-foreground mb-1">Saved to:</div>
                  <div className="font-mono text-sm text-foreground break-all">{exportedPath}</div>
                </div>

                <div className="flex justify-end pt-4">
                  <button
                    onClick={handleClose}
                    className="px-5 py-2.5 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 transition-colors shadow-md"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}

            {/* Error State */}
            {status === 'error' && (
              <div className="flex flex-col items-center justify-center py-12">
                <AlertCircle className="w-16 h-16 text-destructive mb-4" />
                <div className="text-lg font-bold text-foreground">Export Failed</div>
                <div className="text-sm text-muted-foreground mt-1">An error occurred during export</div>
                <button
                  onClick={() => setStatus('idle')}
                  className="mt-4 px-4 py-2 border border-border rounded-xl hover:bg-secondary text-foreground font-medium transition-colors"
                >
                  Try Again
                </button>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
