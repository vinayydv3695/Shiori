import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));

  await page.addInitScript(() => {
    const tauriInternals = {
      metadata: { currentWindow: { label: 'main' } },
      transformCallback: (callback: any, once: boolean) => Math.random().toString(),
      convertFileSrc: (url: string) => url,
      invoke: async (cmd: string, args: any) => {
        console.log('Mocking Tauri invoke:', cmd, args);
        
        const mockBook = {
          id: 1,
          title: 'Mock Manga',
          domain: 'books',
          cover_path: '',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        
        if (cmd === 'plugin:dialog|open') return '/mock/manga/folder';
        if (cmd === 'scan_folder_for_manga') return { success: ['/mock/manga/folder/series1'], failed: [], duplicate: [] };
        if (cmd === 'get_all_books') return [mockBook];
        if (cmd === 'search_books' || cmd === 'search_library') return { books: [mockBook], total: 1 };
        
        if (cmd === 'get_book') return mockBook;
        if (cmd === 'get_manga_chapters') return [];
        
        if (cmd === 'get_book_summaries_by_domain') return [mockBook];
        if (cmd === 'get_books_by_reading_status') return [];
        if (cmd === 'get_recommended_books') return [];
        if (cmd === 'get_reading_progress_batch') return {};
        if (cmd === 'get_cover_paths_batch') return {};
        
        if (cmd === 'get_startup_data') {
          return {
            preferences: {
              theme: 'dark',
              linuxTransparentWindow: true,
              book: { fontFamily: 'serif', fontSize: 16, lineHeight: 1.5, pageWidth: 800, scrollMode: 'paged', justification: 'left', paragraphSpacing: 1.0, animationSpeed: 1, hyphenation: false, customCSS: '' },
              manga: { mode: 'single', direction: 'ltr', marginSize: 0, fitWidth: true, backgroundColor: '#000000', progressBar: 'bottom', imageSmoothing: true, preloadCount: 5, gpuAcceleration: true },
              tts: { rate: 1.0, pitch: 1.0, volume: 1.0, voice: null },
              autoStart: false,
              defaultImportPath: '',
              uiDensity: 'comfortable',
              accentColor: '#3B82F6',
              uiScale: 1.0,
              preferredContentType: 'both',
              performanceMode: 'standard',
              metadataMode: 'online',
              autoScanEnabled: true,
              defaultMangaPath: null,
              translationTargetLanguage: 'en',
              autoGroupManga: true,
              autoTranslate: false,
              cacheSizeLimitMB: 500,
              librarySizeLimit: 10000
            },
            bookOverrides: [],
            mangaOverrides: [],
            onboarding: { completed: true },
            readingGoalMinutes: null
          };
        }

        if (cmd === 'get_collections') return [];
        if (cmd === 'get_tags') return [];
        if (cmd === 'get_library_stats') return { total_books: 1, total_manga: 1, total_chapters: 0, unread_chapters: 0, reading_time_minutes: 0, total_series: 0 };
        if (cmd === 'list_conversion_jobs') return [];
        if (cmd === 'get_favorite_book_ids') return [];
        
        if (cmd === 'plugin:event|listen') return 12345;
        if (cmd === 'plugin:event|unlisten') return;
        
        return null;
      }
    };

    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      get: () => tauriInternals,
      set: (val) => Object.assign(tauriInternals, val)
    });
    
    window.__TAURI_OS_PLUGIN_INTERNALS__ = { os_type: 'linux' };
  });
});

test('add source and search flow', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(2000);

  // Take screenshot right after load
  await page.screenshot({ path: 'test-results/after-load.png' });

  // Switch to Library view on the left
  await page.getByText('Library', { exact: true }).click();
  await page.waitForTimeout(1000);

  // Now mock data should load here
  await expect(page.getByText('Mock Manga').first()).toBeVisible({ timeout: 10000 });

  const searchInput = page.getByPlaceholder('Search books...');
  await searchInput.fill('Mock');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1000);

  await expect(page.getByText('Mock Manga').first()).toBeVisible();

  await page.getByText('Mock Manga').first().click({ force: true });

  await expect(page.getByText('Mock Manga').first()).toBeVisible();
});
