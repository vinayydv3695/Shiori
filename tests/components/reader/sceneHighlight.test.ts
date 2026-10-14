import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  normalizeText,
  extractSearchTokens,
  findBestMatchingBlock,
  highlightTextInElement,
  scrollCanvasToSearchTerm,
} from '@/lib/sceneHighlight';

describe('sceneHighlight', () => {
  describe('normalizeText', () => {
    it('normalizes smart quotes, dashes, and whitespace', () => {
      const input = '“Hello—world,’  said   Frodo.';
      expect(normalizeText(input)).toBe('"hello-world,\' said frodo.');
    });
  });

  describe('extractSearchTokens', () => {
    it('extracts tokens with punctuation stripped', () => {
      const input = '“You shall not pass!” cried Gandalf.';
      const tokens = extractSearchTokens(input);
      expect(tokens).toContain('you');
      expect(tokens).toContain('shall');
      expect(tokens).toContain('not');
      expect(tokens).toContain('pass');
      expect(tokens).toContain('cried');
      expect(tokens).toContain('gandalf');
    });
  });

  describe('findBestMatchingBlock', () => {
    let container: HTMLDivElement;

    beforeEach(() => {
      container = document.createElement('div');
    });

    it('matches the exact paragraph containing a dialogue quote', () => {
      container.innerHTML = `
        <p>It was a dark and stormy night in the shire.</p>
        <p>“I know what I must do,” said Frodo quietly. “The ring must be destroyed.”</p>
        <p>The fire crackled softly in the hearth.</p>
      `;
      const match = findBestMatchingBlock(container, '“I know what I must do,” said Frodo');
      expect(match).not.toBeNull();
      expect(match?.textContent).toContain('The ring must be destroyed');
    });

    it('matches when text is broken across inline formatting tags', () => {
      container.innerHTML = `
        <p>Chapter One</p>
        <p>He turned to <em>Gandalf</em> and whispered, <strong>“Is it true?”</strong></p>
        <p>Nothing moved in the shadows.</p>
      `;
      const match = findBestMatchingBlock(container, 'He turned to Gandalf and whispered, "Is it true?"');
      expect(match).not.toBeNull();
      expect(match?.textContent).toContain('Gandalf');
    });
  });

  describe('highlightTextInElement', () => {
    it('wraps matching text in mark tag inside the element', () => {
      const p = document.createElement('p');
      p.textContent = 'The magic sword gleamed brightly in the sunlight.';
      highlightTextInElement(p, 'magic sword');
      expect(p.innerHTML).toContain('<mark class="search-highlight search-highlight--active">magic sword</mark>');
    });
  });

  describe('scrollCanvasToSearchTerm', () => {
    let container: HTMLDivElement;

    beforeEach(() => {
      container = document.createElement('div');
      container.scrollTo = vi.fn();
    });

    it('scrolls container to target paragraph using targetSnippet option', () => {
      container.innerHTML = `
        <p>First paragraph with word sword.</p>
        <p id="target">Fourth paragraph with the ancient enchanted sword in Aragorn\\'s hand.</p>
      `;
      const result = scrollCanvasToSearchTerm(container, 'sword', {
        targetSnippet: 'enchanted sword in Aragorn',
      });
      expect(result).toBe(true);
      const target = container.querySelector('#target');
      expect(target?.classList.contains('scene-dialogue-highlight')).toBe(true);
      expect(container.scrollTo).toHaveBeenCalled();
    });
  });
});
