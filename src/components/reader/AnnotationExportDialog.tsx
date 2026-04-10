import React, { useState, useEffect, useCallback } from 'react';
import { api, AnnotationExportData } from '@/lib/tauri';
import { useToastStore } from '@/store/toastStore';
import { X } from '@/components/icons';

interface AnnotationExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookId?: number;
}

export function AnnotationExportDialog({ open, onOpenChange, bookId }: AnnotationExportDialogProps) {
  const [format, setFormat] = useState('markdown');
  const [exportData, setExportData] = useState<AnnotationExportData | null>(null);
  const [loading, setLoading] = useState(false);

  const loadPreview = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.exportAnnotations({
        format,
        book_id: bookId,
        include_book_info: true,
      });
      setExportData(data);
    } catch (err) {
      useToastStore.getState().addToast({
        title: 'Failed to generate export preview',
        description: String(err),
        variant: 'error',
      });
    } finally {
      setLoading(false);
    }
  }, [format, bookId]);

  useEffect(() => {
    if (open) {
      loadPreview();
    }
  }, [open, loadPreview]);

  const handleCopy = async () => {
    if (!exportData) return;
    try {
      await navigator.clipboard.writeText(exportData.content);
      useToastStore.getState().addToast({
        title: 'Copied to clipboard',
        variant: 'success',
        duration: 2000,
      });
    } catch (err) {
      useToastStore.getState().addToast({
        title: 'Failed to copy',
        description: String(err),
        variant: 'error',
      });
    }
  };

  const handleSave = async () => {
    if (!exportData) return;
    try {
      const defaultExt = format === 'markdown' ? 'md' : format === 'json' ? 'json' : 'txt';
      const defaultName = `annotations_export.${defaultExt}`;
      const filePath = await api.saveFileDialog(defaultName);
      
      if (filePath) {
        await api.writeTextToFile(filePath, exportData.content);
        useToastStore.getState().addToast({
          title: 'Annotations exported',
          description: `Saved to ${filePath}`,
          variant: 'success',
        });
        onOpenChange(false);
      }
    } catch (err) {
      useToastStore.getState().addToast({
        title: 'Failed to save',
        description: String(err),
        variant: 'error',
      });
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity" 
        onClick={() => onOpenChange(false)} 
      />
      <div className="relative rounded-lg shadow-xl w-full max-w-2xl flex flex-col max-h-[85vh] overflow-hidden" style={{ backgroundColor: 'hsl(var(--card))', color: 'hsl(var(--card-foreground))', borderWidth: 1, borderColor: 'hsl(var(--border))' }}>
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottomWidth: 1, borderColor: 'hsl(var(--border))' }}>
          <div>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--reader-fg)' }}>
              Export Annotations
            </h2>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {bookId ? 'Exporting annotations for this book' : 'Exporting all annotations in library'}
            </p>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="p-2 rounded-full transition-colors" style={{ color: 'var(--text-tertiary)' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Format Selection */}
          <div className="space-y-3">
            <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Format</label>
            <div className="flex gap-4">
              {['markdown', 'json', 'text'].map((f) => (
                <label key={f} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="format"
                    value={f}
                    checked={format === f}
                    onChange={(e) => setFormat(e.target.value)}
                    className="text-accent focus:ring-accent w-4 h-4"
                  />
                  <span className="capitalize" style={{ color: 'var(--text-secondary)' }}>{f}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="space-y-3 flex-1 flex flex-col min-h-[300px]">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                Preview
              </label>
              {exportData && (
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  {exportData.annotation_count} annotation(s)
                </span>
              )}
            </div>
            
            <div className="flex-1 rounded-md p-4 overflow-y-auto relative font-mono text-sm" style={{ backgroundColor: 'hsl(var(--surface-1))', borderWidth: 1, borderColor: 'hsl(var(--border))', color: 'var(--text-secondary)' }}>
              {loading ? (
                <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: 'var(--overlay-bg)' }}>
                  <span className="animate-pulse">Loading preview...</span>
                </div>
              ) : exportData ? (
                <pre className="whitespace-pre-wrap break-words">
                  {exportData.content.length > 500
                    ? exportData.content.slice(0, 500) + '\n\n... (truncated)'
                    : exportData.content}
                </pre>
              ) : (
                <div className="text-center mt-10" style={{ color: 'var(--text-tertiary)' }}>
                  No preview available
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4" style={{ borderTopWidth: 1, borderColor: 'hsl(var(--border))', backgroundColor: 'hsl(var(--surface-1))' }}>
          <button
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 text-sm font-medium rounded-md transition-colors" style={{ color: 'var(--btn-secondary-fg)' }}
          >
            Cancel
          </button>
          <button
            onClick={handleCopy}
            disabled={!exportData || loading}
            className="px-4 py-2 text-sm font-medium rounded-md transition-colors disabled:opacity-50" style={{ borderWidth: 1, borderColor: 'hsl(var(--border))', color: 'var(--btn-secondary-fg)' }}
          >
            Copy to Clipboard
          </button>
          <button
            onClick={handleSave}
            disabled={!exportData || loading}
            className="px-4 py-2 text-sm font-medium rounded-md transition-colors disabled:opacity-50" style={{ backgroundColor: 'var(--btn-primary-bg)', color: 'var(--btn-primary-fg)' }}
          >
            Save to File
          </button>
        </div>

      </div>
    </div>
  );
}
