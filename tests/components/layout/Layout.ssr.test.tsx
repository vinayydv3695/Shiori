import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';
import { Layout } from '@/components/layout/Layout';

vi.mock('@/store/libraryStore', () => ({
  useLibraryStore: vi.fn((selector) => {
    const state = { books: [], setBooks: vi.fn(), selectedBookIds: new Set(), selectedFilters: {}, toggleFilter: vi.fn(), clearFilters: vi.fn() };
    return selector(state);
  }),
}));
vi.mock('@/store/toastStore', () => ({
  useToast: vi.fn(() => ({ warning: vi.fn(), success: vi.fn(), error: vi.fn() })),
}));
vi.mock('@/store/uiStore', () => ({
  useUIStore: vi.fn((selector) => {
    const state = { currentView: 'home' };
    return selector(state);
  }),
}));
vi.mock('@/lib/tauri', () => ({
  api: { getBooks: vi.fn().mockResolvedValue([]) },
}));

describe('Layout Component (SSR/Initial Render)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(query => ({
        matches: query === '(max-width: 767px)',
        media: query,
        onchange: null,
        addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
      })),
    });
  });

  it('regression: NavigationRail should NOT render on mobile viewports on initial render', () => {
    // renderToString simulates the initial render before any useEffect fires.
    // If the bug is that useMediaQuery initially returns false, this will render NavigationRail unconditionally on the first frame.
    const html = renderToString(
      <Layout onOpenSettings={() => {}}>
        <div data-testid="main-content">Content</div>
      </Layout>
    );
    
    // We expect the NavigationRail HTML NOT to be present.
    // NavigationRailDesktop contains aria-label="Primary" on its nav.
    expect(html).not.toContain('aria-label="Primary"');
  });
});
