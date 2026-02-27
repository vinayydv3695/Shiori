import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ═══════════════════════════════════════════════════════════
// PREMIUM READER STATE MANAGEMENT
// Separated into UI, Settings, and Content for optimal performance
// ═══════════════════════════════════════════════════════════

// ────────────────────────────────────────────────────────────
// UI STATE (fast-changing, not persisted)
// ────────────────────────────────────────────────────────────
interface UIState {
  isTopBarVisible: boolean;
  isSidebarOpen: boolean;
  sidebarTab: 'toc' | 'highlights' | 'notes' | 'bookmarks' | 'search';
  isFocusMode: boolean;
  scrollProgress: number; // 0-100
  lastMouseMovement: number;

  // Actions
  setTopBarVisible: (visible: boolean) => void;
  toggleSidebar: (tab?: 'toc' | 'highlights' | 'notes' | 'bookmarks' | 'search') => void;
  closeSidebar: () => void;
  setSidebarTab: (tab: 'toc' | 'highlights' | 'notes' | 'bookmarks' | 'search') => void;
  toggleFocusMode: () => void;
  setScrollProgress: (progress: number) => void;
  updateMouseMovement: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  isTopBarVisible: true,
  isSidebarOpen: false,
  sidebarTab: 'toc',
  isFocusMode: false,
  scrollProgress: 0,
  lastMouseMovement: Date.now(),

  setTopBarVisible: (visible) => set({ isTopBarVisible: visible }),

  toggleSidebar: (tab) => set((state) => {
    if (state.isSidebarOpen && tab === state.sidebarTab) {
      return { isSidebarOpen: false };
    }
    return {
      isSidebarOpen: true,
      sidebarTab: tab || state.sidebarTab,
    };
  }),

  closeSidebar: () => set({ isSidebarOpen: false }),

  setSidebarTab: (tab) => set({ sidebarTab: tab, isSidebarOpen: true }),

  toggleFocusMode: () => set((state) => ({ isFocusMode: !state.isFocusMode })),

  setScrollProgress: (progress) => set({ scrollProgress: progress }),

  updateMouseMovement: () => set({ lastMouseMovement: Date.now() }),
}));

// ────────────────────────────────────────────────────────────
// READING SETTINGS STATE (persisted to localStorage)
// ────────────────────────────────────────────────────────────
export type ReaderTheme = 'light' | 'dark' | 'paper' | 'paper-dark';

interface ReadingSettings {
  // Theme
  theme: ReaderTheme;

  // Typography
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  paragraphSpacing: string;
  letterSpacing: string;

  // Layout
  width: 'narrow' | 'medium' | 'wide' | 'full';
  twoPageView: boolean;

  // Page Flip
  pageFlipEnabled: boolean;
  pageFlipSpeed: number; // ms (100-800)

  // Paper Texture
  paperTextureIntensity: number; // 0.0-0.20

  // Adaptive Layout
  uiScale: number; // 0.8-1.4

  // Actions
  setTheme: (theme: ReaderTheme) => void;
  toggleTheme: () => void;
  setFontFamily: (family: string) => void;
  setFontSize: (size: number) => void;
  increaseFontSize: () => void;
  decreaseFontSize: () => void;
  setLineHeight: (height: number) => void;
  setParagraphSpacing: (spacing: string) => void;
  setLetterSpacing: (spacing: string) => void;
  setWidth: (width: 'narrow' | 'medium' | 'wide' | 'full') => void;
  cycleWidth: () => void;
  toggleTwoPageView: () => void;
  setPageFlipEnabled: (enabled: boolean) => void;
  setPageFlipSpeed: (speed: number) => void;
  setPaperTextureIntensity: (intensity: number) => void;
  setUiScale: (scale: number) => void;
  resetToDefaults: () => void;
}

const defaultSettings = {
  theme: 'light' as ReaderTheme,
  fontFamily: 'literata',
  fontSize: 18,
  lineHeight: 1.6,
  paragraphSpacing: '1em',
  letterSpacing: 'normal',
  width: 'wide' as const,
  twoPageView: false,
  pageFlipEnabled: false,
  pageFlipSpeed: 400,
  paperTextureIntensity: 0.08,
  uiScale: 1.0,
};

