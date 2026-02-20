import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Monitor, Moon, Sun, Book, Image, Palette, Download, Database, Bell, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type SettingsTab = 'appearance' | 'reading' | 'library' | 'storage' | 'notifications' | 'advanced'

export const SettingsDialog = ({ open, onOpenChange }: SettingsDialogProps) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance')

  const tabs = [
    { id: 'appearance' as const, name: 'Appearance', icon: Palette },
    { id: 'reading' as const, name: 'Reading', icon: Book },
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
              {activeTab === 'appearance' && <AppearanceSettings />}
              {activeTab === 'reading' && <ReadingSettings />}
              {activeTab === 'library' && <LibrarySettings />}
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

const AppearanceSettings = () => {
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system')
  const [accentColor, setAccentColor] = useState('#8b5cf6')
  const [compactMode, setCompactMode] = useState(false)
  const [showCoverShadows, setShowCoverShadows] = useState(true)

  return (
    <div className="space-y-8">
      <SettingSection
        title="Theme"
        description="Choose how Shiori looks"
      >
        <div className="grid grid-cols-3 gap-3">
          {[
            { value: 'light' as const, label: 'Light', icon: Sun },
            { value: 'dark' as const, label: 'Dark', icon: Moon },
            { value: 'system' as const, label: 'System', icon: Monitor },
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => setTheme(option.value)}
              className={cn(
                'p-4 rounded-lg border-2 transition-all flex flex-col items-center gap-2',
                theme === option.value
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
        title="Accent Color"
        description="Customize the primary color"
      >
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={accentColor}
            onChange={(e) => setAccentColor(e.target.value)}
            className="w-12 h-12 rounded-lg border border-border cursor-pointer"
          />
          <span className="text-sm text-muted-foreground">{accentColor}</span>
        </div>
      </SettingSection>

      <SettingSection title="Display Options">
        <SettingItem
          label="Compact Mode"
          description="Reduce spacing for more content"
        >
          <input
            type="checkbox"
            checked={compactMode}
            onChange={(e) => setCompactMode(e.target.checked)}
            className="w-5 h-5"
          />
        </SettingItem>

        <SettingItem
          label="Cover Shadows"
          description="Add shadows to book covers"
        >
          <input
            type="checkbox"
            checked={showCoverShadows}
            onChange={(e) => setShowCoverShadows(e.target.checked)}
            className="w-5 h-5"
          />
        </SettingItem>
      </SettingSection>
    </div>
  )
}

const ReadingSettings = () => {
  const [defaultMode, setDefaultMode] = useState<'single' | 'double' | 'scroll'>('single')
  const [fontSize, setFontSize] = useState(18)
  const [lineHeight, setLineHeight] = useState(1.6)
  const [autoBookmark, setAutoBookmark] = useState(true)
  const [pageTransition, setPageTransition] = useState(true)

  return (
    <div className="space-y-8">
      <SettingSection
        title="Reading Mode"
        description="Default reading layout for books"
      >
        <div className="grid grid-cols-3 gap-3">
          {[
            { value: 'single' as const, label: 'Single Page' },
            { value: 'double' as const, label: 'Double Page' },
            { value: 'scroll' as const, label: 'Continuous' },
          ].map((option) => (
            <button
              key={option.value}
              onClick={() => setDefaultMode(option.value)}
              className={cn(
                'p-3 rounded-lg border-2 transition-all',
                defaultMode === option.value
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </SettingSection>

      <SettingSection title="Typography">
        <SettingItem label="Font Size" description={`${fontSize}px`}>
          <input
            type="range"
            min="12"
            max="32"
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
            className="w-48"
          />
        </SettingItem>

        <SettingItem label="Line Height" description={`${lineHeight}`}>
          <input
            type="range"
            min="1.2"
            max="2.4"
            step="0.1"
            value={lineHeight}
            onChange={(e) => setLineHeight(Number(e.target.value))}
            className="w-48"
          />
        </SettingItem>
      </SettingSection>

      <SettingSection title="Reading Experience">
        <SettingItem
          label="Auto-bookmark"
          description="Automatically save reading progress"
        >
          <input
            type="checkbox"
            checked={autoBookmark}
            onChange={(e) => setAutoBookmark(e.target.checked)}
            className="w-5 h-5"
          />
        </SettingItem>

        <SettingItem
          label="Page Transitions"
          description="Animated page turns"
        >
          <input
            type="checkbox"
            checked={pageTransition}
            onChange={(e) => setPageTransition(e.target.checked)}
            className="w-5 h-5"
          />
        </SettingItem>
      </SettingSection>
    </div>
  )
}

const LibrarySettings = () => {
  const [autoFetchMetadata, setAutoFetchMetadata] = useState(true)
  const [coverQuality, setCoverQuality] = useState<'medium' | 'high'>('high')
  const [organizeByAuthor, setOrganizeByAuthor] = useState(false)

  return (
    <div className="space-y-8">
      <SettingSection
        title="Metadata"
        description="Automatically fetch book and manga information"
      >
        <SettingItem
          label="Auto-fetch Metadata"
          description="Fetch metadata when adding new books"
        >
          <input
            type="checkbox"
            checked={autoFetchMetadata}
            onChange={(e) => setAutoFetchMetadata(e.target.checked)}
            className="w-5 h-5"
          />
        </SettingItem>
      </SettingSection>

      <SettingSection title="Covers">
        <SettingItem
          label="Cover Quality"
          description="Higher quality uses more storage"
        >
          <select
            value={coverQuality}
            onChange={(e) => setCoverQuality(e.target.value as 'medium' | 'high')}
            className="px-3 py-2 rounded-md border border-border bg-background"
          >
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </SettingItem>
      </SettingSection>

      <SettingSection title="Organization">
        <SettingItem
          label="Organize by Author"
          description="Create author folders automatically"
        >
          <input
            type="checkbox"
            checked={organizeByAuthor}
            onChange={(e) => setOrganizeByAuthor(e.target.checked)}
            className="w-5 h-5"
          />
        </SettingItem>
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
