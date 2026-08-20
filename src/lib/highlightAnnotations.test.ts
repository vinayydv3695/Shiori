import { describe, expect, it } from 'vitest';
import { applyHighlightsToDOM } from './highlightAnnotations';
import type { Annotation } from './tauri';

function annotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: 7,
    bookId: 1,
    annotationType: 'highlight',
    location: 'chapter_2',
    selectedText: 'same sentence',
    color: '#fbbf24',
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('EPUB highlight restoration', () => {
  it('uses saved chapter-local offsets instead of first duplicate text match', () => {
    const container = document.createElement('div');
    container.dataset.chapterIndex = '2';
    container.innerHTML = '<p>same sentence appears first.</p><p>same sentence appears second.</p>';
    document.body.appendChild(container);

    const text = container.textContent ?? '';
    const first = text.indexOf('same sentence');
    const start = text.indexOf('same sentence', first + 1);
    const cfiRange = JSON.stringify({ version: 1, chapterIndex: '2', start, end: start + 'same sentence'.length });

    applyHighlightsToDOM(container, [annotation({ cfiRange })]);

    const mark = container.querySelector('mark.epub-highlight');
    expect(mark?.textContent).toBe('same sentence');
    expect(mark?.parentElement?.textContent).toContain('appears second');
    expect(mark?.parentElement?.textContent).not.toContain('appears first');
    container.remove();
  });

  it('keeps selected-text fallback for annotations without a range anchor', () => {
    const container = document.createElement('div');
    container.innerHTML = '<p>fallback sentence here.</p>';
    document.body.appendChild(container);

    applyHighlightsToDOM(container, [annotation({ cfiRange: undefined, selectedText: 'fallback sentence' })]);

    expect(container.querySelector('mark.epub-highlight')?.textContent).toBe('fallback sentence');
    container.remove();
  });
});