export const useReadingSettings = create<ReadingSettings>()(
  persist(
    (set, get) => ({
      ...defaultSettings,

      setTheme: (theme) => {
        set({ theme });
        // Theme is now applied to the reader container element by the reader component
        // via applyReaderThemeToElement(), not globally on <html>.
        // Apply texture intensity for paper themes
        if (theme === 'paper' || theme === 'paper-dark') {
          applyTextureIntensityToDOM(get().paperTextureIntensity);
        }
      },

      toggleTheme: () => {
        const cycle: ReaderTheme[] = ['light', 'dark', 'paper', 'paper-dark'];
        const idx = cycle.indexOf(get().theme);
        const newTheme = cycle[(idx + 1) % cycle.length];
        get().setTheme(newTheme);
      },

      setFontFamily: (family) => {
        set({ fontFamily: family });
        applyFontToDOM(family);
      },

      setFontSize: (size) => {
        const clamped = Math.max(14, Math.min(24, size));
        set({ fontSize: clamped });
        applyFontSizeToDOM(clamped);
      },

      increaseFontSize: () => {
        const current = get().fontSize;
        get().setFontSize(current + 1);
      },

      decreaseFontSize: () => {
        const current = get().fontSize;
        get().setFontSize(current - 1);
      },

      setLineHeight: (height) => {
        set({ lineHeight: height });
        applyLineHeightToDOM(height);
      },

      setParagraphSpacing: (spacing) => {
        set({ paragraphSpacing: spacing });
        applyParagraphSpacingToDOM(spacing);
      },

      setLetterSpacing: (spacing) => {
        set({ letterSpacing: spacing });
        applyLetterSpacingToDOM(spacing);
      },

      setWidth: (width) => set({ width }),

      cycleWidth: () => {
        const widths: Array<'narrow' | 'medium' | 'wide' | 'full'> = ['narrow', 'medium', 'wide', 'full'];
        const current = get().width;
        const currentIndex = widths.indexOf(current);
        const nextIndex = (currentIndex + 1) % widths.length;
        set({ width: widths[nextIndex] });
      },

      toggleTwoPageView: () => set((state) => ({ twoPageView: !state.twoPageView })),

      setPageFlipEnabled: (enabled) => set({ pageFlipEnabled: enabled }),

      setPageFlipSpeed: (speed) => set({ pageFlipSpeed: Math.max(100, Math.min(800, speed)) }),

      setPaperTextureIntensity: (intensity) => {
        const clamped = Math.max(0, Math.min(0.20, intensity));
        set({ paperTextureIntensity: clamped });
        applyTextureIntensityToDOM(clamped);
      },

      setUiScale: (scale) => {
        const clamped = Math.max(0.8, Math.min(1.4, scale));
        set({ uiScale: clamped });
        applyUiScaleToDOM(clamped);
      },

      resetToDefaults: () => set(defaultSettings),
    }),
    {
      name: 'shiori-reading-settings',
      version: 3,
    }
  )
);

// ────────────────────────────────────────────────────────────
// DOM MANIPULATION HELPERS (No React re-renders!)
// ────────────────────────────────────────────────────────────

// Reader theme color maps — applied to the reader container element, NOT <html>
export const READER_THEME_COLORS: Record<ReaderTheme, Record<string, string>> = {
  light: {
    '--bg-primary': '#FDFCFA',
    '--bg-secondary': '#F8F7F5',
    '--bg-elevated': '#FFFFFF',
    '--text-primary': '#1A1817',
    '--text-secondary': '#4A4745',
    '--text-tertiary': '#6E6B68',
    '--text-link': '#2563EB',
    '--text-selection': '#3B82F680',
    '--ui-border': '#E7E5E4',
    '--ui-divider': '#D6D3D1',
    '--ui-hover': '#F5F5F4',
    '--ui-active': '#E7E5E4',
    '--ui-focus': '#3B82F6',
    '--shadow': 'rgba(0, 0, 0, 0.05)',
    '--overlay': 'rgba(0, 0, 0, 0.2)',
    '--progress-bar': '#3B82F6',
  },
  dark: {
    '--bg-primary': '#1C1917',
    '--bg-secondary': '#292524',
    '--bg-elevated': '#1F1E1C',
    '--text-primary': '#E7E5E4',
    '--text-secondary': '#A8A29E',
    '--text-tertiary': '#78716C',
    '--text-link': '#60A5FA',
    '--text-selection': '#3B82F680',
    '--ui-border': '#3F3F3F',
    '--ui-divider': '#525252',
    '--ui-hover': '#292524',
    '--ui-active': '#3F3F3F',
    '--ui-focus': '#60A5FA',
    '--shadow': 'rgba(0, 0, 0, 0.3)',
    '--overlay': 'rgba(0, 0, 0, 0.6)',
    '--progress-bar': '#60A5FA',
  },
  paper: {
    '--bg-primary': '#F5F0E8',
    '--bg-secondary': '#EDE7DB',
    '--bg-elevated': '#FAF7F2',
    '--text-primary': '#2C2416',
    '--text-secondary': '#5C4F3D',
    '--text-tertiary': '#8A7B66',
    '--text-link': '#8B4513',
    '--text-selection': '#D4A57480',
    '--ui-border': '#D4C9B8',
    '--ui-divider': '#C7BAA7',
    '--ui-hover': '#EDE7DB',
    '--ui-active': '#D4C9B8',
    '--ui-focus': '#8B6914',
    '--shadow': 'rgba(139, 119, 90, 0.12)',
    '--overlay': 'rgba(44, 36, 22, 0.25)',
    '--progress-bar': '#8B6914',
  },
  'paper-dark': {
    '--bg-primary': '#2A2520',
    '--bg-secondary': '#332E28',
    '--bg-elevated': '#3A342D',
    '--text-primary': '#D4C8B8',
    '--text-secondary': '#A89882',
    '--text-tertiary': '#7A6E5E',
    '--text-link': '#D4A574',
    '--text-selection': '#8B691440',
    '--ui-border': '#4A4238',
    '--ui-divider': '#5A5048',
    '--ui-hover': '#3A342D',
    '--ui-active': '#4A4238',
    '--ui-focus': '#D4A574',
    '--shadow': 'rgba(0, 0, 0, 0.25)',
    '--overlay': 'rgba(0, 0, 0, 0.45)',
    '--progress-bar': '#D4A574',
  },
};

