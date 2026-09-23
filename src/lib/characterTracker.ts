import { api } from '@/lib/tauri';
import { logger } from '@/lib/logger';

export interface CharacterFirstMention {
  chapterIndex: number;
  sentenceSnippet: string;
  charOffset: number;
}

export interface TrackedCharacter {
  name: string;
  totalMentions: number;
  firstMention: CharacterFirstMention;
  chapters: number[];
  avatarColor: string;
  nativeName?: string;
  imageUrl?: string;
}

// Pronouns that must never be considered character names
const PRONOUNS = new Set([
  'she', 'he', 'it', 'we', 'they', 'you', 'i', 'her', 'him', 'his', 'hers',
  'himself', 'herself', 'its', 'itself', 'them', 'theirs', 'themselves',
  'our', 'ours', 'ourselves', 'my', 'me', 'myself', 'your', 'yours', 'yourself', 'yourselves',
  'someone', 'somebody', 'something', 'anyone', 'anybody', 'anything',
  'everyone', 'everybody', 'everything', 'nobody', 'nothing', 'none',
  'who', 'whom', 'whose', 'whoever', 'whomever', 'whatever', 'whichever',
]);

// Non-person object/location suffixes that should not be classified as characters
const OBJECT_OR_LOCATION_SUFFIXES = new Set([
  'island', 'islands', 'town', 'city', 'mountain', 'mountains', 'river', 'sea',
  'ocean', 'world', 'kingdom', 'country', 'empire', 'street', 'castle', 'forest',
  'valley', 'port', 'bay', 'ship', 'fruit', 'hat', 'cap', 'sword', 'gun', 'story',
  'piece', 'novel', 'family', 'blue', 'cleaner', 'palace', 'house', 'room', 'inn',
]);

const CALENDAR_WORDS = new Set([
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december', 'chapter', 'book', 'part', 'act', 'scene',
]);

const COMMON_NON_NAMES = new Set([
  'not', 'whoa', 'stop', 'listen', 'wait', 'look', 'come', 'take', 'tell', 'keep',
  'let', 'leave', 'damn', 'please', 'hello', 'hey', 'yes', 'no', 'oh', 'ah', 'alas',
  'unable', 'especially', 'suddenly', 'immediately', 'meanwhile', 'perhaps', 'maybe',
  'unfortunately', 'certainly', 'naturally', 'obviously', 'actually', 'indeed',
  'finally', 'slowly', 'quickly', 'quietly', 'gently', 'softly', 'loudly', 'silently',
  'somewhere', 'anywhere', 'nowhere', 'everywhere', 'somehow', 'anyhow',
  'don', 'yeah', 'yep', 'nope', 'okay', 'well', 'fine', 'alright',
  'sure', 'true', 'false', 'good', 'bad', 'never', 'ever', 'always', 'sometimes',
  'still', 'even', 'though', 'although', 'because', 'since', 'after', 'before',
  'while', 'when', 'where', 'why', 'what', 'how', 'who', 'which', 'that', 'this',
  'these', 'those', 'such', 'only', 'same', 'than', 'too', 'very', 'can', 'will',
  'just', 'should', 'would', 'could', 'about', 'around', 'across', 'against', 'along',
  'among', 'behind', 'below', 'beneath', 'beside', 'between', 'beyond', 'during',
  'except', 'inside', 'outside', 'through', 'toward', 'towards', 'under', 'within', 'without',
]);

// Theme-harmonized avatar palettes
const AVATAR_PALETTES = [
  'linear-gradient(135deg, #475569, #334155)',
  'linear-gradient(135deg, #64748b, #475569)',
  'linear-gradient(135deg, #0d9488, #0f766e)',
  'linear-gradient(135deg, #0284c7, #0369a1)',
  'linear-gradient(135deg, #6366f1, #4f46e5)',
  'linear-gradient(135deg, #8b5cf6, #7c3aed)',
  'linear-gradient(135deg, #d97706, #b45309)',
  'linear-gradient(135deg, #ea580c, #c2410c)',
  'linear-gradient(135deg, #e11d48, #be123c)',
  'linear-gradient(135deg, #059669, #047857)',
];

export function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const idx = Math.abs(hash) % AVATAR_PALETTES.length;
  return AVATAR_PALETTES[idx];
}

/**
 * Extracts a complete, grammatically intact sentence surrounding the match
 */
