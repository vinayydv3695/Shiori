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

export interface CharacterInteractionQuote {
  chapterIndex: number;
  quote: string;
}

export interface CharacterInteractionEdge {
  source: string;
  target: string;
  weight: number;
  chapters: number[];
  sampleQuotes: CharacterInteractionQuote[];
}

export interface CharacterNetworkData {
  characters: TrackedCharacter[];
  edges: CharacterInteractionEdge[];
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
  'drive', 'lane', 'road', 'avenue', 'boulevard', 'station', 'express', 'thousand',
  'hundred', 'hall', 'corridor', 'cupboard', 'stairs', 'dungeon', 'office', 'ground',
  'grounds', 'pitch', 'dormitory', 'classroom', 'shop', 'pub', 'alley', 'bank',
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

// In-memory cache for character networks to prevent redundant scans across renders
const networkMemoryCache = new Map<number, CharacterNetworkData>();

/**
 * Helper to escape special regex characters
 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Scan and return full character network graph data (nodes + interaction edges).
 * This is the primary, authoritative character and relationship scanning pipeline.
 */
export async function scanBookCharacterNetwork(
  bookId: number,
  totalChapters: number,
  onProgress?: (progress: number) => void
): Promise<CharacterNetworkData> {
  // 1. Fast in-memory cache check
  if (networkMemoryCache.has(bookId)) {
    const mem = networkMemoryCache.get(bookId)!;
    if (mem.characters.length > 0 && (mem.edges.length > 0 || mem.characters.length < 2)) {
      if (onProgress) onProgress(100);
      return mem;
    }
  }

  // 2. Persistent storage cache check (v12 to flush stale 0-edge poison)
  const networkCacheKey = `shiori-char-network-v12-${bookId}`;
  try {
    const cached = localStorage.getItem(networkCacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (
        parsed &&
        Array.isArray(parsed.characters) &&
        parsed.characters.length > 0 &&
        Array.isArray(parsed.edges) &&
        (parsed.edges.length > 0 || parsed.characters.length < 2)
      ) {
        networkMemoryCache.set(bookId, parsed);
        if (onProgress) onProgress(100);
        return parsed as CharacterNetworkData;
      }
    }
  } catch {
    // Cache miss, proceed to scan
  }

  // 3. Resolve true chapter count if totalChapters is unset or 1
  let resolvedChapters = totalChapters;
  if (!resolvedChapters || resolvedChapters <= 1) {
    try {
      const count = await api.getBookChapterCount(bookId);
      if (count && count > 1) {
        resolvedChapters = count;
      }
    } catch {
      // Fallback to provided totalChapters
    }
  }

  // Regex specifically capturing MID-SENTENCE capitalized proper nouns
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

  // Scan up to first 30 chapters for depth and relationship coverage
  const chaptersToScan = Math.max(1, Math.min(resolvedChapters || 1, 30));

  // Store structured paragraphs for scene and co-occurrence extraction
  const chapterParagraphs: { chapIdx: number; paragraphs: string[] }[] = [];

  for (let chapIdx = 0; chapIdx < chaptersToScan; chapIdx++) {
    try {
      const chapter = await api.getBookChapter(bookId, chapIdx);
      if (!chapter?.content) continue;

      // Extract DOM paragraphs
      const doc = new DOMParser().parseFromString(chapter.content, 'text/html');
      doc.querySelectorAll('script, style, nav, header, footer').forEach((el) => el.remove());

      const paragraphs: string[] = [];
      doc.querySelectorAll('p, blockquote, li, dd').forEach((el) => {
        const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (text.length >= 20) {
          paragraphs.push(text);
        }
      });

      // Fallback for HTML/EPUB using <div> blocks without child block tags
      if (paragraphs.length === 0) {
        doc.querySelectorAll('div, section').forEach((el) => {
          if (!el.querySelector('p, div, blockquote, ul, ol')) {
            const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
            if (text.length >= 20) {
              paragraphs.push(text);
            }
          }
        });
      }

      // Final fallback: split on multiple newlines
      if (paragraphs.length === 0) {
        const rawText = doc.body.textContent || '';
        const lines = rawText.split(/(?:\r?\n\s*){2,}|\s{4,}/);
        for (const l of lines) {
          const trimmed = l.replace(/\s+/g, ' ').trim();
          if (trimmed.length >= 20) paragraphs.push(trimmed);
        }
      }

      chapterParagraphs.push({ chapIdx, paragraphs });
      const plain = paragraphs.join('\n\n');

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
          const lowerCount = (plain.match(new RegExp(`\\b${escapeRegex(lower)}\\b`, 'g')) || []).length;
          const capsCount = (plain.match(new RegExp(`\\b${escapeRegex(rawName)}\\b`, 'g')) || []).length;
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
      onProgress(Math.round(((chapIdx + 1) / chaptersToScan) * 75));
    }
  }

  // Filter raw candidates:
  const rawList: TrackedCharacter[] = [];
  for (const [name, data] of characterMap.entries()) {
    const isHonored = /^(Mr|Mrs|Ms|Miss|Dr|Lord|Lady|Sir|Captain|Professor)\b/i.test(name);
    if ((data.midSentenceMentions >= 2 && data.hasHumanSignals) || isHonored) {
      rawList.push({
        name,
        totalMentions: data.totalMentions,
        firstMention: data.firstMention!,
        chapters: Array.from(data.chapters).sort((a, b) => a - b),
        avatarColor: getAvatarColor(name),
      });
    }
  }

  // Deduplicate and merge partial names (e.g. "Hermione" -> "Hermione Granger", "Potter" -> "Harry Potter")
  const mergedMap = new Map<string, TrackedCharacter>();
  rawList.sort((a, b) => b.name.length - a.name.length);

  for (const item of rawList) {
    let absorbed = false;
    for (const [canonicalName, canonicalChar] of mergedMap.entries()) {
      const canonicalLower = canonicalName.toLowerCase();
      const itemLower = item.name.toLowerCase();

      const canonicalTokens = canonicalLower.split(/\s+/);
      const isSub = canonicalTokens.includes(itemLower) || (item.name.length >= 4 && canonicalLower.includes(itemLower));

      if (isSub) {
        canonicalChar.totalMentions += item.totalMentions;
        for (const ch of item.chapters) {
          if (!canonicalChar.chapters.includes(ch)) {
            canonicalChar.chapters.push(ch);
          }
        }
        canonicalChar.chapters.sort((a, b) => a - b);
        absorbed = true;
        break;
      }
    }

    if (!absorbed) {
      mergedMap.set(item.name, { ...item, chapters: [...item.chapters] });
    }
  }

  const results = Array.from(mergedMap.values());
  results.sort((a, b) => b.totalMentions - a.totalMentions);
  const topCharacters = results.slice(0, 45);

  // ──────────────────────────────────────────────────────────────────────────
  // Extract Character Interaction Edges (Paragraph & Scene Co-occurrence)
  // ──────────────────────────────────────────────────────────────────────────
  const edgeMap = new Map<string, {
    source: string;
    target: string;
    weight: number;
    chapters: Set<number>;
    sampleQuotes: CharacterInteractionQuote[];
  }>();

  // Track token frequency across characters to safely match unique vs shared tokens
  const tokenFreq = new Map<string, number>();

  const charTokensList = topCharacters.map((c) => {
    const rawClean = c.name
      .replace(/^(mr|mrs|ms|miss|dr|lord|lady|sir|captain|professor)\.?\s+/i, '')
      .trim();

    // Distinct tokens (e.g. "Ron", "Weasley", "Harry", "Potter", "Law", "Luffy")
    const tokens = rawClean
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => {
        const lower = t.toLowerCase();
        return (
          t.length >= 2 &&
          !COMMON_NON_NAMES.has(lower) &&
          !PRONOUNS.has(lower) &&
          !CALENDAR_WORDS.has(lower) &&
          !OBJECT_OR_LOCATION_SUFFIXES.has(lower)
        );
      });

    for (const t of tokens) {
      const lower = t.toLowerCase();
      tokenFreq.set(lower, (tokenFreq.get(lower) || 0) + 1);
    }

    return {
      name: c.name,
      lowerName: c.name.toLowerCase(),
      tokens,
    };
  });