/**
 * Apply reader theme to a specific DOM element (the reader container).
 * This MUST NOT touch document.documentElement — the app-level theme
 * is managed exclusively by preferencesStore via data-theme="black"|"white".
 */
export const applyReaderThemeToElement = (el: HTMLElement, theme: ReaderTheme) => {
  const colors = READER_THEME_COLORS[theme];
  Object.entries(colors).forEach(([key, value]) => {
    el.style.setProperty(key, value);
  });
  el.setAttribute('data-reader-theme', theme);
};

/**
 * Remove reader theme from a DOM element (cleanup on unmount).
 */
export const removeReaderThemeFromElement = (el: HTMLElement) => {
  const allKeys = Object.keys(READER_THEME_COLORS.light);
  allKeys.forEach((key) => {
    el.style.removeProperty(key);
  });
  el.removeAttribute('data-reader-theme');
};

const applyTextureIntensityToDOM = (intensity: number) => {
  requestAnimationFrame(() => {
    document.documentElement.style.setProperty('--texture-intensity', `${intensity}`);
  });
};

const applyUiScaleToDOM = (scale: number) => {
  requestAnimationFrame(() => {
    document.documentElement.style.setProperty('--ui-scale', `${scale}`);
  });
};

const applyFontToDOM = (fontFamily: string) => {
  const fontMap: Record<string, string> = {
    serif: 'Georgia, serif',
    sans: 'Arial, sans-serif',
    system: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    literata: '"Literata", Georgia, serif',
    merriweather: '"Merriweather", Georgia, serif',
    opensans: '"Open Sans", Arial, sans-serif',
    lora: '"Lora", Georgia, serif',
    mono: 'Courier, "Courier New", monospace',
  };

  const fontValue = fontMap[fontFamily] || fontMap.literata;
  requestAnimationFrame(() => {
    document.documentElement.style.setProperty('--reading-font-family', fontValue);
  });
};

const applyFontSizeToDOM = (size: number) => {
  requestAnimationFrame(() => {
    document.documentElement.style.setProperty('--reading-font-size', `${size}px`);
  });
};

const applyLineHeightToDOM = (height: number) => {
  requestAnimationFrame(() => {
    document.documentElement.style.setProperty('--reading-line-height', `${height}`);
  });
};

const applyParagraphSpacingToDOM = (spacing: string) => {
  requestAnimationFrame(() => {
    document.documentElement.style.setProperty('--reading-paragraph-spacing', spacing);
  });
};

const applyLetterSpacingToDOM = (spacing: string) => {
  const spacingMap: Record<string, string> = {
    tight: '-0.01em',
    normal: '0',
    relaxed: '0.01em',
    wide: '0.02em',
  };

  const value = spacingMap[spacing] || spacingMap.normal;
  requestAnimationFrame(() => {
    document.documentElement.style.setProperty('--reading-letter-spacing', value);
  });
};

// Initialize reader typography settings on load.
// NOTE: Reader theme (colors) are NOT applied here — they are scoped to
// the reader container element and applied on mount via applyReaderThemeToElement().
// The app-level theme (data-theme="black"|"white") is managed by preferencesStore.
if (typeof window !== 'undefined') {
  const savedSettings = localStorage.getItem('shiori-reading-settings');
  let parsed: Record<string, any> | null = null;

  if (savedSettings) {
    try {
      parsed = JSON.parse(savedSettings);
    } catch {
      // Corrupted localStorage — clear it so defaults apply cleanly
      console.warn('[premiumReaderStore] Corrupted saved settings, resetting to defaults');
      localStorage.removeItem('shiori-reading-settings');
    }
  }

  if (parsed?.state) {
    const s = parsed.state;
    applyFontToDOM(s.fontFamily || 'literata');
    applyFontSizeToDOM(s.fontSize || 18);
    applyLineHeightToDOM(s.lineHeight || 1.6);
    applyParagraphSpacingToDOM(s.paragraphSpacing || '1em');
    applyLetterSpacingToDOM(s.letterSpacing || 'normal');
    applyTextureIntensityToDOM(s.paperTextureIntensity ?? 0.08);
  } else {
    // Apply defaults
    applyFontToDOM('literata');
    applyFontSizeToDOM(18);
    applyLineHeightToDOM(1.6);
    applyParagraphSpacingToDOM('1em');
    applyLetterSpacingToDOM('normal');
    applyTextureIntensityToDOM(0.08);
  }
}
