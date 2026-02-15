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
  const [includeCollections, setIncludeCollections] = useState(true);
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
        include_collections: includeCollections,
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
      console.error('Export failed:', error);
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
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-[600px] max-h-[90vh] overflow-y-auto z-50">
          <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-4 z-10">
            <div className="flex items-center justify-between">
              <Dialog.Title className="text-xl font-semibold">Export Library</Dialog.Title>
              <Dialog.Close asChild>
                <button className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">
                  <X className="w-5 h-5" />
                </button>
              </Dialog.Close>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {status === 'idle' && (
              <>
                {/* Format Selection */}
                <div>
                  <label className="block text-sm font-medium mb-3">Export Format</label>
                  <div className="grid grid-cols-3 gap-3">
                    {(['csv', 'json', 'markdown'] as ExportFormat[]).map((fmt) => (
                      <button
                        key={fmt}
                        onClick={() => setFormat(fmt)}
                        className={`flex flex-col items-center gap-2 px-4 py-4 rounded-lg border-2 transition-all ${
                          format === fmt
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                            : 'border-gray-300 dark:border-gray-700 hover:border-gray-400'
                        }`}
                      >
                        <div className={format === fmt ? 'text-blue-600' : 'text-gray-600'}>
                          {formatIcons[fmt]}
                        </div>
                        <div className="text-center">
                          <div className="font-medium uppercase text-xs">{fmt}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    {formatDescriptions[format]}
                  </div>
                </div>

                {/* Export Options */}
                <div>
                  <label className="block text-sm font-medium mb-3">Include in Export</label>
                  <div className="space-y-3">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeMetadata}
                        onChange={(e) => setIncludeMetadata(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium">Full Metadata</div>
                        <div className="text-xs text-gray-500">ISBN, publisher, publication date, etc.</div>
                      </div>
                    </label>
                    
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeCollections}
                        onChange={(e) => setIncludeCollections(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium">Collections</div>
                        <div className="text-xs text-gray-500">Which collections each book belongs to</div>
                      </div>
                    </label>
                    
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeReadingProgress}
                        onChange={(e) => setIncludeReadingProgress(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium">Reading Progress</div>
                        <div className="text-xs text-gray-500">Current reading position and completion percentage</div>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Info Box */}
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <div className="text-sm">
                    <div className="font-medium mb-1">What's Exported:</div>
                    <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                      <li>• Book titles, authors, and tags</li>
                      <li>• File paths and formats</li>
                      <li>• Series information and ratings</li>
                      {includeMetadata && <li>• Publisher, ISBN, and publication dates</li>}
                      {includeCollections && <li>• Collection memberships</li>}
                      {includeReadingProgress && <li>• Reading progress and last read dates</li>}
                    </ul>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end gap-3 pt-4">
                  <Dialog.Close asChild>
                    <button className="px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                      Cancel
                    </button>
                  </Dialog.Close>
                  <button
                    onClick={handleExport}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
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
                <Loader2 className="w-16 h-16 text-blue-600 animate-spin mb-4" />
                <div className="text-lg font-medium">Exporting library...</div>
                <div className="text-sm text-gray-500 mt-1">Creating {format.toUpperCase()} file</div>
              </div>
            )}

            {/* Export Complete */}
            {status === 'completed' && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 pb-3 border-b border-gray-200 dark:border-gray-700">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                  <div>
                    <div className="text-lg font-medium">Export Complete</div>
                    <div className="text-sm text-gray-500">Your library has been exported successfully</div>
                  </div>
                </div>

                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                  <div className="text-xs text-gray-500 mb-1">Saved to:</div>
                  <div className="font-mono text-sm break-all">{exportedPath}</div>
                </div>

                <div className="flex justify-end pt-4">
                  <button
                    onClick={handleClose}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}

            {/* Error State */}
            {status === 'error' && (
              <div className="flex flex-col items-center justify-center py-12">
                <AlertCircle className="w-16 h-16 text-red-600 mb-4" />
                <div className="text-lg font-medium">Export Failed</div>
                <div className="text-sm text-gray-500 mt-1">An error occurred during export</div>
                <button
                  onClick={() => setStatus('idle')}
                  className="mt-4 px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
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
