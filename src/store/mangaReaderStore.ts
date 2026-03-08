import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ═══════════════════════════════════════════════════════════
// MANGA READER STATE MANAGEMENT
// Three slices: Content (ephemeral), UI (ephemeral), Settings (persisted)
// ═══════════════════════════════════════════════════════════

// ────────────────────────────────────────────────────────────
// SLICE 1: Content State (not persisted — changes per book)
// ────────────────────────────────────────────────────────────
interface MangaContentState {
    bookId: number | null;
    bookPath: string | null;
    title: string;
    totalPages: number;
    currentPage: number;
    currentChapter: number;
    totalChapters: number;
    pageDimensions: [number, number][]; // [width, height] per page
    isLoading: boolean;
    error: string | null;

    // Actions
    openManga: (bookId: number, path: string, title: string, totalPages: number, pageDimensions?: [number, number][]) => void;
    closeManga: () => void;
    setCurrentPage: (page: number) => void;
    setCurrentChapter: (chapter: number) => void;
    nextPage: (step?: number) => boolean;
    prevPage: (step?: number) => boolean;
    setLoading: (loading: boolean) => void;
    setError: (error: string | null) => void;
    setTotalPages: (total: number) => void;
    setPageDimensions: (dims: [number, number][]) => void;
    mergePageDimensions: (indices: number[], dims: [number, number][]) => void;
}

export const useMangaContentStore = create<MangaContentState>((set, get) => ({
    bookId: null,
    bookPath: null,
    title: '',
    totalPages: 0,
    currentPage: 0,
    currentChapter: 0,
    totalChapters: 1,
    pageDimensions: [],
    isLoading: false,
    error: null,

    openManga: (bookId, path, title, totalPages, pageDimensions) => set({
        bookId,
        bookPath: path,
        title,
        totalPages,
        currentPage: 0,
        currentChapter: 0,
        pageDimensions: pageDimensions || [],
        isLoading: false,
        error: null,
    }),

    closeManga: () => set({
        bookId: null,
        bookPath: null,
        title: '',
        totalPages: 0,
        currentPage: 0,
        currentChapter: 0,
        totalChapters: 1,
        pageDimensions: [],
        isLoading: false,
        error: null,
    }),

    setCurrentPage: (page) => {
        const { totalPages } = get();
        const clamped = Math.max(0, Math.min(page, totalPages - 1));
        set({ currentPage: clamped });
    },

    setCurrentChapter: (chapter) => set({ currentChapter: chapter }),

    nextPage: (step = 1) => {
        const { currentPage, totalPages } = get();
        if (currentPage < totalPages - 1) {
            set({ currentPage: Math.min(currentPage + step, totalPages - 1) });
            return true;
        }
        return false;
    },

    prevPage: (step = 1) => {
        const { currentPage } = get();
        if (currentPage > 0) {
            set({ currentPage: Math.max(currentPage - step, 0) });
            return true;
        }
        return false;
    },

    setLoading: (loading) => set({ isLoading: loading }),
    setError: (error) => set({ error }),
    setTotalPages: (total) => set({ totalPages: total }),
    setPageDimensions: (dims) => set({ pageDimensions: dims }),
    /** Merge real dimensions into the array at specific indices.
     *  indices[i] maps to dims[i]. Leaves other entries untouched. */
    mergePageDimensions: (indices: number[], dims: [number, number][]) => set((state) => {
        const updated = [...state.pageDimensions];
        for (let i = 0; i < indices.length && i < dims.length; i++) {
            if (indices[i] < updated.length) {
                updated[indices[i]] = dims[i];
            }
        }
        return { pageDimensions: updated };
    }),
}));


// ────────────────────────────────────────────────────────────
// SLICE 2: UI State (not persisted — fast-changing)
// ────────────────────────────────────────────────────────────
interface MangaUIState {
    isTopBarVisible: boolean;
    isSidebarOpen: boolean;
    isSettingsOpen: boolean;
    scrollProgress: number; // 0–100

    setTopBarVisible: (visible: boolean) => void;
    toggleSidebar: () => void;
    closeSidebar: () => void;
    toggleSettings: () => void;
    closeSettings: () => void;
    setScrollProgress: (progress: number) => void;
}

export const useMangaUIStore = create<MangaUIState>((set) => ({
    isTopBarVisible: true,
    isSidebarOpen: false,
    isSettingsOpen: false,
    scrollProgress: 0,

    setTopBarVisible: (visible) => set({ isTopBarVisible: visible }),
    toggleSidebar: () => set((s) => ({
        isSidebarOpen: !s.isSidebarOpen,
        isSettingsOpen: false, // close settings when sidebar toggles
    })),
    closeSidebar: () => set({ isSidebarOpen: false }),
    toggleSettings: () => set((s) => ({
        isSettingsOpen: !s.isSettingsOpen,
        isSidebarOpen: false, // close sidebar when settings open
    })),
    closeSettings: () => set({ isSettingsOpen: false }),
    setScrollProgress: (progress) => set({ scrollProgress: progress }),
}));


