import type { SAFDocumentInfo } from '@/lib/tauri';
import { api } from '@/lib/tauri';

export interface CopyOutcome {
  localPaths: string[];
  failures: { name: string; error: string }[];
}

/** Convert an unknown thrown value into a human-readable message string. */
function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return String(error);
}

/**
 * Copy SAF documents to local storage, retrying each once after 250ms
 * (transient provider hiccups are common on Android). Returns paths that
 * succeeded and a per-file failure list — nothing is silently dropped.
 */
export async function copyDocumentsWithRetry(
  files: SAFDocumentInfo[],
  onProgress?: (name: string, index: number, total: number) => void,
): Promise<CopyOutcome> {
  const localPaths: string[] = [];
  const failures: { name: string; error: string }[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    let lastError: unknown;
    let copied = false;

    // Up to two attempts per file; wait 250ms before the retry so transient
    // provider hiccups (common on Android) settle down.
    for (let attempt = 0; attempt < 2 && !copied; attempt++) {
      onProgress?.(file.name, i, files.length);
      if (attempt === 1) {
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      try {
        const { path } = await api.copyDocument(file.uri, file.name);
        localPaths.push(path);
        copied = true;
      } catch (error) {
        lastError = error;
      }
    }

    if (!copied) {
      failures.push({ name: file.name, error: describeError(lastError) });
    }
  }

  return { localPaths, failures };
}