import DOMPurify from 'dompurify'

/**
 * Sanitize HTML content rendered from eBooks (EPUB/MOBI chapters).
 *
 * Allows the rich subset needed for book content (headings, paragraphs,
 * images, tables, inline styles for formatting) while stripping script
 * tags, event handlers, and other XSS vectors.
 */
export function sanitizeBookContent(html: string): string {
  if (!html) return ''
  return DOMPurify.sanitize(html, {
    // Keep style attributes — books rely on inline styles for formatting
    ADD_ATTR: ['style'],
    // Allow class attributes for CSS styling
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'textarea', 'select', 'button'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
  })
}

/**
 * Sanitize RSS/feed article HTML content.
 * More restrictive than book content — only allows a curated set of tags.
 */
export function sanitizeArticleHTML(html: string): string {
  if (!html) return ''
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'br', 'b', 'i', 'em', 'strong', 'a', 'ul', 'ol', 'li',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code',
      'img', 'figure', 'figcaption', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'span', 'div', 'hr', 'sub', 'sup', 'del', 's',
    ],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'target', 'rel', 'width', 'height'],
    ALLOW_DATA_ATTR: false,
  })
}

/**
 * Sanitize SVG content (e.g. QR codes).
 */
export function sanitizeSVG(svg: string): string {
  if (!svg) return ''
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true },
    ALLOWED_TAGS: ['svg', 'rect', 'path', 'circle', 'line', 'polyline', 'polygon', 'g', 'defs', 'title'],
    ALLOWED_ATTR: ['viewBox', 'width', 'height', 'fill', 'stroke', 'stroke-width', 'd', 'x', 'y', 'rx', 'ry', 'cx', 'cy', 'r', 'points', 'transform', 'xmlns'],
  })
}
