import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Layout } from '@/components/layout/Layout';

// Mock the zustand stores
vi.mock('@/store/libraryStore', () => ({
  useLibraryStore: vi.fn((selector) => {
    const state = {
      books: [],
      setBooks: vi.fn(),
      selectedBookIds: new Set(),
      selectedFilters: {},
      toggleFilter: vi.fn(),
      clearFilters: vi.fn(),
    };
    return selector(state);
  }),
}));

vi.mock('@/store/toastStore', () => ({
  useToast: vi.fn(() => ({
    warning: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock('@/store/uiStore', () => ({
  useUIStore: vi.fn((selector) => {
    const state = {
      currentView: 'home',
    };
    return selector(state);
  }),
}));

// Mock tauri API
vi.mock('@/lib/tauri', () => ({
  api: {
    getBooks: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('./NavigationRailDesktop', () => ({
  NavigationRailDesktop: () => <div data-testid="navigation-rail-desktop">NavigationRailDesktop</div>,
}));

vi.mock('./BottomNav', () => ({
  BottomNav: () => <div data-testid="bottom-nav">BottomNav</div>,
}));

describe('Layout Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock matchMedia to simulate a mobile viewport
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(query => ({
        matches: query === '(max-width: 767px)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it('regression: NavigationRail should NOT render on mobile viewports', () => {
    // We intentionally do NOT use `act` here because we want to test the INITIAL render
    // where the known bug (unconditional rendering) occurs due to useMediaQuery's initial state
    const { container } = render(
      <Layout onOpenSettings={() => {}}>
        <div data-testid="main-content">Content</div>
      </Layout>
    );
    
    // On mobile, NavigationRail should NOT render
    // If this fails (i.e. NavigationRail is found), it proves the bug exists.
    const navRail = screen.queryByTestId('navigation-rail-desktop');
    expect(navRail).not.toBeInTheDocument();
  });
});