// ────────────────────────────────────────────────────────────
// SLICE 3: Settings State (persisted to localStorage)
// ────────────────────────────────────────────────────────────
export type ReadingMode = 'single' | 'strip' | 'webtoon' | 'manhwa' | 'comic';
export type ReadingDirection = 'ltr' | 'rtl';
export type FitMode = 'width' | 'height' | 'contain' | 'original';
export type ProgressBarPosition = 'top' | 'bottom' | 'left' | 'right' | 'none';

interface MangaSettingsState {
    readingMode: ReadingMode;
    readingDirection: ReadingDirection;
    fitMode: FitMode;
    stripMargin: number;
    progressBarPosition: ProgressBarPosition;
    stickyHeader: boolean;
    showNavigationTips: boolean;
    theme: 'light' | 'dark';
    imageQuality: number; // 0.5–1.0
    preloadIntensity: 'light' | 'normal' | 'aggressive';

    // Actions
    setReadingMode: (mode: ReadingMode) => void;
    setReadingDirection: (dir: ReadingDirection) => void;
    setFitMode: (fit: FitMode) => void;
    setStripMargin: (margin: number) => void;
    setProgressBarPosition: (pos: ProgressBarPosition) => void;
    toggleStickyHeader: () => void;
    toggleNavigationTips: () => void;
    setTheme: (theme: 'light' | 'dark') => void;
    toggleTheme: () => void;
    setImageQuality: (quality: number) => void;
    setPreloadIntensity: (intensity: 'light' | 'normal' | 'aggressive') => void;
    resetToDefaults: () => void;
}

const defaultMangaSettings = {
    readingMode: 'single' as ReadingMode,
    readingDirection: 'ltr' as ReadingDirection,
    fitMode: 'contain' as FitMode,
    stripMargin: 4,
    progressBarPosition: 'bottom' as ProgressBarPosition,
    stickyHeader: true,
    showNavigationTips: true,
    theme: 'dark' as const,
    imageQuality: 0.85,
    preloadIntensity: 'normal' as const,
};

export const useMangaSettingsStore = create<MangaSettingsState>()(
    persist(
        (set, get) => ({
            ...defaultMangaSettings,

            setReadingMode: (mode) => {
                const fitDefaults: Record<ReadingMode, FitMode> = {
                    single: 'contain',
                    strip: 'width',
                    webtoon: 'width',
                    manhwa: 'width',
                    comic: 'contain',
                };
                set({ readingMode: mode, fitMode: fitDefaults[mode] });
            },
            setReadingDirection: (dir) => set({ readingDirection: dir }),
            setFitMode: (fit) => {
                set({ fitMode: fit });
            },
            setStripMargin: (margin) => {
                const clamped = Math.max(0, Math.min(32, margin));
                set({ stripMargin: clamped });
            },
            setProgressBarPosition: (pos) => set({ progressBarPosition: pos }),
            toggleStickyHeader: () => set((s) => ({ stickyHeader: !s.stickyHeader })),
            toggleNavigationTips: () => set((s) => ({ showNavigationTips: !s.showNavigationTips })),
            setTheme: (theme) => {
                set({ theme });
                applyMangaThemeToDOM(theme);
            },
            toggleTheme: () => {
                const newTheme = get().theme === 'light' ? 'dark' : 'light';
                get().setTheme(newTheme);
            },
            setImageQuality: (quality) => {
                const clamped = Math.max(0.5, Math.min(1.0, quality));
                set({ imageQuality: clamped });
            },
            setPreloadIntensity: (intensity) => set({ preloadIntensity: intensity }),
            resetToDefaults: () => {
                set(defaultMangaSettings);
                applyMangaThemeToDOM(defaultMangaSettings.theme);
            },
        }),
        {
            name: 'shiori-manga-settings',
            version: 1,
        }
    )
);


// ────────────────────────────────────────────────────────────
// DOM MANIPULATION HELPERS (No React re-renders!)
// ────────────────────────────────────────────────────────────

const applyMangaThemeToDOM = (theme: 'light' | 'dark') => {
    requestAnimationFrame(() => {
        document.documentElement.setAttribute('data-manga-theme', theme);
    });
};

// Initialize on load (prevent FOUC)
if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('shiori-manga-settings');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            const theme = parsed.state?.theme || 'dark';
            document.documentElement.setAttribute('data-manga-theme', theme);
        } catch {
            document.documentElement.setAttribute('data-manga-theme', 'dark');
        }
    } else {
        document.documentElement.setAttribute('data-manga-theme', 'dark');
    }
}
