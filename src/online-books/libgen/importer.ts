import { invoke } from '@tauri-apps/api/core';
import { downloadLibgenEpub } from './downloads';

export interface ImportResult {
  success: string[];
  failed: [string, string][];
  duplicates: string[];
}

export async function downloadAndImportLibgen(epubUrl: string, titleHint: string): Promise<ImportResult> {
  // Download to temp dir
  const tempPath = await downloadLibgenEpub(epubUrl, titleHint);

  // Import to library as a book
  return invoke<ImportResult>('import_books', {
    paths: [tempPath],
  });
}
