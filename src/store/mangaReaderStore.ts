import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Chapter } from '@/lib/pluginSources';

// ═══════════════════════════════════════════════════════════
// MANGA READER STATE MANAGEMENT
// Four slices: Content (ephemeral), UI (ephemeral), Settings (persisted), Source (ephemeral)
// ═══════════════════════════════════════════════════════════

// ────────────────────────────────────────────────────────────
// MANGA SOURCE TYPES - Unified interface for local/online
// ────────────────────────────────────────────────────────────

export type MangaSourceType = 'local' | 'online';

export interface OnlineSourceConfig {
    sourceId: string;       // e.g., 'mangadex', 'toongod'
    contentId: string;      // manga ID from the source
    contentTitle: string;   // manga title
    chapterId: string;      // current chapter ID
    chapterTitle: string;   // current chapter title
    chapters: Chapter[];    // all available chapters
    pageUrls: string[];     // URLs for all pages in current chapter
}

export interface LocalSourceConfig {
    bookId: number;
    bookPath: string;
}

// ────────────────────────────────────────────────────────────
// SLICE 1: Content State (not persisted — changes per book)
// ────────────────────────────────────────────────────────────
interface MangaContentState {
    // Source type and configuration
    sourceType: MangaSourceType;
    localSource: LocalSourceConfig | null;
    onlineSource: OnlineSourceConfig | null;
    
    // Legacy fields for backward compatibility
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

    // Actions - Local manga (existing API)
    openManga: (bookId: number, path: string, title: string, totalPages: number, pageDimensions?: [number, number][]) => void;
    
    // Actions - Online manga (new API)
    openOnlineManga: (config: OnlineSourceConfig) => void;
    setOnlineChapter: (chapterId: string, chapterTitle: string, pageUrls: string[]) => void;
    
    // Common actions
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
    
    // Helpers
    isOnline: () => boolean;
    getPageUrl: (pageIndex: number) => string | null;
}

