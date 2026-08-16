import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { api, type AnnotationExportData } from '@/lib/tauri';
import { useToastStore } from '@/store/toastStore';
import { 
  X, FileText, Code2, AlignLeft, Copy, Download, 
  Check, FileDown, Loader2, Layers, BookOpen 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import * as Dialog from '@radix-ui/react-dialog';

interface AnnotationExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookId?: number;
}

const FORMAT_OPTIONS = [
  {
    id: 'markdown',
    label: 'Markdown',
    extension: '.md',
    icon: FileText,
    description: 'Formatted for Obsidian, Notion & Bear',
  },
  {
    id: 'json',
    label: 'JSON',
    extension: '.json',
    icon: Code2,
    description: 'Raw structured data for backups & tools',
  },
  {
    id: 'text',
    label: 'Plain Text',
    extension: '.txt',
    icon: AlignLeft,
    description: 'Clean readable text without markdown tags',
  },
];

function cleanExportContent(content: string, format: string): string {
  if (format === 'json') return content;
  // If JSON vocabulary definitions are embedded in raw markdown notes, format them cleanly
  return content.replace(/\*\*Note:\*\*\s*(\{[^}]+\})/g, (match, jsonStr) => {
    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed.type === 'define' && parsed.data) {
        const d = parsed.data;
        const phon = d.phonetic ? ` (${d.phonetic})` : '';
        const def = d.meanings?.[0]?.definitions?.[0]?.definition || d.definition || '';
        return `**Definition:** *${d.word}*${phon} — ${def}`;
      }
      if (parsed.type === 'translate' && parsed.data) {
        const d = parsed.data;
        return `**Translation:** *${d.original}* → *${d.translated}*`;
      }
    } catch {
      // Keep original if not JSON
    }
    return match;
  });
}

export function AnnotationExportDialog({ open, onOpenChange, bookId }: AnnotationExportDialogProps) {
  const [format, setFormat] = useState('markdown');
  const [exportData, setExportData] = useState<AnnotationExportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

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

  const cleanedContent = useMemo(() => {
    if (!exportData?.content) return '';
    return cleanExportContent(exportData.content, format);
  }, [exportData, format]);

  const handleCopy = async () => {
    if (!cleanedContent) return;
    try {
      await navigator.clipboard.writeText(cleanedContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      useToastStore.getState().addToast({
        title: 'Copied to clipboard',
        description: `Successfully copied ${exportData?.annotation_count || ''} annotations.`,
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
    if (!cleanedContent) return;
    try {
      const defaultExt = format === 'markdown' ? 'md' : format === 'json' ? 'json' : 'txt';
      const defaultName = `shiori_annotations_${new Date().toISOString().slice(0, 10)}.${defaultExt}`;
      const filePath = await api.saveFileDialog(defaultName);
      
      if (filePath) {
        await api.writeTextToFile(filePath, cleanedContent);
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

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] transition-opacity" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-2xl bg-card border border-border rounded-3xl shadow-2xl z-[210] flex flex-col max-h-[88vh] overflow-hidden focus:outline-none">
          
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-border/50 bg-card/60 backdrop-blur-xl">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-xs">
                <FileDown size={20} />
              </div>
              <div>
                <Dialog.Title className="text-lg font-extrabold text-foreground tracking-tight">
                  Export Annotations
                </Dialog.Title>
                <Dialog.Description className="text-xs text-muted-foreground mt-0.5">
                  {bookId ? 'Exporting highlights & notes for selected book' : 'Exporting all annotations in your library'}
                </Dialog.Description>
              </div>
            </div>
            
            <button
              onClick={() => onOpenChange(false)}
              className="p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              title="Close"
            >
              <X size={18} />
            </button>
          </div>

          {/* Body Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            
            {/* Format Selector Cards */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Select Export Format
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {FORMAT_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const isSelected = format === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setFormat(opt.id)}
                      className={cn(
                        "flex flex-col items-start p-3.5 rounded-2xl border text-left transition-all cursor-pointer relative",
                        isSelected
                          ? "bg-primary/10 border-primary/40 shadow-xs ring-1 ring-primary/30 text-foreground"
                          : "bg-muted/30 hover:bg-muted/60 border-border/40 text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <div className="flex items-center justify-between w-full mb-1.5">
                        <div className="flex items-center gap-2">
                          <Icon size={16} className={isSelected ? 'text-primary' : 'text-muted-foreground'} />
                          <span className="font-bold text-xs text-foreground">{opt.label}</span>
                        </div>
                        <span className={cn(
                          "text-[10px] font-extrabold px-1.5 py-0.5 rounded",
                          isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                        )}>
                          {opt.extension}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground line-clamp-2 leading-snug">
                        {opt.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Live Preview Container */}
            <div className="space-y-2 flex-1 flex flex-col min-h-[260px]">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Live Preview
                </label>
                {exportData && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-muted border border-border/40 text-muted-foreground">
                    {exportData.annotation_count} {exportData.annotation_count === 1 ? 'annotation' : 'annotations'}
                  </span>
                )}
              </div>
              
              <div className="relative flex-1 rounded-2xl border border-border/60 bg-muted/40 overflow-hidden min-h-[220px] flex flex-col">
                {/* Floating Quick Copy inside preview */}
                <div className="absolute top-2.5 right-2.5 z-10">
                  <button
                    type="button"
                    onClick={handleCopy}
                    disabled={!cleanedContent || loading}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-card/90 hover:bg-card border border-border/60 text-xs font-bold text-foreground backdrop-blur-md shadow-xs transition-all cursor-pointer disabled:opacity-50"
                  >
                    {copied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                    <span>{copied ? 'Copied!' : 'Copy Preview'}</span>
                  </button>
                </div>

                <div className="flex-1 p-4 overflow-y-auto font-mono text-xs text-foreground/90 leading-relaxed no-scrollbar select-text">
                  {loading ? (
                    <div className="flex flex-col items-center justify-center h-48 gap-2.5 text-muted-foreground">
                      <Loader2 size={24} className="animate-spin text-primary" />
                      <span className="text-xs">Generating export preview...</span>
                    </div>
                  ) : cleanedContent ? (
                    <pre className="whitespace-pre-wrap break-words pr-20 font-mono">
                      {cleanedContent.length > 2000
                        ? cleanedContent.slice(0, 2000) + '\n\n... (preview truncated, full content saved on export)'
                        : cleanedContent}
                    </pre>
                  ) : (
                    <div className="flex items-center justify-center h-48 text-xs text-muted-foreground">
                      No annotations available to export
                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-border/50 bg-card/60 backdrop-blur-xl">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="rounded-xl font-bold text-xs cursor-pointer text-muted-foreground hover:text-foreground"
            >
              Cancel
            </Button>
            
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                disabled={!cleanedContent || loading}
                className="rounded-xl font-bold text-xs border-border/60 gap-1.5 cursor-pointer"
              >
                <Copy size={13} />
                <span>Copy to Clipboard</span>
              </Button>
              
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!cleanedContent || loading}
                className="rounded-xl font-bold text-xs bg-primary text-primary-foreground shadow-sm shadow-primary/20 hover:bg-primary/90 gap-1.5 cursor-pointer"
              >
                <Download size={13} />
                <span>Save to File</span>
              </Button>
            </div>
          </div>

        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
