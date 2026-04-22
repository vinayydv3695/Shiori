import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { logger } from '@/lib/logger';
import { DEFAULT_READING_FONT_ID, normalizeLegacyFontPreference, resolveReadingFontCss } from '@/lib/readingFonts';

// ═══════════════════════════════════════════════════════════
// PREMIUM READER STATE MANAGEMENT
// Separated into UI, Settings, and Content for optimal performance
// ═══════════════════════════════════════════════════════════

// ────────────────────────────────────────────────────────────
// UI STATE (fast-changing, not persisted)
// ────────────────────────────────────────────────────────────
interface UIState {
  isTopBarVisible: boolean;
  isTopBarShortcutOnly: boolean;
  isSidebarOpen: boolean;
  sidebarTab: 'toc' | 'highlights' | 'notes' | 'bookmarks' | 'search';
  isFocusMode: boolean;
  scrollProgress: number; // 0-100
  lastMouseMovement: number;
  pendingAnnotationId: number | null; // Set to scroll-to a specific annotation after DOM render

  // Actions
  setTopBarVisible: (visible: boolean) => void;
  setTopBarShortcutOnly: (enabled: boolean) => void;
  toggleSidebar: (tab?: 'toc' | 'highlights' | 'notes' | 'bookmarks' | 'search') => void;
  closeSidebar: () => void;
  setSidebarTab: (tab: 'toc' | 'highlights' | 'notes' | 'bookmarks' | 'search') => void;
  toggleFocusMode: () => void;
  setScrollProgress: (progress: number) => void;
  updateMouseMovement: () => void;
  setPendingAnnotationId: (id: number | null) => void;
}

