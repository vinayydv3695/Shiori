# Settings Section Complete Redesign

**Generated**: March 8, 2026  
**Priority**: 🔥 **USER PRIORITY #1**  
**Audit Sources**: Settings Audit (bg_97bb58be), Best Practices Research (bg_4bee65c4)

---

## EXECUTIVE SUMMARY

The Settings dialog (`SettingsDialog.tsx`) requires a comprehensive redesign to:
1. **Fix Critical Bugs** (paragraphSpacing units mismatch, unimplemented controls)
2. **Add Missing Features** (40+ standard settings not exposed)
3. **Improve UX** (search, previews, better organization, accessibility)
4. **Implement Unfinished Controls** (Change Import Path, Debug Logging, etc.)

**Current State**: 8 tabs, ~30 exposed settings, 3+ unimplemented buttons, poor accessibility  
**Target State**: Polished, searchable, comprehensive settings with live previews and proper ARIA

---

## CRITICAL BUGS (Fix First)

### 1. Paragraph Spacing Units Mismatch 🔴 CRITICAL
**Files**: `src/types/preferences.ts`, `src/components/settings/SettingsDialog.tsx`  
**Problem**:
```typescript
// types/preferences.ts
DEFAULT_BOOK_PREFERENCES.paragraphSpacing = 16  // Stored as pixels?

// SettingsDialog.tsx
<Slider min={0} max={2} step={0.1} />  // Shows "1.5em"
<span>{preferences.book.paragraphSpacing.toFixed(1)}em</span>
```
- Default is `16` but UI expects `0-2` range in `em` units
- User sees broken rendering or confusing values

**Fix**:
```typescript
// src/types/preferences.ts
export const DEFAULT_BOOK_PREFERENCES: BookPreferences = {
  // ... other fields
  paragraphSpacing: 1.0,  // ✅ Change to em (matches UI)
}

// SettingsDialog.tsx (already correct)
<Slider
  min={0}
  max={2}
  step={0.1}
  value={[preferences.book.paragraphSpacing]}
  onValueChange={([val]) => updateBookDefaults({ paragraphSpacing: val })}
/>
<span>{preferences.book.paragraphSpacing.toFixed(1)}em</span>
```

**Verification**:
- [ ] Check existing user data (migrate `paragraphSpacing` values > 2 to `1.0`)
- [ ] Test paragraph rendering with new defaults

---

### 2. "Change Import Path" Button Not Implemented 🔴 CRITICAL
**File**: `src/components/settings/SettingsDialog.tsx`  
**Lines**: ~599-607  
**Problem**:
```typescript
<Button onClick={() => console.log('Open folder dialog')}>
  Change Import Path
</Button>
```
- Button does nothing (only logs to console)
- User cannot change default import location

**Fix**:
```typescript
const handleChangeImportPath = async () => {
  try {
    const path = await api.openFolderDialog()
    if (path) {
      await updateGeneralSettings({ defaultImportPath: path })
      toast.success(`Import path updated to ${path}`)
    }
  } catch (error) {
    logger.error('Failed to select import path:', error)
    toast.error('Failed to change import path')
  }
}

// In JSX
<Button onClick={handleChangeImportPath}>
  <FolderOpen size={16} />
  Change Import Path
</Button>
```

**API Available**: `api.openFolderDialog()` already exists in `src/lib/tauri.ts`

---

### 3. Debug "Enable Logging" Checkbox Not Wired 🟠 HIGH
**File**: `src/components/settings/SettingsDialog.tsx`  
**Lines**: Advanced tab  
**Problem**:
- Checkbox renders but doesn't bind to any state
- No backend/store integration

**Fix** (Option A - Frontend Only):
```typescript
// Add to UserPreferences type
export interface UserPreferences {
  // ... existing fields
  debugLogging?: boolean
}

// In SettingsDialog.tsx
<Checkbox
  checked={preferences.debugLogging ?? false}
  onCheckedChange={(checked) => 
    updateGeneralSettings({ debugLogging: checked as boolean })
  }
/>

// Use in logger utility
// src/lib/logger.ts
const isDev = import.meta.env.DEV
const debugEnabled = () => {
  const prefs = usePreferencesStore.getState().preferences
  return isDev || prefs?.debugLogging
}

export const logger = {
  debug: (...args: any[]) => debugEnabled() && console.debug('[Shiori]', ...args),
  // ... rest
}
```

