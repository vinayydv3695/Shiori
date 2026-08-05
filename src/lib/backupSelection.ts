import type {
  BackupCategory,
  BackupSelection,
  ConflictPolicy,
  RestoreSelection,
} from './tauri'

/**
 * All backup categories in display order. The `books` category maps to the
 * legacy `include_books` flag; `preferences` is backend preferences while
 * `frontendSettings` (localStorage) is a separate boolean on BackupSelection.
 */
export const ALL_BACKUP_CATEGORIES: BackupCategory[] = [
  'library',
  'annotations',
  'progress',
  'preferences',
  'sources',
  'rss',
  'covers',
  'books',
]

export const BACKUP_CATEGORY_LABELS: Record<BackupCategory, string> = {
  library: 'Library data',
  annotations: 'Annotations',
  progress: 'Progress',
  preferences: 'Preferences',
  sources: 'Sources',
  rss: 'RSS',
  covers: 'Covers',
  books: 'Book files',
}

export const BACKUP_CATEGORY_DESCRIPTIONS: Partial<Record<BackupCategory, string>> = {
  library: 'Books, shelves and library metadata',
  annotations: 'Highlights, notes and bookmarks',
  progress: 'Reading progress and history',
  preferences: 'Backend user preferences',
  sources: 'Online source configuration',
  rss: 'RSS feeds and subscriptions',
  covers: 'Downloaded cover images',
  books: 'The imported book files themselves (increases backup size)',
}

export const CONFLICT_POLICY_LABELS: Record<ConflictPolicy, string> = {
  skip: 'Skip (keep existing)',
  overwrite: 'Overwrite (replace existing)',
  keepBoth: 'Keep both (duplicate)',
}

export const DEFAULT_CONFLICT_POLICY: ConflictPolicy = 'skip'

/** True when every category is selected (i.e. a full backup/restore). */
export function isFullSelection(categories: BackupCategory[]): boolean {
  return (
    categories.length === ALL_BACKUP_CATEGORIES.length &&
    ALL_BACKUP_CATEGORIES.every((cat) => categories.includes(cat))
  )
}

/** All categories selected — the default for both backup and restore. */
export function defaultBackupCategories(): BackupCategory[] {
  return [...ALL_BACKUP_CATEGORIES]
}

/** Build the create-backup selection object sent to the backend. */
export function buildBackupSelection(
  categories: BackupCategory[],
  includeCredentials: boolean,
  frontendSettings: boolean,
): BackupSelection {
  return {
    categories,
    includeCredentials,
    includeBooks: categories.includes('books'),
    frontendSettings,
  }
}

/**
 * Build the restore selection object sent to the backend.
 *
 * Mirrors create's `is_everything` semantics: an empty `categories` array
 * means "everything". When every category is checked we therefore send an
 * empty array — a full-snapshot archive cannot be restored from a non-empty
 * subset list, and all-8-checked is a full restore anyway.
 */
export function buildRestoreSelection(
  categories: BackupCategory[],
  conflictPolicy: ConflictPolicy,
  includeCredentials: boolean,
): RestoreSelection {
  return {
    categories: isFullSelection(categories) ? [] : categories,
    conflictPolicy,
    includeCredentials,
  }
}