export const useMangaContentStore = create<MangaContentState>((set, get) => ({
    // Source type and configuration
    sourceType: 'local' as MangaSourceType,
    localSource: null,
    onlineSource: null,
    
    // Legacy fields for backward compatibility
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

    // Open local manga (existing API - maintains backward compatibility)
    openManga: (bookId, path, title, totalPages, pageDimensions) => set({
        sourceType: 'local',
        localSource: { bookId, bookPath: path },
        onlineSource: null,
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

    // Open online manga (new API)
    openOnlineManga: (config) => set({
        sourceType: 'online',
        localSource: null,
        onlineSource: config,
        bookId: null,
        bookPath: null,
        title: config.contentTitle,
        totalPages: config.pageUrls.length,
        currentPage: 0,
        currentChapter: config.chapters.findIndex(c => c.id === config.chapterId),
        totalChapters: config.chapters.length,
        pageDimensions: config.pageUrls.map(() => [800, 1200] as [number, number]), // Default dimensions for online
        isLoading: false,
        error: null,
    }),

    // Update chapter for online manga
    setOnlineChapter: (chapterId, chapterTitle, pageUrls) => {
        const state = get();
        if (state.sourceType !== 'online' || !state.onlineSource) return;
        
        const chapterIndex = state.onlineSource.chapters.findIndex(c => c.id === chapterId);
        
        set({
            onlineSource: {
                ...state.onlineSource,
                chapterId,
                chapterTitle,
                pageUrls,
            },
            totalPages: pageUrls.length,
            currentPage: 0,
            currentChapter: chapterIndex >= 0 ? chapterIndex : 0,
            pageDimensions: pageUrls.map(() => [800, 1200] as [number, number]),
        });
    },

    closeManga: () => set({
        sourceType: 'local',
        localSource: null,
        onlineSource: null,
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
    
    // Helpers
    isOnline: () => get().sourceType === 'online',
    
    getPageUrl: (pageIndex) => {
        const state = get();
        if (state.sourceType === 'online' && state.onlineSource) {
            return state.onlineSource.pageUrls[pageIndex] || null;
        }
        return null; // Local pages use IPC, not URLs
    },
}));


// ────────────────────────────────────────────────────────────
// SLICE 2: UI State (not persisted — fast-changing)
// ────────────────────────────────────────────────────────────
interface MangaUIState {
    isTopBarVisible: boolean;
    isSidebarOpen: boolean;
    isSettingsOpen: boolean;
    scrollProgress: number; // 0–100
    lastScrollActivityAt: number;

    setTopBarVisible: (visible: boolean) => void;
    toggleTopBar: () => void;
    markScrollActivity: () => void;
    toggleSidebar: () => void;
    closeSidebar: () => void;
    toggleSettings: () => void;
    closeSettings: () => void;
    setScrollProgress: (progress: number) => void;
    resetUI: () => void;
}

export const useMangaUIStore = create<MangaUIState>((set) => ({
    isTopBarVisible: true,
    isSidebarOpen: false,
    isSettingsOpen: false,
    scrollProgress: 0,
    lastScrollActivityAt: 0,

    setTopBarVisible: (visible) => set({ isTopBarVisible: visible }),
    toggleTopBar: () => set((s) => ({ isTopBarVisible: !s.isTopBarVisible })),
    markScrollActivity: () => set({ lastScrollActivityAt: Date.now() }),
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
    resetUI: () => set({
        isTopBarVisible: true,
        isSidebarOpen: false,
        isSettingsOpen: false,
        scrollProgress: 0,
        lastScrollActivityAt: 0,
    }),
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

const READING_MODE_OPTIONS: ReadingMode[] = ['single', 'strip', 'webtoon', 'manhwa', 'comic'];
const READING_DIRECTION_OPTIONS: ReadingDirection[] = ['ltr', 'rtl'];
const FIT_MODE_OPTIONS: FitMode[] = ['width', 'height', 'contain', 'original'];
const PROGRESS_BAR_POSITION_OPTIONS: ProgressBarPosition[] = ['top', 'bottom', 'left', 'right', 'none'];
const PRELOAD_INTENSITY_OPTIONS: Array<MangaSettingsState['preloadIntensity']> = ['light', 'normal', 'aggressive'];
const MANGA_THEME_OPTIONS: Array<MangaSettingsState['theme']> = ['light', 'dark'];

const clampNumber = (value: unknown, fallback: number, min: number, max: number): number => {
    if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
    return Math.max(min, Math.min(max, value));
};

const clampStringEnum = <T extends string>(value: unknown, fallback: T, allowed: readonly T[]): T => {
    if (typeof value !== 'string') return fallback;
    return allowed.includes(value as T) ? (value as T) : fallback;
};

const normalizeMangaSettingsState = (raw: unknown) => {
    const source = (raw && typeof raw === 'object') ? (raw as Partial<typeof defaultMangaSettings>) : {};

    return {
        readingMode: clampStringEnum(source.readingMode, defaultMangaSettings.readingMode, READING_MODE_OPTIONS),
        readingDirection: clampStringEnum(source.readingDirection, defaultMangaSettings.readingDirection, READING_DIRECTION_OPTIONS),
        fitMode: clampStringEnum(source.fitMode, defaultMangaSettings.fitMode, FIT_MODE_OPTIONS),
        stripMargin: clampNumber(source.stripMargin, defaultMangaSettings.stripMargin, 0, 32),
        progressBarPosition: clampStringEnum(source.progressBarPosition, defaultMangaSettings.progressBarPosition, PROGRESS_BAR_POSITION_OPTIONS),
        stickyHeader: typeof source.stickyHeader === 'boolean' ? source.stickyHeader : defaultMangaSettings.stickyHeader,
        showNavigationTips: typeof source.showNavigationTips === 'boolean' ? source.showNavigationTips : defaultMangaSettings.showNavigationTips,
        theme: clampStringEnum(source.theme, defaultMangaSettings.theme, MANGA_THEME_OPTIONS),
        imageQuality: clampNumber(source.imageQuality, defaultMangaSettings.imageQuality, 0.5, 1.0),
        preloadIntensity: clampStringEnum(source.preloadIntensity, defaultMangaSettings.preloadIntensity, PRELOAD_INTENSITY_OPTIONS),
    };
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
            migrate: (persistedState) => {
                if (!persistedState || typeof persistedState !== 'object') {
                    return defaultMangaSettings;
                }
                return normalizeMangaSettingsState(persistedState);
            },
            merge: (persistedState, currentState) => {
                const normalized = normalizeMangaSettingsState(persistedState);
                return {
                    ...currentState,
                    ...normalized,
                };
            },
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