**Fix** (Option B - Backend Integration):
```rust
// Add debug_logging field to Rust preferences struct
// Expose as Tauri command to toggle log level
```

---

## MISSING SETTINGS (Add These)

### Appearance Settings (5 missing)

#### 1. Accent Color Picker
```typescript
<div className="space-y-2">
  <Label>Accent Color</Label>
  <div className="flex items-center gap-2">
    <input
      type="color"
      value={preferences.accentColor || '#3b82f6'}
      onChange={(e) => updateGeneralSettings({ accentColor: e.target.value })}
      className="w-12 h-12 rounded cursor-pointer"
    />
    <Button
      variant="outline"
      size="sm"
      onClick={() => updateGeneralSettings({ accentColor: '#3b82f6' })}
    >
      Reset to Default
    </Button>
  </div>
  <p className="text-sm text-muted-foreground">
    Used for buttons, links, and highlights
  </p>
</div>
```

#### 2. UI Font Family
```typescript
<Select
  value={preferences.uiFontFamily || 'system'}
  onValueChange={(val) => updateGeneralSettings({ uiFontFamily: val })}
>
  <SelectTrigger>
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="system">System Default</SelectItem>
    <SelectItem value="inter">Inter</SelectItem>
    <SelectItem value="roboto">Roboto</SelectItem>
    <SelectItem value="open-sans">Open Sans</SelectItem>
  </SelectContent>
</Select>
```

#### 3. Theme Variants (System/Auto)
```typescript
// Expand theme options
<Select
  value={preferences.theme || 'light'}
  onValueChange={(val) => updateTheme(val as Theme)}
>
  <SelectTrigger><SelectValue /></SelectTrigger>
  <SelectContent>
    <SelectItem value="light">Light</SelectItem>
    <SelectItem value="dark">Dark</SelectItem>
    <SelectItem value="system">System (Auto)</SelectItem>
    <SelectItem value="sepia">Sepia</SelectItem>
    <SelectItem value="high-contrast">High Contrast</SelectItem>
  </SelectContent>
</Select>
```

#### 4. Animation Speed
```typescript
<div className="space-y-2">
  <Label>Animation Speed</Label>
  <Slider
    min={0}
    max={2}
    step={0.1}
    value={[preferences.book.animationSpeed || 1.0]}
    onValueChange={([val]) => updateBookDefaults({ animationSpeed: val })}
  />
  <div className="flex justify-between text-sm text-muted-foreground">
    <span>Slow</span>
    <span>{preferences.book.animationSpeed?.toFixed(1)}x</span>
    <span>Fast</span>
  </div>
</div>
```

#### 5. Cover Size Preference
```typescript
<RadioGroup
  value={preferences.coverSize || 'medium'}
  onValueChange={(val) => updateGeneralSettings({ coverSize: val })}
>
  <div className="flex items-center space-x-2">
    <RadioGroupItem value="small" id="cover-small" />
    <Label htmlFor="cover-small">Small (150px)</Label>
  </div>
  <div className="flex items-center space-x-2">
    <RadioGroupItem value="medium" id="cover-medium" />
    <Label htmlFor="cover-medium">Medium (200px)</Label>
  </div>
  <div className="flex items-center space-x-2">
    <RadioGroupItem value="large" id="cover-large" />
    <Label htmlFor="cover-large">Large (300px)</Label>
  </div>
</RadioGroup>
```

---

### Book Reading Settings (3 missing)

#### 1. Custom CSS Injection
```typescript
<div className="space-y-2">
  <Label>Custom CSS</Label>
  <Textarea
    value={preferences.book.customCSS || ''}
    onChange={(e) => updateBookDefaults({ customCSS: e.target.value })}
    placeholder="/* Custom reader styles */&#10;body { font-family: 'Comic Sans'; }"
    className="font-mono text-sm"
    rows={6}
  />
  <p className="text-sm text-muted-foreground">
    Advanced: Inject custom CSS into book reader
  </p>
</div>
```

#### 2. Dual-Page/Two-Column Mode
```typescript
<div className="flex items-center justify-between">
  <div>
    <Label>Two-Page Spread</Label>
    <p className="text-sm text-muted-foreground">
      Display two pages side-by-side (desktop only)
    </p>
  </div>
  <Switch
    checked={preferences.book.twoPageSpread || false}
    onCheckedChange={(checked) => updateBookDefaults({ twoPageSpread: checked })}
  />
</div>
```

