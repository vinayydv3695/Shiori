import { Switch } from '@/components/ui/switch'
import { useState, useEffect, useMemo } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import * as Tabs from '@radix-ui/react-tabs'
import { motion, AnimatePresence } from 'framer-motion'
import { open } from '@tauri-apps/plugin-shell'
import {
  X, Moon, Sun, Palette, Shield, BookOpen, FileText,
  Download, Upload, HardDrive, Archive, CheckCircle2, AlertTriangle,
  Search, FolderOpen, ExternalLink, RefreshCw, Trash2, Info,
  RotateCcw, Play, Square, Folder, Plus, Blocks, Puzzle, MonitorSmartphone
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
import { useLibraryStore } from '@/store/libraryStore';
import { useSourceStore } from '../../store/sourceStore'
import { SourceManager } from './SourceManager'
import { TorboxSettings } from './TorboxSettings'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { getVersion } from '@tauri-apps/api/app'
import { DesktopCompanionSettings } from './DesktopCompanionSettings'
import { CompanionDiscovery } from '../companion/CompanionDiscovery'
import { useIsMobile } from '@/hooks/useIsMobile'



import { READING_FONTS, normalizeLegacyFontPreference, resolveReadingFontCss } from '@/lib/readingFonts'

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type SettingsTab = 'general' | 'book-reading' | 'manga-reading' | 'companion' | 'advanced' | 'community-plugins' | 'about'

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
  { label: 'Enable Window Transparency', description: 'Toggle transparent window background (Requires restart)', tab: 'general', section: 'Appearance' },
  { label: 'Settings Transparency', description: 'Toggle transparent background for the settings dialog', tab: 'general', section: 'Appearance' },
  { label: 'Auto-start Application', description: 'Start Shiori when system boots', tab: 'general', section: 'General' },
  { label: 'Discord Rich Presence', description: 'Show your reading activity on Discord', tab: 'general', section: 'General' },
  { label: 'Primary Content Type', description: 'What type of content you prefer to read', tab: 'general', section: 'General' },
  { label: 'Import Path', description: 'Default import location', tab: 'general', section: 'Import' },
  { label: 'Default Sort Order', description: 'How books are sorted', tab: 'general', section: 'Library' },
  { label: 'Default View Mode', description: 'Grid list or table view', tab: 'general', section: 'Library' },
  { label: 'Library Display Density', description: 'Compact comfortable or spacious', tab: 'general', section: 'Library' },
  { label: 'Auto-Scan Library Folders', description: 'Automatically import new books', tab: 'general', section: 'Library' },
  { label: 'Auto-Scan Interval', description: 'How often to check for new books', tab: 'general', section: 'Library' },
  { label: 'Duplicate Handling', description: 'What to do with duplicate imports', tab: 'general', section: 'Library' },
  { label: 'Metadata Fetch Policy', description: 'How to fetch book metadata', tab: 'general', section: 'Library' },
  { label: 'Auto-fetch Cover Images', description: 'Download covers when missing', tab: 'general', section: 'Library' },
  { label: 'Enable Recycle Bin', description: 'Move deleted items to trash (kept for 7 days)', tab: 'general', section: 'Library' },
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
  { label: 'Clean Up Database', description: 'Remove orphaned records and unused covers', tab: 'advanced', section: 'Database' },
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
]

const EPUB_RESUME_CHOICE_STORAGE_KEY = 'shiori-epub-resume-choice:v1'

