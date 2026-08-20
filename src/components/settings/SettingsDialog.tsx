import { Switch } from '@/components/ui/switch'
import { useState, useEffect, useMemo } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import * as Tabs from '@radix-ui/react-tabs'
import { Drawer } from 'vaul'
import { motion, AnimatePresence, Variants } from 'framer-motion'
import { openExternal } from '@/lib/externalLinks'

import {
  X, Moon, Sun, Palette, Shield, BookOpen, FileText,
  Download, Upload, HardDrive, Archive, CheckCircle2, AlertTriangle,
  Search, FolderOpen, ExternalLink, RefreshCw, Trash2, Info,
  RotateCcw, Puzzle, MonitorSmartphone, Heart, Clock, Loader2,
  ChevronLeft, ChevronRight
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { usePreferencesStore } from '../../store/preferencesStore'
import type {
  Theme, UserPreferences, BookPreferences, MangaPreferences, TtsPreferences,
} from '../../types/preferences'
import { DEFAULT_USER_PREFERENCES, DEFAULT_BOOK_PREFERENCES, DEFAULT_MANGA_PREFERENCES } from '../../types/preferences'
import { api, isTauri, isAndroid } from '../../lib/tauri'
import { getErrorMessage } from '@/lib/errors'
import type {
  BackupInfo, BackupCategory, CacheStats, ConflictPolicy, MigrateReport, RestoreInfo,
  BackupProgressPayload, RestoreProgressPayload
} from '../../lib/tauri'
import { listen } from '@tauri-apps/api/event'
import {
  ALL_BACKUP_CATEGORIES,
  BACKUP_CATEGORY_DESCRIPTIONS,
  BACKUP_CATEGORY_LABELS,
  CONFLICT_POLICY_LABELS,
  DEFAULT_CONFLICT_POLICY,
  buildBackupSelection,
  buildRestoreSelection,
  defaultBackupCategories,
  isFullSelection,
} from '@/lib/backupSelection'
import { TTSEngine } from '@/lib/ttsEngine'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { useToast } from '../../store/toastStore'
import { logger } from '../../lib/logger'
import { useLibraryStore } from '@/store/libraryStore';
import { useSourceStore } from '../../store/sourceStore'
import { SourceManager } from './SourceManager'
import { OnlineCacheSettings } from './OnlineCacheSettings'
import { TorboxSettings } from './TorboxSettings'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { getVersion } from '@tauri-apps/api/app'
import { DesktopCompanionSettings } from './DesktopCompanionSettings'
import { CompanionDiscovery } from '../companion/CompanionDiscovery'
import { useIsMobile } from '@/hooks/useIsMobile'
import { AniListSettings } from './AniListSettings'
import { VoiceManager } from './VoiceManager'
import { UpdateChangelogDialog } from '../dialogs/UpdateChangelogDialog'
import { useUpdateStore } from '@/store/updateStore'

import { READING_FONTS, normalizeLegacyFontPreference, resolveReadingFontCss } from '@/lib/readingFonts'

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const TOOLBAR_ALL_ACTIONS = [
  { id: 'highlight', label: 'Highlight' },
  { id: 'copy', label: 'Copy' },
  { id: 'note', label: 'Note' },
  { id: 'translate', label: 'Translate' },
  { id: 'define', label: 'Define' },
  { id: 'aloud', label: 'Read Aloud' },
]

// Extracted from an inline IIFE so its useState/useEffect run as real component
// hooks. Hooks called inside a callback/IIFE violate the Rules of Hooks.
function ToolbarActionsSelector() {
  const [actions, setActions] = useState<string[]>([])

  useEffect(() => {
    const saved = localStorage.getItem('shiori-toolbar-actions')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) setActions(parsed)
      } catch {
        // ignore malformed persisted value
      }
    } else {
      setActions(['highlight', 'note', 'translate'])
    }
  }, [])

  const toggleAction = (action: string) => {
    let newActions = [...actions]
    if (newActions.includes(action)) {
      newActions = newActions.filter(a => a !== action)
    } else {
      newActions.push(action)
    }
    if (newActions.length === 0) newActions = ['highlight'] // ensure at least one
    setActions(newActions)
    localStorage.setItem('shiori-toolbar-actions', JSON.stringify(newActions))
  }

  return (
    <>
      {TOOLBAR_ALL_ACTIONS.map(a => (
        <button
          key={a.id}
          onClick={() => toggleAction(a.id)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${actions.includes(a.id) ? 'bg-primary/20 border-primary/50 text-primary' : 'bg-transparent border-border/50 text-muted-foreground hover:bg-muted/50'}`}
        >
          {a.label}
        </button>
      ))}
    </>
  )
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
  { label: 'UI Density', description: 'Adjust interface spacing', tab: 'general', section: 'Appearance' },
  { label: 'UI Scale', description: 'Adjust overall application size', tab: 'general', section: 'Appearance' },
  { label: 'Cover Size', description: 'Book cover display size', tab: 'general', section: 'Appearance' },
  { label: 'Enable Window Transparency', description: 'Toggle transparent window background (Requires restart)', tab: 'general', section: 'Appearance' },
  { label: 'Settings Transparency', description: 'Toggle transparent background for the settings dialog', tab: 'general', section: 'Appearance' },
  { label: 'Auto-start Application', description: 'Start Shiori when system boots', tab: 'general', section: 'General' },
  { label: 'Discord Rich Presence', description: 'Show your reading activity on Discord', tab: 'general', section: 'General' },
  { label: 'Primary Content Type', description: 'What type of content you prefer to read', tab: 'general', section: 'General' },
  { label: 'Filter NSFW & Adult Content', description: 'Hide 18+ adult content across online catalogs, manga browsing, metadata, and search results', tab: 'general', section: 'General' },
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
  { label: 'Page Width', description: 'Maximum content width', tab: 'book-reading', section: 'Layout' },
  { label: 'Paragraph Spacing', description: 'Space between paragraphs in em', tab: 'book-reading', section: 'Layout' },
  { label: 'Toolbar Base Actions', description: 'Customize the default visible text selection actions', tab: 'book-reading', section: 'Advanced' },
  { label: 'Custom CSS', description: 'Inject custom CSS into book reader', tab: 'book-reading', section: 'Advanced' },
  { label: 'Text-to-Speech Voice', description: 'TTS voice selection', tab: 'book-reading', section: 'Audio / TTS' },
  { label: 'Speech Rate', description: 'TTS playback speed', tab: 'book-reading', section: 'Audio / TTS' },
  { label: 'Auto-advance Chapter', description: 'Continue to next chapter after TTS finishes', tab: 'book-reading', section: 'Audio / TTS' },
  { label: 'Highlight Color', description: 'TTS highlight color', tab: 'book-reading', section: 'Audio / TTS' },
  { label: 'Reading Mode', description: 'Single double or long strip', tab: 'manga-reading', section: 'Reading Mode' },
  { label: 'Reading Direction', description: 'Left-to-right or right-to-left', tab: 'manga-reading', section: 'Reading Direction' },
  { label: 'Fit to Width', description: 'Scale images to fit width', tab: 'manga-reading', section: 'Display Options' },
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
  { label: 'Library Storage', description: 'Choose where managed books live', tab: 'advanced', section: 'Library Storage' },
  { label: 'Choose Folder', description: 'Pick a durable folder for managed books', tab: 'advanced', section: 'Library Storage' },
  { label: 'Migrate Managed Books', description: 'Move managed books into the durable folder', tab: 'advanced', section: 'Library Storage' },
  { label: 'Use App-Private Storage', description: 'Store managed books in the Shiori private folder', tab: 'advanced', section: 'Library Storage' },
  { label: 'Send Analytics', description: 'Anonymous usage statistics', tab: 'advanced', section: 'Privacy' },
  { label: 'Send Crash Reports', description: 'Automatic crash reporting', tab: 'advanced', section: 'Privacy' },
  { label: 'Reading History Retention', description: 'How long to keep reading history', tab: 'advanced', section: 'Privacy' },
  { label: 'Clear Reading History', description: 'Delete all reading history', tab: 'advanced', section: 'Privacy' },
  { label: 'AniList Token', description: 'API Token for AniList two-way sync', tab: 'general', section: 'Integrations' },
]

const EPUB_RESUME_CHOICE_STORAGE_KEY = 'shiori-epub-resume-choice:v1'

export const SettingsDialog = ({ open, onOpenChange }: SettingsDialogProps) => {
  const isMobile = useIsMobile()
  
  const triggerHaptic = (ms = 50) => {
    if (isMobile && navigator.vibrate) {
      navigator.vibrate(ms)
    }
  }

  const [activeTab, setActiveTab] = useState<SettingsTab>('general')
  const [mobileView, setMobileView] = useState<'root' | 'detail'>('root')
  const [searchQuery, setSearchQuery] = useState('')
  const preferences = usePreferencesStore((state) => state.preferences)
  const updateTheme = usePreferencesStore((state) => state.updateTheme)
  const updateBookDefaults = usePreferencesStore((state) => state.updateBookDefaults)
  const updateMangaDefaults = usePreferencesStore((state) => state.updateMangaDefaults)
  const updateTtsDefaults = usePreferencesStore((state) => state.updateTtsDefaults)
  const updateGeneralSettings = usePreferencesStore((state) => state.updateGeneralSettings)
  const loadPreferences = usePreferencesStore((state) => state.loadPreferences)

  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setActiveTab('general')
        setMobileView('root')
        setSearchQuery('')
      }, 300)
    }
  }, [open])

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

  const Wrapper: any = isMobile ? Drawer.Root : Dialog.Root;
  const Portal: any = isMobile ? Drawer.Portal : Dialog.Portal;
  const Overlay: any = isMobile ? Drawer.Overlay : Dialog.Overlay;
  const Content: any = isMobile ? Drawer.Content : Dialog.Content;

  return (
    <Wrapper open={open} onOpenChange={onOpenChange}>
      <Portal>
        <Overlay className="dialog-overlay fixed inset-0 z-[100] bg-black/40 backdrop-blur-md transition-all duration-300" />
        <Content 
          aria-describedby={undefined} 
          onOpenAutoFocus={(e: Event) => {
            if (isMobile) {
              e.preventDefault();
            }
          }}
          className={cn(
          "z-[101] flex flex-col overflow-hidden focus:outline-none",
          isMobile 
            ? "fixed inset-0 w-full h-full rounded-none" 
            : "dialog-content settings-dialog fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 border border-white/10 rounded-2xl shadow-[0_0_40px_rgba(0,0,0,0.2)] w-[95vw] max-w-5xl h-[90vh]",
          // Transparent mode must stay near-opaque: at /80 the inner panels
          // (bg-background/30 sidebar, /50 content) stacked on the /40 overlay
          // let the app's icons show through the panel. /95 + heavy blur keeps
          // the frosted look while making the background unreadable.
          preferences?.transparentSettings ?? false ? "bg-background/95 backdrop-blur-2xl" : "bg-background"
        )}>
          <div 
            className="flex items-center justify-between p-3.5 sm:p-5 border-b border-border/60 gap-2 sm:gap-3 bg-background/80 backdrop-blur-md sticky top-0 z-20"
            style={{ paddingTop: isMobile ? 'max(env(safe-area-inset-top, 0px), 12px)' : undefined }}
          >
            {isMobile ? (
              mobileView === 'detail' ? (
                <div className="flex items-center gap-2.5 min-w-0">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => { triggerHaptic(40); setMobileView('root'); }} 
                    className="rounded-full shrink-0 -ml-1 hover:bg-muted/80"
                    aria-label="Back to settings categories"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </Button>
                  <Dialog.Title className="text-lg font-bold tracking-tight truncate">
                    {tabs.find(t => t.id === selectedTab)?.name || 'Settings'}
                  </Dialog.Title>
                </div>
              ) : (
                <div className="flex items-center gap-2.5 min-w-0">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => { triggerHaptic(40); onOpenChange(false); }} 
                    className="rounded-full shrink-0 -ml-1 hover:bg-muted/80"
                    aria-label="Close settings"
                  >
                    <X className="w-5 h-5 text-muted-foreground hover:text-foreground" />
                  </Button>
                  <Dialog.Title className="text-xl font-bold tracking-tight">
                    Settings
                  </Dialog.Title>
                </div>
              )
            ) : (
              <Dialog.Title className="text-xl md:text-2xl font-bold tracking-tight">Settings</Dialog.Title>
            )}

            <div className="flex items-center gap-2 shrink-0">
              {!(isMobile && mobileView === 'detail') && (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} />
                  <Input
                    type="search"
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8.5 pr-7 h-9 text-xs sm:text-sm w-32 sm:w-48 md:w-64 rounded-full bg-muted/40 focus:bg-background border-border/50"
                    aria-label="Search settings"
                  />
                  {searchQuery && (
                    <button
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setSearchQuery('')}
                      aria-label="Clear search"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
              )}
              {isMobile && mobileView === 'detail' ? (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => { triggerHaptic(40); onOpenChange(false); }} 
                  className="rounded-full shrink-0" 
                  aria-label="Close settings"
                >
                  <X className="w-5 h-5 text-muted-foreground hover:text-foreground" />
                </Button>
              ) : !isMobile ? (
                 <Dialog.Close asChild>
                   <Button variant="ghost" size="icon" className="rounded-full shrink-0" aria-label="Close settings">
                     <X className="w-5 h-5 text-muted-foreground hover:text-foreground" />
                   </Button>
                 </Dialog.Close>
              ) : null}
            </div>
          </div>

          <Tabs.Root
            value={selectedTab}
            onValueChange={(val) => {
              setActiveTab(val as SettingsTab);
              if (isMobile) setMobileView('detail');
            }}
            className="flex flex-1 overflow-hidden max-md:flex-col"
            orientation="vertical"
          >
            <Tabs.List asChild>
              <motion.div
                className={cn(
                  "w-64 bg-background/30 p-4 md:p-6 space-y-1.5 flex-shrink-0 overflow-y-auto custom-scrollbar",
                  isMobile && mobileView === 'root' ? "w-full flex-1 max-md:pb-16 p-3 sm:p-4 space-y-2" : isMobile ? "hidden" : "block"
                )}
                aria-label="Settings categories"
                initial="hidden"
                animate="show"
                variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } }}
              >
                {filteredTabs.map((tab) => (
                  <motion.div key={tab.id} variants={{ hidden: { opacity: 0, x: -10 }, show: { opacity: 1, x: 0, transition: { type: "spring", stiffness: 300, damping: 24 } } }}>
                    <Tabs.Trigger
                      value={tab.id}
                      onClick={() => {
                        triggerHaptic(30);
                        if (isMobile) setMobileView('detail');
                      }}
                      className={cn(
                        'w-full flex items-center gap-3.5 px-4 py-3 rounded-xl transition-all duration-300 text-left font-medium text-[14px] group relative overflow-hidden',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                        'data-[state=active]:bg-primary/10 data-[state=active]:text-primary',
                        'data-[state=inactive]:text-muted-foreground/80 data-[state=inactive]:hover:bg-muted/40 data-[state=inactive]:hover:text-foreground',
                        isMobile && mobileView === 'root' && "py-3.5 px-4 rounded-2xl border border-border/50 bg-card/60 hover:bg-card/90 shadow-sm active:scale-[0.98]"
                      )}
                    >
                      <div className={cn(
                        "p-2 rounded-xl flex items-center justify-center transition-colors shrink-0",
                        isMobile ? "bg-primary/10 text-primary" : "text-muted-foreground group-hover:text-foreground"
                      )}>
                        <tab.icon className="w-5 h-5" />
                      </div>
                      <span className={cn(
                        "font-sans font-medium tracking-wide block flex-1 truncate",
                        isMobile && mobileView === 'root' && "text-[15px] font-semibold text-foreground"
                      )}>{tab.name}</span>
                      {isMobile && mobileView === 'root' && (
                        <ChevronRight className="w-4.5 h-4.5 text-muted-foreground/60 shrink-0" />
                      )}
                    </Tabs.Trigger>
                  </motion.div>
                ))}
              </motion.div>
            </Tabs.List>

            <div className={cn(
              "flex-1 relative bg-background/50",
              isMobile && mobileView === 'root' ? "hidden" : "block"
            )}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={selectedTab}
                  drag={isMobile && mobileView === 'detail' ? "x" : false}
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.4}
                  onDragEnd={(e, info) => {
                    if (isMobile && mobileView === 'detail' && info.offset.x > 100 && info.velocity.x > 200) {
                      triggerHaptic(50);
                      setMobileView('root');
                    }
                  }}
                  initial="hidden"
                  animate="show"
                  exit="hidden"
                  variants={{
                    hidden: { opacity: 0, x: isMobile ? 50 : 0, y: isMobile ? 0 : 10, filter: 'blur(4px)' },
                    show: { 
                      opacity: 1, 
                      x: 0,
                      y: 0, 
                      filter: 'blur(0px)',
                      transition: { duration: 0.2, staggerChildren: 0.05, delayChildren: 0.05 } 
                    }
                  }}
                  className="absolute inset-0 p-4 md:p-8 pb-32 md:pb-8 overflow-y-auto custom-scrollbar"
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
                    <div className="p-4 md:p-6 pb-20 max-md:pb-32 overflow-y-auto max-h-full scroll-smooth custom-scrollbar">
                      {/* Companion Tab Content */}
                      {isAndroid ? <CompanionDiscovery /> : <DesktopCompanionSettings />}
                    </div>
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
        </Content>
      </Portal>
    </Wrapper>
  )
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
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
  <motion.section variants={itemVariants} className="space-y-4 pb-8 mb-8 border-b border-border/20 last:border-0 last:pb-0 last:mb-0">
    <div className="flex items-center justify-between px-2">
      <div>
        <h3 className="text-[1.15rem] font-medium tracking-tight text-foreground/90">{title}</h3>
        {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
      </div>
      {onReset && (
        <Button variant="ghost" size="sm" onClick={onReset} className="gap-1.5 text-muted-foreground hover:text-foreground">
          <RotateCcw size={14} />
          Reset
        </Button>
      )}
    </div>
    <div className="flex flex-col space-y-1">
      {children}
    </div>
  </motion.section>
)

const SettingItem = ({
  label,
  description,
  children,
}: {
  label: string
  description?: string
  children: React.ReactNode
}) => {
  const isMobile = useIsMobile();
  return (
  <motion.div variants={itemVariants} className={cn(
    "group flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-6 px-3 md:px-4 rounded-xl hover:bg-muted/40 transition-colors duration-200",
    isMobile ? "py-4" : "py-3.5"
  )}>
    <div className="space-y-1 flex-1 md:pr-4">
      <label className="text-[15px] font-medium tracking-tight text-foreground/90">{label}</label>
      {description && <p className="text-[13px] text-muted-foreground/80 leading-snug">{description}</p>}
    </div>
    <div className="flex-shrink-0 flex items-center justify-start md:justify-end w-full md:w-auto md:min-w-[200px]">
      {children}
    </div>
  </motion.div>
  );
}

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

  useEffect(() => {
    // Keep useEffect empty or remove it if not needed, but there are other things?
    // Actually we can just remove the whole useEffect since it only did AniList stuff.
  }, []);

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
    { value: 'light', label: 'Premium Light', icon: Sun },
    { value: 'dark', label: 'OLED Midnight', icon: Moon },
    { value: 'hello-kitty', label: 'Hello Kitty', icon: Heart },
    { value: 'midnight-pink', label: 'Midnight Pink', icon: Palette },
    { value: 'sepia', label: 'Sepia Paper', icon: Sun },
    { value: 'gray', label: 'E-Ink Gray', icon: Moon },
    { value: 'rose-pine-moon', label: 'Rosé Pine', icon: Palette },
    { value: 'catppuccin-mocha', label: 'Catppuccin', icon: Palette },
    { value: 'tokyo-night', label: 'Tokyo Night', icon: Palette },
    { value: 'premium-dark', label: 'Premium Dark', icon: Palette },
  ]

  return (
    <div className="space-y-8">
      {isSectionVisible('Theme', ['Theme', 'Dark Theme', 'Light Theme', 'System Theme']) && (
        <SettingSection title="Theme" description="Choose how Shiori looks">
          <div className="flex flex-wrap gap-3 mt-2">
            {themeOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => updateTheme(option.value)}
                className={cn(
                  'relative group flex items-center gap-2.5 px-4 py-2.5 rounded-full border transition-all duration-300',
                  preferences.theme === option.value
                    ? 'border-primary bg-primary/10 shadow-sm'
                    : 'border-border/60 bg-background hover:border-primary/40 hover:bg-muted/50'
                )}
                aria-label={`${option.label} theme`}
              >
                <option.icon className={cn(
                  "w-4 h-4 transition-colors duration-300",
                  preferences.theme === option.value ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                )} />
                <span className={cn(
                  "text-[14px] font-medium tracking-tight transition-colors duration-300",
                  preferences.theme === option.value ? "text-primary" : "text-foreground/80 group-hover:text-foreground"
                )}>{option.label}</span>
              </button>
            ))}
          </div>

          {isSettingVisible('Theme Preview', 'Preview of current theme colors', 'Theme') && (
            <div className="mt-6 p-5 rounded-2xl bg-muted/30 border border-border/40">
              <p className="text-[12px] font-medium text-muted-foreground uppercase tracking-widest mb-4">Color Palette</p>
              <div className="flex flex-wrap gap-4 items-center">
                <div className="w-8 h-8 rounded-full bg-primary shadow-sm ring-1 ring-border/20 transition-transform hover:scale-110 cursor-default" title="Primary" />
                <div className="w-8 h-8 rounded-full bg-secondary shadow-sm ring-1 ring-border/20 transition-transform hover:scale-110 cursor-default" title="Secondary" />
                <div className="w-8 h-8 rounded-full bg-accent shadow-sm ring-1 ring-border/20 transition-transform hover:scale-110 cursor-default" title="Accent" />
                <div className="w-8 h-8 rounded-full bg-muted shadow-sm ring-1 ring-border/20 transition-transform hover:scale-110 cursor-default" title="Muted" />
                <div className="w-8 h-8 rounded-full bg-destructive shadow-sm ring-1 ring-border/20 transition-transform hover:scale-110 cursor-default" title="Destructive" />
                <div className="w-8 h-8 rounded-full bg-background shadow-sm ring-1 ring-border transition-transform hover:scale-110 cursor-default" title="Background" />
                <div className="w-8 h-8 rounded-full bg-foreground shadow-sm ring-1 ring-border/20 transition-transform hover:scale-110 cursor-default" title="Foreground" />
              </div>
            </div>
          )}
        </SettingSection>
      )}

      {isSectionVisible('Appearance', ['UI Scale', 'Cover Size', 'Enable Window Transparency', 'Settings Transparency']) && (
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

          {!isAndroid && isSettingVisible('UI Scale', 'Adjust overall application size', 'Appearance') && (
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

          {!isAndroid && isSettingVisible('Enable Window Transparency', 'Toggle transparent window background (Requires restart)', 'Appearance') && (
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

          {!isAndroid && isSettingVisible('Settings Transparency', 'Toggle transparent background for the settings dialog', 'Appearance') && (
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
          {!isAndroid && isSettingVisible('Auto-start Application', 'Start Shiori when system boots', 'General') && (
            <SettingItem label="Auto-start Application" description="Start Shiori when system boots">
              <Switch checked={preferences.autoStart} onChange={(checked) => updateGeneralSettings({ autoStart: checked })} />
            </SettingItem>
          )}
          {!isAndroid && isSettingVisible('Discord Rich Presence', 'Show your reading activity on Discord', 'General') && (
            <SettingItem label="Discord Rich Presence" description="Show your reading activity on Discord">
              <Switch checked={preferences.discordRpcEnabled ?? true} onChange={(checked) => updateGeneralSettings({ discordRpcEnabled: checked })} />
            </SettingItem>
          )}
          {isSettingVisible('Primary Content Type', 'What type of content you prefer to read', 'General') && (
            <SettingItem label="Primary Content Type" description="What type of content you prefer to read">
              <Select
                value={preferences.preferredContentType ?? 'both'}
                onValueChange={(val) => updateGeneralSettings({ preferredContentType: val as 'books' | 'manga' | 'both' })}
              >
                <SelectTrigger className="w-full md:w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">Both Books & Manga</SelectItem>
                  <SelectItem value="books">Only Books</SelectItem>
                  <SelectItem value="manga">Only Manga & Comics</SelectItem>
                </SelectContent>
              </Select>
            </SettingItem>
          )}
          {isSettingVisible('Filter NSFW & Adult Content', 'Hide 18+ adult content across online catalogs, manga browsing, metadata, and search results', 'General') && (
            <SettingItem
              label="Filter NSFW & Adult Content"
              description="Hide 18+ adult content across online catalogs, manga browsing, metadata, and search results (Enabled by default)"
            >
              <Switch
                checked={!(preferences.includeNsfw ?? false)}
                onChange={(filtered) => updateGeneralSettings({ includeNsfw: !filtered })}
              />
            </SettingItem>
          )}
        </SettingSection>
      )}

      {!isAndroid && isSectionVisible('Import', ['Import Path']) && (
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

      {isSectionVisible('Library', ['Auto-Scan Library Folders', 'Daily Reading Goal']) && (
        <SettingSection
          title="Library"
          description="Configure library behavior"
          onReset={() => {
            updateGeneralSettings({
              autoScanEnabled: DEFAULT_USER_PREFERENCES.autoScanEnabled,
              dailyReadingGoalMinutes: DEFAULT_USER_PREFERENCES.dailyReadingGoalMinutes,
            })
            toast.success('Library settings reset')
          }}
        >
          {!isAndroid && isSettingVisible('Auto-Scan Library Folders', 'Automatically import new books', 'Library') && (
            <SettingItem label="Auto-Scan Library Folders" description="Automatically import new books when detected">
              <Switch checked={preferences.autoScanEnabled ?? false} onChange={(checked) => updateGeneralSettings({ autoScanEnabled: checked })} />
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
              <Select
                value={preferences.translationTargetLanguage || 'en'}
                onValueChange={(val) => updateGeneralSettings({ translationTargetLanguage: val })}
              >
                <SelectTrigger className="w-full md:w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="es">Spanish</SelectItem>
                  <SelectItem value="fr">French</SelectItem>
                  <SelectItem value="de">German</SelectItem>
                  <SelectItem value="it">Italian</SelectItem>
                  <SelectItem value="pt">Portuguese</SelectItem>
                  <SelectItem value="ru">Russian</SelectItem>
                  <SelectItem value="ja">Japanese</SelectItem>
                  <SelectItem value="ko">Korean</SelectItem>
                  <SelectItem value="zh">Chinese</SelectItem>
                  <SelectItem value="ar">Arabic</SelectItem>
                  <SelectItem value="hi">Hindi</SelectItem>
                </SelectContent>
              </Select>
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
            <Select
              value={preferredDebridProvider}
              onValueChange={(val) => setPreferredDebridProvider(val as 'auto' | 'torbox')}
              disabled
            >
              <SelectTrigger className="w-full md:w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto (Torbox)</SelectItem>
                <SelectItem value="torbox">Torbox</SelectItem>
              </SelectContent>
            </Select>
          </SettingItem>



          <SettingItem
            label="Torbox API Key"
            description="Cloud torrent service to download and import media directly into Shiori."
          >
            <TorboxSettings />
          </SettingItem>

        </div>
      </SettingSection>

      {isSectionVisible('Integrations', ['AniList Token']) && (
        <SettingSection title="Integrations" description="Connect to third-party services">
          {isSettingVisible('AniList Token', 'API Token for AniList two-way sync', 'Integrations') && (
            <SettingItem label="AniList API Token" description="Token for two-way sync with AniList.">
              <AniListSettings />
            </SettingItem>
          )}
        </SettingSection>
      )}
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
              <Select
                value={normalizedBookFontFamily}
                onValueChange={(val) => updateBookDefaults({ fontFamily: normalizeLegacyFontPreference(val) })}
              >
                <SelectTrigger className="w-full md:w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {READING_FONTS.map((font) => (
                    <SelectItem key={font.id} value={font.id}>{font.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

      {isSectionVisible('Reading Experience', ['Scroll Mode', 'Text Justification', 'Hyphenation']) && (
        <SettingSection title="Reading Experience">
          {isSettingVisible('Scroll Mode', 'Paged or continuous scrolling', 'Reading Experience') && (
            <SettingItem
              label="Scroll Mode"
              description={preferences.book.scrollMode === 'continuous' ? 'Continuous' : 'Paged'}
            >
              <Select
                value={preferences.book.scrollMode}
                onValueChange={(val) => updateBookDefaults({ scrollMode: val as 'paged' | 'continuous' })}
              >
                <SelectTrigger className="w-full md:w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="paged">Paged</SelectItem>
                  <SelectItem value="continuous">Continuous</SelectItem>
                </SelectContent>
              </Select>
            </SettingItem>
          )}

          {isSettingVisible('Text Justification', 'Left-aligned or justified', 'Reading Experience') && (
            <SettingItem
              label="Text Justification"
              description={preferences.book.justification === 'justify' ? 'Justified' : 'Left-aligned'}
            >
              <Select
                value={preferences.book.justification}
                onValueChange={(val) => updateBookDefaults({ justification: val as 'left' | 'justify' })}
              >
                <SelectTrigger className="w-full md:w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">Left</SelectItem>
                  <SelectItem value="justify">Justify</SelectItem>
                </SelectContent>
              </Select>
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

      {isSectionVisible('Advanced', ['Custom CSS', 'Toolbar Base Actions']) && (
        <SettingSection title="Advanced">
          {isSettingVisible('Toolbar Base Actions', 'Customize the default visible text selection actions', 'Advanced') && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Toolbar Base Actions</label>
              <div className="flex flex-wrap gap-2 mt-2">
                <ToolbarActionsSelector />
              </div>
              <p className="text-xs text-muted-foreground">
                Select which actions appear on the main toolbar when text is selected. Unselected actions will appear in the expanded dropdown.
              </p>
            </div>
          )}

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
          {isSettingVisible('Text-to-Speech Voice', 'TTS voice selection', 'Audio / TTS') && (
            <div className="py-4 border-b border-border/50">
              <VoiceManager />
            </div>
          )}

          {isSettingVisible('Speech Rate', 'TTS playback speed', 'Audio / TTS') && (
            <SettingItem label="Speech Rate" description={`${preferences.tts?.rate ?? 1.0}x`}>
              <Select
                value={String(preferences.tts?.rate ?? 1.0)}
                onValueChange={(val) => updateTtsDefaults({ rate: Number(val) })}
                disabled={!isAvailable}
              >
                <SelectTrigger className="w-full md:w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SPEED_OPTIONS.map((s) => (
                    <SelectItem key={s} value={String(s)}>{s}x</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
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

      {isSectionVisible('Display Options', ['Fit to Width', 'Background Color', 'Progress Bar']) && (
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
              <Select
                value={preferences.manga?.progressBar || 'hidden'}
                onValueChange={(val) => updateMangaDefaults({ progressBar: val as 'top' | 'bottom' | 'hidden' })}
              >
                <SelectTrigger className="w-full md:w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hidden">Hidden</SelectItem>
                  <SelectItem value="top">Top</SelectItem>
                  <SelectItem value="bottom">Bottom</SelectItem>
                </SelectContent>
              </Select>
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
  const [backupProgress, setBackupProgress] = useState<BackupProgressPayload | null>(null)
  const [restoreProgress, setRestoreProgress] = useState<RestoreProgressPayload | null>(null)
  const [selectedCategories, setSelectedCategories] = useState<BackupCategory[]>(defaultBackupCategories)
  const [includeCredentials, setIncludeCredentials] = useState(false)
  const [includeFrontendSettings, setIncludeFrontendSettings] = useState(true)
  const [conflictPolicy, setConflictPolicy] = useState<ConflictPolicy>(DEFAULT_CONFLICT_POLICY)
  const [backupResult, setBackupResult] = useState<BackupInfo | null>(null)
  const [restoreResult, setRestoreResult] = useState<RestoreInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null)
  // Library storage mode (Mode A app-private vs Mode B SAF durable folder).
  // Frontend-tracked: the backend only exposes setLibraryMode, so the display
  // starts at 'app' and follows every action taken in this section.
  const [libraryMode, setLibraryMode] = useState<'app' | 'saf'>('app')
  const [libraryRootUri, setLibraryRootUri] = useState<string | null>(null)
  const [isPickingFolder, setIsPickingFolder] = useState(false)
  const [isMigrating, setIsMigrating] = useState(false)
  const [migrateReport, setMigrateReport] = useState<MigrateReport | null>(null)
  const [libraryError, setLibraryError] = useState<string | null>(null)
  const toast = useToast()

  const formatEta = (seconds: number | null | undefined): string => {
    if (seconds === null || seconds === undefined) return 'Calculating...'
    if (seconds <= 0) return 'Almost done...'
    if (seconds < 60) return `~${seconds}s remaining`
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return secs > 0 ? `~${mins}m ${secs}s remaining` : `~${mins}m remaining`
  }

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
      // Strict allowlist: only ever write keys the app itself collects for
      // backup (see collectFrontendSettings — `shiori-` prefixed keys only).
      // A crafted backup must not be able to plant arbitrary localStorage
      // entries; unknown keys are skipped silently.
      for (const [key, value] of Object.entries(settings)) {
        if (!key.startsWith('shiori-')) {
          if (import.meta.env.DEV) console.warn(`[restore] Skipping non-backup key: ${key}`)
          continue
        }
        localStorage.setItem(key, value)
      }
    } catch {
      logger.error('Failed to restore frontend settings')
    }
  }

  const handleExport = async () => {
    try {
      setIsExporting(true)
      
      let finalUri: string | null = null;
      let rustSavePath: string | null = null;
      const fileName = 'shiori_export.json';

      if (isAndroid) {
        finalUri = await api.saveFileDialog(fileName);
        if (!finalUri) return;
        const { appCacheDir, join } = await import('@tauri-apps/api/path');
        const cacheDir = await appCacheDir();
        rustSavePath = await join(cacheDir, fileName);
      } else {
        rustSavePath = await api.saveFileDialog(fileName);
        if (!rustSavePath) return;
      }

      await api.exportLibrary({
        format: 'json',
        include_metadata: true,
        include_shelves: true,
        include_reading_progress: true,
        file_path: rustSavePath,
      })

      if (isAndroid && finalUri && rustSavePath) {
        await api.writeDocument(finalUri, rustSavePath);
      }

      toast.success('Database exported successfully')
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
    setBackupProgress(null)
    let unlisten: (() => void) | null = null
    try {
      const defaultName = `shiori-backup-${new Date().toISOString().slice(0, 10)}.shiori`
      
      let finalUri: string | null = null;
      let rustSavePath: string | null = null;

      if (isAndroid) {
        finalUri = await api.saveFileDialog(defaultName);
        if (!finalUri) return;
        const { appCacheDir, join } = await import('@tauri-apps/api/path');
        const cacheDir = await appCacheDir();
        rustSavePath = await join(cacheDir, defaultName);
      } else {
        rustSavePath = await api.saveFileDialog(defaultName);
        if (!rustSavePath) return;
      }

      setIsBackingUp(true)
      try {
        unlisten = await listen<BackupProgressPayload>('backup:progress', (event) => {
          setBackupProgress(event.payload)
        })
      } catch (e) {
        logger.debug('Failed to register backup:progress listener', e)
      }

      const frontendSettings = includeFrontendSettings ? collectFrontendSettings() : undefined
      const info = await api.createBackup(
        rustSavePath,
        buildBackupSelection(selectedCategories, includeCredentials, includeFrontendSettings),
        frontendSettings,
      )

      if (isAndroid && finalUri && rustSavePath) {
        await api.writeDocument(finalUri, rustSavePath);
      }

      setBackupResult(info)
      toast.success('Backup created successfully')
    } catch (err) {
      setError(`Backup failed: ${getErrorMessage(err)}`)
    } finally {
      if (unlisten) unlisten()
      setIsBackingUp(false)
    }
  }

  const handleRestore = async () => {
    setError(null)
    setRestoreResult(null)
    setRestoreProgress(null)
    let unlisten: (() => void) | null = null

    const restoreScope = isFullSelection(selectedCategories)
      ? 'everything'
      : `${selectedCategories.length} categor${selectedCategories.length === 1 ? 'y' : 'ies'}`
    const confirmed = confirm(
      `Restore ${restoreScope} from the backup? Existing data is handled per the conflict policy you chose (${CONFLICT_POLICY_LABELS[conflictPolicy]}).\n\nContinue?`
    )
    if (!confirmed) return

    try {
      if (!isTauri) return
      let filePath: string | null = null;
      if (isAndroid) {
        const result = await api.openFileDialog();
        if (result && result.length > 0) {
          filePath = result[0];
        }
      } else {
        filePath = await openDialog({
          multiple: false,
          filters: [{ name: 'Shiori Backup', extensions: ['shiori', 'zip'] }],
        }) as string | null
      }
      if (!filePath) return

      setIsRestoring(true)
      try {
        unlisten = await listen<RestoreProgressPayload>('restore:progress', (event) => {
          setRestoreProgress(event.payload)
        })
      } catch (e) {
        logger.debug('Failed to register restore:progress listener', e)
      }

      const result = await api.restoreBackup(
        filePath,
        buildRestoreSelection(selectedCategories, conflictPolicy, includeCredentials),
      )

      if (result.frontend_settings) {
        restoreFrontendSettings(result.frontend_settings)
      }

      setRestoreResult(result)
      toast.success(
        'Restore completed',
        `Restored ${result.books_restored} books, ${result.annotations_restored} annotations, ${result.shelves_restored} shelves, ${result.covers_restored} covers.`
      )
      setTimeout(() => window.location.reload(), 2000)
    } catch (err) {
      setError(`Restore failed: ${getErrorMessage(err)}`)
    } finally {
      if (unlisten) unlisten()
      setIsRestoring(false)
    }
  }

  const toggleCategory = (cat: BackupCategory) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    )
  }

  const handleChooseLibraryFolder = async () => {
    setLibraryError(null)
    try {
      setIsPickingFolder(true)
      const uri = await api.pickLibraryRoot()
      if (!uri) return
      if (!confirm('Use this folder as Shiori\'s durable library storage?\n\nBooks stored here survive app uninstall. Continue?')) return
      await api.setLibraryMode('saf', uri)
      setLibraryMode('saf')
      setLibraryRootUri(uri)
      setMigrateReport(null)
      toast.success('Durable folder set', 'Managed books will be stored in the chosen folder')
    } catch (err) {
      logger.error('Failed to set library folder:', err)
      setLibraryError(`Failed to set library folder: ${getErrorMessage(err)}`)
    } finally {
      setIsPickingFolder(false)
    }
  }

  const handleMigrateToSaf = async () => {
    if (!libraryRootUri) return
    setLibraryError(null)
    if (!confirm('Copy all managed books into the chosen durable folder?\n\nYour library keeps working from that folder afterwards. Continue?')) return
    try {
      setIsMigrating(true)
      const report = await api.migrateLibraryToSaf(libraryRootUri)
      setMigrateReport(report)
      if (report.failed.length === 0) {
        setLibraryMode('saf')
        toast.success('Migration complete', `${report.migrated} books moved to the durable folder`)
      } else {
        toast.warning('Migration finished with errors', `${report.migrated} migrated, ${report.failed.length} failed`)
      }
    } catch (err) {
      logger.error('Migration to SAF failed:', err)
      setLibraryError(`Migration failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsMigrating(false)
    }
  }

  const handleUseAppStorage = async () => {
    setLibraryError(null)
    try {
      await api.setLibraryMode('app')
      setLibraryMode('app')
      setLibraryRootUri(null)
      setMigrateReport(null)
      toast.info('App-private storage active', 'Managed books live in the Shiori private folder')
    } catch (err) {
      logger.error('Failed to switch to app storage:', err)
      setLibraryError(`Failed to switch storage: ${err instanceof Error ? err.message : String(err)}`)
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
          <div className="flex flex-wrap gap-3">
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
            <div className="pt-2 w-full">
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
              <Select
                value={preferences.annotationsExportFormat || 'markdown'}
                onValueChange={(val) => updateGeneralSettings({ annotationsExportFormat: val })}
              >
                <SelectTrigger className="w-full md:w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="markdown">Markdown (.md)</SelectItem>
                  <SelectItem value="json">JSON (.json)</SelectItem>
                  <SelectItem value="text">Plain Text (.txt)</SelectItem>
                </SelectContent>
              </Select>
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
              <Select
                value={String(preferences.cacheSizeLimitMB || 500)}
                onValueChange={(val) => updateGeneralSettings({ cacheSizeLimitMB: Number(val) })}
              >
                <SelectTrigger className="w-full md:w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="100">100 MB</SelectItem>
                  <SelectItem value="250">250 MB</SelectItem>
                  <SelectItem value="500">500 MB (Default)</SelectItem>
                  <SelectItem value="1000">1 GB</SelectItem>
                  <SelectItem value="2000">2 GB</SelectItem>
                  <SelectItem value="-1">Unlimited</SelectItem>
                </SelectContent>
              </Select>
            </SettingItem>
          )}

          {isSettingVisible('Cache Clear Policy', 'When to auto-clear cache', 'Cache') && (
            <SettingItem label="Cache Clear Policy" description="When to automatically clear cached data">
              <Select
                value={preferences.cacheClearPolicy || 'manual'}
                onValueChange={(val) => updateGeneralSettings({ cacheClearPolicy: val as UserPreferences['cacheClearPolicy'] })}
              >
                <SelectTrigger className="w-full md:w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual Only</SelectItem>
                  <SelectItem value="on-startup">On Startup</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
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
            <div className="p-4 rounded-lg bg-muted border border-border space-y-3">
              <div>
                <label className="text-sm font-medium">Categories</label>
                <p className="text-xs text-muted-foreground">
                  Choose what to include in the backup and restore
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {ALL_BACKUP_CATEGORIES.map((cat) => (
                  <label
                    key={cat}
                    className="flex items-start gap-2.5 cursor-pointer select-none rounded-md px-2 py-1.5 hover:bg-background/60 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedCategories.includes(cat)}
                      onChange={() => toggleCategory(cat)}
                      className="rounded border-border text-primary focus:ring-primary/20 bg-background/50 cursor-pointer w-4 h-4 mt-0.5"
                    />
                    <span>
                      <span className="block text-[13px] font-medium">{BACKUP_CATEGORY_LABELS[cat]}</span>
                      <span className="block text-[11px] text-muted-foreground leading-snug">
                        {BACKUP_CATEGORY_DESCRIPTIONS[cat]}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg bg-muted border border-border">
              <div className="space-y-0.5">
                <label className="text-sm font-medium">Include credentials</label>
                <p className="text-xs text-muted-foreground">
                  API keys, Cloudflare sessions (off by default)
                </p>
              </div>
              <Switch checked={includeCredentials} onChange={setIncludeCredentials} />
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg bg-muted border border-border">
              <div className="space-y-0.5">
                <label className="text-sm font-medium">Frontend settings</label>
                <p className="text-xs text-muted-foreground">
                  Local UI preferences (toolbar, onboarding, window state)
                </p>
              </div>
              <Switch checked={includeFrontendSettings} onChange={setIncludeFrontendSettings} />
            </div>

            <Button variant="outline" onClick={handleBackup} disabled={isBackingUp} className="w-full gap-2">
              {isBackingUp ? (
                <><Loader2 className="w-4 h-4 animate-spin text-primary" /> Creating backup...</>
              ) : (
                <><Download className="w-4 h-4" /> Create Backup</>
              )}
            </Button>

            {isBackingUp && (
              <div className="p-4 rounded-xl bg-card border border-primary/20 space-y-3 shadow-inner">
                <div className="flex items-center justify-between text-xs gap-2">
                  <div className="flex items-center gap-2 font-medium text-foreground truncate">
                    <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
                    <span className="truncate">{backupProgress?.message || 'Preparing backup archive...'}</span>
                  </div>
                  <span className="font-mono font-bold text-sm text-primary tabular-nums shrink-0">
                    {Math.round(backupProgress?.percentage ?? 5)}%
                  </span>
                </div>

                <div className="w-full h-2.5 bg-muted/80 rounded-full overflow-hidden p-0.5 border border-border/50">
                  <div
                    className="h-full bg-gradient-to-r from-primary/80 via-primary to-primary rounded-full transition-all duration-300 shadow-[0_0_12px_rgba(var(--primary),0.5)]"
                    style={{ width: `${Math.max(4, Math.min(100, backupProgress?.percentage ?? 5))}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
                  <div className="flex items-center gap-1.5 truncate">
                    {backupProgress?.total && backupProgress.total > 1 ? (
                      <span>
                        Item {backupProgress.current} of {backupProgress.total}
                      </span>
                    ) : (
                      <span>Processing files & database...</span>
                    )}
                  </div>
                  {backupProgress?.etaSeconds !== undefined && backupProgress?.etaSeconds !== null && (
                    <div className="flex items-center gap-1 font-mono text-primary/90 shrink-0 font-medium">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{formatEta(backupProgress.etaSeconds)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {backupResult && (
              <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30 space-y-1">
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="text-sm font-medium">Backup created successfully</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {backupResult.book_count} books, {backupResult.annotation_count} annotations, {backupResult.shelf_count} shelves &mdash; {formatBytes(backupResult.total_size_bytes)}
                </p>
              </div>
            )}

            <div className="border-t border-border pt-4 space-y-4">
              <div className="p-4 rounded-lg bg-muted border border-border">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <label className="text-sm font-medium">Conflict policy</label>
                    <p className="text-xs text-muted-foreground">
                      What to do when restored data already exists
                    </p>
                  </div>
                  <Select
                    value={conflictPolicy}
                    onValueChange={(val) => setConflictPolicy(val as ConflictPolicy)}
                  >
                    <SelectTrigger className="w-full sm:w-[200px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(CONFLICT_POLICY_LABELS) as ConflictPolicy[]).map((policy) => (
                        <SelectItem key={policy} value={policy}>{CONFLICT_POLICY_LABELS[policy]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/30">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-900 dark:text-amber-200 font-medium">
                    Restore applies to the categories selected above. Existing data is handled per the conflict policy — 'Skip' leaves it untouched.
                  </p>
                </div>
              </div>

              <Button variant="outline" onClick={handleRestore} disabled={isRestoring} className="w-full gap-2">
                {isRestoring ? (
                  <><Loader2 className="w-4 h-4 animate-spin text-primary" /> Restoring...</>
                ) : (
                  <><Upload className="w-4 h-4" /> Restore from Backup</>
                )}
              </Button>

              {isRestoring && (
                <div className="p-4 rounded-xl bg-card border border-primary/20 space-y-3 shadow-inner">
                  <div className="flex items-center justify-between text-xs gap-2">
                    <div className="flex items-center gap-2 font-medium text-foreground truncate">
                      <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
                      <span className="truncate">{restoreProgress?.message || 'Restoring backup data...'}</span>
                    </div>
                    <span className="font-mono font-bold text-sm text-primary tabular-nums shrink-0">
                      {Math.round(restoreProgress?.percentage ?? 5)}%
                    </span>
                  </div>

                  <div className="w-full h-2.5 bg-muted/80 rounded-full overflow-hidden p-0.5 border border-border/50">
                    <div
                      className="h-full bg-gradient-to-r from-primary/80 via-primary to-primary rounded-full transition-all duration-300 shadow-[0_0_12px_rgba(var(--primary),0.5)]"
                      style={{ width: `${Math.max(4, Math.min(100, restoreProgress?.percentage ?? 5))}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
                    <div className="flex items-center gap-1.5 truncate">
                      {restoreProgress?.total && restoreProgress.total > 1 ? (
                        <span>
                          Item {restoreProgress.current} of {restoreProgress.total}
                        </span>
                      ) : (
                        <span>Extracting and merging...</span>
                      )}
                    </div>
                    {restoreProgress?.etaSeconds !== undefined && restoreProgress?.etaSeconds !== null && (
                      <div className="flex items-center gap-1 font-mono text-primary/90 shrink-0 font-medium">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{formatEta(restoreProgress.etaSeconds)}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {restoreResult && (
                <div className="p-4 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/30 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="text-sm font-semibold">Restore completed</span>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    {Object.entries(restoreResult.restored).map(([cat, count]) => (
                      <div key={cat} className="flex items-center justify-between gap-4">
                        <span>{BACKUP_CATEGORY_LABELS[cat as BackupCategory] ?? cat}</span>
                        <span className="font-medium">{count} restored</span>
                      </div>
                    ))}
                    {restoreResult.skipped > 0 && (
                      <div className="flex items-center justify-between gap-4">
                        <span>Skipped (conflict policy)</span>
                        <span className="font-medium">{restoreResult.skipped}</span>
                      </div>
                    )}
                  </div>
                  {restoreResult.errors.length > 0 && (
                    <div className="rounded-md bg-red-500/10 border border-red-500/30 p-2 space-y-1">
                      <p className="text-xs font-medium text-red-600 dark:text-red-400">
                        Errors ({restoreResult.errors.length})
                      </p>
                      {restoreResult.errors.map((msg, i) => (
                        <p key={i} className="text-[11px] text-red-600/80 dark:text-red-400/80 break-words">{msg}</p>
                      ))}
                    </div>
                  )}
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

      {isSectionVisible('Library Storage', ['Library Storage', 'Choose Folder', 'Migrate Managed Books', 'Use App-Private Storage']) && (
        <SettingSection
          title="Library Storage"
          description="Choose where managed books live"
        >
          <div className="p-4 rounded-lg bg-muted border border-border space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <label className="text-sm font-medium">Current mode</label>
                <p className="text-xs text-muted-foreground">
                  {libraryMode === 'saf'
                    ? 'Durable folder — survives uninstall'
                    : 'App-private storage — wiped on uninstall'}
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/30 shrink-0">
                {libraryMode === 'saf' ? 'Mode B' : 'Mode A'}
              </span>
            </div>
            {libraryMode === 'saf' && libraryRootUri && (
              <p className="text-xs font-mono text-muted-foreground break-all">{libraryRootUri}</p>
            )}

            {isAndroid ? (
              <>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button variant="outline" onClick={handleChooseLibraryFolder} disabled={isPickingFolder} className="gap-2">
                    <FolderOpen size={15} />
                    {isPickingFolder ? 'Opening picker...' : 'Choose folder'}
                  </Button>
                  <Button variant="outline" onClick={handleMigrateToSaf} disabled={isMigrating || !libraryRootUri} className="gap-2">
                    <RefreshCw size={15} className={cn(isMigrating && 'animate-spin')} />
                    {isMigrating ? 'Migrating...' : 'Migrate existing managed books'}
                  </Button>
                  <Button variant="outline" onClick={handleUseAppStorage} className="gap-2">
                    <HardDrive size={15} />
                    Use app-private storage
                  </Button>
                </div>

                <div className="pt-1 space-y-1.5">
                  <p className="text-xs text-muted-foreground leading-snug">
                    <span className="font-medium text-foreground/80">App-private storage</span> keeps managed books inside
                    Shiori's own folder — it is <span className="font-medium text-foreground/80">wiped when the app is uninstalled</span>.
                  </p>
                  <p className="text-xs text-muted-foreground leading-snug">
                    A <span className="font-medium text-foreground/80">durable folder</span> keeps books in a folder you
                    choose, so they <span className="font-medium text-foreground/80">survive uninstall</span>. This mode is
                    available on Android only.
                  </p>
                </div>

                {migrateReport && (
                  <div className="rounded-lg border border-border/50 p-3 space-y-1.5 bg-background/50">
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                      <span className="font-medium">Migration report</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{migrateReport.migrated} books migrated</p>
                    {migrateReport.failed.length > 0 && (
                      <div className="rounded-md bg-red-500/10 border border-red-500/30 p-2 space-y-1">
                        <p className="text-xs font-medium text-red-600 dark:text-red-400">
                          Failed ({migrateReport.failed.length})
                        </p>
                        {migrateReport.failed.map(([path, err], i) => (
                          <p key={i} className="text-[11px] text-red-600/80 dark:text-red-400/80 break-words">
                            {path}: {err}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-amber-900 dark:text-amber-200 font-medium flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-400 mt-0.5 shrink-0" />
                The durable storage folder is Android-only. On desktop, managed books always live in Shiori's
                app-private folder, which is removed on uninstall.
              </p>
            )}
          </div>

          {libraryError && (
            <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30">
              <p className="text-sm text-red-600 dark:text-red-400">{libraryError}</p>
            </div>
          )}
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
              <Select
                value={String(preferences.historyRetentionDays ?? -1)}
                onValueChange={(val) => updateGeneralSettings({ historyRetentionDays: Number(val) })}
              >
                <SelectTrigger className="w-full md:w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="-1">Keep Forever</SelectItem>
                  <SelectItem value="30">30 Days</SelectItem>
                  <SelectItem value="90">90 Days</SelectItem>
                  <SelectItem value="180">6 Months</SelectItem>
                  <SelectItem value="365">1 Year</SelectItem>
                </SelectContent>
              </Select>
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
      {isSectionVisible('Online Sources', ['MangaDex', 'MangaFire', 'ToonGod', 'ManhwaHub', 'Weebrook', 'Nyaa', 'Project Gutenberg', 'LibGen']) && (
        <SettingSection title="Online Sources" description="Enable or disable online providers used by online sections">
          <SourceManager />
        </SettingSection>
      )}
      {isSectionVisible('Online Cache', ['Online Cache', 'Cache', 'Storage']) && (
        <SettingSection title="Online Cache" description="Disk space used by online browsing — bounded and auto-cleaned">
          <OnlineCacheSettings />
        </SettingSection>
      )}
    </div>
  )
}

const AboutSettings = () => {
  const [appVersion, setAppVersion] = useState('Loading...')
  const [isChecking, setIsChecking] = useState(false)
  const [updateData, setUpdateData] = useState<{ version: string; notes: string; url: string; tauriUpdate?: any } | null>(null)
  const toast = useToast()

  useEffect(() => {
    getVersion().then(setAppVersion).catch(console.error)
  }, [])

  const handleCheckUpdate = async () => {
    try {
      setIsChecking(true)
      
      // In development mode or browser, open the rich update preview dialog with real GitHub release info
      if (import.meta.env.DEV || !isTauri) {
        let latestVersion = '2.3.33';
        let latestNotes = '';
        try {
          const res = await fetch("https://api.github.com/repos/vinayydv3695/Shiori/releases/latest");
          if (res.ok) {
            const data = await res.json();
            latestVersion = data.tag_name?.replace(/^v/, '') || '2.3.33';
            latestNotes = data.body || '';
          }
        } catch {
          // ignore
        }
        const updateStore = useUpdateStore.getState()
        updateStore.setUpdateInfo({
          version: latestVersion,
          notes: latestNotes,
        })
        updateStore.setIsUpdateDialogOpen(true)
        toast.success("Opening update dialog preview...")
        return
      }

      if (isAndroid) {
        const res = await fetch("https://api.github.com/repos/vinayydv3695/Shiori/releases/latest");
        if (!res.ok) throw new Error("Failed to fetch releases");
        const data = await res.json();
        const latestVersion = data.tag_name.replace(/^v/, '');
        
        const isNewer = (v1: string, v2: string) => {
          const parts1 = v1.split('.').map(Number);
          const parts2 = v2.split('.').map(Number);
          for (let i = 0; i < 3; i++) {
            if ((parts1[i] || 0) > (parts2[i] || 0)) return true;
            if ((parts1[i] || 0) < (parts2[i] || 0)) return false;
          }
          return false;
        };
        
        if (isNewer(latestVersion, appVersion)) {
          const updateStore = useUpdateStore.getState()
          const apkAsset = data.assets?.find((a: any) => a.name.endsWith('.apk'));
          updateStore.setUpdateInfo({
            version: latestVersion,
            notes: data.body || 'No release notes available.',
            apkUrl: apkAsset?.browser_download_url
          })
          updateStore.setIsUpdateDialogOpen(true)
        } else {
          toast.success("You are on the latest version.");
        }
      } else {
        // Desktop: try Tauri updater plugin first, fall back to GitHub API
        let updated = false;
        try {
          const update = await check()
          if (update && update.available) {
            const updateStore = useUpdateStore.getState()
            updateStore.setUpdateInfo({
              version: update.version,
              notes: update.body || 'No release notes available.',
              desktopUpdate: update
            })
            updateStore.setIsUpdateDialogOpen(true)
            updated = true;
          } else {
            toast.success("You are on the latest version.")
            updated = true;
          }
        } catch (pluginErr) {
          // Tauri updater failed — fall back to GitHub API
          console.warn('[Update] Tauri updater failed, falling back to GitHub API:', pluginErr)
          try {
            const res = await fetch("https://api.github.com/repos/vinayydv3695/Shiori/releases/latest");
            if (!res.ok) throw new Error("GitHub API request failed");
            const data = await res.json();
            const latestVersion = data.tag_name.replace(/^v/, '');
            const isNewer = (v1: string, v2: string) => {
              const p1 = v1.split('.').map(Number);
              const p2 = v2.split('.').map(Number);
              for (let i = 0; i < 3; i++) {
                if ((p1[i] || 0) > (p2[i] || 0)) return true;
                if ((p1[i] || 0) < (p2[i] || 0)) return false;
              }
              return false;
            };
            if (isNewer(latestVersion, appVersion)) {
              const updateStore = useUpdateStore.getState()
              updateStore.setUpdateInfo({
                version: latestVersion,
                notes: data.body || 'No release notes available.',
              })
              updateStore.setIsUpdateDialogOpen(true)
            } else {
              toast.success("You are on the latest version.")
            }
            updated = true;
          } catch (ghErr) {
            console.error('[Update] GitHub API fallback also failed:', ghErr)
          }
        }
        if (!updated) {
          toast.error("Failed to check for updates. Make sure you are connected to the internet.")
        }
      }
    } catch (error) {
      console.error(error)
      toast.error("Failed to check for updates. Make sure you are connected to the internet.")
    } finally {
      setIsChecking(false)
    }
  }

  return (
    <div className="space-y-10 max-w-2xl mx-auto py-4">
      {/* Hero Section */}
      <motion.div variants={itemVariants} className="flex flex-col items-center justify-center text-center space-y-6">
        <div className="w-24 h-24 rounded-3xl overflow-hidden shadow-2xl flex-shrink-0 border border-border/20 bg-background/50 backdrop-blur-xl">
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="Shiori Logo" className="w-full h-full object-contain p-3" />
        </div>
        <div className="space-y-2">
          <h2 className="text-3xl font-semibold tracking-tight text-foreground">Shiori</h2>
          <p className="text-[15px] text-muted-foreground/90 max-w-md mx-auto">
            A beautiful, fast, and modern eBook & manga manager built for reading enthusiasts.
          </p>
        </div>
      </motion.div>

      {/* Version & Updates */}
      <motion.div variants={itemVariants} className="bg-card/30 border border-border/40 rounded-2xl p-5 flex items-center justify-between shadow-sm">
        <div className="space-y-1">
          <div className="text-[15px] font-medium tracking-tight">Version {appVersion}</div>
          <div className="text-[13px] text-muted-foreground">You are running the latest version</div>
        </div>
        <Button variant="secondary" className="gap-2 rounded-xl" onClick={handleCheckUpdate} disabled={isChecking}>
          <RefreshCw size={15} className={cn(isChecking && "animate-spin")} />
          {isChecking ? "Checking..." : "Check for Updates"}
        </Button>
      </motion.div>

      {/* Quick Links */}
      <motion.div variants={itemVariants} className="space-y-3">
        <h3 className="text-sm font-medium tracking-wider text-muted-foreground uppercase px-2 mb-2">Resources</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {([
            { label: 'GitHub Repository', url: 'https://github.com/vinayydv3695/Shiori', icon: ExternalLink },
            { label: 'Report an Issue', url: 'https://github.com/vinayydv3695/Shiori/issues', icon: AlertTriangle },
            { label: 'License (MIT)', url: 'https://github.com/vinayydv3695/Shiori?tab=MIT-1-ov-file', icon: FileText },
            { label: 'Official Website', url: 'http://shiori.vinayydv.me/', icon: ExternalLink },
          ]).map((link) => (
            <a
              key={link.url}
              href={link.url}
              onClick={(e) => {
                e.preventDefault()
                void openExternal(link.url)
              }}
              className="flex items-center gap-3 p-4 rounded-xl border border-border/40 bg-card/10 hover:bg-muted/50 hover:border-border transition-all group cursor-pointer"
            >
              <div className="p-2 rounded-lg bg-background shadow-sm border border-border/30 text-muted-foreground group-hover:text-primary transition-colors">
                <link.icon size={16} />
              </div>
              <span className="text-[14px] font-medium">{link.label}</span>
            </a>
          ))}
        </div>
      </motion.div>

      {/* Credits */}
      <motion.div variants={itemVariants} className="text-center pt-8 border-t border-border/20">
        <p className="text-[13px] text-muted-foreground/70 mb-2">Built with modern tools</p>
        <p className="text-[12px] text-muted-foreground/50 flex items-center justify-center gap-2 flex-wrap max-w-[200px] mx-auto">
          <span>Tauri</span> &middot; <span>React</span> &middot; <span>Tailwind CSS</span> &middot; <span>Radix UI</span>
        </p>
      </motion.div>

      <UpdateChangelogDialog
        open={!!updateData}
        onOpenChange={(o) => { if (!o) setUpdateData(null) }}
        version={updateData?.version || ''}
        notes={updateData?.notes || ''}
        onConfirm={async () => {
          if (!updateData) return;
          if (updateData.tauriUpdate) {
            try {
              toast.info(`Downloading update...`);
              await updateData.tauriUpdate.downloadAndInstall();
              toast.success("Update installed successfully. Restarting...");
              await relaunch();
            } catch (e) {
              console.error(e);
              toast.error("Failed to install update.");
            }
          } else if (updateData.url) {
            void openExternal(updateData.url);
          }
          setUpdateData(null);
        }}
      />
    </div>
  )
}
