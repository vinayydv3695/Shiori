import { describe, it, expect } from 'vitest';
import { toastForIngestResult } from './openedFiles';
import type { IngestResult } from './tauri';

const importedBase: IngestResult = { status: 'imported', path: '/tmp/book.epub' };

describe('toastForIngestResult', () => {
  it('imported → success toast, preferring title over path', () => {
    expect(toastForIngestResult({ ...importedBase, title: 'The Great Gatsby' })).toEqual({
      title: 'Imported The Great Gatsby',
      variant: 'success',
    });
  });

  it('imported without title → falls back to the path', () => {
    expect(toastForIngestResult(importedBase)).toEqual({
      title: 'Imported /tmp/book.epub',
      variant: 'success',
    });
  });

  it('duplicate → neutral info toast', () => {
    expect(toastForIngestResult({ ...importedBase, status: 'duplicate' })).toEqual({
      title: 'Already in library',
      variant: 'info',
    });
  });

  it('previously_deleted → null (dialog path, no toast)', () => {
    expect(toastForIngestResult({ ...importedBase, status: 'previously_deleted' })).toBeNull();
  });

  it('unsupported → warning toast', () => {
    expect(toastForIngestResult({ ...importedBase, status: 'unsupported' })).toEqual({
      title: 'Unsupported format',
      variant: 'warning',
    });
  });
});
