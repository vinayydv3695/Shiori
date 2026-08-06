import { describe, it, expect } from 'vitest';
import { emptyImportResult, mergeImportResults } from './importResults';
import type { ImportResult } from './tauri';

describe('emptyImportResult', () => {
  it('returns all-empty buckets including previouslyDeleted', () => {
    expect(emptyImportResult()).toEqual({
      success: [],
      failed: [],
      duplicates: [],
      previouslyDeleted: [],
    });
  });
});

describe('mergeImportResults', () => {
  it('merges every bucket from incoming into target', () => {
    const target = emptyImportResult();
    const incoming: ImportResult = {
      success: ['/a.epub'],
      failed: [['/b.epub', 'boom']],
      duplicates: ['/c.epub'],
      previouslyDeleted: ['/d.epub'],
    };

    const merged = mergeImportResults(target, incoming);

    expect(merged).toBe(target);
    expect(merged.success).toEqual(['/a.epub']);
    expect(merged.failed).toEqual([['/b.epub', 'boom']]);
    expect(merged.duplicates).toEqual(['/c.epub']);
    expect(merged.previouslyDeleted).toEqual(['/d.epub']);
  });

  it('accumulates across multiple merges', () => {
    const target = emptyImportResult();
    mergeImportResults(target, {
      success: ['/a.epub'],
      failed: [],
      duplicates: [],
      previouslyDeleted: [],
    });
    mergeImportResults(target, {
      success: ['/b.epub'],
      failed: [['/c.epub', 'nope']],
      duplicates: ['/d.epub'],
      previouslyDeleted: ['/e.epub'],
    });

    expect(target.success).toEqual(['/a.epub', '/b.epub']);
    expect(target.failed).toEqual([['/c.epub', 'nope']]);
    expect(target.duplicates).toEqual(['/d.epub']);
    expect(target.previouslyDeleted).toEqual(['/e.epub']);
  });

  it('does not throw when incoming is missing previouslyDeleted (partial result)', () => {
    const target = emptyImportResult();

    expect(() =>
      mergeImportResults(target, { success: ['/a.epub'] } as ImportResult)
    ).not.toThrow();

    expect(target.success).toEqual(['/a.epub']);
    expect(target.previouslyDeleted).toEqual([]);
  });

  it('does not throw when incoming is missing failed (partial result)', () => {
    const target = emptyImportResult();

    expect(() =>
      mergeImportResults(target, {
        success: ['/a.epub'],
        duplicates: ['/c.epub'],
        previouslyDeleted: ['/d.epub'],
      } as ImportResult)
    ).not.toThrow();

    expect(target.success).toEqual(['/a.epub']);
    expect(target.failed).toEqual([]);
    expect(target.duplicates).toEqual(['/c.epub']);
    expect(target.previouslyDeleted).toEqual(['/d.epub']);
  });

  it('still merges remaining buckets when only some are present', () => {
    const target = emptyImportResult();
    mergeImportResults(target, {
      failed: [['/b.epub', 'boom']],
    } as ImportResult);

    expect(target.failed).toEqual([['/b.epub', 'boom']]);
    expect(target.success).toEqual([]);
    expect(target.duplicates).toEqual([]);
    expect(target.previouslyDeleted).toEqual([]);
  });
});