export const SettingsDialog = ({ open, onOpenChange }: SettingsDialogProps) => {
  const isMobile = useIsMobile()
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
    { id: 'companion' as const, name: 'Companion App', icon: MonitorSmartphone },
    { id: 'community-plugins' as const, name: 'Community Plugins', icon: Puzzle },
    { id: 'about' as const, name: 'About', icon: Info },
  ]

  const filteredTabs = matchingTabs
    ? tabs.filter(tab => matchingTabs.has(tab.id) || tab.id === 'about')
    : tabs

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 bg-background/40 backdrop-blur-md z-50 transition-all duration-300" />
        <Dialog.Content aria-describedby={undefined} className={cn(
          "dialog-content settings-dialog fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 border border-white/10 rounded-2xl shadow-[0_0_40px_rgba(0,0,0,0.2)] w-[95vw] max-w-5xl h-[90vh] max-md:h-[95vh] max-md:rounded-xl z-50 flex flex-col overflow-hidden",
          preferences?.transparentSettings ?? false ? "bg-background/80 backdrop-blur-2xl" : "bg-background"
        )}>
          <div className="flex items-center justify-between p-4 md:p-6 border-b border-border gap-3">
            <Dialog.Title className="text-xl md:text-2xl font-semibold">Settings</Dialog.Title>
            <div className="flex items-center gap-2">
              <div className="relative hidden sm:block">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                <Input
                  type="search"
                  placeholder="Search settings..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 w-48 md:w-64"
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
            className="flex flex-1 overflow-hidden max-md:flex-col"
            orientation="vertical"
          >
            <Tabs.List
              className="w-64 max-md:w-full max-md:flex max-md:flex-row max-md:flex-nowrap max-md:overflow-x-auto max-md:scrollbar-none max-md:border-b max-md:border-r-0 max-md:p-2 max-md:gap-1 border-r border-white/5 bg-muted/10 p-5 space-y-1.5 flex-shrink-0 overflow-y-auto scrollbar-none"
              aria-label="Settings categories"
            >
              {filteredTabs.map((tab) => (
                <Tabs.Trigger
                  key={tab.id}
                  value={tab.id}
                  className={cn(
                    'w-full max-md:w-auto max-md:flex-shrink-0 max-md:justify-center flex items-center gap-2 px-4 py-3 max-md:px-3 max-md:py-2 rounded-xl transition-all duration-200 text-left font-medium text-sm',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                    'data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-sm',
                    'data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:bg-muted/50 data-[state=inactive]:hover:text-foreground'
                  )}
                >
                  <tab.icon className="w-5 h-5 flex-shrink-0" />
                  <span className="font-sans font-semibold tracking-wide max-md:hidden sm:max-md:inline">{tab.name}</span>
                </Tabs.Trigger>
              ))}
            </Tabs.List>

            <div className="flex-1 relative bg-background/50">
              <AnimatePresence mode="wait">
                <motion.div
                  key={selectedTab}
                  initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }}
                  transition={{ duration: 0.2 }}
                  className="absolute inset-0 p-8 overflow-y-auto"
                >
                  {selectedTab === 'general' && (
                    <GeneralSettings
                      preferences={preferences}
                      updateTheme={updateTheme}
                      updateGeneralSettings={updateGeneralSettings}
                      isSettingVisible={isSettingVisible}
                      isSectionVisible={isSectionVisible}
                    />
                  )}

                  {selectedTab === 'book-reading' && (
                    <BookReadingSettings
                      preferences={preferences}
                      updateBookDefaults={updateBookDefaults}
                      updateTtsDefaults={updateTtsDefaults}
                      isSettingVisible={isSettingVisible}
                      isSectionVisible={isSectionVisible}
                    />
                  )}

                  {selectedTab === 'manga-reading' && (
                    <MangaReadingSettings
                      preferences={preferences}
                      updateMangaDefaults={updateMangaDefaults}
                      updateGeneralSettings={updateGeneralSettings}
                      isSettingVisible={isSettingVisible}
                      isSectionVisible={isSectionVisible}
                    />
                  )}

                  {selectedTab === 'companion' && (
                    isMobile ? <CompanionDiscovery /> : <DesktopCompanionSettings />
                  )}

                  {selectedTab === 'advanced' && (
                    <AdvancedSettings
                      preferences={preferences}
                      updateGeneralSettings={updateGeneralSettings}
                      loadPreferences={loadPreferences}
                      isSettingVisible={isSettingVisible}
                      isSectionVisible={isSectionVisible}
                    />
                  )}

                  {selectedTab === 'community-plugins' && (
                    <CommunityPluginsSettings
                      isSectionVisible={isSectionVisible}
                    />
                  )}

                  {selectedTab === 'about' && (
                    <AboutSettings />
                  )}
                </motion.div>
              </AnimatePresence>
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
  <section className="space-y-4 pb-6">
    <div className="flex items-center justify-between px-1">
      <div>
        <h3 className="text-xl font-semibold tracking-tight">{title}</h3>
        {description && <p className="text-sm text-muted-foreground mt-1.5">{description}</p>}
      </div>
      {onReset && (
        <Button variant="ghost" size="sm" onClick={onReset} className="gap-1.5 text-muted-foreground hover:text-foreground">
          <RotateCcw size={14} />
          Reset
        </Button>
      )}
    </div>
    <div className="bg-transparent space-y-3">
      {children}
    </div>
  </section>
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
  <div className="group flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-6 p-4 rounded-2xl border border-border/50 bg-card/30 hover:bg-card/50 transition-all duration-300 shadow-sm hover:shadow-md">
    <div className="space-y-1.5 flex-1 md:pr-4">
      <label className="text-[15px] font-semibold tracking-tight leading-none text-foreground">{label}</label>
      {description && <p className="text-[13px] text-muted-foreground leading-relaxed">{description}</p>}
    </div>
    <div className="flex-shrink-0 flex items-center justify-start md:justify-end w-full md:w-auto md:min-w-[200px]">
      {children}
    </div>
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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {themeOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => updateTheme(option.value)}
                className={cn(
                  'relative overflow-hidden p-4 rounded-xl border-2 transition-all duration-300 flex flex-col items-center gap-3',
                  preferences.theme === option.value
                    ? 'border-primary bg-primary/10 shadow-[0_0_15px_rgba(var(--primary),0.2)] scale-[1.02]'
                    : 'border-border/50 bg-background/30 hover:border-primary/50 hover:bg-background/80 hover:-translate-y-1'
                )}
                aria-label={`${option.label} theme`}
              >
                <div className={cn(
                  "absolute inset-0 bg-gradient-to-tr from-primary/10 to-transparent opacity-0 transition-opacity duration-300",
                  preferences.theme === option.value && "opacity-100"
                )} />
                <option.icon className={cn(
                  "w-7 h-7 transition-colors duration-300",
                  preferences.theme === option.value ? "text-primary" : "text-muted-foreground"
                )} />
                <span className={cn(
                  "text-sm font-semibold tracking-wide transition-colors duration-300",
                  preferences.theme === option.value ? "text-foreground" : "text-muted-foreground"
                )}>{option.label}</span>
                {preferences.theme === option.value && (
                  <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--primary),1)]" />
                )}
              </button>
            ))}
          </div>

          {isSettingVisible('Theme Preview', 'Preview of current theme colors', 'Theme') && (
            <div className="rounded-xl border border-border/50 bg-background/50 backdrop-blur-md p-5 shadow-inner">
              <p className="text-[13px] font-semibold text-muted-foreground tracking-wider uppercase mb-4">Theme Palette</p>
              <div className="flex gap-3 items-center">
                <div className="w-10 h-10 rounded-full bg-primary shadow-lg ring-2 ring-background transition-transform hover:scale-110 cursor-help" title="Primary" />
                <div className="w-10 h-10 rounded-full bg-secondary shadow-lg ring-2 ring-background transition-transform hover:scale-110 cursor-help" title="Secondary" />
                <div className="w-10 h-10 rounded-full bg-accent shadow-lg ring-2 ring-background transition-transform hover:scale-110 cursor-help" title="Accent" />
                <div className="w-10 h-10 rounded-full bg-muted shadow-lg ring-2 ring-background transition-transform hover:scale-110 cursor-help" title="Muted" />
                <div className="w-10 h-10 rounded-full bg-destructive shadow-lg ring-2 ring-background transition-transform hover:scale-110 cursor-help" title="Destructive" />
                <div className="w-10 h-10 rounded-full border border-border/50 bg-background shadow-lg ring-2 ring-background transition-transform hover:scale-110 cursor-help" title="Background" />
                <div className="w-10 h-10 rounded-full bg-foreground shadow-lg ring-2 ring-background transition-transform hover:scale-110 cursor-help" title="Foreground" />
              </div>
            </div>
          )}
        </SettingSection>
      )}

      {isSectionVisible('Appearance', ['Accent Color', 'UI Font Family', 'UI Density', 'UI Scale', 'Cover Size', 'Enable Window Transparency', 'Settings Transparency']) && (
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
                className="px-3 py-2 rounded-lg border border-border/50 bg-background/50 backdrop-blur-sm hover:border-primary/50 focus:border-primary focus:ring-1 focus:ring-primary transition-all outline-none "
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
              <div className="flex gap-2 w-full md:w-auto">
                {(['compact', 'comfortable'] as const).map((density) => (
                  <button
                    key={density}
                    onClick={() => updateGeneralSettings({ uiDensity: density })}
                    className={cn(
                      'flex-1 md:flex-none px-4 py-2 rounded-md border text-sm transition-all capitalize',
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
              <div className="flex items-center gap-3 w-full md:w-auto">
                <span className="text-xs text-muted-foreground w-8 text-right shrink-0">75%</span>
                <input
                  type="range"
                  min="75"
                  max="150"
                  step="5"
                  value={scalePercent}
                  onChange={(e) => updateGeneralSettings({ uiScale: Number(e.target.value) / 100 })}
                  className="flex-1 md:w-40"
                  aria-label="UI scale"
                />
                <span className="text-xs text-muted-foreground w-10 shrink-0">150%</span>
              </div>
            </SettingItem>
          )}

          {isSettingVisible('Cover Size', 'Book cover display size', 'Appearance') && (
            <SettingItem label="Cover Size" description="Book cover display size in library">
              <div className="flex gap-2 w-full md:w-auto">
                {([
                  { value: 'small' as const, label: 'Small' },
                  { value: 'medium' as const, label: 'Medium' },
                  { value: 'large' as const, label: 'Large' },
                ]).map((size) => (
                  <button
                    key={size.value}
                    onClick={() => updateGeneralSettings({ coverSize: size.value })}
                    className={cn(
                      'flex-1 md:flex-none px-3 py-1.5 rounded-md border text-sm transition-all',
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

          {isSettingVisible('Enable Window Transparency', 'Toggle transparent window background (Requires restart)', 'Appearance') && (
            <SettingItem label="Enable Window Transparency (Requires Restart)" description="Disable this if Shiori runs slowly on Linux. Requires app restart to take effect.">
              <Switch 
                checked={preferences?.linuxTransparentWindow ?? true} 
                onChange={(checked) => {
                  updateGeneralSettings({ linuxTransparentWindow: checked });
                  toast.success('Preference saved. Please restart Shiori for transparency changes to take effect.');
                }} 
              />
            </SettingItem>
          )}

          {isSettingVisible('Settings Transparency', 'Toggle transparent background for the settings dialog', 'Appearance') && (
            <SettingItem label="Settings Transparency" description="Toggle transparent background for the settings dialog">
              <Switch 
                checked={preferences?.transparentSettings ?? false} 
                onChange={(checked) => updateGeneralSettings({ transparentSettings: checked })} 
              />
            </SettingItem>
          )}
        </SettingSection>
      )}

      {isSectionVisible('General', ['Auto-start Application', 'Discord Rich Presence', 'Primary Content Type']) && (
        <SettingSection title="General">
          {isSettingVisible('Auto-start Application', 'Start Shiori when system boots', 'General') && (
            <SettingItem label="Auto-start Application" description="Start Shiori when system boots">
              <Switch checked={preferences.autoStart} onChange={(checked) => updateGeneralSettings({ autoStart: checked })} />
            </SettingItem>
          )}
          {isSettingVisible('Discord Rich Presence', 'Show your reading activity on Discord', 'General') && (
            <SettingItem label="Discord Rich Presence" description="Show your reading activity on Discord">
              <Switch checked={preferences.discordRpcEnabled ?? true} onChange={(checked) => updateGeneralSettings({ discordRpcEnabled: checked })} />
            </SettingItem>
          )}
          {isSettingVisible('Primary Content Type', 'What type of content you prefer to read', 'General') && (
            <SettingItem label="Primary Content Type" description="What type of content you prefer to read">
              <select
                className="flex h-10 w-full md:w-[200px] items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={preferences.preferredContentType ?? 'both'}
                onChange={(e) => updateGeneralSettings({ preferredContentType: e.target.value as any })}
              >
                <option value="both" className="bg-background">Both Books & Manga</option>
                <option value="books" className="bg-background">Only Books</option>
                <option value="manga" className="bg-background">Only Manga & Comics</option>
              </select>
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
                className="px-3 py-2 rounded-lg border border-border/50 bg-background/50 backdrop-blur-sm hover:border-primary/50 focus:border-primary focus:ring-1 focus:ring-primary transition-all outline-none "
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
              <div className="flex gap-2 w-full md:w-auto">
                {(['grid', 'list', 'table'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => updateGeneralSettings({ defaultViewMode: mode })}
                    className={cn(
                      'flex-1 md:flex-none px-3 py-1.5 rounded-md border text-sm transition-all capitalize',
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
              <div className="flex gap-2 w-full md:w-auto">
                {(['compact', 'comfortable', 'spacious'] as const).map((density) => (
                  <button
                    key={density}
                    onClick={() => updateGeneralSettings({ libraryDensity: density })}
                    className={cn(
                      'flex-1 md:flex-none px-3 py-1.5 rounded-md border text-sm transition-all capitalize',
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
              <Switch checked={preferences.autoScanEnabled ?? false} onChange={(checked) => updateGeneralSettings({ autoScanEnabled: checked })} />
            </SettingItem>
          )}

          {preferences.autoScanEnabled && isSettingVisible('Auto-Scan Interval', 'How often to check for new books', 'Library') && (
            <SettingItem label="Auto-Scan Interval" description="How often to check for new books">
              <select
                value={String(preferences.autoScanIntervalMinutes || 60)}
                onChange={(e) => updateGeneralSettings({ autoScanIntervalMinutes: Number(e.target.value) })}
                className="px-3 py-2 rounded-lg border border-border/50 bg-background/50 backdrop-blur-sm hover:border-primary/50 focus:border-primary focus:ring-1 focus:ring-primary transition-all outline-none "
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
                className="px-3 py-2 rounded-lg border border-border/50 bg-background/50 backdrop-blur-sm hover:border-primary/50 focus:border-primary focus:ring-1 focus:ring-primary transition-all outline-none "
                aria-label="Duplicate handling"
              >
                <option value="skip">Skip Duplicates</option>
                <option value="overwrite">Overwrite Existing</option>
                <option value="keep-both">Keep Both</option>
                <option value="ask">Ask Each Time</option>
              </select>
            </SettingItem>
          )}

          {isSettingVisible('Enable Recycle Bin', 'Move deleted items to trash (kept for 7 days)', 'Library') && (
            <SettingItem label="Enable Recycle Bin" description="Move deleted items to trash (kept for 7 days)">
              <Switch 
                checked={preferences?.enableRecycleBin ?? false} 
                onChange={(checked) => updateGeneralSettings({ enableRecycleBin: checked })} 
              />
            </SettingItem>
          )}

          {isSettingVisible('Metadata Fetch Policy', 'How to fetch book metadata', 'Library') && (
            <SettingItem label="Metadata Fetch Policy" description="How to fetch book metadata">
              <select
                value={preferences.metadataMode || 'auto'}
                onChange={(e) => updateGeneralSettings({ metadataMode: e.target.value })}
                className="px-3 py-2 rounded-lg border border-border/50 bg-background/50 backdrop-blur-sm hover:border-primary/50 focus:border-primary focus:ring-1 focus:ring-primary transition-all outline-none "
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
              <Switch checked={preferences.autoFetchCovers ?? true} onChange={(checked) => updateGeneralSettings({ autoFetchCovers: checked })} />
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
                className="w-full md:w-48"
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
              className="px-3 py-2 rounded-lg border border-border/50 bg-background/50 backdrop-blur-sm hover:border-primary/50 focus:border-primary focus:ring-1 focus:ring-primary transition-all outline-none "
              aria-label="Preferred debrid provider"
              disabled
            >
              <option value="auto">Auto (Torbox)</option>
              <option value="torbox">Torbox</option>
            </select>
          </SettingItem>



          <div>
            <h4 className="text-sm font-semibold mb-2">Torbox</h4>
            <TorboxSettings />
          </div>

        </div>
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
                className="px-3 py-2 rounded-lg border border-border/50 bg-background/50 backdrop-blur-sm hover:border-primary/50 focus:border-primary focus:ring-1 focus:ring-primary transition-all outline-none "
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
                className="w-full md:w-48"
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
                className="w-full md:w-48"
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
                className="px-3 py-2 rounded-lg border border-border/50 bg-background/50 backdrop-blur-sm hover:border-primary/50 focus:border-primary focus:ring-1 focus:ring-primary transition-all outline-none "
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
                className="px-3 py-2 rounded-lg border border-border/50 bg-background/50 backdrop-blur-sm hover:border-primary/50 focus:border-primary focus:ring-1 focus:ring-primary transition-all outline-none "
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
              <Switch checked={preferences.book.hyphenation} onChange={(checked) => updateBookDefaults({ hyphenation: checked })} />
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
                className="w-full md:w-48"
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
                className="w-full md:w-48"
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
                className="w-full md:w-48"
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
                Your browser or operating system does not support the Web Speech API.
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
                className="px-3 py-2 rounded-lg border border-border/50 bg-background/50 backdrop-blur-sm hover:border-primary/50 focus:border-primary focus:ring-1 focus:ring-primary transition-all outline-none  max-w-[250px] disabled:opacity-50"
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
                className="px-3 py-2 rounded-lg border border-border/50 bg-background/50 backdrop-blur-sm hover:border-primary/50 focus:border-primary focus:ring-1 focus:ring-primary transition-all outline-none  disabled:opacity-50"
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
              <Switch checked={preferences.tts?.autoAdvance ?? true} onChange={(checked) => updateTtsDefaults({ autoAdvance: checked })} />
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
        description="Manage how series volumes are organized"
      >
        <SettingItem
          label="Auto-Group Series Volumes"
          description={preferences.autoGroupManga ? 'Enabled - Automatically groups books and manga by series' : 'Disabled - Manual organization'}
        >
          <Switch checked={preferences.autoGroupManga} onChange={(checked) => updateGeneralSettings({ autoGroupManga: checked })} />
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
              <Switch checked={preferences.manga.fitWidth} onChange={(checked) => updateMangaDefaults({ fitWidth: checked })} />
            </SettingItem>
          )}

          {isSettingVisible('Image Smoothing', 'Anti-aliasing for images', 'Display Options') && (
            <SettingItem
              label="Image Smoothing"
              description={preferences.manga.imageSmoothing ? 'Enabled' : 'Disabled'}
            >
              <Switch checked={preferences.manga.imageSmoothing} onChange={(checked) => updateMangaDefaults({ imageSmoothing: checked })} />
            </SettingItem>
          )}

          {isSettingVisible('GPU Acceleration', 'Hardware accelerated rendering', 'Display Options') && (
            <SettingItem
              label="GPU Acceleration"
              description={preferences.manga.gpuAcceleration ? 'Enabled' : 'Disabled'}
            >
              <Switch checked={preferences.manga.gpuAcceleration} onChange={(checked) => updateMangaDefaults({ gpuAcceleration: checked })} />
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
                className="px-3 py-2 rounded-lg border border-border/50 bg-background/50 backdrop-blur-sm hover:border-primary/50 focus:border-primary focus:ring-1 focus:ring-primary transition-all outline-none "
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
                className="w-full md:w-48"
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
                className="w-full md:w-48"
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
  const [isCleaningUp, setIsCleaningUp] = useState(false)
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

  const handleCleanUpDatabase = async () => {
    if (confirm('Are you sure you want to clean up the database? This will remove records for missing files and unused covers.')) {
      try {
        setIsCleaningUp(true)
        const [books, covers] = await api.cleanUpDatabase()
        toast.success(`Database cleaned: Removed ${books} missing books and ${covers} unused covers.`)
        // Refresh library to reflect removed books
        await useLibraryStore.getState().loadInitialBooks()
      } catch (err) {
        logger.error('Cleanup failed:', err)
        toast.error('Failed to clean up database')
      } finally {
        setIsCleaningUp(false)
      }
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

  const handleClearResumePromptMemory = () => {
    try {
      localStorage.removeItem(EPUB_RESUME_CHOICE_STORAGE_KEY)
      toast.success('Resume prompt memory cleared')
    } catch {
      toast.error('Failed to clear resume prompt memory')
    }
  }

  return (
    <div className="space-y-8">
      {isSectionVisible('Database', ['Export Database', 'Import Database', 'Clean Up Database', 'Reset Database', 'Reset Onboarding']) && (
        <SettingSection title="Database" description="Manage your library database">
          <div className="space-y-3">
            <Button variant="outline" onClick={handleExport} disabled={isExporting}>
              {isExporting ? 'Exporting...' : 'Export Database'}
            </Button>
            <Button variant="outline" onClick={handleImport}>
              Import Database
            </Button>
            <Button variant="outline" onClick={handleCleanUpDatabase} disabled={isCleaningUp}>
              {isCleaningUp ? 'Cleaning...' : 'Clean Up Database'}
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
              <Switch checked={preferences.debugLogging ?? false} onChange={(checked) => updateGeneralSettings({ debugLogging: checked })} />
            </SettingItem>
          )}
        </SettingSection>
      )}

      {isSectionVisible('Annotations', ['Auto-Export Annotations', 'Export Format', 'Export Path']) && (
        <SettingSection title="Annotations & Sync" description="Manage annotation auto-exports">
          {isSettingVisible('Auto-Export Annotations', 'Automatically export annotations', 'Annotations') && (
            <SettingItem
              label="Auto-Export Annotations"
              description="Automatically export annotations to a folder when created or updated"
            >
              <Switch checked={preferences.autoExportAnnotations ?? false} onChange={(checked) => updateGeneralSettings({ autoExportAnnotations: checked })} />
            </SettingItem>
          )}

          {preferences.autoExportAnnotations && isSettingVisible('Export Format', 'Format for exported annotations', 'Annotations') && (
            <SettingItem label="Export Format" description="Format to save annotations">
              <select
                value={preferences.annotationsExportFormat || 'markdown'}
                onChange={(e) => updateGeneralSettings({ annotationsExportFormat: e.target.value })}
                className="px-3 py-2 rounded-lg border border-border/50 bg-background/50 backdrop-blur-sm hover:border-primary/50 focus:border-primary focus:ring-1 focus:ring-primary transition-all outline-none "
                aria-label="Annotations export format"
              >
                <option value="markdown">Markdown (.md)</option>
                <option value="json">JSON (.json)</option>
                <option value="text">Plain Text (.txt)</option>
              </select>
            </SettingItem>
          )}

          {preferences.autoExportAnnotations && isSettingVisible('Export Path', 'Directory to save exports', 'Annotations') && (
            <SettingItem label="Export Directory" description="Where to save the auto-exported files">
              <div className="flex gap-2 w-full max-w-sm items-center">
                <Input 
                  value={preferences.annotationsExportPath || ''} 
                  readOnly 
                  placeholder="Not set" 
                  className="flex-1"
                />
                <Button variant="outline" onClick={async () => {
                  try {
                    const path = await api.openFolderDialog()
                    if (path) {
                      await updateGeneralSettings({ annotationsExportPath: path })
                    }
                  } catch (e) {
                    console.error("Failed to set export path", e)
                  }
                }} className="px-3">
                  <FolderOpen size={16} />
                </Button>
              </div>
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
                className="px-3 py-2 rounded-lg border border-border/50 bg-background/50 backdrop-blur-sm hover:border-primary/50 focus:border-primary focus:ring-1 focus:ring-primary transition-all outline-none "
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
                className="px-3 py-2 rounded-lg border border-border/50 bg-background/50 backdrop-blur-sm hover:border-primary/50 focus:border-primary focus:ring-1 focus:ring-primary transition-all outline-none "
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
              <Switch checked={includeBooks} onChange={(checked) => setIncludeBooks(checked)} />
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

      {isSectionVisible('Privacy', ['Send Analytics', 'Send Crash Reports', 'Reading History Retention', 'Clear Reading History']) && (
        <SettingSection title="Privacy & Data" description="Control your data and privacy">
          {isSettingVisible('Send Analytics', 'Anonymous usage statistics', 'Privacy') && (
            <SettingItem label="Send Anonymous Usage Statistics" description="Help improve Shiori by sending anonymous usage data">
              <Switch checked={preferences.sendAnalytics ?? false} onChange={(checked) => updateGeneralSettings({ sendAnalytics: checked })} />
            </SettingItem>
          )}

          {isSettingVisible('Send Crash Reports', 'Automatic crash reporting', 'Privacy') && (
            <SettingItem label="Send Crash Reports" description="Automatically report crashes to help fix bugs">
              <Switch checked={preferences.sendCrashReports ?? false} onChange={(checked) => updateGeneralSettings({ sendCrashReports: checked })} />
            </SettingItem>
          )}

          {isSettingVisible('Reading History Retention', 'How long to keep reading history', 'Privacy') && (
            <SettingItem label="Reading History Retention" description="How long to keep reading history">
              <select
                value={String(preferences.historyRetentionDays ?? -1)}
                onChange={(e) => updateGeneralSettings({ historyRetentionDays: Number(e.target.value) })}
                className="px-3 py-2 rounded-lg border border-border/50 bg-background/50 backdrop-blur-sm hover:border-primary/50 focus:border-primary focus:ring-1 focus:ring-primary transition-all outline-none "
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

          {isSettingVisible('Clear Reading History', 'Delete all reading history', 'Privacy') && (
            <div className="flex gap-2 pt-2 flex-wrap">
              <Button
                variant="outline"
                onClick={() => toast.info('Reading history clearing is not yet implemented')}
              >
                Clear Reading History
              </Button>
            </div>
          )}
        </SettingSection>
      )}
    </div>
  )
}

const CommunityPluginsSettings = ({
  isSectionVisible,
}: {
  isSectionVisible: (section: string, settings: string[]) => boolean
}) => {
  return (
    <div className="space-y-8">
      {isSectionVisible('Online Sources', ['MangaDex', 'ToonGod', 'ManhwaHub', 'Weebrook', 'Nyaa', 'Project Gutenberg', 'LibGen']) && (
        <SettingSection title="Online Sources" description="Enable or disable online providers used by online sections">
          <SourceManager />
        </SettingSection>
      )}
    </div>
  )
}

const AboutSettings = () => {
  const [appVersion, setAppVersion] = useState('Loading...')
  const [isChecking, setIsChecking] = useState(false)
  const toast = useToast()

  useEffect(() => {
    getVersion().then(setAppVersion).catch(console.error)
  }, [])

  const handleCheckUpdate = async () => {
    if (!isTauri) {
      toast.info('Auto-updates are only available in the desktop app.')
      return
    }
    
    try {
      setIsChecking(true)
      const update = await check()
      if (update) {
        toast.info(`Update ${update.version} is available! Downloading...`)
        await update.downloadAndInstall()
        toast.success("Update installed successfully. Restarting...")
        await relaunch()
      } else {
        toast.success("You are on the latest version.")
      }
    } catch (error) {
      console.error(error)
      toast.error("Failed to check for updates (ensure your GitHub keys are set in tauri.conf.json if you are the developer)")
    } finally {
      setIsChecking(false)
    }
  }

  return (
    <div className="space-y-8">
      <SettingSection title="Shiori eBook Manager">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-xl overflow-hidden shadow-sm flex-shrink-0">
            <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Shiori Logo" className="w-full h-full object-contain p-[2px]" />
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
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleCheckUpdate} disabled={isChecking}>
            <RefreshCw size={14} className={cn(isChecking && "animate-spin")} />
            {isChecking ? "Checking..." : "Check Now"}
          </Button>
        </div>
      </SettingSection>

      <SettingSection title="Links">
        <div className="space-y-2">
          {([
            { label: 'GitHub Repository', url: 'https://github.com/vinayydv3695/Shiori' },
            { label: 'License', url: 'https://github.com/vinayydv3695/Shiori?tab=MIT-1-ov-file' },
            { label: 'Report an Issue', url: 'https://github.com/vinayydv3695/Shiori/issues' },
          ]).map((link) => (
            <a
              key={link.url}
              href={link.url}
              onClick={(e) => {
                e.preventDefault()
                open(link.url)
              }}
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
