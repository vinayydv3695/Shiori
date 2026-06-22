import { invoke } from '@tauri-apps/api/core';
import { downloadLibgenEpub } from './downloads';

export interface ImportResult {
  success: string[];
  failed: [string, string][];
  duplicates: string[];
}

export async function downloadAndImportLibgen(
  epubUrl: string, 
  titleHint: string,
  mirrors: string[] = [],
  formatExt: string = 'epub'
): Promise<ImportResult> {
  const urlPayload = JSON.stringify([epubUrl, ...mirrors]);
  
  const tempPath = await downloadLibgenEpub(urlPayload, titleHint, formatExt);

  return invoke<ImportResult>('import_books', {
    paths: [tempPath],
  });
}
