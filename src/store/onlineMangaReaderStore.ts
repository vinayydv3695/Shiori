import { create } from 'zustand';
import { pluginApi, type Chapter, type Page } from '@/lib/pluginSources';

interface OnlineMangaReaderState {
  sourceId: string | null;
  contentId: string | null;
  chapterId: string | null;
  chapters: Chapter[];
  pages: Page[];
  currentPageIndex: number;
  isLoading: boolean;
  error: string | null;

  setSource: (sourceId: string | null) => void;
  setContent: (contentId: string | null, chapters?: Chapter[]) => void;
  setChapter: (chapterId: string | null) => Promise<void>;
  setChapters: (chapters: Chapter[]) => void;
  nextPage: () => boolean;
  prevPage: () => boolean;
  goToPage: (index: number) => void;
  loadChapterPages: (sourceId: string, contentId: string, chapterId: string) => Promise<void>;
  reset: () => void;
}

export const useOnlineMangaReaderStore = create<OnlineMangaReaderState>((set, get) => ({
  sourceId: null,
  contentId: null,
  chapterId: null,
  chapters: [],
  pages: [],
  currentPageIndex: 0,
  isLoading: false,
  error: null,

  setSource: (sourceId) => set({ sourceId }),

  setContent: (contentId, chapters = []) =>
    set({
      contentId,
      chapters,
      chapterId: null,
      pages: [],
      currentPageIndex: 0,
      error: null,
    }),

  setChapters: (chapters) => set({ chapters }),

  setChapter: async (chapterId) => {
    const { sourceId, contentId } = get();
    set({ chapterId, pages: [], currentPageIndex: 0, error: null });

    if (!sourceId || !contentId || !chapterId) return;
    await get().loadChapterPages(sourceId, contentId, chapterId);
  },

  nextPage: () => {
    const { currentPageIndex, pages } = get();
    if (currentPageIndex < pages.length - 1) {
      set({ currentPageIndex: currentPageIndex + 1 });
      return true;
    }
    return false;
  },

  prevPage: () => {
    const { currentPageIndex } = get();
    if (currentPageIndex > 0) {
      set({ currentPageIndex: currentPageIndex - 1 });
      return true;
    }
    return false;
  },

  goToPage: (index) => {
    const { pages } = get();
    const clamped = Math.max(0, Math.min(index, Math.max(0, pages.length - 1)));
    set({ currentPageIndex: clamped });
  },

  loadChapterPages: async (sourceId, contentId, chapterId) => {
    set({ isLoading: true, error: null });
    try {
      const pages = await pluginApi.getPages(sourceId, contentId, chapterId);
      const sortedPages = pages.slice().sort((a, b) => a.index - b.index);
      set({ pages: sortedPages, currentPageIndex: 0, isLoading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load chapter pages';
      set({ isLoading: false, error: message, pages: [] });
    }
  },

  reset: () =>
    set({
      sourceId: null,
      contentId: null,
      chapterId: null,
      chapters: [],
      pages: [],
      currentPageIndex: 0,
      isLoading: false,
      error: null,
    }),
}));
