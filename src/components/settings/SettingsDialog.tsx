import { useState, useEffect, useMemo } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import * as Tabs from '@radix-ui/react-tabs'
import {
  X, Moon, Sun, Palette, Shield, BookOpen, FileText,
  Download, Upload, HardDrive, Archive, CheckCircle2, AlertTriangle,
  Search, FolderOpen, ExternalLink, RefreshCw, Trash2, Info, BookMarked,
  RotateCcw, Play, Square, Folder, Plus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { usePreferencesStore } from '../../store/preferencesStore'
import type {
  Theme, UserPreferences, BookPreferences, MangaPreferences, TtsPreferences, WatchFolder,
} from '../../types/preferences'
import { DEFAULT_USER_PREFERENCES, DEFAULT_BOOK_PREFERENCES, DEFAULT_MANGA_PREFERENCES } from '../../types/preferences'
import { api, isTauri } from '../../lib/tauri'
import type { BackupInfo, CacheStats } from '../../lib/tauri'
import { TTSEngine } from '@/lib/ttsEngine'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { useToast } from '../../store/toastStore'
import { logger } from '../../lib/logger'
import { useSourceStore } from '../../store/sourceStore'
import { SourceManager } from './SourceManager'
import { TorboxSettings } from './TorboxSettings'
import { AnnaArchiveSettings } from './AnnaArchiveSettings'
import { READING_FONTS, normalizeLegacyFontPreference, resolveReadingFontCss } from '@/lib/readingFonts'

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type SettingsTab = 'general' | 'book-reading' | 'manga-reading' | 'advanced' | 'watch-folders' | 'about'

interface SettingDefinition {
  label: string
  description?: string
  tab: SettingsTab
  section: string
}

const ALL_SETTINGS: SettingDefinition[] = [
  { label: 'Theme', description: 'Choose how Shiori looks', tab: 'general', section: 'Theme' },
  { label: 'Dark Theme', description: 'Dark color scheme', tab: 'general', section: 'Theme' },
  { label: 'Light Theme', description: 'Light color scheme', tab: 'general', section: 'Theme' },
  { label: 'System Theme', description: 'Follow system preference', tab: 'general', section: 'Theme' },
  { label: 'Accent Color', description: 'Used for buttons links and highlights', tab: 'general', section: 'Appearance' },
  { label: 'UI Font Family', description: 'Application font', tab: 'general', section: 'Appearance' },
  { label: 'UI Density', description: 'Adjust interface spacing', tab: 'general', section: 'Appearance' },
  { label: 'UI Scale', description: 'Adjust overall application size', tab: 'general', section: 'Appearance' },
  { label: 'Cover Size', description: 'Book cover display size', tab: 'general', section: 'Appearance' },
  { label: 'Auto-start Application', description: 'Start Shiori when system boots', tab: 'general', section: 'General' },
  { label: 'Import Path', description: 'Default import location', tab: 'general', section: 'Import' },
  { label: 'Default Sort Order', description: 'How books are sorted', tab: 'general', section: 'Library' },
  { label: 'Default View Mode', description: 'Grid list or table view', tab: 'general', section: 'Library' },
  { label: 'Library Display Density', description: 'Compact comfortable or spacious', tab: 'general', section: 'Library' },
  { label: 'Auto-Scan Library Folders', description: 'Automatically import new books', tab: 'general', section: 'Library' },
  { label: 'Auto-Scan Interval', description: 'How often to check for new books', tab: 'general', section: 'Library' },
  { label: 'Duplicate Handling', description: 'What to do with duplicate imports', tab: 'general', section: 'Library' },
  { label: 'Metadata Fetch Policy', description: 'How to fetch book metadata', tab: 'general', section: 'Library' },
  { label: 'Auto-fetch Cover Images', description: 'Download covers when missing', tab: 'general', section: 'Library' },
  { label: 'Daily Reading Goal', description: 'Daily reading target in minutes', tab: 'general', section: 'Library' },
  { label: 'Translation Target Language', description: 'Language for text translation', tab: 'general', section: 'Translation' },
  { label: 'Font Family', description: 'Book reader font', tab: 'book-reading', section: 'Font Settings' },
  { label: 'Font Size', description: 'Text size in pixels', tab: 'book-reading', section: 'Font Settings' },
  { label: 'Line Height', description: 'Space between lines', tab: 'book-reading', section: 'Font Settings' },
  { label: 'Scroll Mode', description: 'Paged or continuous scrolling', tab: 'book-reading', section: 'Reading Experience' },
  { label: 'Text Justification', description: 'Left-aligned or justified', tab: 'book-reading', section: 'Reading Experience' },
  { label: 'Hyphenation', description: 'Automatic word hyphenation', tab: 'book-reading', section: 'Reading Experience' },
  { label: 'Animation Speed', description: 'Page transition speed', tab: 'book-reading', section: 'Reading Experience' },
  { label: 'Page Width', description: 'Maximum content width', tab: 'book-reading', section: 'Layout' },
  { label: 'Paragraph Spacing', description: 'Space between paragraphs in em', tab: 'book-reading', section: 'Layout' },
  { label: 'Custom CSS', description: 'Inject custom CSS into book reader', tab: 'book-reading', section: 'Advanced' },
  { label: 'Text-to-Speech Voice', description: 'TTS voice selection', tab: 'book-reading', section: 'Audio / TTS' },
  { label: 'Speech Rate', description: 'TTS playback speed', tab: 'book-reading', section: 'Audio / TTS' },
  { label: 'Auto-advance Chapter', description: 'Continue to next chapter after TTS finishes', tab: 'book-reading', section: 'Audio / TTS' },
  { label: 'Highlight Color', description: 'TTS highlight color', tab: 'book-reading', section: 'Audio / TTS' },
  { label: 'Reading Mode', description: 'Single double or long strip', tab: 'manga-reading', section: 'Reading Mode' },
  { label: 'Reading Direction', description: 'Left-to-right or right-to-left', tab: 'manga-reading', section: 'Reading Direction' },
  { label: 'Fit to Width', description: 'Scale images to fit width', tab: 'manga-reading', section: 'Display Options' },
  { label: 'Image Smoothing', description: 'Anti-aliasing for images', tab: 'manga-reading', section: 'Display Options' },
  { label: 'GPU Acceleration', description: 'Hardware accelerated rendering', tab: 'manga-reading', section: 'Display Options' },
  { label: 'Background Color', description: 'Reader background color', tab: 'manga-reading', section: 'Display Options' },
  { label: 'Progress Bar', description: 'Progress bar position', tab: 'manga-reading', section: 'Display Options' },
  { label: 'Preload Pages', description: 'Number of pages to preload', tab: 'manga-reading', section: 'Performance' },
  { label: 'Margin Size', description: 'Page margin in pixels', tab: 'manga-reading', section: 'Performance' },
  { label: 'Export Database', description: 'Export library data', tab: 'advanced', section: 'Database' },
  { label: 'Import Database', description: 'Import library data', tab: 'advanced', section: 'Database' },
  { label: 'Reset Database', description: 'Delete all data', tab: 'advanced', section: 'Database' },
  { label: 'Reset Onboarding', description: 'Re-show welcome screens', tab: 'advanced', section: 'Database' },
  { label: 'Enable Logging', description: 'Save debug logs', tab: 'advanced', section: 'Debug' },
  { label: 'Renderer Cache', description: 'Temporary reading resources', tab: 'advanced', section: 'Cache' },
  { label: 'Max Cache Size', description: 'Maximum cache storage limit', tab: 'advanced', section: 'Cache' },
  { label: 'Cache Clear Policy', description: 'When to auto-clear cache', tab: 'advanced', section: 'Cache' },
  { label: 'Backup', description: 'Create library backup', tab: 'advanced', section: 'Backup & Restore' },
  { label: 'Restore', description: 'Restore from backup', tab: 'advanced', section: 'Backup & Restore' },
  { label: 'Send Analytics', description: 'Anonymous usage statistics', tab: 'advanced', section: 'Privacy' },
  { label: 'Send Crash Reports', description: 'Automatic crash reporting', tab: 'advanced', section: 'Privacy' },
  { label: 'Reading History Retention', description: 'How long to keep reading history', tab: 'advanced', section: 'Privacy' },
  { label: 'Clear Reading History', description: 'Delete all reading history', tab: 'advanced', section: 'Privacy' },
  { label: 'Reset All Settings', description: 'Restore factory defaults', tab: 'advanced', section: 'Privacy' },
]

export const SettingsDialog = ({ open, onOpenChange }: SettingsDialogProps) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')
  const [searchQuery, setSearchQuery] = useState('')
  const preferences = usePreferencesStore((state) => state.preferences)
  const updateTheme = usePreferencesStore((state) => state.updateTheme)
  const updateBookDefaults = usePreferencesStore((state) => state.updateBookDefaults)
  const updateMangaDefaults = usePreferencesStore((state) => state.updateMangaDefaults)
  const updateTtsDefaults = usePreferencesStore((state) => state.updateTtsDefaults)
  const updateGeneralSettings = usePreferencesStore((state) => state.updateGeneralSettings)
  const loadPreferences = usePreferencesStore((state) => state.loadPreferences)

  const matchingTabs = useMemo(() => {
    if (!searchQuery.trim()) return null
    const query = searchQuery.toLowerCase()
    const tabs = new Set<SettingsTab>()
    ALL_SETTINGS.forEach((setting) => {
      if (
        setting.label.toLowerCase().includes(query) ||
        setting.description?.toLowerCase().includes(query) ||
        setting.section.toLowerCase().includes(query)
      ) {
        tabs.add(setting.tab)
      }
    })
    return tabs
  }, [searchQuery])

  const isSettingVisible = (label: string, description?: string, section?: string): boolean => {
    if (!searchQuery.trim()) return true
    const query = searchQuery.toLowerCase()
    return (
      label.toLowerCase().includes(query) ||
      (description?.toLowerCase().includes(query) ?? false) ||
      (section?.toLowerCase().includes(query) ?? false)
    )
  }

  const isSectionVisible = (sectionName: string, settings: string[]): boolean => {
    if (!searchQuery.trim()) return true
    const query = searchQuery.toLowerCase()
    if (sectionName.toLowerCase().includes(query)) return true
    return settings.some(s => s.toLowerCase().includes(query))
  }

  const visibleTabSet = matchingTabs
  const activeTabIsVisible = !visibleTabSet || visibleTabSet.has(activeTab) || activeTab === 'about'
  const selectedTab = activeTabIsVisible
    ? activeTab
    : ((visibleTabSet?.values().next().value as SettingsTab | undefined) ?? 'general')

  const tabs = [
    { id: 'general' as const, name: 'General', icon: Palette },
    { id: 'book-reading' as const, name: 'Reading (Books)', icon: BookOpen },
    { id: 'manga-reading' as const, name: 'Reading (Manga)', icon: FileText },
    { id: 'advanced' as const, name: 'Advanced', icon: Shield },
    { id: 'watch-folders' as const, name: 'Watch Folders', icon: Folder },
    { id: 'about' as const, name: 'About', icon: Info },
  ]

  const filteredTabs = matchingTabs
    ? tabs.filter(tab => matchingTabs.has(tab.id) || tab.id === 'about')
    : tabs

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
        <Dialog.Content className="settings-dialog fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background border border-border rounded-lg shadow-2xl w-[90vw] max-w-5xl h-[85vh] z-50 flex flex-col">
          <div className="flex items-center justify-between p-6 border-b border-border">
            <Dialog.Title className="text-2xl font-semibold">Settings</Dialog.Title>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                <Input
                  type="search"
                  placeholder="Search settings..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 w-64"
                  aria-label="Search settings"
                />
                {searchQuery && (
                  <button
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setSearchQuery('')}
                    aria-label="Clear search"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <Dialog.Close asChild>
                <Button variant="ghost" size="icon" aria-label="Close settings">
                  <X className="w-5 h-5" />
                </Button>
              </Dialog.Close>
            </div>
          </div>

          <Tabs.Root
            value={selectedTab}
            onValueChange={(val) => setActiveTab(val as SettingsTab)}
            className="flex flex-1 overflow-hidden"
            orientation="vertical"
          >
            <Tabs.List
              className="w-56 border-r border-border p-4 space-y-1 flex-shrink-0"
              aria-label="Settings categories"
            >
              {filteredTabs.map((tab) => (
                <Tabs.Trigger
                  key={tab.id}
                  value={tab.id}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-left',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    'data-[state=active]:bg-primary data-[state=active]:text-primary-foreground',
                    'data-[state=inactive]:text-foreground/90 data-[state=inactive]:hover:bg-muted data-[state=inactive]:hover:text-foreground',
                    'dark:data-[state=inactive]:text-zinc-100 dark:data-[state=inactive]:hover:bg-zinc-700 dark:data-[state=inactive]:hover:text-white'
                  )}
                >
                  <tab.icon className="w-5 h-5 flex-shrink-0" />
                  <span className="font-sans font-semibold tracking-wide">{tab.name}</span>
                </Tabs.Trigger>
              ))}
            </Tabs.List>

            <div className="flex-1 overflow-y-auto p-6">
              <Tabs.Content value="general" className="focus-visible:outline-none">
                <GeneralSettings
                  preferences={preferences}
                  updateTheme={updateTheme}
                  updateGeneralSettings={updateGeneralSettings}
                  isSettingVisible={isSettingVisible}
                  isSectionVisible={isSectionVisible}
                />
              </Tabs.Content>

              <Tabs.Content value="book-reading" className="focus-visible:outline-none">
                <BookReadingSettings
                  preferences={preferences}
                  updateBookDefaults={updateBookDefaults}
                  updateTtsDefaults={updateTtsDefaults}
                  isSettingVisible={isSettingVisible}
                  isSectionVisible={isSectionVisible}
                />
              </Tabs.Content>

              <Tabs.Content value="manga-reading" className="focus-visible:outline-none">
                <MangaReadingSettings
                  preferences={preferences}
                  updateMangaDefaults={updateMangaDefaults}
                  updateGeneralSettings={updateGeneralSettings}
                  isSettingVisible={isSettingVisible}
                  isSectionVisible={isSectionVisible}
                />
              </Tabs.Content>

              <Tabs.Content value="advanced" className="focus-visible:outline-none">
                <AdvancedSettings
                  preferences={preferences}
                  updateGeneralSettings={updateGeneralSettings}
                  loadPreferences={loadPreferences}
                  isSettingVisible={isSettingVisible}
                  isSectionVisible={isSectionVisible}
                />
              </Tabs.Content>

              <Tabs.Content value="watch-folders" className="focus-visible:outline-none">
                <WatchFoldersSettings
                  preferences={preferences}
                  isSectionVisible={isSectionVisible}
                />
              </Tabs.Content>

              <Tabs.Content value="about" className="focus-visible:outline-none">
                <AboutSettings />
              </Tabs.Content>
            </div>
          </Tabs.Root>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

