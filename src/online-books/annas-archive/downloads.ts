import { invoke } from '@tauri-apps/api/core';

export async function downloadAnnasArchiveBook(contentId: string, titleHint?: string): Promise<string> {
  return invoke('annas_archive_download', { contentId, titleHint });
}