export const useReaderUIStore = create<UIState>((set) => ({
  isTopBarVisible: false,
  isTopBarShortcutOnly: true,
  isSidebarOpen: false,
  sidebarTab: 'toc',
  isFocusMode: false,
  scrollProgress: 0,
  lastMouseMovement: Date.now(),
  pendingAnnotationId: null,

  setTopBarVisible: (visible) => set({ isTopBarVisible: visible }),
  setTopBarShortcutOnly: (enabled) => set({ isTopBarShortcutOnly: enabled }),

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

  setPendingAnnotationId: (id) => set({ pendingAnnotationId: id }),
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
  textAlign: 'left' | 'justify';

  // Colors (Koodo-style custom bg/text)
  backgroundColor: string; // hex color or 'default' (uses theme color)
  textColor: string; // hex color or 'default' (uses theme color)

  // Layout
  width: 'narrow' | 'medium' | 'wide' | 'full';
  margin: number; // 0-80px content margin
  twoPageView: boolean;

  // Brightness
  brightness: number; // 0.5-1.5

  // Page Transition Animation
  pageFlipEnabled: boolean;
  pageFlipSpeed: number; // ms (100-800)
  animationStyle: 'slide' | 'fade' | 'none';

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
  setTextAlign: (align: 'left' | 'justify') => void;
  setBackgroundColor: (color: string) => void;
  setTextColor: (color: string) => void;
  setWidth: (width: 'narrow' | 'medium' | 'wide' | 'full') => void;
  setMargin: (margin: number) => void;
  cycleWidth: () => void;
  toggleTwoPageView: () => void;
  setBrightness: (brightness: number) => void;
  setPageFlipEnabled: (enabled: boolean) => void;
  setPageFlipSpeed: (speed: number) => void;
  setAnimationStyle: (style: 'slide' | 'fade' | 'none') => void;
  setPaperTextureIntensity: (intensity: number) => void;
  setUiScale: (scale: number) => void;
  resetToDefaults: () => void;
}

const defaultSettings = {
  theme: 'light' as ReaderTheme,
  fontFamily: DEFAULT_READING_FONT_ID,
  fontSize: 18,
  lineHeight: 1.6,
  paragraphSpacing: '1em',
  letterSpacing: 'normal',
  textAlign: 'left' as const,
  backgroundColor: 'default',
  textColor: 'default',
  width: 'wide' as const,
  margin: 0,
  twoPageView: false,
  brightness: 1.0,
  pageFlipEnabled: true,
  pageFlipSpeed: 400,
  animationStyle: 'slide' as const,
  paperTextureIntensity: 0.08,
  uiScale: 1.0,
};

export const BG_COLOR_PRESETS = [
  { id: 'default', color: 'default', label: 'Theme' },
  { id: 'white', color: '#FFFFFF', label: 'White' },
  { id: 'cream', color: '#F5F0E8', label: 'Cream' },
  { id: 'green', color: '#E8F0E8', label: 'Green' },
  { id: 'blue', color: '#E8EEF5', label: 'Blue' },
  { id: 'pink', color: '#F5E8EE', label: 'Pink' },
  { id: 'dark', color: '#1C1917', label: 'Dark' },
];

export const TEXT_COLOR_PRESETS = [
  { id: 'default', color: 'default', label: 'Theme' },
  { id: 'black', color: '#1A1817', label: 'Black' },
  { id: 'dark-gray', color: '#333333', label: 'Dark Gray' },
  { id: 'brown', color: '#5C4F3D', label: 'Brown' },
  { id: 'dark-green', color: '#2D4A2D', label: 'Green' },
  { id: 'dark-blue', color: '#2D3A4A', label: 'Blue' },
  { id: 'light', color: '#E7E5E4', label: 'Light' },
];

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
        const normalized = normalizeLegacyFontPreference(family);
        set({ fontFamily: normalized });
        applyFontToDOM(normalized);
      },

      setFontSize: (size) => {
        const clamped = Math.max(12, Math.min(32, size));
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

      setTextAlign: (align) => {
        set({ textAlign: align });
        applyTextAlignToDOM(align);
      },

      setBackgroundColor: (color) => {
        set({ backgroundColor: color });
        applyBackgroundColorToDOM(color);
      },

      setTextColor: (color) => {
        set({ textColor: color });
        applyTextColorToDOM(color);
      },

      setWidth: (width) => set({ width }),

      setMargin: (margin) => {
        const clamped = Math.max(0, Math.min(80, margin));
        set({ margin: clamped });
        applyMarginToDOM(clamped);
      },

      cycleWidth: () => {
        const widths: Array<'narrow' | 'medium' | 'wide' | 'full'> = ['narrow', 'medium', 'wide', 'full'];
        const current = get().width;
        const currentIndex = widths.indexOf(current);
        const nextIndex = (currentIndex + 1) % widths.length;
        set({ width: widths[nextIndex] });
      },

      toggleTwoPageView: () => set((state) => ({ twoPageView: !state.twoPageView })),

      setBrightness: (brightness) => {
        const clamped = Math.max(0.5, Math.min(1.5, brightness));
        set({ brightness: clamped });
        applyBrightnessToDOM(clamped);
      },

      setPageFlipEnabled: (enabled) => set({ pageFlipEnabled: enabled }),

      setPageFlipSpeed: (speed) => set({ pageFlipSpeed: Math.max(100, Math.min(800, speed)) }),

      setAnimationStyle: (style) => set({ animationStyle: style }),

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
      version: 4,
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
  const fontValue = resolveReadingFontCss(fontFamily);
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

const applyTextAlignToDOM = (align: string) => {
  const value = align === 'justify' ? 'justify' : 'left';
  requestAnimationFrame(() => {
    document.documentElement.style.setProperty('--reading-text-align', value);
  });
};

const applyBackgroundColorToDOM = (color: string) => {
  requestAnimationFrame(() => {
    if (color === 'default') {
      document.documentElement.style.removeProperty('--reading-bg-color');
    } else {
      document.documentElement.style.setProperty('--reading-bg-color', color);
    }
  });
};

const applyTextColorToDOM = (color: string) => {
  requestAnimationFrame(() => {
    if (color === 'default') {
      document.documentElement.style.removeProperty('--reading-text-color');
    } else {
      document.documentElement.style.setProperty('--reading-text-color', color);
    }
  });
};

const applyMarginToDOM = (margin: number) => {
  requestAnimationFrame(() => {
    document.documentElement.style.setProperty('--reading-margin', `${margin}px`);
  });
};

const applyBrightnessToDOM = (brightness: number) => {
  requestAnimationFrame(() => {
    document.documentElement.style.setProperty('--reading-brightness', `${brightness}`);
  });
};

// Initialize reader typography settings on load.
// NOTE: Reader theme (colors) are NOT applied here — they are scoped to
// the reader container element and applied on mount via applyReaderThemeToElement().
// The app-level theme (data-theme="black"|"white") is managed by preferencesStore.
if (typeof window !== 'undefined') {
  const savedSettings = localStorage.getItem('shiori-reading-settings');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON.parse returns any; validated below via fallback defaults
  let parsed: Record<string, any> | null = null;

  if (savedSettings) {
    try {
      parsed = JSON.parse(savedSettings);
    } catch {
      // Corrupted localStorage — clear it so defaults apply cleanly
      logger.warn('[premiumReaderStore] Corrupted saved settings, resetting to defaults');
      localStorage.removeItem('shiori-reading-settings');
    }
  }

  if (parsed?.state) {
    const s = parsed.state;
    applyFontToDOM(normalizeLegacyFontPreference(s.fontFamily || DEFAULT_READING_FONT_ID));
    applyFontSizeToDOM(s.fontSize || 18);
    applyLineHeightToDOM(s.lineHeight || 1.6);
    applyParagraphSpacingToDOM(s.paragraphSpacing || '1em');
    applyLetterSpacingToDOM(s.letterSpacing || 'normal');
    applyTextAlignToDOM(s.textAlign || 'left');
    applyTextureIntensityToDOM(s.paperTextureIntensity ?? 0.08);
    applyBackgroundColorToDOM(s.backgroundColor || 'default');
    applyTextColorToDOM(s.textColor || 'default');
    applyMarginToDOM(s.margin ?? 0);
    applyBrightnessToDOM(s.brightness ?? 1.0);
  } else {
    // Apply defaults
    applyFontToDOM(DEFAULT_READING_FONT_ID);
    applyFontSizeToDOM(18);
    applyLineHeightToDOM(1.6);
    applyParagraphSpacingToDOM('1em');
    applyLetterSpacingToDOM('normal');
    applyTextAlignToDOM('left');
    applyTextureIntensityToDOM(0.08);
    applyBackgroundColorToDOM('default');
    applyTextColorToDOM('default');
    applyMarginToDOM(0);
    applyBrightnessToDOM(1.0);
  }
}
