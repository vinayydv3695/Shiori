import { logger } from '@/lib/logger';
import React from 'react';
import { XCircle, RefreshCw, Copy, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ErrorDetails {
  title: string;
  message: string;
  suggestions?: string[];
  technicalDetails?: string;
}

interface ReaderErrorBoundaryProps {
  error: ErrorDetails | null;
  onRetry?: () => void;
  onClose?: () => void;
}

export function ReaderErrorBoundary({ error, onRetry, onClose }: ReaderErrorBoundaryProps) {
  const [copied, setCopied] = React.useState(false);

  if (!error) return null;

  const handleCopyError = async () => {
    const errorText = `
Error: ${error.title}
Message: ${error.message}
${error.technicalDetails ? `\nTechnical Details:\n${error.technicalDetails}` : ''}
`.trim();

    try {
      await navigator.clipboard.writeText(errorText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      logger.error('Failed to copy error:', err);
    }
  };

  return (
    <div className="flex items-center justify-center h-full p-8" style={{ backgroundColor: 'var(--reader-bg)' }}>
      <div className="max-w-2xl w-full rounded-lg shadow-lg p-8" style={{ backgroundColor: 'hsl(var(--card))', color: 'hsl(var(--card-foreground))' }}>
        {/* Error Icon & Title */}
        <div className="flex items-start gap-4 mb-6">
          <div className="flex-shrink-0">
            <XCircle className="w-12 h-12" style={{ color: 'var(--color-error)' }} />
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--reader-fg)' }}>
              {error.title}
            </h2>
            <p className="text-lg" style={{ color: 'var(--text-secondary)' }}>
              {error.message}
            </p>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="flex-shrink-0" style={{ color: 'var(--text-tertiary)' }}
            >
              <X className="w-6 h-6" />
            </button>
          )}
        </div>

        {/* Recovery Suggestions */}
        {error.suggestions && error.suggestions.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--reader-fg)' }}>
              What you can try:
            </h3>
            <ul className="space-y-2">
              {error.suggestions.map((suggestion, index) => (
                <li
                  key={index}
                  className="flex items-start gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}
                >
                  <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-medium mt-0.5" style={{ backgroundColor: 'hsl(var(--accent))', color: 'var(--interactive-accent)' }}>
                    {index + 1}
                  </span>
                  <span>{suggestion}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Technical Details (Collapsible) */}
        {error.technicalDetails && (
          <details className="mb-6 rounded-lg p-4" style={{ backgroundColor: 'hsl(var(--surface-1))' }}>
            <summary className="text-sm font-medium cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
              Technical Details
            </summary>
            <pre className="mt-3 text-xs overflow-x-auto whitespace-pre-wrap" style={{ color: 'var(--text-tertiary)' }}>
              {error.technicalDetails}
            </pre>
          </details>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          {onRetry && (
            <Button
              onClick={onRetry}
              className="flex items-center gap-2"
              variant="default"
            >
              <RefreshCw className="w-4 h-4" />
              Try Again
            </Button>
          )}
          
          <Button
            onClick={handleCopyError}
            variant="outline"
            className="flex items-center gap-2"
          >
            <Copy className="w-4 h-4" />
            {copied ? 'Copied!' : 'Copy Error'}
          </Button>

          {onClose && (
            <Button
              onClick={onClose}
              variant="outline"
              className="ml-auto"
            >
              Close Reader
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// Helper function to parse errors from Tauri
// eslint-disable-next-line react-refresh/only-export-components
export function parseReaderError(error: unknown): ErrorDetails {
  if (typeof error === 'string') {
    // Parse common error patterns
    if (error.includes('File not found')) {
      return {
        title: 'Book File Not Found',
        message: 'The book file could not be found. It may have been moved or deleted.',
        suggestions: [
          'Check if the file still exists at its original location',
          'Try re-importing the book',
          'Remove this book from the library and add it again',
        ],
        technicalDetails: error,
      };
    }

    if (error.includes('Corrupted EPUB')) {
      return {
        title: 'Corrupted EPUB File',
        message: 'This EPUB file appears to be corrupted or incomplete.',
        suggestions: [
          'Try re-downloading the book from the original source',
          'Check if the file opens in other reader applications',
          'The file may be DRM-protected or incompatible',
        ],
        technicalDetails: error,
      };
    }

    if (error.includes('Corrupted PDF')) {
      return {
        title: 'Corrupted PDF File',
        message: 'This PDF file appears to be corrupted or incomplete.',
        suggestions: [
          'Try re-downloading the book from the original source',
          'Check if the file opens in other PDF readers',
          'The file may be password-protected or damaged',
        ],
        technicalDetails: error,
      };
    }

    if (error.includes('Unsupported format')) {
      const formatMatch = error.match(/format: (\w+)/);
      const format = formatMatch ? formatMatch[1] : 'unknown';
      return {
        title: 'Unsupported Format',
        message: `The '${format}' format is not currently supported.`,
        suggestions: [
          'Convert the file to EPUB or PDF format',
          'Check for app updates that may add support for this format',
        ],
        technicalDetails: error,
      };
    }

    if (error.includes('File size exceeds')) {
      return {
        title: 'File Too Large',
        message: 'This file exceeds the maximum size limit.',
        suggestions: [
          'Try splitting the book into smaller volumes',
          'Compress images within the book file',
        ],
        technicalDetails: error,
      };
    }

    // Generic error
    return {
      title: 'Failed to Open Book',
      message: error,
      suggestions: [
        'Try restarting the application',
        'Check file permissions',
        'Re-import the book',
      ],
      technicalDetails: error,
    };
  }

  // Unknown error type
  return {
    title: 'Unknown Error',
    message: 'An unexpected error occurred while opening the book.',
    suggestions: [
      'Try restarting the application',
      'Check the console for more details',
    ],
    technicalDetails: JSON.stringify(error, null, 2),
  };
}
