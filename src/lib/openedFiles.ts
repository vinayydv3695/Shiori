import type { IngestResult } from './tauri';

export interface OpenedFileToast {
  title: string;
  variant: 'success' | 'error' | 'info' | 'warning';
}

/**
 * Map a single "Open with Shiori" ingest result to the toast that should be
 * shown. `previously_deleted` maps to `null` — that path opens the tombstone
 * confirm dialog instead of a toast.
 */
export function toastForIngestResult(result: IngestResult): OpenedFileToast | null {
  switch (result.status) {
    case 'imported':
      return { title: `Imported ${result.title ?? result.path}`, variant: 'success' };
    case 'duplicate':
      return { title: 'Already in library', variant: 'info' };
    case 'previously_deleted':
      return null;
    case 'unsupported':
      return { title: 'Unsupported format', variant: 'warning' };
  }
}
