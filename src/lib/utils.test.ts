import { describe, it, expect } from 'vitest';
import { pageCountLabel } from './utils';

describe('pageCountLabel', () => {
  it('returns "N pages" for a positive count', () => {
    expect(pageCountLabel({ page_count: 12, file_format: 'epub' })).toBe('12 pages');
    expect(pageCountLabel({ page_count: 300, file_format: 'pdf' })).toBe('300 pages');
  });

  it('returns null for missing/zero page_count (MOBI reports None)', () => {
    expect(pageCountLabel({ page_count: 0, file_format: 'mobi' })).toBeNull();
    expect(pageCountLabel({ page_count: null, file_format: 'mobi' })).toBeNull();
    expect(pageCountLabel({ page_count: undefined, file_format: 'azw3' })).toBeNull();
    expect(pageCountLabel({ page_count: 0, file_format: 'epub' })).toBeNull();
  });

  it('ignores file_format entirely — only the count matters', () => {
    expect(pageCountLabel({ page_count: 5, file_format: 'MOBI' })).toBe('5 pages');
  });
});
