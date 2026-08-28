import { invoke } from '@tauri-apps/api/core';
import { downloadAnnasArchiveBook } from './downloads';
import { showImportOutcomeFeedback } from '@/store/onlineDownloadStore';

export interface ImportResult {
  success: string[];
  failed: [string, string][];
  duplicates: string[];
  previouslyDeleted: string[];
}

export async function downloadAndImportAnnas(
  contentId: string,
  titleHint?: string
): Promise<ImportResult> {
  const tempPath = await downloadAnnasArchiveBook(contentId, titleHint);

  const result = await invoke<ImportResult>('import_books', {
    paths: [tempPath],
  });
  showImportOutcomeFeedback(result, titleHint);
  return result;
}