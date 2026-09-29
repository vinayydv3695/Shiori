import { describe, it, expect } from 'vitest';
import { isChapterHtmlBlank } from '@/components/reader/PremiumEpubReader';

describe('isChapterHtmlBlank', () => {
  it('identifies completely empty or whitespace-only content as blank', () => {
    expect(isChapterHtmlBlank('')).toBe(true);
    expect(isChapterHtmlBlank('   \n\t  ')).toBe(true);
  });

  it('identifies empty stubs and tags containing only nbsp/whitespace as blank', () => {
    expect(isChapterHtmlBlank('<div id="native-splash"></div><div id="root"></div>')).toBe(true);
    expect(isChapterHtmlBlank('<p>&nbsp;</p>')).toBe(true);
    expect(isChapterHtmlBlank('<p>&#160;</p>')).toBe(true);
    expect(isChapterHtmlBlank('<div><p>   </p></div>')).toBe(true);
  });

  it('identifies HTML with text content as not blank', () => {
    expect(isChapterHtmlBlank('<p>Chapter 1: The Beginning</p>')).toBe(false);
    expect(isChapterHtmlBlank('<div>Hello World</div>')).toBe(false);
  });

  it('identifies HTML with images as not blank', () => {
    expect(isChapterHtmlBlank('<img src="cover.jpg" alt="Cover" />')).toBe(false);
    expect(isChapterHtmlBlank('<div class="cover"><img src="images/cover.jpeg"/></div>')).toBe(false);
  });

  it('identifies HTML with SVG images or vector graphics as not blank', () => {
    expect(isChapterHtmlBlank('<svg><image href="cover.jpg"/></svg>')).toBe(false);
    expect(isChapterHtmlBlank('<svg:svg><svg:image xlink:href="cover.jpg"/></svg:svg>')).toBe(false);
    expect(isChapterHtmlBlank('<svg><rect width="100" height="100"/></svg>')).toBe(false);
    expect(isChapterHtmlBlank('<svg><text>Cover Title</text></svg>')).toBe(false);
  });
});
