import { invoke } from '@tauri-apps/api/core';
import { downloadLibgenEpub } from './downloads';
import { showImportOutcomeFeedback } from '@/store/onlineDownloadStore';

export interface ImportResult {
  success: string[];
  failed: [string, string][];
  duplicates: string[];
  previouslyDeleted: string[];
}

export async function downloadAndImportLibgen(
  epubUrl: string, 
  titleHint: string,
  mirrors: string[] = [],
  formatExt: string = 'epub'
): Promise<ImportResult> {
  const urlPayload = JSON.stringify([epubUrl, ...mirrors]);
  
  const tempPath = await downloadLibgenEpub(urlPayload, titleHint, formatExt);

  const result = await invoke<ImportResult>('import_books', {
    paths: [tempPath],
  });
  showImportOutcomeFeedback(result, titleHint);
  return result;
}