#### 3. Margin Controls
```typescript
<div className="space-y-2">
  <Label>Reader Margins</Label>
  <Slider
    min={0}
    max={100}
    value={[preferences.book.marginSize || 20]}
    onValueChange={([val]) => updateBookDefaults({ marginSize: val })}
  />
  <span className="text-sm text-muted-foreground">
    {preferences.book.marginSize || 20}px
  </span>
</div>
```

---

### Manga Reading Settings (2 missing)

#### 1. Background Color
```typescript
<div className="space-y-2">
  <Label>Background Color</Label>
  <div className="flex items-center gap-2">
    <input
      type="color"
      value={preferences.manga.backgroundColor || '#000000'}
      onChange={(e) => updateMangaDefaults({ backgroundColor: e.target.value })}
      className="w-12 h-12 rounded cursor-pointer"
    />
    <Button
      variant="outline"
      size="sm"
      onClick={() => updateMangaDefaults({ backgroundColor: '#000000' })}
    >
      Reset
    </Button>
  </div>
</div>
```

#### 2. Advanced Reading Modes
```typescript
// Expand mode options
<Select
  value={preferences.manga.mode}
  onValueChange={(val) => updateMangaDefaults({ mode: val })}
>
  <SelectTrigger><SelectValue /></SelectTrigger>
  <SelectContent>
    <SelectItem value="single">Single Page</SelectItem>
    <SelectItem value="double">Double Page</SelectItem>
    <SelectItem value="long-strip">Long Strip (Webtoon)</SelectItem>
    <SelectItem value="manhwa">Manhwa (Scroll)</SelectItem>
    <SelectItem value="comic">Western Comic</SelectItem>
  </SelectContent>
</Select>
```

---

### Library Settings (8 missing)

#### 1. Default Sort Order
```typescript
<Select
  value={preferences.defaultSortOrder || 'title-asc'}
  onValueChange={(val) => updateGeneralSettings({ defaultSortOrder: val })}
>
  <SelectTrigger><SelectValue /></SelectTrigger>
  <SelectContent>
    <SelectItem value="title-asc">Title (A-Z)</SelectItem>
    <SelectItem value="title-desc">Title (Z-A)</SelectItem>
    <SelectItem value="author-asc">Author (A-Z)</SelectItem>
    <SelectItem value="date-added-desc">Recently Added</SelectItem>
    <SelectItem value="date-added-asc">Oldest First</SelectItem>
    <SelectItem value="last-read-desc">Recently Read</SelectItem>
  </SelectContent>
</Select>
```

#### 2. Default View Mode
```typescript
<RadioGroup
  value={preferences.defaultViewMode || 'grid'}
  onValueChange={(val) => updateGeneralSettings({ defaultViewMode: val })}
>
  <div className="flex items-center space-x-2">
    <RadioGroupItem value="grid" id="view-grid" />
    <Label htmlFor="view-grid">Grid</Label>
  </div>
  <div className="flex items-center space-x-2">
    <RadioGroupItem value="list" id="view-list" />
    <Label htmlFor="view-list">List</Label>
  </div>
  <div className="flex items-center space-x-2">
    <RadioGroupItem value="table" id="view-table" />
    <Label htmlFor="view-table">Table</Label>
  </div>
</RadioGroup>
```

#### 3. Auto-Scan Folder
```typescript
<div className="space-y-4">
  <div className="flex items-center justify-between">
    <div>
      <Label>Auto-Scan Library Folders</Label>
      <p className="text-sm text-muted-foreground">
        Automatically import new books when detected
      </p>
    </div>
    <Switch
      checked={preferences.autoScanEnabled || false}
      onCheckedChange={(checked) => updateGeneralSettings({ autoScanEnabled: checked })}
    />
  </div>
  
  {preferences.autoScanEnabled && (
    <Select
      value={String(preferences.autoScanIntervalMinutes || 60)}
      onValueChange={(val) => updateGeneralSettings({ autoScanIntervalMinutes: Number(val) })}
    >
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="5">Every 5 minutes</SelectItem>
        <SelectItem value="15">Every 15 minutes</SelectItem>
        <SelectItem value="30">Every 30 minutes</SelectItem>
        <SelectItem value="60">Every hour</SelectItem>
        <SelectItem value="1440">Once per day</SelectItem>
      </SelectContent>
    </Select>
  )}
</div>
```

