import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkHiatus, getChapterCatchUpData } from '@/lib/catchUpService';
import { api } from '@/lib/tauri';

vi.mock('@/lib/tauri', () => ({
  api: {
    getBookChapter: vi.fn(),
  },
  isTauri: () => true,
  isAndroid: false,
}));

describe('catchUpService', () => {
  describe('checkHiatus', () => {
    it('returns false when lastRead is undefined or invalid', () => {
      expect(checkHiatus(undefined).isHiatus).toBe(false);
      expect(checkHiatus(null as any).isHiatus).toBe(false);
      expect(checkHiatus('invalid-date').isHiatus).toBe(false);
    });

    it('returns false when reading was active within 48 hours', () => {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const result = checkHiatus(oneDayAgo);
      expect(result.isHiatus).toBe(false);
      expect(result.daysAgo).toBe(1);
    });

    it('returns true when reading was more than 48 hours ago', () => {
      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
      const result = checkHiatus(fiveDaysAgo);
      expect(result.isHiatus).toBe(true);
      expect(result.daysAgo).toBe(5);
    });
  });

  describe('getChapterCatchUpData', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('extracts key narrative beats and active characters from previous chapter', async () => {
      const mockChapterHtml = `
        <html>
          <body>
            <h2>Chapter 3: The Whispering Gallery</h2>
            <p>"We shouldn't be here," whispered Hermione, looking nervously down the dark corridor.</p>
            <p>Harry clutched the invisibility cloak tighter. The stone walls glistened with dampness.</p>
            <p>Suddenly, a loud crash echoed from the end of the hall. Ron jumped and dropped his wand.</p>
            <p>"Did you hear that?" Harry asked in a tense whisper. Something was moving in the shadows.</p>
          </body>
        </html>
      `;

      vi.mocked(api.getBookChapter).mockResolvedValue({
        index: 2,
        title: 'Chapter 3',
        content: mockChapterHtml,
        location: 'chapter3.html',
      });

      // User is at chapter 3, so it recaps chapter 2 (the one they previously read)
      const data = await getChapterCatchUpData(1, 3);
      expect(data).not.toBeNull();
      expect(data?.chapterIndex).toBe(2);
      expect(data?.chapterTitle).toContain('Chapter 3');
      expect(data?.keyMoments.length).toBeGreaterThan(0);
      expect(data?.openingScene).toBeDefined();
      expect(data?.closingScene).toBeDefined();
    });
  });
});