function extractCleanSentence(text: string, matchIndex: number, matchLength: number): string {
  let start = matchIndex;
  while (start > 0 && !/[.!?\n]/.test(text[start - 1])) {
    start--;
  }
  while (start < matchIndex && /[\s\r\n"“'‘(\[]/.test(text[start])) {
    start++;
  }

  let end = matchIndex + matchLength;
  while (end < text.length && !/[.!?\n]/.test(text[end])) {
    end++;
  }
  if (end < text.length && /[.!?]/.test(text[end])) {
    end++;
  }

  let sentence = text.slice(start, end).trim();

  // Strip leading/trailing quote fragments, empty quotation pairs like "" or “ ”, or stray punctuation
  sentence = sentence
    .replace(/^(?:["'“‘]\s*["'”’]|["'“‘—–,.;:]|\s)+/g, '')
    .replace(/(?:["'“‘]\s*["'”’]|["'”’—–,.;:]|\s)+$/g, '')
    .trim();

  // If the sentence is extremely short, include the subsequent sentence for context
  if (sentence.length < 30 && end < text.length) {
    let nextEnd = end;
    while (nextEnd < text.length && !/[.!?\n]/.test(text[nextEnd])) {
      nextEnd++;
    }
    if (nextEnd < text.length && /[.!?]/.test(text[nextEnd])) {
      nextEnd++;
    }
    const combined = text.slice(start, nextEnd).trim();
    if (combined.length <= 180) {
      sentence = combined
        .replace(/^(?:["'“‘]\s*["'”’]|["'“‘—–,.;:]|\s)+/g, '')
        .replace(/(?:["'“‘]\s*["'”’]|["'”’—–,.;:]|\s)+$/g, '')
        .trim();
    }
  }

  if (sentence.length > 200) {
    return sentence.slice(0, 190).replace(/\s+\S*$/, '') + '...';
  }

  return sentence;
}

/**
 * Checks whether a sentence contains explicit character introduction or human action cues
 */
function checkHumanCues(sentence: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`\\b(?:by\\s+the\\s+name\\s+of|named|called|known\\s+as|this\\s+was|it\\s+was)\\s+${escaped}\\b`, 'i'),
    new RegExp(`\\b(?:Mr|Mrs|Ms|Miss|Dr|Doctor|Lord|Lady|Sir|Captain|Professor|Father|Prince|Princess|King|Queen)\\.?\\s+${escaped}\\b`, 'i'),
    new RegExp(`\\b${escaped}\\s+(?:said|asked|replied|shouted|whispered|laughed|sighed|smiled|frowned|nodded|turned|stood|stepped|walked|looked|thought|wondered|remembered|felt|knew|held|took|saw|leaned|sipped|rounded|arrived|entered|spoke|yelled|cried|grabbed|pulled|pushed|sat|jumped|ran|stared)\\b`, 'i'),
    new RegExp(`\\b(?:said|asked|replied|shouted|whispered|answered)\\s+${escaped}\\b`, 'i'),
    new RegExp(`\\b(?:Hey|Oh|Dear|Farewell|Listen|Wait|Welcome),\\s+${escaped}\\b`, 'i'),
    new RegExp(`\\b${escaped}'s\\s+(?:father|mother|sister|brother|son|daughter|crew|ship|eyes|face|hand|voice|sword|hair|smile)\\b`, 'i'),
    // Addressed inside dialogue quotes: e.g. "..., Law" or "Law, are you..."
    new RegExp(`["“][^"”]*\\b${escaped}\\b[^"”]*["”]`, 'i'),
  ];
  return patterns.some((p) => p.test(sentence));
}

/**
 * Scan chapters of a book to discover and index authentic characters.
 * Enforces the Mid-Sentence Capitalization rule to strictly exclude sentence-starting words (Not, Whoa, Stop, Listen).
 */