#### 4. Duplicate Handling Policy
```typescript
<Select
  value={preferences.duplicateHandling || 'skip'}
  onValueChange={(val) => updateGeneralSettings({ duplicateHandling: val })}
>
  <SelectTrigger><SelectValue /></SelectTrigger>
  <SelectContent>
    <SelectItem value="skip">Skip Duplicates</SelectItem>
    <SelectItem value="overwrite">Overwrite Existing</SelectItem>
    <SelectItem value="keep-both">Keep Both</SelectItem>
    <SelectItem value="ask">Ask Each Time</SelectItem>
  </SelectContent>
</Select>
```

#### 5. Metadata Fetch Policy
```typescript
<Select
  value={preferences.metadataMode || 'auto'}
  onValueChange={(val) => updateGeneralSettings({ metadataMode: val })}
>
  <SelectTrigger><SelectValue /></SelectTrigger>
  <SelectContent>
    <SelectItem value="auto">Auto-fetch (Online)</SelectItem>
    <SelectItem value="embedded-only">Embedded Only (Offline)</SelectItem>
    <SelectItem value="manual">Manual Only</SelectItem>
  </SelectContent>
</Select>
```

#### 6. Auto-Fetch Covers
```typescript
<div className="flex items-center justify-between">
  <div>
    <Label>Auto-fetch Cover Images</Label>
    <p className="text-sm text-muted-foreground">
      Download covers from online providers when missing
    </p>
  </div>
  <Switch
    checked={preferences.autoFetchCovers ?? true}
    onCheckedChange={(checked) => updateGeneralSettings({ autoFetchCovers: checked })}
  />
</div>
```

#### 7. Daily Reading Goal
```typescript
<div className="space-y-2">
  <Label>Daily Reading Goal</Label>
  <div className="flex items-center gap-2">
    <Slider
      min={0}
      max={180}
      step={5}
      value={[preferences.dailyReadingGoalMinutes || 30]}
      onValueChange={([val]) => updateGeneralSettings({ dailyReadingGoalMinutes: val })}
      className="flex-1"
    />
    <span className="text-sm text-muted-foreground w-16 text-right">
      {preferences.dailyReadingGoalMinutes || 30} min
    </span>
  </div>
</div>
```

#### 8. Library Display Density
```typescript
<RadioGroup
  value={preferences.libraryDensity || 'comfortable'}
  onValueChange={(val) => updateGeneralSettings({ libraryDensity: val })}
>
  <div className="flex items-center space-x-2">
    <RadioGroupItem value="compact" id="density-compact" />
    <Label htmlFor="density-compact">Compact (More items)</Label>
  </div>
  <div className="flex items-center space-x-2">
    <RadioGroupItem value="comfortable" id="density-comfortable" />
    <Label htmlFor="density-comfortable">Comfortable</Label>
  </div>
  <div className="flex items-center space-x-2">
    <RadioGroupItem value="spacious" id="density-spacious" />
    <Label htmlFor="density-spacious">Spacious (Fewer items)</Label>
  </div>
</RadioGroup>
```

---

### Storage Settings (3 missing)

#### 1. Cache Stats Display
```typescript
const [cacheStats, setCacheStats] = useState<{
  total_size_bytes: number
  item_count: number
} | null>(null)

useEffect(() => {
  const loadCacheStats = async () => {
    try {
      const stats = await api.getRendererCacheStats()
      setCacheStats(stats)
    } catch (error) {
      logger.error('Failed to load cache stats:', error)
    }
  }
  loadCacheStats()
}, [])

// In JSX
<div className="rounded-lg border p-4 space-y-2">
  <div className="flex items-center justify-between">
    <span className="text-sm font-medium">Renderer Cache</span>
    <Button
      variant="outline"
      size="sm"
      onClick={handleClearCache}
    >
      <Trash2 size={16} />
      Clear Cache
    </Button>
  </div>
  
  {cacheStats && (
    <div className="text-sm text-muted-foreground">
      <div>Items: {cacheStats.item_count}</div>
      <div>Size: {formatBytes(cacheStats.total_size_bytes)}</div>
    </div>
  )}
</div>
```

