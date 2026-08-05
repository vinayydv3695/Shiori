import { describe, it, expect } from 'vitest';
import {
  ALL_BACKUP_CATEGORIES,
  BACKUP_CATEGORY_LABELS,
  buildBackupSelection,
  buildRestoreSelection,
  defaultBackupCategories,
  isFullSelection,
} from './backupSelection';

describe('backup categories', () => {
  it('lists all 8 categories in display order', () => {
    expect(ALL_BACKUP_CATEGORIES).toEqual([
      'library',
      'annotations',
      'progress',
      'preferences',
      'sources',
      'rss',
      'covers',
      'books',
    ]);
  });

  it('has a label for every category', () => {
    for (const cat of ALL_BACKUP_CATEGORIES) {
      expect(BACKUP_CATEGORY_LABELS[cat]).toBeTruthy();
    }
  });

  it('default selection includes every category', () => {
    expect(defaultBackupCategories()).toEqual(ALL_BACKUP_CATEGORIES);
    // fresh array, not the shared constant
    expect(defaultBackupCategories()).not.toBe(ALL_BACKUP_CATEGORIES);
  });
});

describe('buildBackupSelection', () => {
  it('maps categories through and mirrors books category into includeBooks', () => {
    const sel = buildBackupSelection(['library', 'books'], true, false);
    expect(sel).toEqual({
      categories: ['library', 'books'],
      includeCredentials: true,
      includeBooks: true,
      frontendSettings: false,
    });
  });

  it('includeBooks is false when books category is not selected', () => {
    const sel = buildBackupSelection(['library', 'covers'], false, true);
    expect(sel.includeBooks).toBe(false);
    expect(sel.includeCredentials).toBe(false);
    expect(sel.frontendSettings).toBe(true);
  });
});

describe('buildRestoreSelection', () => {
  it('passes categories, policy and credentials through', () => {
    const sel = buildRestoreSelection(['annotations', 'progress'], 'keepBoth', true);
    expect(sel).toEqual({
      categories: ['annotations', 'progress'],
      conflictPolicy: 'keepBoth',
      includeCredentials: true,
    });
  });

  it('defaults to skip policy', () => {
    const sel = buildRestoreSelection([], 'skip', false);
    expect(sel.conflictPolicy).toBe('skip');
  });

  it('emits empty categories when all 8 are checked (full restore, mirrors is_everything)', () => {
    const sel = buildRestoreSelection([...ALL_BACKUP_CATEGORIES], 'overwrite', true);
    expect(sel.categories).toEqual([]);
    expect(sel.conflictPolicy).toBe('overwrite');
    expect(sel.includeCredentials).toBe(true);
  });

  it('emits exactly the checked categories when a strict subset is checked', () => {
    const seven = ALL_BACKUP_CATEGORIES.filter((c) => c !== 'books');
    expect(seven).toHaveLength(7);
    const sel = buildRestoreSelection(seven, 'skip', false);
    expect(sel.categories).toEqual(seven);
  });

  it('isFullSelection is false for a strict subset and true for all categories', () => {
    expect(isFullSelection(ALL_BACKUP_CATEGORIES.slice(0, 7))).toBe(false);
    expect(isFullSelection([...ALL_BACKUP_CATEGORIES])).toBe(true);
  });
});
