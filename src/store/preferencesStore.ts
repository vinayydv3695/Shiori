import { create } from "zustand";
import { api } from "../lib/tauri";
import type {
  UserPreferences,
  BookPreferences,
  MangaPreferences,
  Theme,
} from "../types/preferences";
import { DEFAULT_USER_PREFERENCES } from "../types/preferences";

interface PreferencesStore {
  // State
  preferences: UserPreferences | null;
  bookOverrides: Map<number, Partial<BookPreferences>>;
  mangaOverrides: Map<number, Partial<MangaPreferences>>;
  isLoaded: boolean;
  isLoading: boolean;

  // Actions
  loadPreferences: () => Promise<void>;
  updateTheme: (theme: Theme) => Promise<void>;
  updateBookDefaults: (updates: Partial<BookPreferences>) => Promise<void>;
  updateMangaDefaults: (updates: Partial<MangaPreferences>) => Promise<void>;
  updateGeneralSettings: (updates: {
    autoStart?: boolean;
    defaultImportPath?: string;
    uiDensity?: "compact" | "comfortable";
    accentColor?: string;
    uiScale?: number;
  }) => Promise<void>;

  // Per-book overrides
  setBookOverride: (
    bookId: number,
    overrides: Partial<BookPreferences>
  ) => Promise<void>;
  clearBookOverride: (bookId: number) => Promise<void>;
  getBookPreferences: (bookId: number) => BookPreferences;

  // Per-manga overrides
  setMangaOverride: (
    bookId: number,
    overrides: Partial<MangaPreferences>
  ) => Promise<void>;
  clearMangaOverride: (bookId: number) => Promise<void>;
  getMangaPreferences: (bookId: number) => MangaPreferences;

  // Reset
  reset: () => void;
}

