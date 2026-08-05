import type { ImportResult } from './tauri';

/** An all-empty ImportResult, including the previously-deleted bucket. */
export function emptyImportResult(): ImportResult {
  return { success: [], failed: [], duplicates: [], previouslyDeleted: [] };
}

/**
 * Merge the buckets of `incoming` into `target` (mutating and returning `target`).
 * Used to combine manga + book import calls and to fold tombstone-retry results
 * into an already-displayed import result.
 */
export function mergeImportResults(target: ImportResult, incoming: ImportResult): ImportResult {
  target.success.push(...incoming.success);
  target.failed.push(...incoming.failed);
  target.duplicates.push(...incoming.duplicates);
  target.previouslyDeleted.push(...incoming.previouslyDeleted);
  return target;
}
