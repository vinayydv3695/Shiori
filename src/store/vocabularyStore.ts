import { create } from 'zustand';
import { api, type VocabularyWord, type VocabularyStats } from '@/lib/tauri';
import { useToastStore } from './toastStore';

interface VocabularyState {
  words: VocabularyWord[];
  dueWords: VocabularyWord[];
  stats: VocabularyStats | null;
  isLoading: boolean;
  reviewIndex: number;
  showAnswer: boolean;
  isReviewCompleted: boolean;

  loadWords: (bookId?: number) => Promise<void>;
  loadDueWords: (bookId?: number) => Promise<void>;
  loadStats: (bookId?: number) => Promise<void>;
  addWord: (params: {
    bookId?: number;
    word: string;
    cleanWord?: string;
    reading?: string;
    definition: string;
    sentenceContext?: string;
    chapterTitle?: string;
  }) => Promise<VocabularyWord | null>;
  submitReview: (cardId: number, grade: number) => Promise<void>;
  deleteWord: (cardId: number) => Promise<void>;
  exportAnki: (bookId?: number) => Promise<string>;
  nextCard: () => void;
  setShowAnswer: (show: boolean) => void;
  resetReview: () => void;
}

export const useVocabularyStore = create<VocabularyState>((set, get) => ({
  words: [],
  dueWords: [],
  stats: null,
  isLoading: false,
  reviewIndex: 0,
  showAnswer: false,
  isReviewCompleted: false,

  loadWords: async (bookId) => {
    set({ isLoading: true });
    try {
      const words = await api.getVocabularyWords(bookId, false);
      set({ words, isLoading: false });
    } catch (err) {
      console.error('[VocabularyStore] Failed to load words:', err);
      set({ isLoading: false });
    }
  },

  loadDueWords: async (bookId) => {
    set({ isLoading: true, reviewIndex: 0, showAnswer: false, isReviewCompleted: false });
    try {
      const dueWords = await api.getVocabularyWords(bookId, true);
      // If no due words today, fall back to recent words so user can practice anytime
      let wordsToReview = dueWords;
      if (wordsToReview.length === 0) {
        const allWords = await api.getVocabularyWords(bookId, false);
        wordsToReview = allWords.slice(0, 15);
      }
      set({
        dueWords: wordsToReview,
        isReviewCompleted: wordsToReview.length === 0,
        isLoading: false,
      });
    } catch (err) {
      console.error('[VocabularyStore] Failed to load due words:', err);
      set({ isLoading: false });
    }
  },

  loadStats: async (bookId) => {
    try {
      const stats = await api.getVocabularyStats(bookId);
      set({ stats });
    } catch (err) {
      console.error('[VocabularyStore] Failed to load stats:', err);
    }
  },

  addWord: async (params) => {
    try {
      const word = await api.addVocabularyWord(params);
      useToastStore.getState().addToast({
        title: 'Saved to Vocabulary Deck',
        description: `"${params.word}" added with context`,
        variant: 'success',
        duration: 2500,
      });
      // Refresh list and stats
      void get().loadStats(params.bookId);
      void get().loadWords(params.bookId);
      return word;
    } catch (err) {
      console.error('[VocabularyStore] Failed to add vocabulary word:', err);
      useToastStore.getState().addToast({
        title: 'Failed to save word',
        description: String(err),
        variant: 'error',
      });
      return null;
    }
  },

  submitReview: async (cardId, grade) => {
    try {
      await api.reviewVocabularyWord(cardId, grade);
      const { dueWords, reviewIndex } = get();
      if (reviewIndex + 1 >= dueWords.length) {
        set({ isReviewCompleted: true, showAnswer: false });
      } else {
        set({ reviewIndex: reviewIndex + 1, showAnswer: false });
      }
      void get().loadStats();
    } catch (err) {
      console.error('[VocabularyStore] Failed to review word:', err);
    }
  },

  deleteWord: async (cardId) => {
    try {
      await api.deleteVocabularyWord(cardId);
      set((state) => ({
        words: state.words.filter((w) => w.id !== cardId),
        dueWords: state.dueWords.filter((w) => w.id !== cardId),
      }));
      useToastStore.getState().addToast({
        title: 'Word deleted from deck',
        variant: 'info',
        duration: 1500,
      });
      void get().loadStats();
    } catch (err) {
      console.error('[VocabularyStore] Failed to delete word:', err);
    }
  },

  exportAnki: async (bookId) => {
    try {
      const tsv = await api.exportVocabularyAnki(bookId);
      return tsv;
    } catch (err) {
      console.error('[VocabularyStore] Failed to export Anki:', err);
      throw err;
    }
  },

  nextCard: () => {
    const { dueWords, reviewIndex } = get();
    if (reviewIndex + 1 >= dueWords.length) {
      set({ isReviewCompleted: true, showAnswer: false });
    } else {
      set({ reviewIndex: reviewIndex + 1, showAnswer: false });
    }
  },

  setShowAnswer: (show) => set({ showAnswer: show }),

  resetReview: () => set({ reviewIndex: 0, showAnswer: false, isReviewCompleted: false }),
}));
