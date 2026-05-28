import { invoke } from '@tauri-apps/api/core';

export async function downloadGutenbergEpub(epubUrl: string, titleHint: string): Promise<string> {
  return invoke('download_gutenberg_epub', {
    url: epubUrl,
    titleHint: titleHint,
  });
}
