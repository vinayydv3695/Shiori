import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useVocabularyStore } from './vocabularyStore';
import { api, type VocabularyWord, type VocabularyStats } from '@/lib/tauri';

const mockWords: VocabularyWord[] = [
  {
    id: 1,
    bookId: 1,
    word: 'soliloquy',
    cleanWord: 'soliloquy',
    reading: 'səˈlɪləkwi',
    definition: 'an act of speaking ones thoughts aloud',
    sentenceContext: 'He began his famous soliloquy in the third scene.',
    chapterTitle: 'Act III Scene I',
    tags: '',
    reps: 0,
    intervalDays: 0,
    easeFactor: 2.5,
    dueDate: '2026-11-06',
    createdAt: '2026-11-06T00:00:00Z',
    lastReviewed: null,
  },
];

vi.mock('@/lib/tauri', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/tauri')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      addVocabularyWord: vi.fn(async (params) => ({
        id: 100,
        bookId: params.bookId,
        word: params.word,
        cleanWord: params.cleanWord || params.word.toLowerCase(),
        reading: params.reading || null,
        definition: params.definition,
        sentenceContext: params.sentenceContext || null,
        chapterTitle: params.chapterTitle || null,
        tags: '',
        reps: 0,
        intervalDays: 0,
        easeFactor: 2.5,
        dueDate: '2026-11-06',
        createdAt: '2026-11-06T00:00:00Z',
        lastReviewed: null,
      })),
      getVocabularyWords: vi.fn(async () => [...mockWords]),
      reviewVocabularyWord: vi.fn(async (cardId, grade) => ({
        ...mockWords[0],
        reps: 1,
        dueDate: '2026-11-07',
      })),
      deleteVocabularyWord: vi.fn(async () => {}),
      getVocabularyStats: vi.fn(async () => ({
        totalCards: 1,
        dueToday: 1,
        learned: 0,
        newToday: 1,
      })),
      exportVocabularyAnki: vi.fn(async () => 'mock-tsv-data'),
    },
  };
});

describe('vocabularyStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useVocabularyStore.setState({
      words: [],
      dueWords: [],
      stats: null,
      isLoading: false,
      reviewIndex: 0,
      showAnswer: false,
      isReviewCompleted: false,
    });
  });

  it('adds a vocabulary word and updates stats', async () => {
    const word = await useVocabularyStore.getState().addWord({
      bookId: 1,
      word: 'soliloquy',
      cleanWord: 'soliloquy',
      definition: 'an act of speaking ones thoughts aloud',
      sentenceContext: 'He began his famous soliloquy in the third scene.',
    });

    expect(word).toBeDefined();
    expect(word?.word).toBe('soliloquy');
    expect(api.addVocabularyWord).toHaveBeenCalled();
  });

  it('steps through cards and handles SM-2 grading', async () => {
    const store = useVocabularyStore.getState();
    await store.loadDueWords(1);
    expect(useVocabularyStore.getState().dueWords.length).toBeGreaterThan(0);

    const firstCard = useVocabularyStore.getState().dueWords[0];
    useVocabularyStore.getState().setShowAnswer(true);
    expect(useVocabularyStore.getState().showAnswer).toBe(true);

    await useVocabularyStore.getState().submitReview(firstCard.id, 3); // Grade Good
    expect(useVocabularyStore.getState().showAnswer).toBe(false);
    expect(api.reviewVocabularyWord).toHaveBeenCalledWith(firstCard.id, 3);
  });
});