export const usePreferencesStore = create<PreferencesStore>((set, get) => ({
  // Initial state
  preferences: null,
  bookOverrides: new Map(),
  mangaOverrides: new Map(),
  isLoaded: false,
  isLoading: false,

  // Load all preferences from backend
  loadPreferences: async () => {
    set({ isLoading: true });
    try {
      const [preferences, bookOverrides, mangaOverrides] = await Promise.all([
        api.getUserPreferences(),
        api.getBookPreferenceOverrides(),
        api.getMangaPreferenceOverrides(),
      ]);

      const bookOverrideMap = new Map(
        bookOverrides.map((o) => [o.bookId, o.preferences as Partial<BookPreferences>])
      );

      const mangaOverrideMap = new Map(
        mangaOverrides.map((o) => [o.bookId, o.preferences as Partial<MangaPreferences>])
      );

      set({
        preferences,
        bookOverrides: bookOverrideMap,
        mangaOverrides: mangaOverrideMap,
        isLoaded: true,
        isLoading: false,
      });

      // Apply theme and scale to DOM
      document.documentElement.setAttribute("data-theme", preferences.theme);
      const scale = (preferences as any).uiScale ?? preferences.uiScale ?? 1.0;
      document.documentElement.style.setProperty('--ui-scale', String(scale));
    } catch (error) {
      console.error("Failed to load preferences:", error);
      set({ isLoading: false });
    }
  },

  // Update theme (with optimistic update)
  updateTheme: async (theme: Theme) => {
    const previousTheme = get().preferences?.theme;

    // Optimistic update
    set((state) => ({
      preferences: state.preferences
        ? { ...state.preferences, theme }
        : DEFAULT_USER_PREFERENCES,
    }));
    document.documentElement.setAttribute("data-theme", theme);

    try {
      await api.updateUserPreferences({ theme });
    } catch (error) {
      console.error("Failed to update theme:", error);
      // Rollback
      if (previousTheme) {
        set((state) => ({
          preferences: state.preferences
            ? { ...state.preferences, theme: previousTheme }
            : DEFAULT_USER_PREFERENCES,
        }));
        document.documentElement.setAttribute("data-theme", previousTheme);
      }
    }
  },

  // Update book defaults
  updateBookDefaults: async (updates: Partial<BookPreferences>) => {
    const previous = get().preferences?.book;

    // Optimistic update
    set((state) => ({
      preferences: state.preferences
        ? {
          ...state.preferences,
          book: { ...state.preferences.book, ...updates },
        }
        : DEFAULT_USER_PREFERENCES,
    }));

    try {
      await api.updateUserPreferences({
        book: { ...get().preferences!.book, ...updates },
      });
    } catch (error) {
      console.error("Failed to update book preferences:", error);
      // Rollback
      if (previous) {
        set((state) => ({
          preferences: state.preferences
            ? { ...state.preferences, book: previous }
            : DEFAULT_USER_PREFERENCES,
        }));
      }
    }
  },

  // Update manga defaults
  updateMangaDefaults: async (updates: Partial<MangaPreferences>) => {
    const previous = get().preferences?.manga;

    // Optimistic update
    set((state) => ({
      preferences: state.preferences
        ? {
          ...state.preferences,
          manga: { ...state.preferences.manga, ...updates },
        }
        : DEFAULT_USER_PREFERENCES,
    }));

    try {
      await api.updateUserPreferences({
        manga: { ...get().preferences!.manga, ...updates },
      });
    } catch (error) {
      console.error("Failed to update manga preferences:", error);
      // Rollback
      if (previous) {
        set((state) => ({
          preferences: state.preferences
            ? { ...state.preferences, manga: previous }
            : DEFAULT_USER_PREFERENCES,
        }));
      }
    }
  },

  // Update general settings
  updateGeneralSettings: async (updates) => {
    const previous = get().preferences;

    // Optimistic update
    set((state) => ({
      preferences: state.preferences
        ? { ...state.preferences, ...updates }
        : DEFAULT_USER_PREFERENCES,
    }));

    // Immediately apply ui_scale to CSS if provided (real-time preview)
    if ('uiScale' in updates) {
      const scale = (updates as any).uiScale as number;
      document.documentElement.style.setProperty('--ui-scale', String(scale));
    }

    try {
      await api.updateUserPreferences(updates);
    } catch (error) {
      console.error("Failed to update general settings:", error);
      // Rollback
      if (previous) {
        set({ preferences: previous });
        const prevScale = previous.uiScale ?? 1.0;
        document.documentElement.style.setProperty('--ui-scale', String(prevScale));
      }
    }
  },

  // Set book-specific override
  setBookOverride: async (bookId: number, overrides: Partial<BookPreferences>) => {
    const previous = get().bookOverrides.get(bookId);

    // Optimistic update
    set((state) => {
      const newOverrides = new Map(state.bookOverrides);
      newOverrides.set(bookId, overrides);
      return { bookOverrides: newOverrides };
    });

    try {
      await api.setBookPreferenceOverride(bookId, overrides);
    } catch (error) {
      console.error("Failed to set book override:", error);
      // Rollback
      set((state) => {
        const newOverrides = new Map(state.bookOverrides);
        if (previous) {
          newOverrides.set(bookId, previous);
        } else {
          newOverrides.delete(bookId);
        }
        return { bookOverrides: newOverrides };
      });
    }
  },

  // Clear book-specific override
  clearBookOverride: async (bookId: number) => {
    const previous = get().bookOverrides.get(bookId);

    // Optimistic update
    set((state) => {
      const newOverrides = new Map(state.bookOverrides);
      newOverrides.delete(bookId);
      return { bookOverrides: newOverrides };
    });

    try {
      await api.clearBookPreferenceOverride(bookId);
    } catch (error) {
      console.error("Failed to clear book override:", error);
      // Rollback
      if (previous) {
        set((state) => {
          const newOverrides = new Map(state.bookOverrides);
          newOverrides.set(bookId, previous);
          return { bookOverrides: newOverrides };
        });
      }
    }
  },

  // Get merged book preferences (defaults + overrides)
  getBookPreferences: (bookId: number): BookPreferences => {
    const defaults = get().preferences?.book ?? DEFAULT_USER_PREFERENCES.book;
    const overrides = get().bookOverrides.get(bookId) ?? {};
    return { ...defaults, ...overrides };
  },

  // Set manga-specific override
  setMangaOverride: async (bookId: number, overrides: Partial<MangaPreferences>) => {
    const previous = get().mangaOverrides.get(bookId);

    // Optimistic update
    set((state) => {
      const newOverrides = new Map(state.mangaOverrides);
      newOverrides.set(bookId, overrides);
      return { mangaOverrides: newOverrides };
    });

    try {
      await api.setMangaPreferenceOverride(bookId, overrides);
    } catch (error) {
      console.error("Failed to set manga override:", error);
      // Rollback
      set((state) => {
        const newOverrides = new Map(state.mangaOverrides);
        if (previous) {
          newOverrides.set(bookId, previous);
        } else {
          newOverrides.delete(bookId);
        }
        return { mangaOverrides: newOverrides };
      });
    }
  },

  // Clear manga-specific override
  clearMangaOverride: async (bookId: number) => {
    const previous = get().mangaOverrides.get(bookId);

    // Optimistic update
    set((state) => {
      const newOverrides = new Map(state.mangaOverrides);
      newOverrides.delete(bookId);
      return { mangaOverrides: newOverrides };
    });

    try {
      await api.clearMangaPreferenceOverride(bookId);
    } catch (error) {
      console.error("Failed to clear manga override:", error);
      // Rollback
      if (previous) {
        set((state) => {
          const newOverrides = new Map(state.mangaOverrides);
          newOverrides.set(bookId, previous);
          return { mangaOverrides: newOverrides };
        });
      }
    }
  },

  // Get merged manga preferences (defaults + overrides)
  getMangaPreferences: (bookId: number): MangaPreferences => {
    const defaults = get().preferences?.manga ?? DEFAULT_USER_PREFERENCES.manga;
    const overrides = get().mangaOverrides.get(bookId) ?? {};
    return { ...defaults, ...overrides };
  },

  // Reset to defaults
  reset: () => {
    set({
      preferences: null,
      bookOverrides: new Map(),
      mangaOverrides: new Map(),
      isLoaded: false,
      isLoading: false,
    });
  },
}));