const SettingSection = ({
  title,
  description,
  children,
  onReset,
}: {
  title: string
  description?: string
  children: React.ReactNode
  onReset?: () => void
}) => (
  <div className="space-y-4 pb-8 border-b border-border last:border-0">
    <div className="flex items-center justify-between">
      <div>
        <h3 className="text-lg font-semibold">{title}</h3>
        {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
      </div>
      {onReset && (
        <Button variant="ghost" size="sm" onClick={onReset} className="gap-1.5 text-muted-foreground hover:text-foreground">
          <RotateCcw size={14} />
          Reset
        </Button>
      )}
    </div>
    <div className="space-y-4">{children}</div>
  </div>
)

const SettingItem = ({
  label,
  description,
  children,
}: {
  label: string
  description?: string
  children: React.ReactNode
}) => (
  <div className="flex items-center justify-between">
    <div className="space-y-0.5">
      <label className="text-sm font-medium">{label}</label>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
    </div>
    <div>{children}</div>
  </div>
)

const GeneralSettings = ({
  preferences,
  updateTheme,
  updateGeneralSettings,
  isSettingVisible,
  isSectionVisible,
}: {
  preferences: UserPreferences | null
  updateTheme: (theme: Theme) => Promise<void>
  updateGeneralSettings: (updates: Partial<UserPreferences>) => Promise<void>
  isSettingVisible: (label: string, description?: string, section?: string) => boolean
  isSectionVisible: (section: string, settings: string[]) => boolean
}) => {
  const toast = useToast()
  const preferredDebridProvider = useSourceStore((state) => state.preferredDebridProvider)
  const setPreferredDebridProvider = useSourceStore((state) => state.setPreferredDebridProvider)

  if (!preferences) return null

  const currentScale = preferences.uiScale ?? 1.0
  const scalePercent = Math.round(currentScale * 100)

  const handleChangeImportPath = async () => {
    try {
      const path = await api.openFolderDialog()
      if (path) {
        await updateGeneralSettings({ defaultImportPath: path })
        toast.success('Import path updated', `Set to ${path}`)
      }
    } catch (error) {
      logger.error('Failed to select import path:', error)
      toast.error('Failed to change import path')
    }
  }

  const themeOptions: { value: Theme; label: string; icon: typeof Moon }[] = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'rose-pine-moon', label: 'Rosé Pine', icon: Palette },
    { value: 'catppuccin-mocha', label: 'Catppuccin', icon: Palette },
    { value: 'nord', label: 'Nord', icon: Palette },
    { value: 'dracula', label: 'Dracula', icon: Palette },
    { value: 'tokyo-night', label: 'Tokyo Night', icon: Palette },
  ]

  return (
    <div className="space-y-8">
      {isSectionVisible('Theme', ['Theme', 'Dark Theme', 'Light Theme', 'System Theme']) && (
        <SettingSection title="Theme" description="Choose how Shiori looks">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {themeOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => updateTheme(option.value)}
                className={cn(
                  'p-4 rounded-lg border-2 transition-all flex flex-col items-center gap-2',
                  preferences.theme === option.value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                )}
                aria-label={`${option.label} theme`}
              >
                <option.icon className="w-6 h-6" />
                <span className="text-sm font-medium">{option.label}</span>
              </button>
            ))}
          </div>

          {isSettingVisible('Theme Preview', 'Preview of current theme colors', 'Theme') && (
            <div className="rounded-lg border p-4">
              <p className="text-xs font-medium text-muted-foreground mb-3">Theme Preview</p>
              <div className="flex gap-2">
                <div className="w-8 h-8 rounded-full bg-primary" title="Primary" />
                <div className="w-8 h-8 rounded-full bg-secondary" title="Secondary" />
                <div className="w-8 h-8 rounded-full bg-accent" title="Accent" />
                <div className="w-8 h-8 rounded-full bg-muted" title="Muted" />
                <div className="w-8 h-8 rounded-full bg-destructive" title="Destructive" />
                <div className="w-8 h-8 rounded-full border bg-background" title="Background" />
                <div className="w-8 h-8 rounded-full bg-foreground" title="Foreground" />
              </div>
            </div>
          )}
        </SettingSection>
      )}

      {isSectionVisible('Appearance', ['Accent Color', 'UI Font Family', 'UI Density', 'UI Scale', 'Cover Size']) && (
        <SettingSection
          title="Appearance"
          description="Customize the interface"
          onReset={() => {
            updateGeneralSettings({
              accentColor: DEFAULT_USER_PREFERENCES.accentColor,
              uiDensity: DEFAULT_USER_PREFERENCES.uiDensity,
              uiScale: DEFAULT_USER_PREFERENCES.uiScale,
              uiFontFamily: DEFAULT_USER_PREFERENCES.uiFontFamily,
              coverSize: DEFAULT_USER_PREFERENCES.coverSize,
            })
            toast.success('Appearance settings reset')
          }}
        >
          {isSettingVisible('Accent Color', 'Used for buttons links and highlights', 'Appearance') && (
            <SettingItem label="Accent Color" description="Used for buttons, links, and highlights">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={preferences.accentColor || '#3b82f6'}
                  onChange={(e) => updateGeneralSettings({ accentColor: e.target.value })}
                  className="w-10 h-10 rounded cursor-pointer border border-border"
                  aria-label="Accent color picker"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => updateGeneralSettings({ accentColor: '#3B82F6' })}
                >
                  Reset
                </Button>
              </div>
            </SettingItem>
          )}

          {isSettingVisible('UI Font Family', 'Application font', 'Appearance') && (
            <SettingItem label="UI Font Family" description={preferences.uiFontFamily || 'System Default'}>
              <select
                value={preferences.uiFontFamily || 'system'}
                onChange={(e) => updateGeneralSettings({ uiFontFamily: e.target.value })}
                className="px-3 py-2 rounded-md border border-border bg-background"
                aria-label="UI font family"
              >
                <option value="system">System Default</option>
                <option value="Inter">Inter</option>
                <option value="Roboto">Roboto</option>
                <option value="Open Sans">Open Sans</option>
              </select>
            </SettingItem>
          )}

          {isSettingVisible('UI Density', 'Adjust interface spacing', 'Appearance') && (
            <SettingItem label="UI Density" description="Adjust interface spacing">
              <div className="flex gap-2">
                {(['compact', 'comfortable'] as const).map((density) => (
                  <button
                    key={density}
                    onClick={() => updateGeneralSettings({ uiDensity: density })}
                    className={cn(
                      'px-4 py-2 rounded-md border text-sm transition-all capitalize',
                      preferences.uiDensity === density
                        ? 'border-primary bg-primary/5 font-medium'
                        : 'border-border hover:border-primary/50'
                    )}
                  >
                    {density}
                  </button>
                ))}
              </div>
            </SettingItem>
          )}

          {isSettingVisible('UI Scale', 'Adjust overall application size', 'Appearance') && (
            <SettingItem label="UI Scale" description={`${scalePercent}%`}>
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
                  aria-label="UI scale"
                />
                <span className="text-xs text-muted-foreground w-10">150%</span>
              </div>
            </SettingItem>
          )}

          {isSettingVisible('Cover Size', 'Book cover display size', 'Appearance') && (
            <SettingItem label="Cover Size" description="Book cover display size in library">
              <div className="flex gap-2">
                {([
                  { value: 'small' as const, label: 'Small' },
                  { value: 'medium' as const, label: 'Medium' },
                  { value: 'large' as const, label: 'Large' },
                ]).map((size) => (
                  <button
                    key={size.value}
                    onClick={() => updateGeneralSettings({ coverSize: size.value })}
                    className={cn(
                      'px-3 py-1.5 rounded-md border text-sm transition-all',
                      preferences.coverSize === size.value
                        ? 'border-primary bg-primary/5 font-medium'
                        : 'border-border hover:border-primary/50'
                    )}
                  >
                    {size.label}
                  </button>
                ))}
              </div>
            </SettingItem>
          )}
        </SettingSection>
      )}

      {isSectionVisible('General', ['Auto-start Application']) && (
        <SettingSection title="General">
          {isSettingVisible('Auto-start Application', 'Start Shiori when system boots', 'General') && (
            <SettingItem label="Auto-start Application" description="Start Shiori when system boots">
              <input
                type="checkbox"
                checked={preferences.autoStart}
                onChange={(e) => updateGeneralSettings({ autoStart: e.target.checked })}
                className="w-5 h-5"
                aria-label="Auto-start application"
              />
            </SettingItem>
          )}
        </SettingSection>
      )}

      {isSectionVisible('Import', ['Import Path']) && (
        <SettingSection title="Import Path">
          <div className="space-y-3">
            <div className="p-4 rounded-lg bg-muted border border-border">
              <p className="text-sm font-mono">{preferences.defaultImportPath || 'Not set'}</p>
            </div>
            <Button variant="outline" onClick={handleChangeImportPath} className="gap-2">
              <FolderOpen size={16} />
              Change Import Path
            </Button>
          </div>
        </SettingSection>
      )}

      {isSectionVisible('Library', ['Default Sort Order', 'Default View Mode', 'Library Display Density', 'Auto-Scan Library Folders', 'Auto-Scan Interval', 'Duplicate Handling', 'Metadata Fetch Policy', 'Auto-fetch Cover Images', 'Daily Reading Goal']) && (
        <SettingSection
          title="Library"
          description="Configure library behavior"
          onReset={() => {
            updateGeneralSettings({
              defaultSortOrder: DEFAULT_USER_PREFERENCES.defaultSortOrder,
              defaultViewMode: DEFAULT_USER_PREFERENCES.defaultViewMode,
              libraryDensity: DEFAULT_USER_PREFERENCES.libraryDensity,
              autoScanEnabled: DEFAULT_USER_PREFERENCES.autoScanEnabled,
              autoScanIntervalMinutes: DEFAULT_USER_PREFERENCES.autoScanIntervalMinutes,
              duplicateHandling: DEFAULT_USER_PREFERENCES.duplicateHandling,
              metadataMode: DEFAULT_USER_PREFERENCES.metadataMode,
              autoFetchCovers: DEFAULT_USER_PREFERENCES.autoFetchCovers,
              dailyReadingGoalMinutes: DEFAULT_USER_PREFERENCES.dailyReadingGoalMinutes,
            })
            toast.success('Library settings reset')
          }}
        >
          {isSettingVisible('Default Sort Order', 'How books are sorted', 'Library') && (
            <SettingItem label="Default Sort Order" description="How books are sorted in library">
              <select
                value={preferences.defaultSortOrder || 'title-asc'}
                onChange={(e) => updateGeneralSettings({ defaultSortOrder: e.target.value as UserPreferences['defaultSortOrder'] })}
                className="px-3 py-2 rounded-md border border-border bg-background"
                aria-label="Default sort order"
              >
                <option value="title-asc">Title (A-Z)</option>
                <option value="title-desc">Title (Z-A)</option>
                <option value="author-asc">Author (A-Z)</option>
                <option value="date-added-desc">Recently Added</option>
                <option value="date-added-asc">Oldest First</option>
                <option value="last-read-desc">Recently Read</option>
              </select>
            </SettingItem>
          )}

          {isSettingVisible('Default View Mode', 'Grid list or table view', 'Library') && (
            <SettingItem label="Default View Mode" description="Library display mode">
              <div className="flex gap-2">
                {(['grid', 'list', 'table'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => updateGeneralSettings({ defaultViewMode: mode })}
                    className={cn(
                      'px-3 py-1.5 rounded-md border text-sm transition-all capitalize',
                      preferences.defaultViewMode === mode
                        ? 'border-primary bg-primary/5 font-medium'
                        : 'border-border hover:border-primary/50'
                    )}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </SettingItem>
          )}

          {isSettingVisible('Library Display Density', 'Compact comfortable or spacious', 'Library') && (
            <SettingItem label="Library Display Density" description="Items per row density">
              <div className="flex gap-2">
                {(['compact', 'comfortable', 'spacious'] as const).map((density) => (
                  <button
                    key={density}
                    onClick={() => updateGeneralSettings({ libraryDensity: density })}
                    className={cn(
                      'px-3 py-1.5 rounded-md border text-sm transition-all capitalize',
                      preferences.libraryDensity === density
                        ? 'border-primary bg-primary/5 font-medium'
                        : 'border-border hover:border-primary/50'
                    )}
                  >
                    {density}
                  </button>
                ))}
              </div>
            </SettingItem>
          )}

          {isSettingVisible('Auto-Scan Library Folders', 'Automatically import new books', 'Library') && (
            <SettingItem label="Auto-Scan Library Folders" description="Automatically import new books when detected">
              <input
                type="checkbox"
                checked={preferences.autoScanEnabled ?? false}
                onChange={(e) => updateGeneralSettings({ autoScanEnabled: e.target.checked })}
                className="w-5 h-5"
                aria-label="Auto-scan library folders"
              />
            </SettingItem>
          )}

          {preferences.autoScanEnabled && isSettingVisible('Auto-Scan Interval', 'How often to check for new books', 'Library') && (
            <SettingItem label="Auto-Scan Interval" description="How often to check for new books">
              <select
                value={String(preferences.autoScanIntervalMinutes || 60)}
                onChange={(e) => updateGeneralSettings({ autoScanIntervalMinutes: Number(e.target.value) })}
                className="px-3 py-2 rounded-md border border-border bg-background"
                aria-label="Auto-scan interval"
              >
                <option value="5">Every 5 minutes</option>
                <option value="15">Every 15 minutes</option>
                <option value="30">Every 30 minutes</option>
                <option value="60">Every hour</option>
                <option value="1440">Once per day</option>
              </select>
            </SettingItem>
          )}

          {isSettingVisible('Duplicate Handling', 'What to do with duplicate imports', 'Library') && (
            <SettingItem label="Duplicate Handling" description="What to do with duplicate imports">
              <select
                value={preferences.duplicateHandling || 'skip'}
                onChange={(e) => updateGeneralSettings({ duplicateHandling: e.target.value as UserPreferences['duplicateHandling'] })}
                className="px-3 py-2 rounded-md border border-border bg-background"
                aria-label="Duplicate handling"
              >
                <option value="skip">Skip Duplicates</option>
                <option value="overwrite">Overwrite Existing</option>
                <option value="keep-both">Keep Both</option>
                <option value="ask">Ask Each Time</option>
              </select>
            </SettingItem>
          )}

          {isSettingVisible('Metadata Fetch Policy', 'How to fetch book metadata', 'Library') && (
            <SettingItem label="Metadata Fetch Policy" description="How to fetch book metadata">
              <select
                value={preferences.metadataMode || 'auto'}
                onChange={(e) => updateGeneralSettings({ metadataMode: e.target.value })}
                className="px-3 py-2 rounded-md border border-border bg-background"
                aria-label="Metadata fetch policy"
              >
                <option value="auto">Auto-fetch (Online)</option>
                <option value="embedded-only">Embedded Only (Offline)</option>
                <option value="manual">Manual Only</option>
                <option value="online">Online</option>
              </select>
            </SettingItem>
          )}

          {isSettingVisible('Auto-fetch Cover Images', 'Download covers when missing', 'Library') && (
            <SettingItem label="Auto-fetch Cover Images" description="Download covers from online providers when missing">
              <input
                type="checkbox"
                checked={preferences.autoFetchCovers ?? true}
                onChange={(e) => updateGeneralSettings({ autoFetchCovers: e.target.checked })}
                className="w-5 h-5"
                aria-label="Auto-fetch cover images"
              />
            </SettingItem>
          )}

          {isSettingVisible('Daily Reading Goal', 'Daily reading target in minutes', 'Library') && (
            <SettingItem label="Daily Reading Goal" description={`${preferences.dailyReadingGoalMinutes || 30} minutes`}>
              <input
                type="range"
                min="0"
                max="180"
                step="5"
                value={preferences.dailyReadingGoalMinutes || 30}
                onChange={(e) => updateGeneralSettings({ dailyReadingGoalMinutes: Number(e.target.value) })}
                className="w-48"
                aria-label="Daily reading goal"
              />
            </SettingItem>
          )}
        </SettingSection>
      )}

      {isSectionVisible('Translation', ['Translation Target Language']) && (
        <SettingSection title="Translation" description="Default target language for text translation">
          {isSettingVisible('Translation Target Language', 'Language for text translation', 'Translation') && (
            <SettingItem label="Target Language" description="Language to translate selected text into">
              <select
                value={preferences.translationTargetLanguage || 'en'}
                onChange={(e) => updateGeneralSettings({ translationTargetLanguage: e.target.value })}
                className="px-3 py-2 rounded-lg bg-muted border border-border text-sm"
                aria-label="Translation target language"
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
          )}
        </SettingSection>
      )}

      <SettingSection title="Download Services" description="Configure cloud torrent and download services">
        <div className="space-y-4">
          <SettingItem
            label="Debrid Provider"
            description="Torbox is the active SHIORI x TORBOX provider for online downloads in this build."
          >
            <select
              value={preferredDebridProvider}
              onChange={(e) => setPreferredDebridProvider(e.target.value as 'auto' | 'torbox')}
              className="px-3 py-2 rounded-md border border-border bg-background"
              aria-label="Preferred debrid provider"
              disabled
            >
              <option value="auto">Auto (Torbox)</option>
              <option value="torbox">Torbox</option>
            </select>
          </SettingItem>
          <div>
            <h4 className="text-sm font-semibold mb-2">Anna Archive</h4>
            <AnnaArchiveSettings />
          </div>
          <div>
            <h4 className="text-sm font-semibold mb-2">Torbox</h4>
            <TorboxSettings />
          </div>
        </div>
      </SettingSection>

      <SettingSection title="Online Sources" description="Enable or disable online providers used by online sections">
        <SourceManager />
      </SettingSection>
    </div>
  )
}

