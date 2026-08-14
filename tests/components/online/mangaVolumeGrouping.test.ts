import { describe, it, expect } from 'vitest';
import {
  extractChapterVolume,
  formatChapterTitle,
  groupChaptersIntoVolumes,
  sortChaptersAscending,
} from '@/components/online/mangaDownloadUtils';
import type { UnifiedChapter } from '@/components/online/OnlineMangaDetailView';

function makeChapter(id: string, chapter: string, volume: string = 'None', title: string = ''): UnifiedChapter {
  return {
    id,
    chapter,
    volume,
    title,
    sourceType: 'plugin',
    originalChapter: {},
  };
}

describe('mangaVolumeGrouping', () => {
  describe('extractChapterVolume', () => {
    it('returns rawVolume if valid and not None', () => {
      expect(extractChapterVolume('1', 'Chapter 5', '5')).toBe('1');
      expect(extractChapterVolume('12', '', '')).toBe('12');
    });

    it('extracts volume number from title when rawVolume is None', () => {
      expect(extractChapterVolume('None', 'Vol. 1 Chapter 5', '5')).toBe('1');
      expect(extractChapterVolume('None', 'Volume 02 - The Battle', '15')).toBe('02');
      expect(extractChapterVolume(undefined, '[v03] Chapter 25', '25')).toBe('03');
      expect(extractChapterVolume(null, 'Vol 10', '100')).toBe('10');
    });

    it('extracts volume from chapter string when present', () => {
      expect(extractChapterVolume('None', 'Chapter Title', 'Vol 4 Ch 2')).toBe('4');
    });

    it('returns null when no volume information exists', () => {
      expect(extractChapterVolume('None', 'Chapter 100', '100')).toBeNull();
      expect(extractChapterVolume('None', '', '50')).toBeNull();
    });
  });

  describe('formatChapterTitle', () => {
    it('avoids duplicate "Chapter X: Chapter X" when title equals chapter number', () => {
      expect(formatChapterTitle({ volume: 'None', chapter: '60', title: 'Chapter 60' })).toBe('Chapter 60');
      expect(formatChapterTitle({ volume: 'None', chapter: '57', title: 'Chapter 57' })).toBe('Chapter 57');
      expect(formatChapterTitle({ volume: 'None', chapter: '57', title: '57' })).toBe('Chapter 57');
    });

    it('shows volume first when volume is present without duplicate chapter string', () => {
      expect(formatChapterTitle({ volume: '5', chapter: '60', title: 'Chapter 60' })).toBe('Vol. 5 Ch. 60');
      expect(formatChapterTitle({ volume: '2', chapter: '10', title: 'Vol 2 Ch 10' })).toBe('Vol. 2 Ch. 10');
    });

    it('includes distinct title when present with volume or chapter prefix', () => {
      expect(formatChapterTitle({ volume: '1', chapter: '1', title: 'The Beginning' })).toBe('Vol. 1 Ch. 1: The Beginning');
      expect(formatChapterTitle({ volume: 'None', chapter: '12', title: 'Chapter 12: The Battle' })).toBe('Chapter 12: The Battle');
      expect(formatChapterTitle({ volume: '3', chapter: '25', title: 'Vol. 3 Chapter 25 - Confrontation' })).toBe('Vol. 3 Ch. 25: Confrontation');
    });

    it('handles oneshots and unnumbered chapters', () => {
      expect(formatChapterTitle({ volume: 'None', chapter: '?', title: 'Oneshot' })).toBe('Oneshot');
      expect(formatChapterTitle({ volume: '1', chapter: '?', title: 'Special Prologue' })).toBe('Vol. 1: Special Prologue');
    });
  });

  describe('groupChaptersIntoVolumes', () => {
    it('groups chapters with explicit volume numbers', () => {
      const chapters: UnifiedChapter[] = [
        makeChapter('1', '1', '1', 'Chapter 1'),
        makeChapter('2', '2', '1', 'Chapter 2'),
        makeChapter('3', '3', '2', 'Chapter 3'),
        makeChapter('4', '4', '2', 'Chapter 4'),
      ];

      const groups = groupChaptersIntoVolumes(chapters);
      expect(groups).toHaveLength(2);
      expect(groups[0].volumeLabel).toBe('Volume 1');
      expect(groups[0].chapters).toHaveLength(2);
      expect(groups[0].chapterRangeLabel).toBe('Ch. 1 – 2');

      expect(groups[1].volumeLabel).toBe('Volume 2');
      expect(groups[1].chapters).toHaveLength(2);
      expect(groups[1].chapterRangeLabel).toBe('Ch. 3 – 4');
    });

    it('intelligently groups chapters into 10-chapter bundles when no volume tags exist (e.g. 433 chapters from scraper)', () => {
      // Create 25 chapters without volume tags
      const chapters: UnifiedChapter[] = Array.from({ length: 25 }, (_, i) =>
        makeChapter(`ch-${i + 1}`, String(i + 1), 'None', `Chapter ${i + 1}`)
      );

      const groups = groupChaptersIntoVolumes(chapters);
      expect(groups).toHaveLength(3);

      expect(groups[0].volumeLabel).toBe('Volume 1');
      expect(groups[0].chapterRangeLabel).toBe('Ch. 1 – 10');
      expect(groups[0].chapters).toHaveLength(10);

      expect(groups[1].volumeLabel).toBe('Volume 2');
      expect(groups[1].chapterRangeLabel).toBe('Ch. 11 – 20');
      expect(groups[1].chapters).toHaveLength(10);

      expect(groups[2].volumeLabel).toBe('Volume 3');
      expect(groups[2].chapterRangeLabel).toBe('Ch. 21 – 25');
      expect(groups[2].chapters).toHaveLength(5);
    });

    it('handles special / oneshot chapters gracefully', () => {
      const chapters: UnifiedChapter[] = [
        makeChapter('1', '1', 'None', 'Chapter 1'),
        makeChapter('2', '2', 'None', 'Chapter 2'),
        makeChapter('extra', 'Extra', 'None', 'Prequel Special'),
      ];

      const groups = groupChaptersIntoVolumes(chapters);
      expect(groups).toHaveLength(2);
      expect(groups[0].volumeLabel).toBe('Volume 1');
      expect(groups[0].chapters).toHaveLength(2);

      expect(groups[1].volumeLabel).toBe('Specials & Extras');
      expect(groups[1].chapters).toHaveLength(1);
    });
  });
});
