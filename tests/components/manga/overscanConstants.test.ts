import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  MANGA_OVERSCAN,
  MANGA_OVERSCAN_DESKTOP,
  MANGA_OVERSCAN_ANDROID,
} from '@/components/manga/constants';

/**
 * K3-005: manga virtualized views must use the shared overscan constant
 * (8 desktop / 4 Android) instead of the hardcoded 25.
 */

describe('manga overscan constants', () => {
  it('exports desktop 8 / Android 4, resolving to desktop in jsdom', () => {
    expect(MANGA_OVERSCAN_DESKTOP).toBe(8);
    expect(MANGA_OVERSCAN_ANDROID).toBe(4);
    expect(MANGA_OVERSCAN).toBe(8);
  });

  for (const view of ['LongStripView', 'WebtoonView', 'ContinuousWebtoonView']) {
    it(`${view} uses MANGA_OVERSCAN instead of overscan: 25`, () => {
      const src = readFileSync(resolve(process.cwd(), `src/components/manga/views/${view}.tsx`), 'utf8');
      expect(src).toContain('overscan: MANGA_OVERSCAN');
      expect(src).not.toContain('overscan: 25');
    });
  }
});