const SPEED_OPTIONS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0]

const BookReadingSettings = ({
  preferences,
  updateBookDefaults,
  updateTtsDefaults,
  isSettingVisible,
  isSectionVisible,
}: {
  preferences: UserPreferences | null
  updateBookDefaults: (updates: Partial<BookPreferences>) => Promise<void>
  updateTtsDefaults: (updates: Partial<TtsPreferences>) => Promise<void>
  isSettingVisible: (label: string, description?: string, section?: string) => boolean
  isSectionVisible: (section: string, settings: string[]) => boolean
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

  const normalizedBookFontFamily = normalizeLegacyFontPreference(preferences.book.fontFamily)

  const previewText =
    'The quick brown fox jumps over the lazy dog. This is a sample text to preview your reading settings in real-time.'

  return (
    <div className="space-y-8">
      {isSectionVisible('Font Settings', ['Font Family', 'Font Size', 'Line Height']) && (
        <SettingSection
          title="Font Settings"
          description="Customize how books are displayed"
          onReset={() => {
            updateBookDefaults({
              fontFamily: DEFAULT_BOOK_PREFERENCES.fontFamily,
              fontSize: DEFAULT_BOOK_PREFERENCES.fontSize,
              lineHeight: DEFAULT_BOOK_PREFERENCES.lineHeight,
            })
          }}
        >
          {isSettingVisible('Font Family', 'Book reader font', 'Font Settings') && (
            <SettingItem label="Font Family" description={normalizedBookFontFamily}>
              <select
                value={normalizedBookFontFamily}
                onChange={(e) => updateBookDefaults({ fontFamily: normalizeLegacyFontPreference(e.target.value) })}
                className="px-3 py-2 rounded-md border border-border bg-background"
                aria-label="Font family"
              >
                {READING_FONTS.map((font) => (
                  <option key={font.id} value={font.id}>{font.label}</option>
                ))}
              </select>
            </SettingItem>
          )}

          {isSettingVisible('Font Size', 'Text size in pixels', 'Font Settings') && (
            <SettingItem label="Font Size" description={`${preferences.book.fontSize}px`}>
              <input
                type="range"
                min="12"
                max="32"
                value={preferences.book.fontSize}
                onChange={(e) => updateBookDefaults({ fontSize: Number(e.target.value) })}
                className="w-48"
                aria-label="Font size"
              />
            </SettingItem>
          )}

          {isSettingVisible('Line Height', 'Space between lines', 'Font Settings') && (
            <SettingItem label="Line Height" description={`${preferences.book.lineHeight}`}>
              <input
                type="range"
                min="1.2"
                max="2.4"
                step="0.1"
                value={preferences.book.lineHeight}
                onChange={(e) => updateBookDefaults({ lineHeight: Number(e.target.value) })}
                className="w-48"
                aria-label="Line height"
              />
            </SettingItem>
          )}

          <div className="rounded-lg border p-6 bg-background">
            <p className="text-xs font-medium text-muted-foreground mb-3">Font Preview</p>
            <div
              style={{
                fontFamily: resolveReadingFontCss(normalizedBookFontFamily),
                fontSize: `${preferences.book.fontSize}px`,
                lineHeight: preferences.book.lineHeight,
                textAlign: preferences.book.justification,
                maxWidth: `${preferences.book.pageWidth}px`,
                margin: '0 auto',
              }}
            >
              {previewText}
            </div>
          </div>
        </SettingSection>
      )}

      {isSectionVisible('Reading Experience', ['Scroll Mode', 'Text Justification', 'Hyphenation', 'Animation Speed']) && (
        <SettingSection title="Reading Experience">
          {isSettingVisible('Scroll Mode', 'Paged or continuous scrolling', 'Reading Experience') && (
            <SettingItem
              label="Scroll Mode"
              description={preferences.book.scrollMode === 'continuous' ? 'Continuous' : 'Paged'}
            >
              <select
                value={preferences.book.scrollMode}
                onChange={(e) => updateBookDefaults({ scrollMode: e.target.value as 'paged' | 'continuous' })}
                className="px-3 py-2 rounded-md border border-border bg-background"
                aria-label="Scroll mode"
              >
                <option value="paged">Paged</option>
                <option value="continuous">Continuous</option>
              </select>
            </SettingItem>
          )}

          {isSettingVisible('Text Justification', 'Left-aligned or justified', 'Reading Experience') && (
            <SettingItem
              label="Text Justification"
              description={preferences.book.justification === 'justify' ? 'Justified' : 'Left-aligned'}
            >
              <select
                value={preferences.book.justification}
                onChange={(e) => updateBookDefaults({ justification: e.target.value as 'left' | 'justify' })}
                className="px-3 py-2 rounded-md border border-border bg-background"
                aria-label="Text justification"
              >
                <option value="left">Left</option>
                <option value="justify">Justify</option>
              </select>
            </SettingItem>
          )}

          {isSettingVisible('Hyphenation', 'Automatic word hyphenation', 'Reading Experience') && (
            <SettingItem
              label="Hyphenation"
              description={preferences.book.hyphenation ? 'Enabled' : 'Disabled'}
            >
              <input
                type="checkbox"
                checked={preferences.book.hyphenation}
                onChange={(e) => updateBookDefaults({ hyphenation: e.target.checked })}
                className="w-5 h-5"
                aria-label="Hyphenation"
              />
            </SettingItem>
          )}

          {isSettingVisible('Animation Speed', 'Page transition speed', 'Reading Experience') && (
            <SettingItem label="Animation Speed" description={`${preferences.book.animationSpeed}ms`}>
              <input
                type="range"
                min="0"
                max="500"
                step="50"
                value={preferences.book.animationSpeed}
                onChange={(e) => updateBookDefaults({ animationSpeed: Number(e.target.value) })}
                className="w-48"
                aria-label="Animation speed"
              />
            </SettingItem>
          )}
        </SettingSection>
      )}

      {isSectionVisible('Layout', ['Page Width', 'Paragraph Spacing']) && (
        <SettingSection title="Layout">
          {isSettingVisible('Page Width', 'Maximum content width', 'Layout') && (
            <SettingItem label="Page Width" description={`${preferences.book.pageWidth}px`}>
              <input
                type="range"
                min="400"
                max="1200"
                step="50"
                value={preferences.book.pageWidth}
                onChange={(e) => updateBookDefaults({ pageWidth: Number(e.target.value) })}
                className="w-48"
                aria-label="Page width"
              />
            </SettingItem>
          )}

          {isSettingVisible('Paragraph Spacing', 'Space between paragraphs in em', 'Layout') && (
            <SettingItem label="Paragraph Spacing" description={`${preferences.book.paragraphSpacing.toFixed(1)}em`}>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={preferences.book.paragraphSpacing}
                onChange={(e) => updateBookDefaults({ paragraphSpacing: Number(e.target.value) })}
                className="w-48"
                aria-label="Paragraph spacing"
              />
            </SettingItem>
          )}
        </SettingSection>
      )}

      {isSectionVisible('Advanced', ['Custom CSS']) && (
        <SettingSection title="Advanced">
          {isSettingVisible('Custom CSS', 'Inject custom CSS into book reader', 'Advanced') && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Custom CSS</label>
              <textarea
                value={preferences.book.customCSS || ''}
                onChange={(e) => updateBookDefaults({ customCSS: e.target.value })}
                placeholder="/* Custom reader styles */"
                className="w-full font-mono text-sm p-3 rounded-md border border-border bg-background resize-y min-h-[100px]"
                rows={6}
                aria-label="Custom CSS"
              />
              <p className="text-xs text-muted-foreground">
                Inject custom CSS into the book reader
              </p>
            </div>
          )}
        </SettingSection>
      )}

      {isSectionVisible('Audio / TTS', ['Text-to-Speech Voice', 'Speech Rate', 'Auto-advance Chapter', 'Highlight Color']) && (
        <SettingSection title="Audio / TTS" description="Configure voice and speech settings for read-aloud">
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

          {'speechSynthesis' in window && voices.length === 0 && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <p className="text-sm text-amber-600 dark:text-amber-400">
                No TTS voices were found. On Linux, the WebKitGTK webview may expose
                the Speech API but provide no voices. Try installing speech-dispatcher
                or espeak-ng and restarting the app.
              </p>
            </div>
          )}

          {isSettingVisible('Text-to-Speech Voice', 'TTS voice selection', 'Audio / TTS') && (
            <SettingItem
              label="Voice"
              description={(preferences.tts?.voice ?? 'default') === 'default' ? 'System default' : (preferences.tts?.voice ?? 'default')}
            >
              <select
                value={preferences.tts?.voice ?? 'default'}
                onChange={(e) => updateTtsDefaults({ voice: e.target.value })}
                disabled={!isAvailable}
                className="px-3 py-2 rounded-md border border-border bg-background max-w-[250px] disabled:opacity-50"
                aria-label="TTS voice"
              >
                <option value="default">System Default</option>
                {voices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </select>
            </SettingItem>
          )}

          {isSettingVisible('Speech Rate', 'TTS playback speed', 'Audio / TTS') && (
            <SettingItem label="Speech Rate" description={`${preferences.tts?.rate ?? 1.0}x`}>
              <select
                value={preferences.tts?.rate ?? 1.0}
                onChange={(e) => updateTtsDefaults({ rate: Number(e.target.value) })}
                disabled={!isAvailable}
                className="px-3 py-2 rounded-md border border-border bg-background disabled:opacity-50"
                aria-label="Speech rate"
              >
                {SPEED_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}x</option>
                ))}
              </select>
            </SettingItem>
          )}

          {isSettingVisible('Auto-advance Chapter', 'Continue to next chapter after TTS finishes', 'Audio / TTS') && (
            <SettingItem
              label="Auto-advance Chapter"
              description={(preferences.tts?.autoAdvance ?? true) ? 'Automatically go to next chapter when done' : 'Stop at end of chapter'}
            >
              <input
                type="checkbox"
                checked={preferences.tts?.autoAdvance ?? true}
                onChange={(e) => updateTtsDefaults({ autoAdvance: e.target.checked })}
                disabled={!isAvailable}
                className="w-5 h-5 disabled:opacity-50"
                aria-label="Auto-advance chapter"
              />
            </SettingItem>
          )}

          {isSettingVisible('Highlight Color', 'TTS highlight color', 'Audio / TTS') && (
            <SettingItem label="Highlight Color" description="Color used to highlight the spoken sentence">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={(preferences.tts?.highlightColor ?? '#f3a6a6').slice(0, 7)}
                  onChange={(e) => updateTtsDefaults({ highlightColor: e.target.value + '8c' })}
                  disabled={!isAvailable}
                  className="w-8 h-8 rounded cursor-pointer border border-border disabled:opacity-50"
                  aria-label="TTS highlight color"
                />
                <span className="text-xs text-muted-foreground font-mono">{preferences.tts?.highlightColor ?? '#f3a6a68c'}</span>
              </div>
            </SettingItem>
          )}
        </SettingSection>
      )}
    </div>
  )
}

