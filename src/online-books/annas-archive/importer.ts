import { invoke } from '@tauri-apps/api/core';
import { downloadAnnasArchiveBook } from './downloads';

export interface ImportResult {
  success: string[];
  failed: [string, string][];
  duplicates: string[];
}

export async function downloadAndImportAnnas(
  contentId: string,
  titleHint?: string
): Promise<ImportResult> {
  const tempPath = await downloadAnnasArchiveBook(contentId, titleHint);

  return invoke<ImportResult>('import_books', {
    paths: [tempPath],
  });
}
