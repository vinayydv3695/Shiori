/**
 * Sentence boundary detection with intelligent splitting
 * Uses Intl.Segmenter when available, falls back to regex
 */

const MAX_SENTENCE_LENGTH = 200;

/**
 * Check if Intl.Segmenter is available in the current environment
 */
function isSegmenterAvailable(): boolean {
  return typeof Intl !== 'undefined' && 'Segmenter' in Intl;
}

/**
 * Split text using Intl.Segmenter (modern browsers)
 */
function splitWithSegmenter(text: string): string[] {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'sentence' });
  const segments = Array.from(segmenter.segment(text));
  return segments.map(seg => seg.segment.trim()).filter(s => s.length > 0);
}

/**
 * Split text using regex fallback for older browsers
 * Splits on sentence-ending punctuation (.!?) followed by whitespace or end
 */
function splitWithRegex(text: string): string[] {
  // Split on .!? followed by whitespace or end of string
  const sentencePattern = /[.!?]+(?:\s+|$)/g;
  const parts: string[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = sentencePattern.exec(text)) !== null) {
    const sentence = text.slice(lastIndex, match.index + match[0].length).trim();
    if (sentence.length > 0) {
      parts.push(sentence);
    }
    lastIndex = match.index + match[0].length;
  }

  // Add remaining text if any
  const remaining = text.slice(lastIndex).trim();
  if (remaining.length > 0) {
    parts.push(remaining);
  }

  return parts;
}

/**
 * Split long sentences on punctuation markers like commas, semicolons, etc.
 */
function splitLongSentence(sentence: string): string[] {
  if (sentence.length <= MAX_SENTENCE_LENGTH) {
    return [sentence];
  }

  // Split on , ; : — followed by space
  const subPattern = /[,;:—]+\s+/g;
  const parts: string[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = subPattern.exec(sentence)) !== null) {
    const part = sentence.slice(lastIndex, match.index + match[0].length).trim();
    if (part.length > 0) {
      parts.push(part);
    }
    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  const remaining = sentence.slice(lastIndex).trim();
  if (remaining.length > 0) {
    parts.push(remaining);
  }

  // If we couldn't split effectively, return original
  return parts.length > 0 ? parts : [sentence];
}

/**
 * Split text into sentences with intelligent boundary detection
 * Uses Intl.Segmenter when available, falls back to regex
 * Handles long sentences by splitting on punctuation markers
 */
export function splitSentences(text: string): string[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  // Primary split using best available method
  const sentences = isSegmenterAvailable() 
    ? splitWithSegmenter(text)
    : splitWithRegex(text);

  // Further split long sentences
  const finalSentences: string[] = [];
  for (const sentence of sentences) {
    const parts = splitLongSentence(sentence);
    finalSentences.push(...parts);
  }

  // Filter empty/whitespace-only segments
  return finalSentences.filter(s => s.trim().length > 0);
}

/**
 * Safely get a sentence at a specific index
 * Returns null if index is out of bounds
 */
export function getSentenceAtIndex(sentences: string[], index: number): string | null {
  if (index < 0 || index >= sentences.length) {
    return null;
  }
  return sentences[index];
}