const MangaReadingSettings = ({
  preferences,
  updateMangaDefaults,
  updateGeneralSettings,
  isSettingVisible,
  isSectionVisible,
}: {
  preferences: UserPreferences | null
  updateMangaDefaults: (updates: Partial<MangaPreferences>) => Promise<void>
  updateGeneralSettings: (updates: Partial<UserPreferences>) => Promise<void>
  isSettingVisible: (label: string, description?: string, section?: string) => boolean
  isSectionVisible: (section: string, settings: string[]) => boolean
}) => {
  if (!preferences) return null

  const mangaModes: { value: MangaPreferences['mode']; label: string; icon: React.ReactNode }[] = [
    {
      value: 'single',
      label: 'Single Page',
      icon: (
        <div className="w-10 h-14 border-2 border-current rounded-sm mx-auto" />
      ),
    },
    {
      value: 'double',
      label: 'Double Page',
      icon: (
        <div className="flex gap-0.5 mx-auto w-fit">
          <div className="w-7 h-14 border-2 border-current rounded-sm" />
          <div className="w-7 h-14 border-2 border-current rounded-sm" />
        </div>
      ),
    },
    {
      value: 'long-strip',
      label: 'Long Strip',
      icon: (
        <div className="w-8 h-14 border-2 border-current rounded-sm mx-auto flex flex-col gap-0.5 p-0.5">
          <div className="flex-1 bg-current/20 rounded-sm" />
          <div className="flex-1 bg-current/20 rounded-sm" />
          <div className="flex-1 bg-current/20 rounded-sm" />
        </div>
      ),
    },
    {
      value: 'manhwa',
      label: 'Manhwa',
      icon: (
        <div className="w-8 h-14 border-2 border-current rounded-sm mx-auto flex flex-col gap-0.5 p-0.5">
          <div className="flex-1 bg-current/30 rounded-sm" />
          <div className="flex-[2] bg-current/20 rounded-sm" />
        </div>
      ),
    },
    {
      value: 'comic',
      label: 'Comic',
      icon: (
        <div className="flex gap-0.5 mx-auto w-fit">
          <div className="w-7 h-14 border-2 border-current rounded-sm flex flex-col gap-0.5 p-0.5">
            <div className="flex-1 bg-current/20 rounded-sm" />
          </div>
          <div className="w-7 h-14 border-2 border-current rounded-sm" />
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-8">
      <SettingSection
        title="Library Organization"
        description="Manage how manga volumes are organized"
      >
        <SettingItem
          label="Auto-Group Manga Volumes"
          description={preferences.autoGroupManga ? 'Enabled - Automatically groups volumes by series' : 'Disabled - Manual organization'}
        >
          <input
            type="checkbox"
            checked={preferences.autoGroupManga}
            onChange={(e) => updateGeneralSettings({ autoGroupManga: e.target.checked })}
            className="w-5 h-5"
            aria-label="Auto-group manga volumes"
          />
        </SettingItem>
      </SettingSection>

      {isSectionVisible('Reading Mode', ['Reading Mode']) && (
        <SettingSection
          title="Reading Mode"
          description="Default manga reading layout"
          onReset={() => {
            updateMangaDefaults({
              mode: DEFAULT_MANGA_PREFERENCES.mode,
              direction: DEFAULT_MANGA_PREFERENCES.direction,
            })
          }}
        >
          <div className="grid grid-cols-5 gap-3">
            {mangaModes.map((mode) => (
              <button
                key={mode.value}
                onClick={() => updateMangaDefaults({ mode: mode.value })}
                className={cn(
                  'p-3 rounded-lg border-2 transition-all flex flex-col items-center gap-2',
                  preferences.manga.mode === mode.value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                )}
                aria-label={`${mode.label} reading mode`}
              >
                {mode.icon}
                <span className="text-xs font-medium">{mode.label}</span>
              </button>
            ))}
          </div>
        </SettingSection>
      )}

      {isSectionVisible('Reading Direction', ['Reading Direction']) && (
        <SettingSection title="Reading Direction">
          <div className="grid grid-cols-2 gap-3">
            {([
              { value: 'ltr' as const, label: 'Left to Right' },
              { value: 'rtl' as const, label: 'Right to Left' },
            ]).map((option) => (
              <button
                key={option.value}
                onClick={() => updateMangaDefaults({ direction: option.value })}
                className={cn(
                  'p-3 rounded-lg border-2 transition-all',
                  preferences.manga.direction === option.value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                )}
                aria-label={`${option.label} direction`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </SettingSection>
      )}

      {isSectionVisible('Display Options', ['Fit to Width', 'Image Smoothing', 'GPU Acceleration', 'Background Color', 'Progress Bar']) && (
        <SettingSection
          title="Display Options"
          onReset={() => {
            updateMangaDefaults({
              fitWidth: DEFAULT_MANGA_PREFERENCES.fitWidth,
              imageSmoothing: DEFAULT_MANGA_PREFERENCES.imageSmoothing,
              gpuAcceleration: DEFAULT_MANGA_PREFERENCES.gpuAcceleration,
              backgroundColor: DEFAULT_MANGA_PREFERENCES.backgroundColor,
              progressBar: DEFAULT_MANGA_PREFERENCES.progressBar,
            })
          }}
        >
          {isSettingVisible('Fit to Width', 'Scale images to fit width', 'Display Options') && (
            <SettingItem
              label="Fit to Width"
              description={preferences.manga.fitWidth ? 'Enabled' : 'Disabled'}
            >
              <input
                type="checkbox"
                checked={preferences.manga.fitWidth}
                onChange={(e) => updateMangaDefaults({ fitWidth: e.target.checked })}
                className="w-5 h-5"
                aria-label="Fit to width"
              />
            </SettingItem>
          )}

          {isSettingVisible('Image Smoothing', 'Anti-aliasing for images', 'Display Options') && (
            <SettingItem
              label="Image Smoothing"
              description={preferences.manga.imageSmoothing ? 'Enabled' : 'Disabled'}
            >
              <input
                type="checkbox"
                checked={preferences.manga.imageSmoothing}
                onChange={(e) => updateMangaDefaults({ imageSmoothing: e.target.checked })}
                className="w-5 h-5"
                aria-label="Image smoothing"
              />
            </SettingItem>
          )}

          {isSettingVisible('GPU Acceleration', 'Hardware accelerated rendering', 'Display Options') && (
            <SettingItem
              label="GPU Acceleration"
              description={preferences.manga.gpuAcceleration ? 'Enabled' : 'Disabled'}
            >
              <input
                type="checkbox"
                checked={preferences.manga.gpuAcceleration}
                onChange={(e) => updateMangaDefaults({ gpuAcceleration: e.target.checked })}
                className="w-5 h-5"
                aria-label="GPU acceleration"
              />
            </SettingItem>
          )}

          {isSettingVisible('Background Color', 'Reader background color', 'Display Options') && (
            <SettingItem label="Background Color" description="Reader background color">
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={preferences.manga.backgroundColor || '#000000'}
                  onChange={(e) => updateMangaDefaults({ backgroundColor: e.target.value })}
                  className="w-10 h-10 rounded cursor-pointer border border-border"
                  aria-label="Manga background color"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => updateMangaDefaults({ backgroundColor: '#000000' })}
                >
                  Reset
                </Button>
              </div>
            </SettingItem>
          )}

          {isSettingVisible('Progress Bar', 'Progress bar position', 'Display Options') && (
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
                aria-label="Progress bar position"
              >
                <option value="hidden">Hidden</option>
                <option value="top">Top</option>
                <option value="bottom">Bottom</option>
              </select>
            </SettingItem>
          )}
        </SettingSection>
      )}

      {isSectionVisible('Performance', ['Preload Pages', 'Margin Size']) && (
        <SettingSection title="Performance">
          {isSettingVisible('Preload Pages', 'Number of pages to preload', 'Performance') && (
            <SettingItem label="Preload Pages" description={`${preferences.manga.preloadCount} pages`}>
              <input
                type="range"
                min="0"
                max="10"
                value={preferences.manga.preloadCount}
                onChange={(e) => updateMangaDefaults({ preloadCount: Number(e.target.value) })}
                className="w-48"
                aria-label="Preload pages"
              />
            </SettingItem>
          )}

          {isSettingVisible('Margin Size', 'Page margin in pixels', 'Performance') && (
            <SettingItem label="Margin Size" description={`${preferences.manga.marginSize}px`}>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={preferences.manga.marginSize}
                onChange={(e) => updateMangaDefaults({ marginSize: Number(e.target.value) })}
                className="w-48"
                aria-label="Manga margin size"
              />
            </SettingItem>
          )}
        </SettingSection>
      )}
    </div>
  )
}

const AdvancedSettings = ({
  preferences,
  updateGeneralSettings,
  loadPreferences,
  isSettingVisible,
  isSectionVisible,
}: {
  preferences: UserPreferences | null
  updateGeneralSettings: (updates: Partial<UserPreferences>) => Promise<void>
  loadPreferences: () => Promise<void>
  isSettingVisible: (label: string, description?: string, section?: string) => boolean
  isSectionVisible: (section: string, settings: string[]) => boolean
}) => {
  const [isExporting, setIsExporting] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [isBackingUp, setIsBackingUp] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)
  const [includeBooks, setIncludeBooks] = useState(false)
  const [backupResult, setBackupResult] = useState<BackupInfo | null>(null)
  const [restoreSuccess, setRestoreSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null)
  const toast = useToast()

  useEffect(() => {
    const loadCacheStats = async () => {
      try {
        const stats = await api.getRendererCacheStats()
        setCacheStats(stats)
      } catch (err) {
        logger.debug('Failed to load cache stats:', err)
      }
    }
    loadCacheStats()
  }, [])

  if (!preferences) return null

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

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
      logger.error('Failed to restore frontend settings')
    }
  }

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
          file_path: savePath,
        })
        toast.success('Database exported successfully')
      }
    } catch (err) {
      logger.error('Export failed:', err)
      toast.error('Failed to export database')
    } finally {
      setIsExporting(false)
    }
  }

  const handleReset = async () => {
    if (confirm('Are you sure you want to reset the database? This will delete all your books and settings. This cannot be undone.')) {
      try {
        setIsResetting(true)
        await api.resetDatabase()
        toast.info('Database has been reset. The application will now reload.')
        setTimeout(() => window.location.reload(), 1000)
      } catch (err) {
        logger.error('Reset failed:', err)
        toast.error('Failed to reset database')
      } finally {
        setIsResetting(false)
      }
    }
  }

  const handleResetOnboarding = async () => {
    if (confirm('Recheck the onboarding experience? This will take you back to the welcome screens. Your library data will NOT be deleted.')) {
      try {
        await api.resetOnboarding()
        toast.info('Onboarding state reset. The application will now reload.')
        setTimeout(() => window.location.reload(), 1000)
      } catch (err) {
        logger.error('Onboarding reset failed:', err)
        toast.error('Failed to reset onboarding state')
      }
    }
  }

  const handleImport = () => {
    toast.warning('Import feature from an exported dataset is not fully supported yet. Coming soon in future versions.')
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
      toast.success('Backup created successfully')
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
      toast.success(
        'Restore completed',
        `Restored ${result.books_restored} books, ${result.annotations_restored} annotations, ${result.collections_restored} collections, ${result.covers_restored} covers.`
      )
      setTimeout(() => window.location.reload(), 2000)
    } catch (err) {
      setError(`Restore failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsRestoring(false)
    }
  }

  const handleClearCache = async () => {
    try {
      await api.clearRendererCache()
      setCacheStats(null)
      toast.success('Cache cleared')
    } catch (err) {
      logger.error('Failed to clear cache:', err)
      toast.error('Failed to clear cache')
    }
  }

  const handleResetAllSettings = async () => {
    if (confirm('This will reset ALL settings to their default values. This action cannot be undone. Continue?')) {
      try {
        await api.updateUserPreferences(DEFAULT_USER_PREFERENCES)
        await loadPreferences()
        toast.success('All settings reset to defaults')
      } catch {
        toast.error('Failed to reset settings')
      }
    }
  }

  return (
    <div className="space-y-8">
      {isSectionVisible('Database', ['Export Database', 'Import Database', 'Reset Database', 'Reset Onboarding']) && (
        <SettingSection title="Database" description="Manage your library database">
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
      )}

      {isSectionVisible('Debug', ['Enable Logging']) && (
        <SettingSection title="Debug">
          {isSettingVisible('Enable Logging', 'Save debug logs', 'Debug') && (
            <SettingItem
              label="Enable Logging"
              description="Save debug logs for troubleshooting"
            >
              <input
                type="checkbox"
                checked={preferences.debugLogging ?? false}
                onChange={(e) => updateGeneralSettings({ debugLogging: e.target.checked })}
                className="w-5 h-5"
                aria-label="Enable debug logging"
              />
            </SettingItem>
          )}
        </SettingSection>
      )}

      {isSectionVisible('Cache', ['Renderer Cache', 'Max Cache Size', 'Cache Clear Policy']) && (
        <SettingSection title="Cache" description="Manage cached data">
          {isSettingVisible('Renderer Cache', 'Temporary reading resources', 'Cache') && (
            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Renderer Cache</span>
                <Button variant="outline" size="sm" onClick={handleClearCache} className="gap-1.5">
                  <Trash2 size={14} />
                  Clear Cache
                </Button>
              </div>
              {cacheStats && (
                <div className="text-sm text-muted-foreground">
                  <div>Items: {cacheStats.item_count}</div>
                  <div>Size: {formatBytes(cacheStats.total_size_bytes)}</div>
                  <div>Hit rate: {(cacheStats.hit_rate * 100).toFixed(1)}%</div>
                </div>
              )}
            </div>
          )}

          {isSettingVisible('Max Cache Size', 'Maximum cache storage limit', 'Cache') && (
            <SettingItem label="Max Cache Size" description="Maximum storage for cached data">
              <select
                value={String(preferences.cacheSizeLimitMB || 500)}
                onChange={(e) => updateGeneralSettings({ cacheSizeLimitMB: Number(e.target.value) })}
                className="px-3 py-2 rounded-md border border-border bg-background"
                aria-label="Max cache size"
              >
                <option value="100">100 MB</option>
                <option value="250">250 MB</option>
                <option value="500">500 MB (Default)</option>
                <option value="1000">1 GB</option>
                <option value="2000">2 GB</option>
                <option value="-1">Unlimited</option>
              </select>
            </SettingItem>
          )}

          {isSettingVisible('Cache Clear Policy', 'When to auto-clear cache', 'Cache') && (
            <SettingItem label="Cache Clear Policy" description="When to automatically clear cached data">
              <select
                value={preferences.cacheClearPolicy || 'manual'}
                onChange={(e) => updateGeneralSettings({ cacheClearPolicy: e.target.value as UserPreferences['cacheClearPolicy'] })}
                className="px-3 py-2 rounded-md border border-border bg-background"
                aria-label="Cache clear policy"
              >
                <option value="manual">Manual Only</option>
                <option value="on-startup">On Startup</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </SettingItem>
          )}
        </SettingSection>
      )}

      {isSectionVisible('Backup & Restore', ['Backup', 'Restore']) && (
        <SettingSection
          title="Backup & Restore"
          description="Create or restore library backups"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg bg-muted border border-border">
              <div className="space-y-0.5">
                <label className="text-sm font-medium">Include book files</label>
                <p className="text-xs text-muted-foreground">
                  Include all imported book files in the backup (increases size)
                </p>
              </div>
              <input
                type="checkbox"
                checked={includeBooks}
                onChange={(e) => setIncludeBooks(e.target.checked)}
                className="w-5 h-5"
                aria-label="Include book files in backup"
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
                  {backupResult.book_count} books, {backupResult.annotation_count} annotations, {backupResult.collection_count} collections &mdash; {formatBytes(backupResult.total_size_bytes)}
                </p>
              </div>
            )}

            <div className="border-t border-border pt-4">
              <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 mb-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-yellow-700 dark:text-yellow-300">
                    Restoring a backup will replace ALL current data including books, annotations, collections, and settings.
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
                <div className="mt-4 p-4 rounded-lg bg-green-500/10 border border-green-500/30">
                  <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="text-sm font-medium">Restore completed successfully</span>
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}
          </div>
        </SettingSection>
      )}

      {isSectionVisible('Privacy', ['Send Analytics', 'Send Crash Reports', 'Reading History Retention', 'Clear Reading History', 'Reset All Settings']) && (
        <SettingSection title="Privacy & Data" description="Control your data and privacy">
          {isSettingVisible('Send Analytics', 'Anonymous usage statistics', 'Privacy') && (
            <SettingItem label="Send Anonymous Usage Statistics" description="Help improve Shiori by sending anonymous usage data">
              <input
                type="checkbox"
                checked={preferences.sendAnalytics ?? false}
                onChange={(e) => updateGeneralSettings({ sendAnalytics: e.target.checked })}
                className="w-5 h-5"
                aria-label="Send anonymous usage statistics"
              />
            </SettingItem>
          )}

          {isSettingVisible('Send Crash Reports', 'Automatic crash reporting', 'Privacy') && (
            <SettingItem label="Send Crash Reports" description="Automatically report crashes to help fix bugs">
              <input
                type="checkbox"
                checked={preferences.sendCrashReports ?? false}
                onChange={(e) => updateGeneralSettings({ sendCrashReports: e.target.checked })}
                className="w-5 h-5"
                aria-label="Send crash reports"
              />
            </SettingItem>
          )}

          {isSettingVisible('Reading History Retention', 'How long to keep reading history', 'Privacy') && (
            <SettingItem label="Reading History Retention" description="How long to keep reading history">
              <select
                value={String(preferences.historyRetentionDays ?? -1)}
                onChange={(e) => updateGeneralSettings({ historyRetentionDays: Number(e.target.value) })}
                className="px-3 py-2 rounded-md border border-border bg-background"
                aria-label="Reading history retention"
              >
                <option value="-1">Keep Forever</option>
                <option value="30">30 Days</option>
                <option value="90">90 Days</option>
                <option value="180">6 Months</option>
                <option value="365">1 Year</option>
              </select>
            </SettingItem>
          )}

          {(isSettingVisible('Clear Reading History', 'Delete all reading history', 'Privacy') ||
            isSettingVisible('Reset All Settings', 'Restore factory defaults', 'Privacy')) && (
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => toast.info('Reading history clearing is not yet implemented')}
              >
                Clear Reading History
              </Button>
              <Button
                variant="outline"
                onClick={handleResetAllSettings}
              >
                Reset All Settings
              </Button>
            </div>
          )}
        </SettingSection>
      )}
    </div>
  )
}

const WatchFoldersSettings = ({
  preferences,
  isSectionVisible,
}: {
  preferences: UserPreferences | null
  isSectionVisible: (section: string, settings: string[]) => boolean
}) => {
  const [watchFolders, setWatchFolders] = useState<WatchFolder[]>([])
  const [watchStatus, setWatchStatus] = useState<{ is_running: boolean; watched_folders_count: number; enabled_folders_count: number } | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const toast = useToast()

  useEffect(() => {
    loadWatchFolders()
    loadWatchStatus()
  }, [])

  const loadWatchFolders = async () => {
    try {
      const folders = await api.getWatchFolders()
      setWatchFolders(folders)
    } catch (err) {
      logger.error('Failed to load watch folders:', err)
    }
  }

  const loadWatchStatus = async () => {
    try {
      const status = await api.getWatchStatus()
      setWatchStatus(status)
    } catch (err) {
      logger.error('Failed to load watch status:', err)
    }
  }

  const handleAddFolder = async () => {
    try {
      const path = await api.openFolderDialog()
      if (!path) return

      await api.addWatchFolder(path, true)
      await loadWatchFolders()
      toast.success('Folder added', `Now watching ${path}`)
    } catch (err) {
      logger.error('Failed to add watch folder:', err)
      toast.error('Failed to add watch folder')
    }
  }

  const handleRemoveFolder = async (path: string) => {
    try {
      await api.removeWatchFolder(path)
      await loadWatchFolders()
      toast.success('Folder removed', `Stopped watching ${path}`)
    } catch (err) {
      logger.error('Failed to remove watch folder:', err)
      toast.error('Failed to remove watch folder')
    }
  }

  const handleToggleWatcher = async () => {
    try {
      setIsLoading(true)
      if (watchStatus?.is_running) {
        await api.stopFolderWatch()
        toast.info('Folder watching stopped')
      } else {
        await api.startFolderWatch()
        toast.success('Folder watching started')
      }
      await loadWatchStatus()
    } catch (err) {
      logger.error('Failed to toggle folder watcher:', err)
      toast.error('Failed to toggle folder watcher')
    } finally {
      setIsLoading(false)
    }
  }

  if (!preferences) return null

  return (
    <div className="space-y-8">
      {isSectionVisible('Watch Folders', ['Enable/Disable', 'Status', 'Folders']) && (
        <SettingSection
          title="Watch Folders"
          description="Automatically import new eBooks from monitored directories"
        >
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-muted border border-border space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Folder Watcher</p>
                  <p className="text-xs text-muted-foreground">
                    {watchStatus?.is_running ? 'Active' : 'Inactive'} • {watchStatus?.enabled_folders_count || 0} of {watchStatus?.watched_folders_count || 0} folders enabled
                  </p>
                </div>
                <Button
                  variant={watchStatus?.is_running ? 'destructive' : 'default'}
                  size="sm"
                  onClick={handleToggleWatcher}
                  disabled={isLoading || watchFolders.length === 0}
                  className="gap-1.5"
                >
                  {watchStatus?.is_running ? (
                    <>
                      <Square size={14} />
                      Stop
                    </>
                  ) : (
                    <>
                      <Play size={14} />
                      Start
                    </>
                  )}
                </Button>
              </div>

              {watchStatus?.is_running && (
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400 text-xs">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span>Monitoring for new files (3s debounce)</span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Watched Folders</label>
                <Button variant="outline" size="sm" onClick={handleAddFolder} className="gap-1.5">
                  <Plus size={14} />
                  Add Folder
                </Button>
              </div>

              {watchFolders.length === 0 ? (
                <div className="p-8 rounded-lg border border-dashed text-center text-muted-foreground">
                  <Folder className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No folders being watched</p>
                  <p className="text-xs mt-1">Click &quot;Add Folder&quot; to start monitoring a directory</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {watchFolders.map((folder) => (
                    <div
                      key={folder.path}
                      className="flex items-center justify-between p-3 rounded-lg border bg-background"
                    >
                      <div className="flex-1 min-w-0 mr-3">
                        <p className="text-sm font-mono truncate">{folder.path}</p>
                        <p className="text-xs text-muted-foreground">
                          {folder.enabled ? 'Enabled' : 'Disabled'}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveFolder(folder.path)}
                        className="shrink-0"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
              <p className="text-xs text-blue-700 dark:text-blue-300">
                <strong>Note:</strong> New files are imported automatically after a 3-second delay. Supported formats: EPUB, PDF, MOBI, AZW3, DOCX, FB2, CBZ, CBR.
              </p>
            </div>
          </div>
        </SettingSection>
      )}
    </div>
  )
}

const AboutSettings = () => {
  const appVersion = '0.1.0'

  return (
    <div className="space-y-8">
      <SettingSection title="Shiori eBook Manager">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center">
            <BookMarked className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h3 className="text-xl font-semibold">Shiori</h3>
            <p className="text-sm text-muted-foreground">Version {appVersion}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Organize, read, and manage your eBook collection
            </p>
          </div>
        </div>
      </SettingSection>

      <SettingSection title="Updates">
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <div className="font-medium text-sm">Check for Updates</div>
            <div className="text-xs text-muted-foreground">
              You&apos;re running version {appVersion}
            </div>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5">
            <RefreshCw size={14} />
            Check Now
          </Button>
        </div>
      </SettingSection>

      <SettingSection title="Links">
        <div className="space-y-2">
          {([
            { label: 'GitHub Repository', url: 'https://github.com/vinayydv3695/Shiori' },
            { label: 'Changelog', url: 'https://github.com/vinayydv3695/Shiori/releases' },
            { label: 'License', url: 'https://github.com/vinayydv3695/Shiori/blob/main/LICENSE' },
            { label: 'Report an Issue', url: 'https://github.com/vinayydv3695/Shiori/issues' },
          ]).map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent transition-colors"
            >
              <span className="text-sm font-medium">{link.label}</span>
              <ExternalLink size={16} className="text-muted-foreground" />
            </a>
          ))}
        </div>
      </SettingSection>

      <SettingSection title="Credits">
        <div className="text-sm text-muted-foreground space-y-1">
          <p>Built with Tauri, React, TypeScript</p>
          <p>Icons by Lucide</p>
          <p>UI Components by Radix UI</p>
          <p>Styling with Tailwind CSS</p>
        </div>
      </SettingSection>
    </div>
  )
}
