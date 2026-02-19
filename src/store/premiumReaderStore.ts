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
interface ReadingSettings {
  // Theme
  theme: 'light' | 'dark';
  
  // Typography
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  paragraphSpacing: string;
  letterSpacing: string;
  
  // Layout
  width: 'narrow' | 'medium' | 'wide' | 'full';
  twoPageView: boolean;
  
  // Actions
  setTheme: (theme: 'light' | 'dark') => void;
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
  resetToDefaults: () => void;
}

const defaultSettings = {
  theme: 'light' as const,
  fontFamily: 'literata',
  fontSize: 18,
  lineHeight: 1.6,
  paragraphSpacing: '1em',
  letterSpacing: 'normal',
  width: 'wide' as const, // Changed to 'wide' for better space usage
  twoPageView: false,
};

export const useReadingSettings = create<ReadingSettings>()(
  persist(
    (set, get) => ({
      ...defaultSettings,
      
      setTheme: (theme) => {
        set({ theme });
        applyThemeToDOM(theme);
      },
      
      toggleTheme: () => {
        const newTheme = get().theme === 'light' ? 'dark' : 'light';
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
      
      resetToDefaults: () => set(defaultSettings),
    }),
    {
      name: 'shiori-reading-settings',
      version: 2, // Increment to migrate from old settings
    }
  )
);

// ────────────────────────────────────────────────────────────
// DOM MANIPULATION HELPERS (No React re-renders!)
// ────────────────────────────────────────────────────────────

const applyThemeToDOM = (theme: 'light' | 'dark') => {
  const root = document.documentElement;
  
  const themes = {
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
  };
  
  const colors = themes[theme];
  requestAnimationFrame(() => {
    Object.entries(colors).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });
    root.setAttribute('data-theme', theme);
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

// Initialize theme on load
if (typeof window !== 'undefined') {
  const savedSettings = localStorage.getItem('shiori-reading-settings');
  if (savedSettings) {
    const parsed = JSON.parse(savedSettings);
    const theme = parsed.state?.theme || 'light';
    applyThemeToDOM(theme);
    
    const fontFamily = parsed.state?.fontFamily || 'literata';
    applyFontToDOM(fontFamily);
    
    const fontSize = parsed.state?.fontSize || 18;
    applyFontSizeToDOM(fontSize);
    
    const lineHeight = parsed.state?.lineHeight || 1.6;
    applyLineHeightToDOM(lineHeight);
    
    const paragraphSpacing = parsed.state?.paragraphSpacing || '1em';
    applyParagraphSpacingToDOM(paragraphSpacing);
    
    const letterSpacing = parsed.state?.letterSpacing || 'normal';
    applyLetterSpacingToDOM(letterSpacing);
  } else {
    // Apply defaults
    applyThemeToDOM('light');
    applyFontToDOM('literata');
    applyFontSizeToDOM(18);
    applyLineHeightToDOM(1.6);
    applyParagraphSpacingToDOM('1em');
    applyLetterSpacingToDOM('normal');
  }
}
