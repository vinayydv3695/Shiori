import { useState, useEffect } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Moon, Sun, Image, Palette, Database, Bell, Shield, BookOpen, FileText, Volume2, Download, Upload, HardDrive, Archive, CheckCircle2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { usePreferencesStore } from '../../store/preferencesStore'
import type { Theme, UserPreferences, BookPreferences, MangaPreferences, TtsPreferences } from '../../types/preferences'
import { api, isTauri } from '../../lib/tauri'
import type { BackupInfo } from '../../lib/tauri'
import { TTSEngine } from '@/lib/ttsEngine'
import { open as openDialog } from '@tauri-apps/plugin-dialog'

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type SettingsTab = 'appearance' | 'book-reading' | 'manga-reading' | 'audio' | 'library' | 'storage' | 'notifications' | 'advanced'

export const SettingsDialog = ({ open, onOpenChange }: SettingsDialogProps) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance')
  const preferences = usePreferencesStore((state) => state.preferences)
  const updateTheme = usePreferencesStore((state) => state.updateTheme)
  const updateBookDefaults = usePreferencesStore((state) => state.updateBookDefaults)
  const updateMangaDefaults = usePreferencesStore((state) => state.updateMangaDefaults)
  const updateTtsDefaults = usePreferencesStore((state) => state.updateTtsDefaults)
  const updateGeneralSettings = usePreferencesStore((state) => state.updateGeneralSettings)

  const tabs = [
    { id: 'appearance' as const, name: 'Appearance', icon: Palette },
    { id: 'book-reading' as const, name: 'Book Reading', icon: BookOpen },
    { id: 'manga-reading' as const, name: 'Manga Reading', icon: FileText },
    { id: 'audio' as const, name: 'Audio / TTS', icon: Volume2 },
    { id: 'library' as const, name: 'Library', icon: Image },
    { id: 'storage' as const, name: 'Storage', icon: Database },
    { id: 'notifications' as const, name: 'Notifications', icon: Bell },
    { id: 'advanced' as const, name: 'Advanced', icon: Shield },
  ]

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background border border-border rounded-lg shadow-2xl w-[90vw] max-w-5xl h-[85vh] z-50 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-border">
            <Dialog.Title className="text-2xl font-semibold">Settings</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon">
                <X className="w-5 h-5" />
              </Button>
            </Dialog.Close>
          </div>

          {/* Content */}
          <div className="flex flex-1 overflow-hidden">
            {/* Sidebar */}
            <div className="w-56 border-r border-border p-4 space-y-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-left',
                    activeTab === tab.id
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted text-muted-foreground'
                  )}
                >
                  <tab.icon className="w-5 h-5" />
                  <span className="font-medium">{tab.name}</span>
                </button>
              ))}
            </div>

            {/* Settings Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {activeTab === 'appearance' && <AppearanceSettings preferences={preferences} updateTheme={updateTheme} updateGeneralSettings={updateGeneralSettings} />}
              {activeTab === 'book-reading' && <BookReadingSettings preferences={preferences} updateBookDefaults={updateBookDefaults} />}
              {activeTab === 'manga-reading' && <MangaReadingSettings preferences={preferences} updateMangaDefaults={updateMangaDefaults} />}
              {activeTab === 'audio' && <AudioTTSSettings preferences={preferences} updateTtsDefaults={updateTtsDefaults} />}
              {activeTab === 'library' && <LibrarySettings preferences={preferences} updateGeneralSettings={updateGeneralSettings} />}
              {activeTab === 'storage' && <StorageSettings preferences={preferences} />}
              {activeTab === 'notifications' && <NotificationSettings />}
              {activeTab === 'advanced' && <AdvancedSettings />}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

const SettingSection = ({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) => (
  <div className="space-y-4 pb-8 border-b border-border last:border-0">
    <div>
      <h3 className="text-lg font-semibold">{title}</h3>
      {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
    </div>
    <div className="space-y-4">{children}</div>
  </div>
)

const SettingItem = ({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) => (
  <div className="flex items-center justify-between">
    <div className="space-y-0.5">
      <label className="text-sm font-medium">{label}</label>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
    </div>
    <div>{children}</div>
  </div>
)

const AppearanceSettings = ({ preferences, updateTheme, updateGeneralSettings }: {
  preferences: UserPreferences | null
  updateTheme: (theme: Theme) => Promise<void>
  updateGeneralSettings: (updates: { uiScale?: number; uiDensity?: 'compact' | 'comfortable'; autoStart?: boolean; defaultImportPath?: string; accentColor?: string }) => Promise<void>
}) => {
  if (!preferences) return null

  const handleThemeChange = async (newTheme: Theme) => {
    await updateTheme(newTheme)
  }

  const currentScale = preferences.uiScale ?? 1.0
  const scalePercent = Math.round(currentScale * 100)

  return (
    <div className="space-y-8">
      <SettingSection
        title="Theme"
        description="Choose how Shiori looks"
      >
        <div className="grid grid-cols-2 gap-3">
          {[
            { value: 'black' as const, label: 'Black Theme', icon: Moon },
            { value: 'white' as const, label: 'White Theme', icon: Sun },
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => handleThemeChange(option.value)}
              className={cn(
                'p-4 rounded-lg border-2 transition-all flex flex-col items-center gap-2',
                preferences.theme === option.value
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              )}
            >
              <option.icon className="w-6 h-6" />
              <span className="text-sm font-medium">{option.label}</span>
            </button>
          ))}
        </div>
      </SettingSection>

      <SettingSection
        title="UI Density"
        description="Adjust interface spacing"
      >
        <div className="grid grid-cols-2 gap-3">
          {[
            { value: 'compact' as const, label: 'Compact' },
            { value: 'comfortable' as const, label: 'Comfortable' },
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => updateGeneralSettings({ uiDensity: option.value })}
              className={cn(
                'p-3 rounded-lg border-2 transition-all',
                preferences.uiDensity === option.value
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </SettingSection>
      <SettingSection
        title="UI Scale"
        description="Adjust the overall application size (75% – 150%)"
      >
        <SettingItem label="Scale" description={`${scalePercent}%`}>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-8 text-right">75%</span>
            <input
              type="range"
              min="75"
              max="150"
              step="5"
              value={scalePercent}
              onChange={(e) => updateGeneralSettings({ uiScale: Number(e.target.value) / 100 })}
              className="w-40"
            />
            <span className="text-xs text-muted-foreground w-10">150%</span>
          </div>
        </SettingItem>
      </SettingSection>
    </div>
  )
}

const BookReadingSettings = ({ preferences, updateBookDefaults }: {
  preferences: UserPreferences | null
  updateBookDefaults: (updates: Partial<BookPreferences>) => Promise<void>
}) => {
  if (!preferences) return null

  return (
    <div className="space-y-8">
      <SettingSection
        title="Font Settings"
        description="Customize how books are displayed"
      >
        <SettingItem label="Font Family" description={preferences.book.fontFamily}>
          <select
            value={preferences.book.fontFamily}
            onChange={(e) => updateBookDefaults({ fontFamily: e.target.value })}
            className="px-3 py-2 rounded-md border border-border bg-background"
          >
            <option value="Georgia">Georgia</option>
            <option value="Arial">Arial</option>
            <option value="Times New Roman">Times New Roman</option>
            <option value="Courier New">Courier New</option>
            <option value="Verdana">Verdana</option>
          </select>
        </SettingItem>

        <SettingItem label="Font Size" description={`${preferences.book.fontSize}px`}>
          <input
            type="range"
            min="12"
            max="32"
            value={preferences.book.fontSize}
            onChange={(e) => updateBookDefaults({ fontSize: Number(e.target.value) })}
            className="w-48"
          />
        </SettingItem>

        <SettingItem label="Line Height" description={`${preferences.book.lineHeight}`}>
          <input
            type="range"
            min="1.2"
            max="2.4"
            step="0.1"
            value={preferences.book.lineHeight}
            onChange={(e) => updateBookDefaults({ lineHeight: Number(e.target.value) })}
            className="w-48"
          />
        </SettingItem>
      </SettingSection>

      <SettingSection title="Reading Experience">
        <SettingItem
          label="Scroll Mode"
          description={preferences.book.scrollMode === 'continuous' ? 'Continuous' : 'Paged'}
        >
          <select
            value={preferences.book.scrollMode}
            onChange={(e) => updateBookDefaults({ scrollMode: e.target.value as 'paged' | 'continuous' })}
            className="px-3 py-2 rounded-md border border-border bg-background"
          >
            <option value="paged">Paged</option>
            <option value="continuous">Continuous</option>
          </select>
        </SettingItem>

        <SettingItem
          label="Text Justification"
          description={preferences.book.justification === 'justify' ? 'Justified' : 'Left-aligned'}
        >
          <select
            value={preferences.book.justification}
            onChange={(e) => updateBookDefaults({ justification: e.target.value as 'left' | 'justify' })}
            className="px-3 py-2 rounded-md border border-border bg-background"
          >
            <option value="left">Left</option>
            <option value="justify">Justify</option>
          </select>
        </SettingItem>

        <SettingItem
          label="Hyphenation"
          description={preferences.book.hyphenation ? 'Enabled' : 'Disabled'}
        >
          <input
            type="checkbox"
            checked={preferences.book.hyphenation}
            onChange={(e) => updateBookDefaults({ hyphenation: e.target.checked })}
            className="w-5 h-5"
          />
        </SettingItem>
      </SettingSection>

      <SettingSection title="Layout">
        <SettingItem label="Page Width" description={`${preferences.book.pageWidth}px`}>
          <input
            type="range"
            min="400"
            max="1200"
            step="50"
            value={preferences.book.pageWidth}
            onChange={(e) => updateBookDefaults({ pageWidth: Number(e.target.value) })}
            className="w-48"
          />
        </SettingItem>

        <SettingItem label="Paragraph Spacing" description={`${preferences.book.paragraphSpacing}em`}>
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={preferences.book.paragraphSpacing}
            onChange={(e) => updateBookDefaults({ paragraphSpacing: Number(e.target.value) })}
            className="w-48"
          />
        </SettingItem>
      </SettingSection>
    </div>
  )
}

const MangaReadingSettings = ({ preferences, updateMangaDefaults }: {
  preferences: UserPreferences | null
  updateMangaDefaults: (updates: Partial<MangaPreferences>) => Promise<void>
}) => {
  if (!preferences) return null

  return (
    <div className="space-y-8">
      <SettingSection
        title="Reading Mode"
        description="Default manga reading layout"
      >
        <div className="grid grid-cols-3 gap-3">
          {[
            { value: 'single' as const, label: 'Single Page' },
            { value: 'double' as const, label: 'Double Page' },
            { value: 'long-strip' as const, label: 'Long Strip' },
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => updateMangaDefaults({ mode: option.value })}
              className={cn(
                'p-3 rounded-lg border-2 transition-all',
                preferences.manga.mode === option.value
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </SettingSection>

      <SettingSection title="Reading Direction">
        <div className="grid grid-cols-2 gap-3">
          {[
            { value: 'ltr' as const, label: 'Left to Right' },
            { value: 'rtl' as const, label: 'Right to Left' },
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => updateMangaDefaults({ direction: option.value })}
              className={cn(
                'p-3 rounded-lg border-2 transition-all',
                preferences.manga.direction === option.value
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </SettingSection>

      <SettingSection title="Display Options">
        <SettingItem
          label="Fit to Width"
          description={preferences.manga.fitWidth ? 'Enabled' : 'Disabled'}
        >
          <input
            type="checkbox"
            checked={preferences.manga.fitWidth}
            onChange={(e) => updateMangaDefaults({ fitWidth: e.target.checked })}
            className="w-5 h-5"
          />
        </SettingItem>

        <SettingItem
          label="Image Smoothing"
          description={preferences.manga.imageSmoothing ? 'Enabled' : 'Disabled'}
        >
          <input
            type="checkbox"
            checked={preferences.manga.imageSmoothing}
            onChange={(e) => updateMangaDefaults({ imageSmoothing: e.target.checked })}
            className="w-5 h-5"
          />
        </SettingItem>

        <SettingItem
          label="GPU Acceleration"
          description={preferences.manga.gpuAcceleration ? 'Enabled' : 'Disabled'}
        >
          <input
            type="checkbox"
            checked={preferences.manga.gpuAcceleration}
            onChange={(e) => updateMangaDefaults({ gpuAcceleration: e.target.checked })}
            className="w-5 h-5"
          />
        </SettingItem>

        <SettingItem
          label="Progress Bar"
          description={
            !preferences.manga?.progressBar || preferences.manga.progressBar === 'hidden'
              ? 'Hidden'
              : preferences.manga.progressBar.charAt(0).toUpperCase() + preferences.manga.progressBar.slice(1)
          }
        >
          <select
            value={preferences.manga?.progressBar || 'hidden'}
            onChange={(e) => updateMangaDefaults({ progressBar: e.target.value as 'top' | 'bottom' | 'hidden' })}
            className="px-3 py-2 rounded-md border border-border bg-background"
          >
            <option value="hidden">Hidden</option>
            <option value="top">Top</option>
            <option value="bottom">Bottom</option>
          </select>
        </SettingItem>
      </SettingSection>

      <SettingSection title="Performance">
        <SettingItem label="Preload Pages" description={`${preferences.manga.preloadCount} pages`}>
          <input
            type="range"
            min="0"
            max="10"
            value={preferences.manga.preloadCount}
            onChange={(e) => updateMangaDefaults({ preloadCount: Number(e.target.value) })}
            className="w-48"
          />
        </SettingItem>

        <SettingItem label="Margin Size" description={`${preferences.manga.marginSize}px`}>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={preferences.manga.marginSize}
            onChange={(e) => updateMangaDefaults({ marginSize: Number(e.target.value) })}
            className="w-48"
          />
        </SettingItem>
      </SettingSection>
    </div>
  )
}

const SPEED_OPTIONS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0]

const AudioTTSSettings = ({ preferences, updateTtsDefaults }: {
  preferences: UserPreferences | null
  updateTtsDefaults: (updates: Partial<TtsPreferences>) => Promise<void>
}) => {
  const isAvailable = TTSEngine.isAvailable()
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])

  useEffect(() => {
    if (isAvailable && typeof window !== 'undefined' && window.speechSynthesis) {
      const loadVoices = () => setVoices(window.speechSynthesis.getVoices())
      loadVoices()
      window.speechSynthesis.addEventListener('voiceschanged', loadVoices)
      return () => window.speechSynthesis.removeEventListener('voiceschanged', loadVoices)
    }
  }, [isAvailable])

  if (!preferences) return null

  return (
    <div className="space-y-8">
      {!isAvailable && (
        <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
          <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400">
            Text-to-Speech is not available on this platform.
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Speech synthesis requires a Chromium-based WebView (Windows/macOS). Linux WebKitGTK does not support the Web Speech API.
          </p>
        </div>
      )}

      <SettingSection
        title="Text-to-Speech"
        description="Configure voice and speech settings for read-aloud"
      >
        <SettingItem label="Voice" description={preferences.tts.voice === 'default' ? 'System default' : preferences.tts.voice}>
          <select
            value={preferences.tts.voice}
            onChange={(e) => updateTtsDefaults({ voice: e.target.value })}
            disabled={!isAvailable}
            className="px-3 py-2 rounded-md border border-border bg-background max-w-[250px] disabled:opacity-50"
          >
            <option value="default">System Default</option>
            {voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
        </SettingItem>

        <SettingItem label="Speech Rate" description={`${preferences.tts.rate}x`}>
          <select
            value={preferences.tts.rate}
            onChange={(e) => updateTtsDefaults({ rate: Number(e.target.value) })}
            disabled={!isAvailable}
            className="px-3 py-2 rounded-md border border-border bg-background disabled:opacity-50"
          >
            {SPEED_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}x</option>
            ))}
          </select>
        </SettingItem>

        <SettingItem
          label="Auto-advance Chapter"
          description={preferences.tts.autoAdvance ? 'Automatically go to next chapter when done' : 'Stop at end of chapter'}
        >
          <input
            type="checkbox"
            checked={preferences.tts.autoAdvance}
            onChange={(e) => updateTtsDefaults({ autoAdvance: e.target.checked })}
            disabled={!isAvailable}
            className="w-5 h-5 disabled:opacity-50"
          />
        </SettingItem>

        <SettingItem label="Highlight Color" description="Color used to highlight the spoken sentence">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={preferences.tts.highlightColor.slice(0, 7)}
              onChange={(e) => updateTtsDefaults({ highlightColor: e.target.value + '8c' })}
              disabled={!isAvailable}
              className="w-8 h-8 rounded cursor-pointer border border-border disabled:opacity-50"
            />
            <span className="text-xs text-muted-foreground font-mono">{preferences.tts.highlightColor}</span>
          </div>
        </SettingItem>
      </SettingSection>
    </div>
  )
}

const LibrarySettings = ({ preferences, updateGeneralSettings }: {
  preferences: UserPreferences | null
  updateGeneralSettings: (updates: Partial<UserPreferences>) => Promise<void>
}) => {
  if (!preferences) return null

  return (
    <div className="space-y-8">
      <SettingSection
        title="General Settings"
        description="Configure library behavior"
      >
        <SettingItem
          label="Auto-start Application"
          description="Start Shiori when system boots"
        >
          <input
            type="checkbox"
            checked={preferences.autoStart}
            onChange={(e) => updateGeneralSettings({ autoStart: e.target.checked })}
            className="w-5 h-5"
          />
        </SettingItem>
      </SettingSection>

      <SettingSection title="Import Path">
        <div className="space-y-3">
          <div className="p-4 rounded-lg bg-muted border border-border">
            <p className="text-sm font-mono">{preferences.defaultImportPath || 'Not set'}</p>
          </div>
          <Button variant="outline" onClick={() => {
            // TODO: Open folder dialog
            console.log('Open folder dialog')
          }}>Change Import Path</Button>
        </div>
      </SettingSection>

      <SettingSection
        title="Translation"
        description="Default target language for text translation"
      >
        <SettingItem
          label="Target Language"
          description="Language to translate selected text into"
        >
          <select
            value={preferences.translationTargetLanguage || 'en'}
            onChange={(e) => updateGeneralSettings({ translationTargetLanguage: e.target.value })}
            className="px-3 py-2 rounded-lg bg-muted border border-border text-sm"
          >
            <option value="en">English</option>
            <option value="es">Spanish</option>
            <option value="fr">French</option>
            <option value="de">German</option>
            <option value="it">Italian</option>
            <option value="pt">Portuguese</option>
            <option value="ru">Russian</option>
            <option value="ja">Japanese</option>
            <option value="ko">Korean</option>
            <option value="zh">Chinese</option>
            <option value="ar">Arabic</option>
            <option value="hi">Hindi</option>
          </select>
        </SettingItem>
      </SettingSection>
    </div>
  )
}

const StorageSettings = ({ preferences }: { preferences: UserPreferences | null }) => {
  const [isBackingUp, setIsBackingUp] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)
  const [includeBooks, setIncludeBooks] = useState(false)
  const [backupResult, setBackupResult] = useState<BackupInfo | null>(null)
  const [restoreSuccess, setRestoreSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!preferences) return null;

  const collectFrontendSettings = (): string => {
    const settings: Record<string, string> = {}
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('shiori-')) {
        settings[key] = localStorage.getItem(key) ?? ''
      }
    }
    return JSON.stringify(settings)
  }

  const restoreFrontendSettings = (settingsJson: string) => {
    try {
      const settings: Record<string, string> = JSON.parse(settingsJson)
      for (const [key, value] of Object.entries(settings)) {
        localStorage.setItem(key, value)
      }
    } catch {
      console.error('Failed to restore frontend settings')
    }
  }

  const handleBackup = async () => {
    setError(null)
    setBackupResult(null)
    try {
      const defaultName = `shiori-backup-${new Date().toISOString().slice(0, 10)}.zip`
      const savePath = await api.saveFileDialog(defaultName)
      if (!savePath) return

      setIsBackingUp(true)
      const frontendSettings = collectFrontendSettings()
      const info = await api.createBackup(savePath, {
        include_books: includeBooks,
        frontend_settings: frontendSettings,
      })
      setBackupResult(info)
    } catch (err) {
      setError(`Backup failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsBackingUp(false)
    }
  }

  const handleRestore = async () => {
    setError(null)
    setRestoreSuccess(false)

    const confirmed = confirm(
      'Restoring a backup will REPLACE all current data (books, annotations, settings, collections). This cannot be undone.\n\nContinue?'
    )
    if (!confirmed) return

    try {
      if (!isTauri) return
      const filePath = await openDialog({
        multiple: false,
        filters: [{ name: 'Shiori Backup', extensions: ['zip'] }],
      }) as string | null
      if (!filePath) return

      setIsRestoring(true)
      const result = await api.restoreBackup(filePath)

      if (result.frontend_settings) {
        restoreFrontendSettings(result.frontend_settings)
      }

      setRestoreSuccess(true)
      setTimeout(() => {
        alert(`Restored ${result.books_restored} books, ${result.annotations_restored} annotations, ${result.collections_restored} collections, ${result.covers_restored} covers. The app will reload.`)
        window.location.reload()
      }, 500)
    } catch (err) {
      setError(`Restore failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsRestoring(false)
    }
  }

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="space-y-8">
      <SettingSection
        title="Library Location"
        description="Where your books are stored"
      >
        <div className="space-y-3">
          <div className="p-4 rounded-lg bg-muted border border-border">
            <p className="text-sm font-mono">{preferences.defaultImportPath || 'Default system data folder'}</p>
          </div>
        </div>
      </SettingSection>

      <SettingSection
        title="Backup"
        description="Create a full backup of your library, annotations, settings, and optionally book files"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted border border-border">
            <div className="space-y-0.5">
              <label className="text-sm font-medium">Include book files</label>
              <p className="text-xs text-muted-foreground">Include all imported book files (EPUB, PDF, etc.) in the backup. This will significantly increase backup size.</p>
            </div>
            <input
              type="checkbox"
              checked={includeBooks}
              onChange={(e) => setIncludeBooks(e.target.checked)}
              className="w-5 h-5"
            />
          </div>

          <Button variant="outline" onClick={handleBackup} disabled={isBackingUp} className="w-full gap-2">
            {isBackingUp ? (
              <><HardDrive className="w-4 h-4 animate-pulse" /> Creating backup...</>
            ) : (
              <><Download className="w-4 h-4" /> Create Backup</>
            )}
          </Button>

          {backupResult && (
            <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30 space-y-1">
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-sm font-medium">Backup created successfully</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {backupResult.book_count} books, {backupResult.annotation_count} annotations, {backupResult.collection_count} collections — {formatBytes(backupResult.total_size_bytes)}
              </p>
            </div>
          )}
        </div>
      </SettingSection>

      <SettingSection
        title="Restore"
        description="Restore your library from a previously created backup"
      >
        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
              <p className="text-xs text-yellow-700 dark:text-yellow-300">
                Restoring a backup will replace ALL current data including books, annotations, collections, and settings. This action cannot be undone.
              </p>
            </div>
          </div>

          <Button variant="outline" onClick={handleRestore} disabled={isRestoring} className="w-full gap-2">
            {isRestoring ? (
              <><Archive className="w-4 h-4 animate-pulse" /> Restoring...</>
            ) : (
              <><Upload className="w-4 h-4" /> Restore from Backup</>
            )}
          </Button>

          {restoreSuccess && (
            <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30">
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-sm font-medium">Restore completed successfully</span>
              </div>
            </div>
          )}
        </div>
      </SettingSection>

      {error && (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      <SettingSection title="Cache">
        <div className="space-y-3">
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted border border-border">
            <div>
              <p className="font-medium">Renderer Cache</p>
              <p className="text-sm text-muted-foreground">Temporary reading resources</p>
            </div>
            <Button variant="outline" size="sm" onClick={async () => {
              try {
                await api.clearRendererCache();
                alert('Cache cleared!');
              } catch (e) { console.error(e); }
            }}>Clear Memory Cache</Button>
          </div>
        </div>
      </SettingSection>
    </div>
  )
}

const NotificationSettings = () => {
  return (
    <div className="space-y-8">
      <SettingSection title="Notifications">
        <div className="p-6 text-center text-muted-foreground">
          <Bell className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">Notifications are not yet available</p>
          <p className="text-sm mt-1">This feature will be added in a future update.</p>
        </div>
      </SettingSection>
    </div>
  )
}

const AdvancedSettings = () => {
  const [isExporting, setIsExporting] = useState(false)
  const [isResetting, setIsResetting] = useState(false)

  const handleExport = async () => {
    try {
      setIsExporting(true)
      const savePath = await api.saveFileDialog('shiori_export.json')
      if (savePath) {
        await api.exportLibrary({
          format: 'json',
          include_metadata: true,
          include_collections: true,
          include_reading_progress: true,
          file_path: savePath
        })
        alert('Database exported successfully!')
      }
    } catch (err) {
      console.error(err)
      alert('Failed to export database')
    } finally {
      setIsExporting(false)
    }
  }

  const handleReset = async () => {
    if (confirm('Are you sure you want to reset the database? This will delete all your books and settings. This cannot be undone.')) {
      try {
        setIsResetting(true)
        await api.resetDatabase()
        alert('Database has been reset. The application will now reload.')
        window.location.reload()
      } catch (err) {
        console.error(err)
        alert('Failed to reset database')
      } finally {
        setIsResetting(false)
      }
    }
  }

  const handleResetOnboarding = async () => {
    if (confirm('Recheck the onboarding experience? This will take you back to the welcome screens. Your library data will NOT be deleted.')) {
      try {
        await api.resetOnboarding();
        alert('Onboarding state reset. The application will now reload.');
        window.location.reload();
      } catch (err) {
        console.error(err);
        alert('Failed to reset onboarding state');
      }
    }
  }

  const handleImport = async () => {
    alert('Import feature from an exported dataset is not fully supported yet in the backend! Coming soon in future versions.')
  }

  return (
    <div className="space-y-8">
      <SettingSection
        title="Database"
        description="Manage your library database"
      >
        <div className="space-y-3">
          <Button variant="outline" onClick={handleExport} disabled={isExporting}>
            {isExporting ? 'Exporting...' : 'Export Database'}
          </Button>
          <Button variant="outline" onClick={handleImport}>
            Import Database
          </Button>
          <Button variant="destructive" onClick={handleReset} disabled={isResetting}>
            {isResetting ? 'Resetting...' : 'Reset Database'}
          </Button>
          <div className="pt-2">
            <Button variant="outline" onClick={handleResetOnboarding} className="w-full">
              Reset Onboarding Experience
            </Button>
          </div>
        </div>
      </SettingSection>

      <SettingSection title="Debug">
        <SettingItem
          label="Enable Logging"
          description="Save debug logs to file"
        >
          <input type="checkbox" className="w-5 h-5" />
        </SettingItem>
      </SettingSection>
    </div>
  )
}