#### 2. Cache Size Limit
```typescript
<div className="space-y-2">
  <Label>Max Cache Size</Label>
  <Select
    value={String(preferences.cacheSizeLimitMB || 500)}
    onValueChange={(val) => updateGeneralSettings({ cacheSizeLimitMB: Number(val) })}
  >
    <SelectTrigger><SelectValue /></SelectTrigger>
    <SelectContent>
      <SelectItem value="100">100 MB</SelectItem>
      <SelectItem value="250">250 MB</SelectItem>
      <SelectItem value="500">500 MB (Default)</SelectItem>
      <SelectItem value="1000">1 GB</SelectItem>
      <SelectItem value="2000">2 GB</SelectItem>
      <SelectItem value="-1">Unlimited</SelectItem>
    </SelectContent>
  </Select>
</div>
```

#### 3. Auto-Clear Cache Policy
```typescript
<Select
  value={preferences.cacheClearPolicy || 'manual'}
  onValueChange={(val) => updateGeneralSettings({ cacheClearPolicy: val })}
>
  <SelectTrigger><SelectValue /></SelectTrigger>
  <SelectContent>
    <SelectItem value="manual">Manual Only</SelectItem>
    <SelectItem value="on-startup">On Startup</SelectItem>
    <SelectItem value="weekly">Weekly</SelectItem>
    <SelectItem value="monthly">Monthly</SelectItem>
  </SelectContent>
</Select>
```

---

### Privacy Settings (NEW TAB - 4 settings)

```typescript
const PrivacySettings = () => (
  <div className="space-y-6">
    <div>
      <h3 className="text-lg font-semibold mb-4">Privacy & Data</h3>
    </div>
    
    {/* Analytics Opt-Out */}
    <div className="flex items-center justify-between">
      <div>
        <Label>Send Anonymous Usage Statistics</Label>
        <p className="text-sm text-muted-foreground">
          Help improve Shiori by sending anonymous usage data
        </p>
      </div>
      <Switch
        checked={preferences.sendAnalytics ?? false}
        onCheckedChange={(checked) => updateGeneralSettings({ sendAnalytics: checked })}
      />
    </div>
    
    {/* Crash Reporting */}
    <div className="flex items-center justify-between">
      <div>
        <Label>Send Crash Reports</Label>
        <p className="text-sm text-muted-foreground">
          Automatically report crashes to help fix bugs
        </p>
      </div>
      <Switch
        checked={preferences.sendCrashReports ?? false}
        onCheckedChange={(checked) => updateGeneralSettings({ sendCrashReports: checked })}
      />
    </div>
    
    {/* Reading History Retention */}
    <div className="space-y-2">
      <Label>Reading History Retention</Label>
      <Select
        value={String(preferences.historyRetentionDays || -1)}
        onValueChange={(val) => updateGeneralSettings({ historyRetentionDays: Number(val) })}
      >
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="-1">Keep Forever</SelectItem>
          <SelectItem value="30">30 Days</SelectItem>
          <SelectItem value="90">90 Days</SelectItem>
          <SelectItem value="180">6 Months</SelectItem>
          <SelectItem value="365">1 Year</SelectItem>
        </SelectContent>
      </Select>
    </div>
    
    {/* Clear All Data */}
    <div className="space-y-2">
      <Label className="text-destructive">Data Management</Label>
      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={() => {/* Clear reading history */}}
        >
          Clear Reading History
        </Button>
        <Button
          variant="outline"
          onClick={() => {/* Clear all preferences */}}
        >
          Reset All Settings
        </Button>
      </div>
    </div>
  </div>
)
```

---

### About Section (NEW TAB - 6 items)

