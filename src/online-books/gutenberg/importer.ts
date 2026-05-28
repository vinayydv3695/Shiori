import { invoke } from '@tauri-apps/api/core';
import { downloadGutenbergEpub } from './downloads';

export interface ImportResult {
  success: string[];
  failed: [string, string][];
  duplicates: string[];
}

export async function downloadAndImportGutenberg(epubUrl: string, titleHint: string): Promise<ImportResult> {
  // Download to temp dir
  const tempPath = await downloadGutenbergEpub(epubUrl, titleHint);

  // Import to library as a book, not manga
  return invoke<ImportResult>('import_books', {
    paths: [tempPath],
  });
}
