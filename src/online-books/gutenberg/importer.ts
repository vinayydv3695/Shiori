import { invoke } from '@tauri-apps/api/core';
import { downloadGutenbergEpub } from './downloads';
import { showImportOutcomeFeedback } from '@/store/onlineDownloadStore';

export interface ImportResult {
  success: string[];
  failed: [string, string][];
  duplicates: string[];
  previouslyDeleted: string[];
}

export async function downloadAndImportGutenberg(epubUrl: string, titleHint: string): Promise<ImportResult> {
  // Download to temp dir
  const tempPath = await downloadGutenbergEpub(epubUrl, titleHint);

  // Import to library as a book, not manga
  const result = await invoke<ImportResult>('import_books', {
    paths: [tempPath],
  });
  showImportOutcomeFeedback(result, titleHint);
  return result;
}