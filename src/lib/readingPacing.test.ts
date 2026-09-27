import { describe, it, expect, beforeEach } from 'vitest';
import {
  countWordsFromHtml,
  calculateMinutesLeft,
  formatTimeRemaining,
  recordReadingSample,
  getStoredWpm,
  getStoredReadoutMode,
  setStoredReadoutMode,
} from './readingPacing';

describe('readingPacing', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('countWordsFromHtml', () => {
    it('returns 0 for empty, null, or undefined content', () => {
      expect(countWordsFromHtml(null)).toBe(0);
      expect(countWordsFromHtml(undefined)).toBe(0);
      expect(countWordsFromHtml('')).toBe(0);
      expect(countWordsFromHtml('    ')).toBe(0);
    });

    it('counts words from plain text correctly', () => {
      expect(countWordsFromHtml('The quick brown fox jumps over the lazy dog')).toBe(9);
    });

    it('strips html tags and script/style tags accurately', () => {
      const html = `
        <style>body { color: red; }</style>
        <div class="chapter-content">
          <h1>Chapter 1: The Beginning</h1>
          <p>It was a <strong>dark and stormy</strong> night.</p>
          <script>console.log('secret code');</script>
        </div>
      `;
      // "Chapter 1: The Beginning It was a dark and stormy night." -> 11 words
      expect(countWordsFromHtml(html)).toBe(11);
    });
  });

  describe('formatTimeRemaining', () => {
    it('formats less than 1 minute properly', () => {
      expect(formatTimeRemaining(0)).toBe('< 1 min');
      expect(formatTimeRemaining(0, true)).toBe('< 1m');
      expect(formatTimeRemaining(-2)).toBe('< 1 min');
    });

    it('formats minutes under an hour', () => {
      expect(formatTimeRemaining(14)).toBe('14 min');
      expect(formatTimeRemaining(14, true)).toBe('14m');
      expect(formatTimeRemaining(59)).toBe('59 min');
    });

    it('formats hours and minutes', () => {
      expect(formatTimeRemaining(60)).toBe('1h');
      expect(formatTimeRemaining(120)).toBe('2h');
      expect(formatTimeRemaining(130)).toBe('2 hr 10 min');
      expect(formatTimeRemaining(130, true)).toBe('2h 10m');
    });
  });

  describe('calculateMinutesLeft', () => {
    it('returns 0 if no words left', () => {
      expect(calculateMinutesLeft(0)).toBe(0);
      expect(calculateMinutesLeft(-5)).toBe(0);
    });

    it('calculates minutes accurately based on WPM', () => {
      // 440 words at 220 wpm = 2 min
      expect(calculateMinutesLeft(440, 220)).toBe(2);
      // 500 words at 220 wpm = ceil(2.27) = 3 min
      expect(calculateMinutesLeft(500, 220)).toBe(3);
    });
  });

  describe('recordReadingSample & getStoredWpm', () => {
    it('returns default WPM if no reading stored', () => {
      expect(getStoredWpm()).toBe(220);
    });

    it('ignores samples with too few words or too short time', () => {
      const wpm = recordReadingSample(10, 5); // too short
      expect(wpm).toBe(220);
    });

    it('smoothly updates user WPM using exponential moving average', () => {
      // 100 words in 20 seconds = 300 WPM
      // Initial: 220. Updated: round(220 * 0.85 + 300 * 0.15) = round(187 + 45) = 232
      const updated = recordReadingSample(100, 20);
      expect(updated).toBe(232);
      expect(getStoredWpm()).toBe(232);
    });
  });

  describe('readout modes persistence', () => {
    it('defaults to chapter mode', () => {
      expect(getStoredReadoutMode()).toBe('chapter');
    });

    it('persists and retrieves readout modes', () => {
      setStoredReadoutMode('book');
      expect(getStoredReadoutMode()).toBe('book');

      setStoredReadoutMode('percent');
      expect(getStoredReadoutMode()).toBe('percent');

      setStoredReadoutMode('session');
      expect(getStoredReadoutMode()).toBe('session');
    });
  });
});
