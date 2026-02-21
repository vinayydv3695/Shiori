import { useState, useEffect } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Monitor, Moon, Sun, Book, Image, Palette, Download, Database, Bell, Shield, BookOpen, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { usePreferencesStore } from '../../store/preferencesStore'
import type { Theme, UserPreferences, BookPreferences, MangaPreferences } from '../../types/preferences'

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type SettingsTab = 'appearance' | 'book-reading' | 'manga-reading' | 'library' | 'storage' | 'notifications' | 'advanced'

export const SettingsDialog = ({ open, onOpenChange }: SettingsDialogProps) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance')
  const preferences = usePreferencesStore((state) => state.preferences)
  const updateTheme = usePreferencesStore((state) => state.updateTheme)
  const updateBookDefaults = usePreferencesStore((state) => state.updateBookDefaults)
  const updateMangaDefaults = usePreferencesStore((state) => state.updateMangaDefaults)
  const updateGeneralSettings = usePreferencesStore((state) => state.updateGeneralSettings)

  const tabs = [
    { id: 'appearance' as const, name: 'Appearance', icon: Palette },
    { id: 'book-reading' as const, name: 'Book Reading', icon: BookOpen },
    { id: 'manga-reading' as const, name: 'Manga Reading', icon: FileText },
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
              {activeTab === 'appearance' && <AppearanceSettings preferences={preferences} updateTheme={updateTheme} />}
              {activeTab === 'book-reading' && <BookReadingSettings preferences={preferences} updateBookDefaults={updateBookDefaults} />}
              {activeTab === 'manga-reading' && <MangaReadingSettings preferences={preferences} updateMangaDefaults={updateMangaDefaults} />}
              {activeTab === 'library' && <LibrarySettings preferences={preferences} updateGeneralSettings={updateGeneralSettings} />}
              {activeTab === 'storage' && <StorageSettings />}
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

const AppearanceSettings = ({ preferences, updateTheme }: { 
  preferences: UserPreferences | null
  updateTheme: (theme: Theme) => Promise<void>
}) => {
  if (!preferences) return null

  const handleThemeChange = async (newTheme: Theme) => {
    await updateTheme(newTheme)
  }

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
          description={preferences.manga.progressBar === 'hidden' ? 'Hidden' : preferences.manga.progressBar.charAt(0).toUpperCase() + preferences.manga.progressBar.slice(1)}
        >
          <select
            value={preferences.manga.progressBar}
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

const LibrarySettings = ({ preferences, updateGeneralSettings }: {
  preferences: UserPreferences | null
  updateGeneralSettings: (updates: any) => Promise<void>
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
    </div>
  )
}

const StorageSettings = () => {
  return (
    <div className="space-y-8">
      <SettingSection
        title="Library Location"
        description="Where your books are stored"
      >
        <div className="space-y-3">
          <div className="p-4 rounded-lg bg-muted border border-border">
            <p className="text-sm font-mono">/home/user/Documents/Shiori</p>
          </div>
          <Button variant="outline">Change Location</Button>
        </div>
      </SettingSection>

      <SettingSection title="Cache">
        <div className="space-y-3">
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted border border-border">
            <div>
              <p className="font-medium">Cover Cache</p>
              <p className="text-sm text-muted-foreground">245 MB</p>
            </div>
            <Button variant="outline" size="sm">Clear</Button>
          </div>
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted border border-border">
            <div>
              <p className="font-medium">Reading Cache</p>
              <p className="text-sm text-muted-foreground">102 MB</p>
            </div>
            <Button variant="outline" size="sm">Clear</Button>
          </div>
        </div>
      </SettingSection>
    </div>
  )
}

const NotificationSettings = () => {
  const [newBookNotif, setNewBookNotif] = useState(true)
  const [updateNotif, setUpdateNotif] = useState(true)

  return (
    <div className="space-y-8">
      <SettingSection title="Notifications">
        <SettingItem
          label="New Books"
          description="Notify when books are added"
        >
          <input
            type="checkbox"
            checked={newBookNotif}
            onChange={(e) => setNewBookNotif(e.target.checked)}
            className="w-5 h-5"
          />
        </SettingItem>

        <SettingItem
          label="Updates"
          description="Notify about app updates"
        >
          <input
            type="checkbox"
            checked={updateNotif}
            onChange={(e) => setUpdateNotif(e.target.checked)}
            className="w-5 h-5"
          />
        </SettingItem>
      </SettingSection>
    </div>
  )
}

const AdvancedSettings = () => {
  return (
    <div className="space-y-8">
      <SettingSection
        title="Database"
        description="Manage your library database"
      >
        <div className="space-y-3">
          <Button variant="outline">Export Database</Button>
          <Button variant="outline">Import Database</Button>
          <Button variant="destructive">Reset Database</Button>
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