export async function scanBookCharacters(
  bookId: number,
  totalChapters: number,
  onProgress?: (progress: number) => void
): Promise<TrackedCharacter[]> {
  // Bumped cache key to v9 to automatically flush stale characters and quotes
  const cacheKey = `shiori-characters-v9-${bookId}`;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // Cache miss, proceed to scan
  }

  // Regex specifically capturing MID-SENTENCE capitalized proper nouns (preceded by lowercase letter, comma, semicolon, dash, colon)
  // This physically excludes words capitalized only at sentence/dialogue beginnings (e.g. "Not", "Whoa", "Stop", "Listen")
  const midSentenceNameRegex = /(?:[a-z,;:\-—]\s+)([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g;

  // Regex for honorific-prefixed names anywhere (e.g. "Captain Tashigi", "Dr. Watson")
  const honoredNameRegex = /\b(?:(?:Mr|Mrs|Ms|Miss|Dr|Lord|Lady|Sir|Captain|Professor|Father|Prince|Princess|King|Queen)\.?\s+)[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\b/g;

  const characterMap = new Map<string, {
    totalMentions: number;
    midSentenceMentions: number;
    firstMention?: CharacterFirstMention;
    hasHumanSignals: boolean;
    chapters: Set<number>;
  }>();

  // Scan up to first 25 chapters for speed and relevance
  const chaptersToScan = Math.min(totalChapters, 25);

  for (let chapIdx = 0; chapIdx < chaptersToScan; chapIdx++) {
    try {
      const chapter = await api.getBookChapter(bookId, chapIdx);
      if (!chapter?.content) continue;

      // Extract plain text
      const doc = new DOMParser().parseFromString(chapter.content, 'text/html');
      doc.querySelectorAll('script, style').forEach((el) => el.remove());
      const plain = (doc.body.textContent || '').replace(/\s+/g, ' ');

      // 1. Scan mid-sentence occurrences
      let match: RegExpExecArray | null;
      while ((match = midSentenceNameRegex.exec(plain)) !== null) {
        const rawName = match[1].trim().replace(/^["'“‘]+|["'”’.,:;!?]+$/g, '').replace(/(?:'s|’s)$/i, '').trim();
        const lower = rawName.toLowerCase();
        const parts = lower.split(/\s+/);

        // Discard pronouns, single stopwords, or calendar words
        if (parts.length === 1 && (PRONOUNS.has(parts[0]) || COMMON_NON_NAMES.has(parts[0]))) continue;
        if (parts.some((p) => PRONOUNS.has(p) || COMMON_NON_NAMES.has(p))) continue;
        if (CALENDAR_WORDS.has(lower) || CALENDAR_WORDS.has(parts[0])) continue;
        if (OBJECT_OR_LOCATION_SUFFIXES.has(parts[parts.length - 1])) continue;
        if (rawName.length < 3 || rawName.length > 30) continue;

        // Verify that single-word candidates aren't just common lowercase vocabulary
        if (parts.length === 1) {
          const lowerCount = (plain.match(new RegExp(`\\b${lower}\\b`, 'g')) || []).length;
          const capsCount = (plain.match(new RegExp(`\\b${rawName}\\b`, 'g')) || []).length;
          if (lowerCount > capsCount) continue;
        }

        const sentence = extractCleanSentence(plain, match.index, rawName.length);
        const hasHuman = checkHumanCues(sentence, rawName);

        let entry = characterMap.get(rawName);
        if (!entry) {
          entry = {
            totalMentions: 1,
            midSentenceMentions: 1,
            firstMention: {
              chapterIndex: chapIdx,
              sentenceSnippet: sentence,
              charOffset: match.index,
            },
            hasHumanSignals: hasHuman,
            chapters: new Set([chapIdx]),
          };
          characterMap.set(rawName, entry);
        } else {
          entry.totalMentions++;
          entry.midSentenceMentions++;
          entry.chapters.add(chapIdx);
          if (hasHuman) {
            entry.hasHumanSignals = true;
          }
        }
      }

      // 2. Scan honored names (e.g. "Captain Tashigi", "Lord Voldemort")
      while ((match = honoredNameRegex.exec(plain)) !== null) {
        const rawName = match[0].trim().replace(/^["'“‘]+|["'”’.,:;!?]+$/g, '').replace(/(?:'s|’s)$/i, '').trim();
        if (rawName.length < 3 || rawName.length > 30) continue;

        const sentence = extractCleanSentence(plain, match.index, rawName.length);
        let entry = characterMap.get(rawName);
        if (!entry) {
          entry = {
            totalMentions: 1,
            midSentenceMentions: 1,
            firstMention: {
              chapterIndex: chapIdx,
              sentenceSnippet: sentence,
              charOffset: match.index,
            },
            hasHumanSignals: true,
            chapters: new Set([chapIdx]),
          };
          characterMap.set(rawName, entry);
        } else {
          entry.totalMentions++;
          entry.chapters.add(chapIdx);
          entry.hasHumanSignals = true;
        }
      }
    } catch (err) {
      logger.warn(`[CharacterTracker] Error scanning chapter ${chapIdx}:`, err);
    }

    if (onProgress) {
      onProgress(Math.round(((chapIdx + 1) / chaptersToScan) * 100));
    }
  }

  // Filter candidates:
  // 1. Must appear capitalized mid-sentence at least 2 times (proves it is a proper noun, NOT a sentence-starting word like 'Not', 'Whoa', 'Stop')
  // 2. Must exhibit human signals (dialogue, actions, honorifics, or vocative address)
  const results: TrackedCharacter[] = [];
  for (const [name, data] of characterMap.entries()) {
    const isHonored = /^(Mr|Mrs|Ms|Miss|Dr|Lord|Lady|Sir|Captain|Professor)\b/i.test(name);
    if ((data.midSentenceMentions >= 2 && data.hasHumanSignals) || isHonored) {
      results.push({
        name,
        totalMentions: data.totalMentions,
        firstMention: data.firstMention!,
        chapters: Array.from(data.chapters).sort((a, b) => a - b),
        avatarColor: getAvatarColor(name),
      });
    }
  }

  // Sort by mention frequency descending
  results.sort((a, b) => b.totalMentions - a.totalMentions);

  // Cache results
  try {
    localStorage.setItem(cacheKey, JSON.stringify(results.slice(0, 50)));
  } catch {
    // Ignore quota errors
  }

  return results.slice(0, 50);
}
