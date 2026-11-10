import { describe, it, expect } from 'vitest';
import {
  cleanChapterContent,
  extractCleanSentences,
  sanitizeTranscriptSentences,
  cleanSentenceArtifacts,
  isTitleBoilerplate,
  isPlaceholderChapter,
} from '@/lib/audiobookTextCleaner';

describe('audiobookTextCleaner', () => {
  it('strips leading repetitive book title and volume header from chapter text', () => {
    const raw = `Re:ZERO -Starting Life in Another World- Short Story Collection, Vol. 4 "I have granddaughters at the main house."`;
    const bookTitle = `Re:ZERO -Starting Life in Another World- Short Story Collection, Vol. 4 (Audiobook)`;

    const cleaned = cleanChapterContent(raw, bookTitle, 'Chapter 16');
    expect(cleaned.startsWith('"I have granddaughters')).toBe(true);
  });

  it('preserves story sentences without accidental splits on Vol. or Ch.', () => {
    const raw = `She read Vol. 4 of the book. It was amazing.`;
    const sentences = extractCleanSentences(raw);
    expect(sentences).toHaveLength(2);
    expect(sentences[0]).toContain('Vol 4');
  });

  it('filters out standalone book title header sentences', () => {
    const raw = `<p>Re:ZERO -Starting Life in Another World-</p><p>Chapter 1</p><p>Subaru woke up on a cobblestone road.</p>`;
    const bookTitle = `Re:ZERO -Starting Life in Another World-`;
    const sentences = extractCleanSentences(raw, bookTitle, 'Chapter 1');
    expect(sentences[0]).toBe('Subaru woke up on a cobblestone road.');
  });

  it('handles existing stored sentence array with split title and orphan volume number (Screenshot Case)', () => {
    const storedSentences = [
      'Re:ZERO -Starting Life in Another World- Short Story Collection, Vol.',
      '4 "I have granddaughters at the main house.',
      "I've told them by letter to serve you well, Lady Felt, so do give those little girls a lot of love.",
      '" "You guys have granddaughters?',
      'Well, I can\'t wait to meet them... Thanks, guys.',
    ];

    const bookTitle = 'Re:ZERO -Starting Life in Another World- Short Story Collection, Vol. 4 (Audiobook)';
    const cleaned = sanitizeTranscriptSentences(storedSentences, bookTitle, 'Chapter 16');

    // Sentence 0 (title) must be dropped
    expect(cleaned[0]).not.toContain('Re:ZERO');
    // Sentence 1 must have the orphan 4 removed and start with quote
    expect(cleaned[0]).toBe('"I have granddaughters at the main house.');
    // Sentence 3 must have double-quote cleaned
    expect(cleaned[2]).toBe('"You guys have granddaughters?');
  });

  it('identifies book title boilerplate correctly', () => {
    const bookTitle = 'Re:ZERO -Starting Life in Another World- Short Story Collection, Vol. 4';
    expect(isTitleBoilerplate('Re:ZERO -Starting Life in Another World- Short Story Collection, Vol.', bookTitle)).toBe(true);
    expect(isTitleBoilerplate('Chapter 16', bookTitle, 'Chapter 16')).toBe(true);
    expect(isTitleBoilerplate('"I have granddaughters at the main house."', bookTitle)).toBe(false);
  });

  it('cleans sentence artifacts properly', () => {
    expect(cleanSentenceArtifacts('4 "I have granddaughters...')).toBe('"I have granddaughters...');
    expect(cleanSentenceArtifacts('" "You guys...')).toBe('"You guys...');
    expect(cleanSentenceArtifacts('16 Felt was running.')).toBe('Felt was running.');
  });

  it('detects image and placeholder chapters to skip empty pages', () => {
    // 1. Image only chapter with minimal text (like Re:Zero illustration pages)
    const imageChapter = '<div class="image_full"><img alt="image" src="../Images/Art_P8.jpg"/></div>';
    expect(isPlaceholderChapter(imageChapter, 'Chapter 2', 11)).toBe(true);

    // 2. Cover page
    const coverChapter = '<section><img alt="Cover" src="cover.jpg"/></section>';
    expect(isPlaceholderChapter(coverChapter, 'Cover', 5)).toBe(true);

    // 3. Insert page
    expect(isPlaceholderChapter('', 'Insert', 11)).toBe(true);
    expect(isPlaceholderChapter('', 'Title Page', 11)).toBe(true);

    // 4. Real story chapter with extensive text
    const realStory = '<p>The kingdom of Lugnica was bustling with activity...</p>'.repeat(20);
    expect(isPlaceholderChapter(realStory, 'Chapter 1', 1200)).toBe(false);
  });
});