  for (const { chapIdx, paragraphs } of chapterParagraphs) {
    const pAppearances: { pIdx: number; chars: string[]; text: string }[] = [];

    for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
      const pText = paragraphs[pIdx];
      const pLower = pText.toLowerCase();

      const foundChars = new Set<string>();

      for (const ct of charTokensList) {
        // 1. Direct full name match
        if (pLower.includes(ct.lowerName)) {
          foundChars.add(ct.name);
          continue;
        }

        // 2. Token match with word boundary
        for (const token of ct.tokens) {
          const lowerToken = token.toLowerCase();
          const freq = tokenFreq.get(lowerToken) || 1;

          // If token is unique across all characters, word-boundary match in paragraph
          if (freq === 1) {
            const tokenRegex = new RegExp(`\\b${escapeRegex(lowerToken)}\\b`, 'i');
            if (tokenRegex.test(pText)) {
              foundChars.add(ct.name);
              break;
            }
          } else {
            // If token is shared (e.g. family surname like "Potter"), require full name match
            const fullRegex = new RegExp(`\\b${escapeRegex(ct.lowerName)}\\b`, 'i');
            if (fullRegex.test(pLower)) {
              foundChars.add(ct.name);
              break;
            }
          }
        }
      }

      if (foundChars.size > 0) {
        pAppearances.push({ pIdx, chars: Array.from(foundChars), text: pText });
      }
    }

