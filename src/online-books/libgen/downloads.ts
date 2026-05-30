import { invoke } from '@tauri-apps/api/core';

export async function downloadLibgenEpub(epubUrl: string, titleHint: string): Promise<string> {
  return invoke('download_libgen_epub', {
    url: epubUrl,
    titleHint: titleHint,
  });
}
