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
      console.error('Failed to copy error:', err);
    }
  };

  return (
    <div className="flex items-center justify-center h-full bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-2xl w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
        {/* Error Icon & Title */}
        <div className="flex items-start gap-4 mb-6">
          <div className="flex-shrink-0">
            <XCircle className="w-12 h-12 text-red-500" />
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              {error.title}
            </h2>
            <p className="text-gray-700 dark:text-gray-300 text-lg">
              {error.message}
            </p>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              <X className="w-6 h-6" />
            </button>
          )}
        </div>

        {/* Recovery Suggestions */}
        {error.suggestions && error.suggestions.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
              What you can try:
            </h3>
            <ul className="space-y-2">
              {error.suggestions.map((suggestion, index) => (
                <li
                  key={index}
                  className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400"
                >
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 flex items-center justify-center text-xs font-medium mt-0.5">
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
          <details className="mb-6 bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
            <summary className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
              Technical Details
            </summary>
            <pre className="mt-3 text-xs text-gray-600 dark:text-gray-400 overflow-x-auto whitespace-pre-wrap">
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
