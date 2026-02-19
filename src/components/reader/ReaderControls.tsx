import { useReaderStore, ReaderSettings } from '@/store/readerStore';
import { api } from '@/lib/tauri';
import { Settings, BookmarkPlus, MessageSquare, X } from '@/components/icons';
import { useState, useEffect } from 'react';

export function ReaderControls() {
  const { settings, updateSettings, currentBookId, toggleAnnotationSidebar, progress } = useReaderStore();
  const [showSettings, setShowSettings] = useState(false);

  const saveSettings = async (updates: Partial<ReaderSettings> = {}) => {
    const newSettings = { ...settings, ...updates };
    await api.saveReaderSettings(
      newSettings.userId,
      newSettings.fontFamily,
      newSettings.fontSize,
      newSettings.lineHeight,
      newSettings.theme,
      newSettings.pageMode,
      newSettings.marginSize
    );
  };

  const handleFontFamilyChange = async (fontFamily: string) => {
    updateSettings({ fontFamily });
    await saveSettings({ fontFamily });
  };

  const handleFontSizeChange = async (fontSize: number) => {
    updateSettings({ fontSize });
    await saveSettings({ fontSize });
  };

  const handleLineHeightChange = async (lineHeight: number) => {
    updateSettings({ lineHeight });
    await saveSettings({ lineHeight });
  };

  const handleThemeChange = async (theme: string) => {
    updateSettings({ theme });
    await saveSettings({ theme });
  };

  const handlePageModeChange = async (pageMode: 'paginated' | 'scrolled') => {
    updateSettings({ pageMode });
    await saveSettings({ pageMode });
  };

  const handleMarginSizeChange = async (marginSize: number) => {
    updateSettings({ marginSize });
    await saveSettings({ marginSize });
  };

  const createBookmark = async () => {
    if (!currentBookId || !progress) return;

    await api.createAnnotation(
      currentBookId,
      'bookmark',
      progress.currentLocation,
      undefined,
      undefined,
      undefined,
      '#3b82f6' // Blue color for bookmarks
    );
  };

  // Close settings panel on ESC key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showSettings) {
        setShowSettings(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [showSettings]);

  return (
    <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between">
      {/* Left side - Reading progress */}
      <div className="flex items-center gap-4">
        <div className="text-sm text-gray-600">
          {progress && (
            <>
              <span className="font-medium">{Math.round(progress.progressPercent)}%</span>
              {progress.currentPage && progress.totalPages && (
                <span className="ml-2">
                  ({progress.currentPage} / {progress.totalPages})
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Right side - Controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={createBookmark}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-900 dark:text-gray-100"
          title="Add bookmark"
        >
          <BookmarkPlus className="w-5 h-5 text-gray-900 dark:text-gray-100" />
        </button>

        <button
          onClick={toggleAnnotationSidebar}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-900 dark:text-gray-100"
          title="Show annotations"
        >
          <MessageSquare className="w-5 h-5 text-gray-900 dark:text-gray-100" />
        </button>

        <button
          onClick={() => setShowSettings(!showSettings)}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-900 dark:text-gray-100"
          title="Reader settings"
        >
          <Settings className="w-5 h-5 text-gray-900 dark:text-gray-100" />
        </button>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/20 z-40"
            onClick={() => setShowSettings(false)}
            aria-label="Close settings"
          />
          
          {/* Settings panel */}
          <div className="absolute right-4 top-14 bg-white rounded-lg shadow-xl border border-gray-200 p-4 w-80 z-50">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Reader Settings</h3>
              <button
                onClick={() => setShowSettings(false)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

          <div className="space-y-4">
            {/* Font Family */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Font Family
              </label>
              <select
                value={settings.fontFamily}
                onChange={(e) => handleFontFamilyChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="serif">Classic Serif (Georgia)</option>
                <option value="sans">Clean Sans (Arial)</option>
                <option value="system">System Font</option>
                <option value="literata">Literata</option>
                <option value="merriweather">Merriweather</option>
                <option value="opensans">Open Sans</option>
                <option value="lora">Lora</option>
                <option value="mono">Monospace (Courier)</option>
              </select>
            </div>

            {/* Font Size */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Font Size: {settings.fontSize}px
              </label>
              <input
                type="range"
                min="12"
                max="24"
                step="1"
                value={settings.fontSize}
                onChange={(e) => handleFontSizeChange(Number(e.target.value))}
                className="w-full"
              />
            </div>

            {/* Line Height */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Line Height: {settings.lineHeight}
              </label>
              <input
                type="range"
                min="1.2"
                max="2.0"
                step="0.1"
                value={settings.lineHeight}
                onChange={(e) => handleLineHeightChange(Number(e.target.value))}
                className="w-full"
              />
            </div>

            {/* Theme */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Theme
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => handleThemeChange('light')}
                  className={`px-3 py-2 text-sm rounded border ${
                    settings.theme === 'light'
                      ? 'bg-blue-500 text-white border-blue-500'
                      : 'bg-white border-gray-300 hover:border-blue-500'
                  }`}
                >
                  Light
                </button>
                <button
                  onClick={() => handleThemeChange('dark')}
                  className={`px-3 py-2 text-sm rounded border ${
                    settings.theme === 'dark'
                      ? 'bg-gray-800 text-white border-gray-800'
                      : 'bg-white border-gray-300 hover:border-gray-800'
                  }`}
                >
                  Dark
                </button>
                <button
                  onClick={() => handleThemeChange('nightlight')}
                  className={`px-3 py-2 text-sm rounded border ${
                    settings.theme === 'nightlight'
                      ? 'bg-amber-900 text-amber-100 border-amber-900'
                      : 'bg-white border-gray-300 hover:border-amber-900'
                  }`}
                >
                  Night Light
                </button>
              </div>
            </div>

            {/* Page Mode */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Page Mode
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handlePageModeChange('paginated')}
                  className={`px-3 py-2 text-sm rounded border ${
                    settings.pageMode === 'paginated'
                      ? 'bg-blue-500 text-white border-blue-500'
                      : 'bg-white border-gray-300 hover:border-blue-500'
                  }`}
                >
                  Paginated
                </button>
                <button
                  onClick={() => handlePageModeChange('scrolled')}
                  className={`px-3 py-2 text-sm rounded border ${
                    settings.pageMode === 'scrolled'
                      ? 'bg-blue-500 text-white border-blue-500'
                      : 'bg-white border-gray-300 hover:border-blue-500'
                  }`}
                >
                  Scrolled
                </button>
              </div>
            </div>

            {/* Margin Size */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Margin Size
              </label>
              <input
                type="range"
                min="0"
                max="4"
                step="1"
                value={settings.marginSize}
                onChange={(e) => handleMarginSizeChange(Number(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>Narrow</span>
                <span>Wide</span>
              </div>
            </div>
          </div>
          </div>
        </>
      )}
    </div>
  );
}
