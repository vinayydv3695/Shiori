import { useReaderStore } from '@/store/readerStore';
import { api } from '@/lib/tauri';
import { Settings, BookmarkPlus, MessageSquare, X } from '@/components/icons';
import { useState } from 'react';

export function ReaderControls() {
  const { settings, updateSettings, currentBookId, toggleAnnotationSidebar, progress } = useReaderStore();
  const [showSettings, setShowSettings] = useState(false);

  const handleFontFamilyChange = async (fontFamily: string) => {
    updateSettings({ fontFamily });
    await api.saveReaderSettings(
      settings.userId,
      fontFamily,
      settings.fontSize,
      settings.lineHeight,
      settings.theme,
      settings.pageMode,
      settings.marginSize
    );
  };

  const handleFontSizeChange = async (fontSize: number) => {
    updateSettings({ fontSize });
    await api.saveReaderSettings(
      settings.userId,
      settings.fontFamily,
      fontSize,
      settings.lineHeight,
      settings.theme,
      settings.pageMode,
      settings.marginSize
    );
  };

  const handleLineHeightChange = async (lineHeight: number) => {
    updateSettings({ lineHeight });
    await api.saveReaderSettings(
      settings.userId,
      settings.fontFamily,
      settings.fontSize,
      lineHeight,
      settings.theme,
      settings.pageMode,
      settings.marginSize
    );
  };

  const handleThemeChange = async (theme: string) => {
    updateSettings({ theme });
    await api.saveReaderSettings(
      settings.userId,
      settings.fontFamily,
      settings.fontSize,
      settings.lineHeight,
      theme,
      settings.pageMode,
      settings.marginSize
    );
  };

  const handlePageModeChange = async (pageMode: 'paginated' | 'scrolled') => {
    updateSettings({ pageMode });
    await api.saveReaderSettings(
      settings.userId,
      settings.fontFamily,
      settings.fontSize,
      settings.lineHeight,
      settings.theme,
      pageMode,
      settings.marginSize
    );
  };

  const handleMarginSizeChange = async (marginSize: number) => {
    updateSettings({ marginSize });
    await api.saveReaderSettings(
      settings.userId,
      settings.fontFamily,
      settings.fontSize,
      settings.lineHeight,
      settings.theme,
      settings.pageMode,
      marginSize
    );
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
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          title="Add bookmark"
        >
          <BookmarkPlus className="w-5 h-5" />
        </button>

        <button
          onClick={toggleAnnotationSidebar}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          title="Show annotations"
        >
          <MessageSquare className="w-5 h-5" />
        </button>

        <button
          onClick={() => setShowSettings(!showSettings)}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          title="Reader settings"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>

      {/* Settings panel */}
      {showSettings && (
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
                <option value="serif">Serif</option>
                <option value="sans">Sans-serif</option>
                <option value="mono">Monospace</option>
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
                  onClick={() => handleThemeChange('sepia')}
                  className={`px-3 py-2 text-sm rounded border ${
                    settings.theme === 'sepia'
                      ? 'bg-yellow-100 border-yellow-500'
                      : 'bg-white border-gray-300 hover:border-yellow-500'
                  }`}
                >
                  Sepia
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
      )}
    </div>
  );
}