    // 1. Direct Same-Paragraph Interactions (Weight +3)
    for (const app of pAppearances) {
      if (app.chars.length >= 2) {
        for (let i = 0; i < app.chars.length; i++) {
          for (let j = i + 1; j < app.chars.length; j++) {
            const charA = app.chars[i];
            const charB = app.chars[j];
            const [src, tgt] = charA.localeCompare(charB) < 0 ? [charA, charB] : [charB, charA];
            const pairKey = `${src}:::${tgt}`;

            let edge = edgeMap.get(pairKey);
            if (!edge) {
              edge = {
                source: src,
                target: tgt,
                weight: 3,
                chapters: new Set([chapIdx]),
                sampleQuotes: [],
              };
              edgeMap.set(pairKey, edge);
            } else {
              edge.weight += 3;
              edge.chapters.add(chapIdx);
            }

            if (edge.sampleQuotes.length < 5) {
              const quoteSnippet = app.text.slice(0, 240).trim() + (app.text.length > 240 ? '...' : '');
              if (!edge.sampleQuotes.some((q) => q.quote === quoteSnippet)) {
                edge.sampleQuotes.push({ chapterIndex: chapIdx, quote: quoteSnippet });
              }
            }
          }
        }
      }
    }

    // 2. Sliding Scene Window Interactions (Adjacent Paragraphs <= 2 apart, Weight +1)
    for (let i = 0; i < pAppearances.length; i++) {
      for (let j = i + 1; j < pAppearances.length; j++) {
        if (pAppearances[j].pIdx - pAppearances[i].pIdx > 2) break;

        const charsA = pAppearances[i].chars;
        const charsB = pAppearances[j].chars;

        for (const charA of charsA) {
          for (const charB of charsB) {
            if (charA === charB) continue;
            const [src, tgt] = charA.localeCompare(charB) < 0 ? [charA, charB] : [charB, charA];
            const pairKey = `${src}:::${tgt}`;

            let edge = edgeMap.get(pairKey);
            if (!edge) {
              edge = {
                source: src,
                target: tgt,
                weight: 1,
                chapters: new Set([chapIdx]),
                sampleQuotes: [],
              };
              edgeMap.set(pairKey, edge);
            } else {
              edge.weight += 1;
              edge.chapters.add(chapIdx);
            }

            if (edge.sampleQuotes.length < 5) {
              const combinedText = `${pAppearances[i].text.slice(0, 140)} ... ${pAppearances[j].text.slice(0, 140)}`.trim();
              if (!edge.sampleQuotes.some((q) => q.quote.includes(pAppearances[i].text.slice(0, 60)))) {
                edge.sampleQuotes.push({ chapterIndex: chapIdx, quote: combinedText });
              }
            }
          }
        }
      }
    }
  }

  // 3. Fallback: Chapter Co-presence (if few or no direct paragraph interactions found)
  if (edgeMap.size < 5 && topCharacters.length >= 2) {
    for (let i = 0; i < topCharacters.length; i++) {
      for (let j = i + 1; j < topCharacters.length; j++) {
        const charA = topCharacters[i];
        const charB = topCharacters[j];
        const sharedChaps = charA.chapters.filter((ch) => charB.chapters.includes(ch));
        if (sharedChaps.length >= 1) {
          const [src, tgt] = charA.name.localeCompare(charB.name) < 0 ? [charA.name, charB.name] : [charB.name, charA.name];
          const pairKey = `${src}:::${tgt}`;
          if (!edgeMap.has(pairKey)) {
            edgeMap.set(pairKey, {
              source: src,
              target: tgt,
              weight: sharedChaps.length,
              chapters: new Set(sharedChaps),
              sampleQuotes: [],
            });
          }
        }
      }
    }
  }

  const edges: CharacterInteractionEdge[] = Array.from(edgeMap.values()).map((e) => ({
    source: e.source,
    target: e.target,
    weight: e.weight,
    chapters: Array.from(e.chapters).sort((a, b) => a - b),
    sampleQuotes: e.sampleQuotes,
  }));

  edges.sort((a, b) => b.weight - a.weight);

  const networkData: CharacterNetworkData = {
    characters: topCharacters,
    edges,
  };

  // Cache in-memory for instant reuse
  networkMemoryCache.set(bookId, networkData);

  // Cache persistently to localStorage with quota-safe cleanup
  try {
    localStorage.setItem(networkCacheKey, JSON.stringify(networkData));
  } catch {
    try {
      // Clear legacy/stale character caches to free space
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('shiori-characters-') || k.startsWith('shiori-char-network-'))) {
          localStorage.removeItem(k);
        }
      }
      localStorage.setItem(networkCacheKey, JSON.stringify(networkData));
    } catch {
      // In-memory cache continues to serve the current session smoothly
    }
  }

  if (onProgress) {
    onProgress(100);
  }

  return networkData;
}

/**
 * Scan chapters of a book to discover and index authentic characters.
 * Delegates directly to scanBookCharacterNetwork to ensure characters and edges stay 100% in sync.
 */
export async function scanBookCharacters(
  bookId: number,
  totalChapters: number,
  onProgress?: (progress: number) => void
): Promise<TrackedCharacter[]> {
  const network = await scanBookCharacterNetwork(bookId, totalChapters, onProgress);
  return network.characters;
}
