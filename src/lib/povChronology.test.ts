import { describe, it, expect, beforeEach } from 'vitest';
import {
  detectCharacterFromTitle,
  detectEraFromTitle,
  getCharacterColor,
  extractPovArcs,
  getNextPovChapter,
  getPrevPovChapter,
  getPovArcProgress,
} from './povChronology';
import type { TocEntry } from './tauri';

describe('povChronology', () => {
  describe('detectCharacterFromTitle', () => {
    it('detects single name character chapters with Roman numerals', () => {
      expect(detectCharacterFromTitle('Tyrion')).toBe('Tyrion');
      expect(detectCharacterFromTitle('Tyrion I')).toBe('Tyrion');
      expect(detectCharacterFromTitle('Daenerys IV')).toBe('Daenerys');
      expect(detectCharacterFromTitle('Arya III')).toBe('Arya');
      expect(detectCharacterFromTitle('Jon')).toBe('Jon');
    });

    it('detects "Chapter X: Character" formats', () => {
      expect(detectCharacterFromTitle('Chapter 4: Kaladin')).toBe('Kaladin');
      expect(detectCharacterFromTitle('Ch. 12 - Shallan')).toBe('Shallan');
      expect(detectCharacterFromTitle('Act 2 - Geralt of Rivia')).toBe('Geralt of Rivia');
    });

    it('ignores non-character titles and frontmatter', () => {
      expect(detectCharacterFromTitle('Chapter 1')).toBeUndefined();
      expect(detectCharacterFromTitle('Prologue')).toBeUndefined();
      expect(detectCharacterFromTitle('Epilogue')).toBeUndefined();
      expect(detectCharacterFromTitle('Table of Contents')).toBeUndefined();
      expect(detectCharacterFromTitle('Cover')).toBeUndefined();
      expect(detectCharacterFromTitle('Cover 1/1')).toBeUndefined();
      expect(detectCharacterFromTitle('Insert')).toBeUndefined();
      expect(detectCharacterFromTitle('Insert 1/1')).toBeUndefined();
      expect(detectCharacterFromTitle('Copyright')).toBeUndefined();
      expect(detectCharacterFromTitle('Title Page')).toBeUndefined();
      expect(detectCharacterFromTitle('Color Illustrations')).toBeUndefined();
      expect(detectCharacterFromTitle('About the Author')).toBeUndefined();
      expect(detectCharacterFromTitle('Newsletter')).toBeUndefined();
    });
  });

  describe('detectEraFromTitle', () => {
    it('detects 4-digit years and seasons', () => {
      expect(detectEraFromTitle('1942: Winter in Moscow')).toBe('Winter 1942');
      expect(detectEraFromTitle('Berlin, 1920')).toBe('1920');
      expect(detectEraFromTitle('Tokyo, 2049')).toBe('2049');
    });

    it('detects named eras and days', () => {
      expect(detectEraFromTitle('Era 3: The Gathering')).toBe('Era 3');
      expect(detectEraFromTitle('Day 14 - Departure')).toBe('Day 14');
      expect(detectEraFromTitle('First Age of Middle-earth')).toBe('First Age');
    });

    it('returns undefined when no era or date is present', () => {
      expect(detectEraFromTitle('The Black Gate Opens')).toBeUndefined();
    });
  });

  describe('extractPovArcs & Single-POV Navigation', () => {
    const mockToc: TocEntry[] = [
      { label: 'Prologue', location: 'chapter_0' },
      { label: 'Tyrion I', location: 'chapter_1' },
      { label: 'Jon I', location: 'chapter_2' },
      { label: 'Daenerys I', location: 'chapter_3' },
      { label: 'Tyrion II', location: 'chapter_4' },
      { label: 'Jon II', location: 'chapter_5' },
      { label: 'Tyrion III', location: 'chapter_6' },
      { label: 'Epilogue', location: 'chapter_7' },
    ];

    it('groups chapters by POV characters', () => {
      const { characters } = extractPovArcs(mockToc, 999);
      expect(characters.length).toBeGreaterThanOrEqual(3);

      const tyrionArc = characters.find((c) => c.character === 'Tyrion');
      expect(tyrionArc).toBeDefined();
      expect(tyrionArc?.chapterIndices).toEqual([1, 4, 6]);

      const jonArc = characters.find((c) => c.character === 'Jon');
      expect(jonArc).toBeDefined();
      expect(jonArc?.chapterIndices).toEqual([2, 5]);
    });

    it('correctly calculates next and prev POV chapters in an arc', () => {
      const tyrionIndices = [1, 4, 6];

      expect(getNextPovChapter(1, tyrionIndices)).toBe(4);
      expect(getNextPovChapter(4, tyrionIndices)).toBe(6);
      expect(getNextPovChapter(6, tyrionIndices)).toBeNull();

      expect(getPrevPovChapter(6, tyrionIndices)).toBe(4);
      expect(getPrevPovChapter(4, tyrionIndices)).toBe(1);
      expect(getPrevPovChapter(1, tyrionIndices)).toBeNull();
    });

    it('tracks POV arc progress', () => {
      const tyrionIndices = [1, 4, 6];
      expect(getPovArcProgress(1, tyrionIndices)).toEqual({ currentStep: 1, totalSteps: 3 });
      expect(getPovArcProgress(4, tyrionIndices)).toEqual({ currentStep: 2, totalSteps: 3 });
      expect(getPovArcProgress(6, tyrionIndices)).toEqual({ currentStep: 3, totalSteps: 3 });
    });

    it('filters out frontmatter and single-word noise titles without numerals', () => {
      const noiseToc: TocEntry[] = [
        { label: 'Cover', location: 'chapter_0' },
        { label: 'Insert', location: 'chapter_1' },
        { label: 'Copyright', location: 'chapter_2' },
        { label: 'Home', location: 'chapter_3' }, // single word non-character noise, appears once without numeral
        { label: 'Subaru I', location: 'chapter_4' },
        { label: 'Subaru II', location: 'chapter_5' },
      ];

      const { characters } = extractPovArcs(noiseToc, 888);
      // Only Subaru should be recognized, Cover, Insert, Copyright, Home must NOT appear
      const names = characters.map((c) => c.character);
      expect(names).toContain('Subaru');
      expect(names).not.toContain('Cover');
      expect(names).not.toContain('Insert');
      expect(names).not.toContain('Copyright');
      expect(names).not.toContain('Home');
    });

    it('rejects narrative chapter titles from being treated as characters', () => {
      const narrativeToc: TocEntry[] = [
        { label: 'Chapter 1: It Always Begins with a Visitor', location: 'chapter_1' },
        { label: 'Chapter 2: The Water Gate City of Pristella', location: 'chapter_2' },
        { label: 'Chapter 3: Noisy Tranquility', location: 'chapter_3' },
        { label: 'Chapter 4: Theatrical Malice', location: 'chapter_4' },
      ];

      expect(detectCharacterFromTitle('Chapter 1: It Always Begins with a Visitor')).toBeUndefined();
      expect(detectCharacterFromTitle('Chapter 2: The Water Gate City of Pristella')).toBeUndefined();
      expect(detectCharacterFromTitle('Chapter 3: Noisy Tranquility')).toBeUndefined();
      expect(detectCharacterFromTitle('Chapter 4: Theatrical Malice')).toBeUndefined();

      const { characters } = extractPovArcs(narrativeToc, 777);
      expect(characters).toHaveLength(0);
    });
  });
});