```typescript
const AboutSettings = () => {
  const [appVersion, setAppVersion] = useState<string>('')
  
  useEffect(() => {
    // Get version from package.json or Tauri
    setAppVersion(import.meta.env.VITE_APP_VERSION || '1.0.0')
  }, [])
  
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">Shiori eBook Manager</h3>
        <p className="text-sm text-muted-foreground">Version {appVersion}</p>
      </div>
      
      {/* Update Check */}
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div>
          <div className="font-medium">Check for Updates</div>
          <div className="text-sm text-muted-foreground">
            You're running version {appVersion}
          </div>
        </div>
        <Button variant="outline">
          <RefreshCw size={16} />
          Check Now
        </Button>
      </div>
      
      {/* Links */}
      <div className="space-y-2">
        <a
          href="https://github.com/yourusername/shiori"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent transition-colors"
        >
          <span className="text-sm font-medium">GitHub Repository</span>
          <ExternalLink size={16} />
        </a>
        
        <a
          href="https://github.com/yourusername/shiori/releases"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent transition-colors"
        >
          <span className="text-sm font-medium">Changelog</span>
          <ExternalLink size={16} />
        </a>
        
        <a
          href="https://github.com/yourusername/shiori/blob/main/LICENSE"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent transition-colors"
        >
          <span className="text-sm font-medium">License</span>
          <ExternalLink size={16} />
        </a>
        
        <a
          href="https://github.com/yourusername/shiori/issues"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent transition-colors"
        >
          <span className="text-sm font-medium">Report an Issue</span>
          <ExternalLink size={16} />
        </a>
      </div>
      
      {/* Credits */}
      <div className="space-y-2">
        <Label>Open Source Credits</Label>
        <div className="text-sm text-muted-foreground space-y-1">
          <p>Built with Tauri, React, TypeScript</p>
          <p>Icons by Lucide</p>
          <p>UI Components by Radix UI</p>
        </div>
      </div>
    </div>
  )
}
```

---

## UX IMPROVEMENTS

### 1. Settings Search (Client-Side Filtering)

```typescript
const [searchQuery, setSearchQuery] = useState('')

// Filter sections by search
const filteredSections = useMemo(() => {
  if (!searchQuery) return allSections
  
  const query = searchQuery.toLowerCase()
  return allSections.filter(section => {
    // Match section title or setting labels
    return section.title.toLowerCase().includes(query) ||
           section.settings.some(setting => 
             setting.label.toLowerCase().includes(query) ||
             setting.description?.toLowerCase().includes(query)
           )
  })
}, [searchQuery, allSections])

// In JSX (above tabs)
<div className="relative mb-4">
  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
  <Input
    type="search"
    placeholder="Search settings..."
    value={searchQuery}
    onChange={(e) => setSearchQuery(e.target.value)}
    className="pl-10"
  />
  {searchQuery && (
    <Button
      variant="ghost"
      size="sm"
      className="absolute right-2 top-1/2 -translate-y-1/2"
      onClick={() => setSearchQuery('')}
    >
      <X size={16} />
    </Button>
  )}
</div>
```

---

### 2. Live Visual Previews

#### Font/Reading Preview
```typescript
const [previewText] = useState(
  "The quick brown fox jumps over the lazy dog. This is a sample text to preview your reading settings in real-time."
)

<div className="rounded-lg border p-6 bg-background">
  <Label className="mb-4 block">Preview</Label>
  <div
    style={{
      fontFamily: preferences.book.fontFamily,
      fontSize: `${preferences.book.fontSize}px`,
      lineHeight: preferences.book.lineHeight,
      textAlign: preferences.book.justification,
      maxWidth: `${preferences.book.pageWidth}px`,
      margin: '0 auto'
    }}
  >
    {previewText}
  </div>
</div>
```

#### Theme Preview
```typescript
<div className="grid grid-cols-2 gap-4">
  {themes.map(theme => (
    <button
      key={theme.value}
      className={cn(
        "rounded-lg border-2 p-4 text-left transition-all",
        preferences.theme === theme.value && "border-primary ring-2 ring-primary/20"
      )}
      onClick={() => updateTheme(theme.value)}
      data-theme={theme.value}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="w-4 h-4 rounded-full bg-primary" />
        <span className="font-medium">{theme.label}</span>
      </div>
      <div className="text-sm text-muted-foreground">
        Sample text in {theme.label} theme
      </div>
    </button>
  ))}
</div>
```

#### Manga Layout Preview
```typescript
<div className="grid grid-cols-3 gap-4">
  {mangaModes.map(mode => (
    <button
      key={mode.value}
      className={cn(
        "rounded-lg border-2 p-4 text-center transition-all",
        preferences.manga.mode === mode.value && "border-primary"
      )}
      onClick={() => updateMangaDefaults({ mode: mode.value })}
    >
      {mode.icon}
      <div className="mt-2 text-sm font-medium">{mode.label}</div>
    </button>
  ))}
</div>
```

---

### 3. Reset to Defaults (Global + Per-Section)

