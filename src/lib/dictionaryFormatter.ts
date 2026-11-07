export interface DefinitionSection {
  partOfSpeech?: string; // e.g. "conjunction", "determiner", "noun"
  senses: string[]; // Individual numbered or separated meanings
}

/**
 * Parses raw multi-sense dictionary strings (e.g. from Wiktionary, FreeDict, Webster)
 * into structured parts-of-speech sections and clean numbered senses.
 *
 * Example input:
 * "[CONJUNCTION] 1. Introduces a simple indirect question.; 2. Indicates doubt.;
 *  [DETERMINER] 1. Which of two."
 */
export function parseDictionaryDefinition(raw: string): DefinitionSection[] {
  if (!raw) return [];
  const text = raw.trim();

  // Pattern 1: [PART_OF_SPEECH] e.g. [CONJUNCTION], [DETERMINER], [NOUN]
  const bracketPosRegex = /\[([A-Za-z_]{2,})\]/g;
  let matches = [...text.matchAll(bracketPosRegex)];

  // Pattern 2: (part of speech) e.g. (noun), (verb), (adjective)
  if (matches.length === 0) {
    const parenPosRegex = /(?:^|\n|\s)\(([A-Za-z_]{2,})\)(?=\s|\d|\.|\w)/g;
    const candidates = [...text.matchAll(parenPosRegex)];
    const KNOWN_POS = new Set([
      'noun', 'verb', 'adjective', 'adj', 'adverb', 'adv', 'pronoun', 'pron',
      'preposition', 'prep', 'conjunction', 'conj', 'interjection', 'interj',
      'determiner', 'det', 'article', 'particle', 'idiom', 'phrase', 'transitive', 'intransitive'
    ]);
    matches = candidates.filter((m) => KNOWN_POS.has(m[1].toLowerCase()));
  }

  // If no parts of speech detected, check for numbered senses or line breaks
  if (matches.length === 0) {
    const senseMatches = [...text.matchAll(/(?:^|\n|\b)(\d+)\.\s*([^;\n]+(?:;(?!\s*\d+\.)[^;\n]*)*)/g)];
    if (senseMatches.length > 0) {
      const senses = senseMatches
        .map((sm) => sm[2].replace(/[;\s]+$/, '').trim())
        .filter(Boolean);
      return [{ senses }];
    }

    // Split on line breaks or bullet characters
    const lines = text
      .split(/\r?\n+/)
      .map((l) => l.replace(/^[\s*•\-–—\d.)]+\s*/, '').trim())
      .filter(Boolean);
    return [{ senses: lines.length > 0 ? lines : [text] }];
  }

  const sections: DefinitionSection[] = [];
  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const pos = current[1].toLowerCase().replace(/_/g, ' ');
    const startIndex = current.index + current[0].length;
    const endIndex = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const body = text.slice(startIndex, endIndex).trim();

    const senses: string[] = [];
    const senseMatches = [...body.matchAll(/(?:^|\n|\b)(\d+)\.\s*([^;\n]+(?:;(?!\s*\d+\.)[^;\n]*)*)/g)];
    if (senseMatches.length > 0) {
      for (const sm of senseMatches) {
        const cleaned = sm[2].replace(/[;\s]+$/, '').trim();
        if (cleaned) senses.push(cleaned);
      }
    } else {
      const parts = body
        .split(/;\s*(?=[A-Z0-9]|$|\n)|\r?\n+/)
        .map((p) => p.replace(/^[\s*•\-–—\d.)]+\s*/, '').replace(/[;\s]+$/, '').trim())
        .filter(Boolean);
      senses.push(...(parts.length > 0 ? parts : [body]));
    }

    sections.push({ partOfSpeech: pos, senses });
  }

  return sections;
}
