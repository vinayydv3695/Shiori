import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  saveCharacterOverride,
  getCharacterOverrides,
  getCharacterOverride,
  removeCharacterOverride,
  applyOverridesToCharacters,
  searchCharacterOnline,
  type CharacterOverride,
} from '@/lib/characterOverrideService';
import type { TrackedCharacter } from '@/lib/characterTracker';

describe('characterOverrideService', () => {
  const BOOK_ID = 42;
  const BOOK_TITLE = 'Re:Zero - Starting Life in Another World, Vol. 20';

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('persists and retrieves a character override', () => {
    const override: CharacterOverride = {
      originalName: 'Holy Dragon',
      resolvedName: 'Volcanica',
      nativeName: 'ボルカニカ',
      imageUrl: 'https://static.wikia.nocookie.net/rezero/images/volcanica.png',
      description: 'The Divine Dragon who sealed the Witch of Envy four hundred years ago.',
      source: 'fandom',
      updatedAt: Date.now(),
    };

    saveCharacterOverride(BOOK_ID, override, BOOK_TITLE);

    const storedOverrides = getCharacterOverrides(BOOK_ID);
    expect(storedOverrides['Holy Dragon']).toBeDefined();
    expect(storedOverrides['Holy Dragon'].resolvedName).toBe('Volcanica');
    expect(storedOverrides['Holy Dragon'].nativeName).toBe('ボルカニカ');
    expect(storedOverrides['Holy Dragon'].source).toBe('fandom');

    const matched = getCharacterOverride(BOOK_ID, 'Holy Dragon');
    expect(matched).toBeDefined();
    expect(matched?.resolvedName).toBe('Volcanica');

    // Case-insensitive lookup
    const matchedLower = getCharacterOverride(BOOK_ID, 'holy dragon');
    expect(matchedLower?.resolvedName).toBe('Volcanica');

    // Resolved name lookup
    const matchedResolved = getCharacterOverride(BOOK_ID, 'volcanica');
    expect(matchedResolved?.resolvedName).toBe('Volcanica');
  });

  it('removes an override when reverted', () => {
    const override: CharacterOverride = {
      originalName: 'Puckie',
      resolvedName: 'Puck',
      nativeName: 'パック',
      imageUrl: 'https://example.com/puck.jpg',
      description: 'Artificial Great Spirit of Fire.',
      source: 'fandom',
      updatedAt: Date.now(),
    };

    saveCharacterOverride(BOOK_ID, override, BOOK_TITLE);
    expect(getCharacterOverride(BOOK_ID, 'Puckie')).toBeDefined();

    removeCharacterOverride(BOOK_ID, 'Puckie', BOOK_TITLE);
    expect(getCharacterOverride(BOOK_ID, 'Puckie')).toBeNull();
  });

  it('applies overrides to a list of TrackedCharacter instances while preserving metrics', () => {
    const mockCharacters: TrackedCharacter[] = [
      {
        name: 'Subaru Natsuki',
        totalMentions: 120,
        chapters: [0, 1, 2],
        firstMention: { chapterIndex: 0, sentenceSnippet: 'Subaru stood in the market.', charOffset: 0 },
        avatarColor: '#123456',
        nativeName: 'ナツキ・スバル',
      },
      {
        name: 'Holy Dragon',
        totalMentions: 17,
        chapters: [19, 20],
        firstMention: { chapterIndex: 19, sentenceSnippet: 'The legend of Holy Dragon was told.', charOffset: 10 },
        avatarColor: '#654321',
      },
    ];

    saveCharacterOverride(BOOK_ID, {
      originalName: 'Holy Dragon',
      resolvedName: 'Volcanica',
      nativeName: 'ボルカニカ',
      imageUrl: 'https://example.com/volcanica.png',
      description: 'The Divine Dragon.',
      source: 'fandom',
      updatedAt: Date.now(),
    }, BOOK_TITLE);

    const remapped = applyOverridesToCharacters(BOOK_ID, mockCharacters);
    expect(remapped.length).toBe(2);

    const subaru = remapped.find((c) => c.name === 'Subaru Natsuki');
    expect(subaru).toBeDefined();
    expect(subaru?.totalMentions).toBe(120);

    const volcanica = remapped.find((c) => c.name === 'Volcanica');
    expect(volcanica).toBeDefined();
    expect(volcanica?.totalMentions).toBe(17); // Preserved mentions
    expect(volcanica?.firstMention.chapterIndex).toBe(19); // Preserved debut chapter
    expect(volcanica?.nativeName).toBe('ボルカニカ');
    expect(volcanica?.imageUrl).toBe('https://example.com/volcanica.png');
    expect(volcanica?.originalExtractedName).toBe('Holy Dragon');
  });

  it('dispatches shiori-character-overrides-changed event on save and remove', () => {
    const listener = vi.fn();
    window.addEventListener('shiori-character-overrides-changed', listener);

    saveCharacterOverride(BOOK_ID, {
      originalName: 'Rem',
      resolvedName: 'Rem',
      nativeName: 'レム',
      source: 'fandom',
      updatedAt: Date.now(),
    });

    expect(listener).toHaveBeenCalledTimes(1);

    removeCharacterOverride(BOOK_ID, 'Rem');
    expect(listener).toHaveBeenCalledTimes(2);

    window.removeEventListener('shiori-character-overrides-changed', listener);
  });
});