```typescript
// Global reset
const handleResetAll = async () => {
  const confirmed = await showConfirmDialog({
    title: 'Reset All Settings?',
    description: 'This will reset all settings to their default values. This action cannot be undone.',
    confirmText: 'Reset All',
    confirmVariant: 'destructive'
  })
  
  if (confirmed) {
    try {
      await api.updateUserPreferences(DEFAULT_USER_PREFERENCES)
      await loadPreferences()
      toast.success('All settings reset to defaults')
    } catch (error) {
      toast.error('Failed to reset settings')
    }
  }
}

// Per-section reset
const handleResetAppearance = async () => {
  try {
    await updateGeneralSettings({
      theme: DEFAULT_USER_PREFERENCES.theme,
      accentColor: DEFAULT_USER_PREFERENCES.accentColor,
      uiDensity: DEFAULT_USER_PREFERENCES.uiDensity,
      uiScale: DEFAULT_USER_PREFERENCES.uiScale
    })
    toast.success('Appearance settings reset')
  } catch (error) {
    toast.error('Failed to reset appearance settings')
  }
}

// In JSX (section header)
<div className="flex items-center justify-between mb-4">
  <h3 className="text-lg font-semibold">Appearance</h3>
  <Button
    variant="ghost"
    size="sm"
    onClick={handleResetAppearance}
  >
    <RotateCcw size={16} />
    Reset Section
  </Button>
</div>
```

---

### 4. Improved Accessibility (Use Radix Tabs)

```typescript
import * as Tabs from '@radix-ui/react-tabs'

<Tabs.Root value={activeTab} onValueChange={setActiveTab} className="flex gap-6">
  {/* Sidebar */}
  <Tabs.List
    className="w-48 flex flex-col space-y-1"
    aria-label="Settings categories"
  >
    <Tabs.Trigger
      value="appearance"
      className={cn(
        "flex items-center gap-3 px-4 py-2 rounded-lg text-left transition-colors",
        "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        activeTab === 'appearance' && "bg-accent font-medium"
      )}
    >
      <Palette size={18} />
      Appearance
    </Tabs.Trigger>
    {/* Other tabs */}
  </Tabs.List>
  
  {/* Content */}
  <div className="flex-1">
    <Tabs.Content value="appearance" className="focus-visible:outline-none">
      <AppearanceSettings />
    </Tabs.Content>
    {/* Other panels */}
  </div>
</Tabs.Root>
```

**Benefits**:
- Auto-manages `aria-selected`, `role="tab"`, `role="tablist"`
- Arrow key navigation (↑/↓ to switch tabs)
- Proper focus management
- Screen reader announcements

---

### 5. Change Indicators & Saving Feedback

```typescript
const [savingStates, setSavingStates] = useState<Record<string, boolean>>({})

const handleSettingChange = async (key: string, value: any) => {
  setSavingStates(prev => ({ ...prev, [key]: true }))
  
  try {
    await updateGeneralSettings({ [key]: value })
    setSavingStates(prev => ({ ...prev, [key]: false }))
    
    // Optional: Show saved indicator briefly
    toast.success('Saved', { duration: 1000 })
  } catch (error) {
    setSavingStates(prev => ({ ...prev, [key]: false }))
    toast.error(`Failed to save ${key}`)
  }
}

// In JSX
<div className="flex items-center gap-2">
  <Switch
    checked={preferences.autoStart}
    onCheckedChange={(checked) => handleSettingChange('autoStart', checked)}
    disabled={savingStates.autoStart}
  />
  {savingStates.autoStart && (
    <Loader2 size={16} className="animate-spin text-muted-foreground" />
  )}
</div>
```

---

### 6. Tooltips & Help Text

```typescript
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip'

<div className="flex items-center gap-2">
  <Label>GPU Acceleration</Label>
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <button className="text-muted-foreground hover:text-foreground transition-colors">
          <HelpCircle size={16} />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p>
          Uses your graphics card to render images faster. Disable if you experience display issues.
        </p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
</div>
```

---

### 7. Keyboard Shortcut Cheatsheet

