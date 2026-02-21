import React, { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, FileInput, FolderOpen, ArrowRight, AlertCircle } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { useConversionStore } from '../../store/conversionStore';
import { api } from '../../lib/tauri';
import { cn } from '../../lib/utils';

interface ConversionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookPath?: string;
  bookFormat?: string;
  bookId?: number;
}

const FORMAT_LABELS: Record<string, string> = {
  epub: 'EPUB',
  pdf: 'PDF',
  mobi: 'MOBI',
  azw3: 'AZW3',
  txt: 'TXT',
  html: 'HTML',
  docx: 'DOCX',
  fb2: 'FB2',
};

export const ConversionDialog: React.FC<ConversionDialogProps> = ({
  open: isOpen,
  onOpenChange,
  bookPath: initialBookPath,
  bookFormat: initialFormat,
  bookId,
}) => {
  const { submitConversion, supportedFormats, loadSupportedFormats, isLoading } =
    useConversionStore();

  const [bookPath, setBookPath] = useState(initialBookPath || '');
  const [detectedFormat, setDetectedFormat] = useState(initialFormat || '');
  const [outputFormat, setOutputFormat] = useState('epub');
  const [outputDir, setOutputDir] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // Load book details if bookId given
  useEffect(() => {
    if (!isOpen) return;
    const load = async () => {
      if (bookId && !initialBookPath) {
        try {
          const filePath = await api.getBookFilePath(bookId);
          const book = await api.getBook(bookId);
          setBookPath(filePath);
          const fmt = book.file_format.toLowerCase();
          setDetectedFormat(fmt);
          setOutputFormat(fmt === 'epub' ? 'pdf' : 'epub');
        } catch {
          setError('Failed to load book information');
        }
      }
    };
    load();
    if (supportedFormats.length === 0) loadSupportedFormats();
    setSubmitted(false);
    setError(null);
  }, [isOpen, bookId]);

  useEffect(() => {
    if (initialBookPath) setBookPath(initialBookPath);
    if (initialFormat) {
      setDetectedFormat(initialFormat);
      setOutputFormat(initialFormat === 'epub' ? 'pdf' : 'epub');
    }
  }, [initialBookPath, initialFormat]);

  const availableTargets = (): string[] => {
    if (!detectedFormat) return ['epub', 'pdf', 'txt'];
    const entry = supportedFormats.find(f => f.from === detectedFormat);
    return entry?.to ?? ['epub'];
  };

  const handleSelectFile = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          { name: 'eBooks', extensions: ['epub', 'pdf', 'mobi', 'azw3', 'txt', 'html', 'docx', 'fb2'] },
        ],
      });
      if (selected && typeof selected === 'string') {
        setBookPath(selected);
        const ext = selected.split('.').pop()?.toLowerCase() || '';
        setDetectedFormat(ext);
        const targets = supportedFormats.find(f => f.from === ext)?.to ?? ['epub'];
        setOutputFormat(targets[0] ?? 'epub');
      }
    } catch {
      setError('Failed to select file');
    }
  };

  const handleSelectOutputDir = async () => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (selected && typeof selected === 'string') setOutputDir(selected);
    } catch {
      setError('Failed to select directory');
    }
  };

  const handleSubmit = async () => {
    setError(null);
    if (!bookPath) { setError('Please select a book to convert'); return; }
    try {
      await submitConversion(bookPath, outputFormat, outputDir || undefined, bookId);
      setSubmitted(true);
      setTimeout(() => onOpenChange(false), 800);
    } catch (err) {
      setError(String(err));
    }
  };

  const targets = availableTargets();
  const fileName = bookPath ? bookPath.split('/').pop() : null;

  return (
    <Dialog.Root open={isOpen} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg bg-background border border-border rounded-xl shadow-2xl p-0 focus:outline-none"
          aria-describedby={undefined}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <Dialog.Title className="text-lg font-semibold text-foreground">
              Convert Book
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="px-6 py-5 space-y-5">
            {/* Source File */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Source File
              </label>
              <div className="flex gap-2">
                <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-muted text-sm truncate">
                  <FileInput className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span className="truncate text-foreground">
                    {fileName || <span className="text-muted-foreground">No file selected...</span>}
                  </span>
                </div>
                <button
                  onClick={handleSelectFile}
                  className="px-3 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-accent transition-colors flex items-center gap-1.5"
                >
                  Browse
                </button>
              </div>
              {detectedFormat && (
                <p className="text-xs text-muted-foreground">
                  Detected format: <span className="font-medium text-foreground">{FORMAT_LABELS[detectedFormat] ?? detectedFormat.toUpperCase()}</span>
                </p>
              )}
            </div>

            {/* Target Format */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Convert To
              </label>
              <div className="flex flex-wrap gap-2">
                {targets.map(fmt => (
                  <button
                    key={fmt}
                    onClick={() => setOutputFormat(fmt)}
                    className={cn(
                      'px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all',
                      outputFormat === fmt
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                    )}
                  >
                    {FORMAT_LABELS[fmt] ?? fmt.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Output Directory */}
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Output Directory <span className="font-normal normal-case">(optional — defaults to same folder)</span>
              </label>
              <div className="flex gap-2">
                <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-muted text-sm truncate">
                  <FolderOpen className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span className="truncate text-foreground">
                    {outputDir || <span className="text-muted-foreground">Same as source file</span>}
                  </span>
                </div>
                <button
                  onClick={handleSelectOutputDir}
                  className="px-3 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-accent transition-colors"
                >
                  Browse
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
                <AlertCircle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            {/* Success state */}
            {submitted && (
              <p className="text-sm text-center text-muted-foreground">
                Job queued — watch the conversion panel for progress.
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="flex gap-3 px-6 py-4 border-t border-border">
            <Dialog.Close asChild>
              <button className="flex-1 px-4 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-accent transition-colors">
                Cancel
              </button>
            </Dialog.Close>
            <button
              onClick={handleSubmit}
              disabled={isLoading || !bookPath || submitted}
              className="flex-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <span>Starting…</span>
              ) : (
                <>
                  <span>Convert</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