```typescript
// Add button to settings header
<Button
  variant="outline"
  size="sm"
  onClick={() => setShowShortcutsDialog(true)}
>
  <Keyboard size={16} />
  Keyboard Shortcuts
</Button>

// Shortcuts dialog
<Dialog open={showShortcutsDialog} onOpenChange={setShowShortcutsDialog}>
  <DialogContent className="max-w-2xl">
    <DialogHeader>
      <DialogTitle>Keyboard Shortcuts</DialogTitle>
    </DialogHeader>
    
    <div className="grid grid-cols-2 gap-6">
      <div>
        <h4 className="font-semibold mb-2">Navigation</h4>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span>Open Settings</span>
            <kbd className="px-2 py-1 bg-muted rounded">Ctrl+,</kbd>
          </div>
          <div className="flex justify-between">
            <span>Close Settings</span>
            <kbd className="px-2 py-1 bg-muted rounded">Esc</kbd>
          </div>
          <div className="flex justify-between">
            <span>Next Tab</span>
            <kbd className="px-2 py-1 bg-muted rounded">↓</kbd>
          </div>
        </div>
      </div>
      
      {/* More sections */}
    </div>
  </DialogContent>
</Dialog>
```

---

## IMPLEMENTATION PLAN

### Phase 1: Critical Fixes (Day 1)
- [ ] Fix paragraph spacing units mismatch
- [ ] Implement "Change Import Path" button
- [ ] Wire "Enable Logging" checkbox
- [ ] Fix theme string values (use 'light'/'dark')

### Phase 2: Missing Settings (Day 2-3)
- [ ] Add 5 appearance settings (accent color, font, system theme, animation, cover size)
- [ ] Add 3 book reading settings (custom CSS, two-page, margins)
- [ ] Add 2 manga settings (background color, advanced modes)
- [ ] Add 8 library settings (sort, view, auto-scan, duplicates, metadata, covers, goal, density)

### Phase 3: Storage & Privacy (Day 4)
- [ ] Add cache stats display + size limit + auto-clear
- [ ] Create Privacy tab (4 settings)
- [ ] Create About tab (version, links, credits)

### Phase 4: UX Polish (Day 5-6)
- [ ] Implement settings search
- [ ] Add live visual previews (font, theme, manga)
- [ ] Add reset buttons (global + per-section)
- [ ] Replace plain tabs with Radix Tabs (accessibility)
- [ ] Add saving indicators + change feedback
- [ ] Add tooltips to all settings

### Phase 5: Final Polish (Day 7)
- [ ] Keyboard shortcut cheatsheet
- [ ] Responsive mobile layout
- [ ] Test all settings save/load correctly
- [ ] Update Settings tests
- [ ] Document new settings in README

---

## FILES TO MODIFY

```
src/
├── types/
│   └── preferences.ts                    [MODIFY] - Add missing fields
├── store/
│   └── preferencesStore.ts              [MODIFY] - Handle new settings
├── components/
│   └── settings/
│       ├── SettingsDialog.tsx           [MAJOR REWRITE] - Implement all changes
│       ├── AppearanceSettings.tsx       [NEW] - Extract appearance section
│       ├── BookReadingSettings.tsx      [NEW] - Extract book section
│       ├── MangaReadingSettings.tsx     [NEW] - Extract manga section
│       ├── LibrarySettings.tsx          [NEW] - Extract library section
│       ├── StorageSettings.tsx          [NEW] - Extract storage section
│       ├── PrivacySettings.tsx          [NEW] - New privacy tab
│       ├── AboutSettings.tsx            [NEW] - New about tab
│       ├── SettingsSearch.tsx           [NEW] - Search component
│       └── SettingsPreview.tsx          [NEW] - Preview components
└── lib/
    └── logger.ts                         [MODIFY] - Add debug flag support
```

---

## TESTING CHECKLIST

### Unit Tests
- [ ] Theme updates correctly
- [ ] Paragraph spacing with em units
- [ ] Import path selection
- [ ] Settings search filters correctly
- [ ] Reset functions restore defaults

### Integration Tests
- [ ] All settings persist across app restarts
- [ ] Live previews update in real-time
- [ ] Cache stats load correctly
- [ ] Keyboard navigation works in tabs

### Accessibility Tests
- [ ] Screen reader announces tab changes
- [ ] All controls keyboard accessible
- [ ] Focus management correct
- [ ] Color contrast meets WCAG AA

---

## SUCCESS METRICS

- ✅ All 40+ missing settings exposed
- ✅ Zero unimplemented buttons/controls
- ✅ Settings search works
- ✅ Live previews functional
- ✅ WCAG 2.1 Level AA compliant
- ✅ Mobile responsive
- ✅ All settings persist correctly

---

**Estimated Time**: 5-7 days  
**Complexity**: Medium-High  
**User Impact**: ⭐⭐⭐⭐⭐ (Very High)
