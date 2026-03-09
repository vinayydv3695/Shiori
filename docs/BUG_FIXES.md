# Critical Bug Fixes & Error Handling Improvements

**Generated**: March 8, 2026  
**Status**: Ready for Implementation  
**Audit Sources**: UI/UX Component Audit, State Management Audit

---

## CRITICAL PRIORITY (Fix Immediately)

### 1. Theme System Type Mismatch (BREAKING BUG)
**File**: `src/hooks/useTheme.ts`  
**Lines**: 12, 18-20  
**Severity**: 🔴 **CRITICAL** - Breaks theme toggling system-wide

**Problem**:
```typescript
// Current (WRONG)
const theme: Theme = preferences?.theme ?? 'white'
toggleTheme uses 'black' / 'white'

// Expected (types/preferences.ts)
Theme = 'light' | 'dark' | ...
```

**Impact**: Theme toggles fail, inconsistent theme state across app, user-visible break.

**Fix**:
```typescript
// src/hooks/useTheme.ts
const theme: Theme = preferences?.theme ?? 'light'  // Change 'white' → 'light'

const toggleTheme = () => {
  const newTheme = theme === 'light' ? 'dark' : 'light'  // Change 'white'/'black' → 'light'/'dark'
  updateTheme(newTheme)
}
```

**Verification**:
- [ ] Theme toggle works in UI
- [ ] `data-theme` attribute updates correctly
- [ ] Settings dialog reflects correct theme

---

### 2. Reading Progress State After Unmount
**File**: `src/hooks/useReadingProgress.ts`  
**Lines**: 49-78 (flush function)  
**Severity**: 🔴 **CRITICAL** - React warnings, incorrect state updates

**Problem**:
- `flush()` is async and calls `setProgress(saved)` after component unmounts
- Unmount handler invokes `void flush()` with no cancellation guard
- Leads to "setState on unmounted component" warnings

**Fix**:
```typescript
// Add cancellation guard
const flush = useCallback(async () => {
  if (!bookIdRef.current || !progress) return

  try {
    const saved = await api.saveReadingProgress(bookIdRef.current, progress)
    if (!mountedRef.current) return  // ✅ Guard before setState
    setProgress(saved)
  } catch (error) {
    if (!mountedRef.current) return  // ✅ Guard before setState
    console.error('Failed to save reading progress:', error)
  }
}, [progress, bookIdRef])

// Add mounted ref
const mountedRef = useRef(true)

useEffect(() => {
  return () => {
    mountedRef.current = false
    void flush()  // Will check mountedRef before setState
  }
}, [flush])
```

**Alternative Fix** (cleaner):
```typescript
// Fire-and-forget on unmount (no setState)
const flushOnly = async () => {
  if (!bookIdRef.current || !progress) return
  try {
    await api.saveReadingProgress(bookIdRef.current, progress)
    // No setProgress — avoid setState on unmount
  } catch (error) {
    console.error('Failed to save reading progress on unmount:', error)
  }
}

useEffect(() => {
  return () => {
    void flushOnly()
  }
}, [progress, bookIdRef])
```

---

### 3. Circular Parent Collection Bug
**File**: `src/components/collections/CreateCollectionDialog.tsx`  
**Line**: 151 (TODO comment)  
**Severity**: 🔴 **HIGH** - Allows circular parent assignments

**Problem**:
```typescript
// TODO: Also exclude descendants (would need recursive check)
```
- Currently only excludes self when selecting parent
- User can set Collection A → parent: B, then B → parent: A (circular reference)
- Causes infinite loops in UI rendering

**Fix**:
```typescript
// Add recursive descendant check
const getDescendantIds = (collectionId: number, allCollections: Collection[]): Set<number> => {
  const descendants = new Set<number>()
  
  const findChildren = (id: number) => {
    allCollections.forEach(col => {
      if (col.parentId === id && !descendants.has(col.id)) {
        descendants.add(col.id)
        findChildren(col.id)
      }
    })
  }
  
  findChildren(collectionId)
  return descendants
}

// In getAvailableParentCollections:
const descendantIds = getDescendantIds(collection.id, allCollections)
return allCollections.filter(col => 
  col.id !== collection.id &&  // Exclude self
  !descendantIds.has(col.id)   // ✅ Exclude descendants
)
```

**Test Case**:
1. Create Collection A
2. Create Collection B with parent: A
3. Try to edit A and set parent: B
4. Should be disabled with tooltip: "Cannot create circular reference"

---

### 4. Keyboard Shortcut Modifier Logic Bug
**File**: `src/hooks/useKeyboardShortcuts.ts`  
**Lines**: 37-51  
**Severity**: 🔴 **HIGH** - Shortcuts don't match when they should

**Problem**:
- Modifier matching requires absent modifiers to be "not pressed"
- Over-constrains matching (e.g., Ctrl+S fails if Shift is also held)
- Confusing nested ternary logic

**Current (buggy)**:
```typescript
const shiftMatch = shortcut.modifiers.includes('shift')
  ? event.shiftKey
  : !event.shiftKey  // ❌ Forces shift to be NOT pressed

const allModifiersMatch = metaMatch && ctrlMatch && shiftMatch && altMatch  // ❌ Wrong
```

**Fix**:
```typescript
// Simplified boolean checks
const modifiers = {
  cmd: shortcut.modifiers.includes('cmd'),
  ctrl: shortcut.modifiers.includes('ctrl'),
  shift: shortcut.modifiers.includes('shift'),
  alt: shortcut.modifiers.includes('alt')
}

const isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform)

const allModifiersMatch = 
  (modifiers.cmd ? (isMac ? event.metaKey : event.ctrlKey) : true) &&
  (modifiers.ctrl ? event.ctrlKey : true) &&
  (modifiers.shift ? event.shiftKey : true) &&
  (modifiers.alt ? event.altKey : true)

// Only require specified modifiers to be present
// Don't require unspecified modifiers to be absent
```

**Test Cases**:
- `Ctrl+S` should match even if Shift is held
- `Ctrl+Shift+S` should only match when both are held
- `S` alone should NOT match when Ctrl is held

---

## HIGH PRIORITY

### 5. Reader Controls Inaccessible on Touch/Keyboard
**File**: `src/components/reader/GenericHtmlReader.tsx`  
**Lines**: 59-93 (auto-hide topbar)  
**Severity**: 🟠 **HIGH** - Core reader UX broken on mobile/touch

**Problem**:
- Auto-hide topbar triggered only by `mousemove`
- No way for keyboard/touch users to reveal controls
- Focus mode hides topbar permanently

**Fix**:
```typescript
// Add keyboard shortcut to toggle topbar
useEffect(() => {
  const handleKeyPress = (e: KeyboardEvent) => {
    if (e.key === 't' || e.key === 'T') {
      setShowTopBar(prev => !prev)
    }
  }
  
  document.addEventListener('keydown', handleKeyPress)
  return () => document.removeEventListener('keydown', handleKeyPress)
}, [])

// Add touch-friendly floating button
{!showTopBar && (
  <button
    className="fixed top-4 right-4 z-50 bg-black/50 text-white rounded-full p-3 touch-target"
    onClick={() => setShowTopBar(true)}
    aria-label="Show controls"
  >
    <MenuIcon size={24} />
  </button>
)}

// Reveal on focus-in (keyboard nav)
const handleFocus = () => setShowTopBar(true)
```

**CSS**:
```css
.touch-target {
  min-width: 44px;
  min-height: 44px;
}
```

---

### 6. Series Management Destructive Actions Missing Confirmation
**File**: `src/components/library/SeriesManagementDialog.tsx`  
**Lines**: 120-129 (handleMerge), 110-117 (handleRemoveVolume)  
**Severity**: 🟠 **HIGH** - Data loss risk

**Problem**:
- Merge series (moves volumes + deletes source) has NO confirmation
- Remove volume has NO confirmation (inconsistent with delete collection)
- Errors only logged to console

**Fix**:
```typescript
// Add confirmation dialog for merge
const [confirmMergeOpen, setConfirmMergeOpen] = useState(false)
const [mergeTarget, setMergeTarget] = useState<SeriesGroup | null>(null)

const handleMergeClick = (target: SeriesGroup) => {
  setMergeTarget(target)
  setConfirmMergeOpen(true)
}

const handleMergeConfirm = async () => {
  if (!mergeTarget) return
  
  try {
    // Show what will happen
    const message = `This will:
    • Move ${series.volumes.length} volumes to "${mergeTarget.title}"
    • Delete the series "${series.title}"
    • This action cannot be undone`
    
    await handleMerge(mergeTarget)
    toast.success('Series merged successfully')
  } catch (error) {
    toast.error(`Failed to merge series: ${error.message}`)
  } finally {
    setConfirmMergeOpen(false)
  }
}

// Add undo toast for remove volume
const handleRemoveVolume = async (bookId: number) => {
  try {
    await api.removeBookFromSeries(bookId)
    
    // Store removed book for undo
    const removed = series.volumes.find(v => v.id === bookId)
    
    toast.success('Volume removed', {
      action: {
        label: 'Undo',
        onClick: async () => {
          await api.assignBookToSeries(bookId, series.title, removed.series_index)
          await loadData()
        }
      }
    })
    
    await loadData()
  } catch (error) {
    toast.error(`Failed to remove volume: ${error.message}`)
  }
}
```

---

### 7. Collection Drag-Drop Lacks Keyboard Alternative
**File**: `src/components/collections/CollectionSidebar.tsx`  
**Lines**: 34-46  
**Severity**: 🟠 **HIGH** - Accessibility violation

**Problem**:
- Drag-drop is ONLY way to add books to collections
- Keyboard-only users cannot use this feature
- No ARIA live announcements for drag/drop state

**Fix**:
```typescript
// Add to collection context menu
const [contextMenu, setContextMenu] = useState<{
  x: number
  y: number
  collection: Collection
} | null>(null)

// In collection item
<DropdownMenu>
  <DropdownMenuTrigger>
    <MoreVertical size={16} />
  </DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuItem onClick={() => handleAddSelectedBooks(collection.id)}>
      <Plus size={16} />
      Add Selected Books ({selectedBookIds.size})
    </DropdownMenuItem>
    {/* Existing delete/edit items */}
  </DropdownMenuContent>
</DropdownMenu>

// Handler
const handleAddSelectedBooks = async (collectionId: number) => {
  const bookIds = Array.from(selectedBookIds)
  try {
    await Promise.all(
      bookIds.map(id => api.addBookToCollection(id, collectionId))
    )
    toast.success(`Added ${bookIds.length} books to collection`)
  } catch (error) {
    toast.error('Failed to add books to collection')
  }
}

// Add ARIA live region for drag/drop feedback
<div role="status" aria-live="polite" className="sr-only">
  {dragFeedback}
</div>
```

---

## MEDIUM PRIORITY

### 8. Replace Blocking `alert()` with Inline Validation
**Files**: Multiple  
**Severity**: 🟡 **MEDIUM** - Poor UX, inconsistent

**Occurrences**:
- `CreateCollectionDialog.tsx` lines 100-111 (validation)
- `ConversionDialog.tsx` (file picker errors)
- `CollectionSidebar.tsx` line 240-243 (delete confirm)

**Fix Pattern**:
```typescript
// Replace alert() with inline validation
const [errors, setErrors] = useState<Record<string, string>>({})

const handleSubmit = async () => {
  const newErrors: Record<string, string> = {}
  
  if (!formData.name.trim()) {
    newErrors.name = 'Collection name is required'
  }
  
  if (formData.smart && formData.rules.length === 0) {
    newErrors.rules = 'Smart collections must have at least one rule'
  }
  
  if (Object.keys(newErrors).length > 0) {
    setErrors(newErrors)
    // Focus first invalid field
    const firstErrorField = Object.keys(newErrors)[0]
    document.querySelector(`[name="${firstErrorField}"]`)?.focus()
    return
  }
  
  // Proceed with submission
}

// In JSX
<Input
  name="name"
  value={formData.name}
  onChange={handleChange}
  aria-invalid={!!errors.name}
  aria-describedby={errors.name ? 'name-error' : undefined}
/>
{errors.name && (
  <span id="name-error" className="text-sm text-red-500">
    {errors.name}
  </span>
)}
```

**Replace `window.confirm()` with Dialog**:
```typescript
<AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Delete Collection?</AlertDialogTitle>
      <AlertDialogDescription>
        This will permanently delete "{collection.name}" and remove {collection.bookCount} books from this collection.
        The books themselves will not be deleted.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction onClick={handleDeleteConfirm} className="bg-red-600">
        Delete Collection
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

---

### 9. Settings Tab Accessibility (Missing ARIA)
**File**: `src/components/settings/SettingsDialog.tsx`  
**Lines**: 58-72  
**Severity**: 🟡 **MEDIUM** - WCAG violation

**Problem**:
- Tabs implemented with plain buttons
- No `role="tablist"`, `role="tab"`, `aria-selected`
- No keyboard arrow navigation

**Fix** (use Radix Tabs):
```typescript
import * as Tabs from '@radix-ui/react-tabs'

<Tabs.Root value={activeTab} onValueChange={setActiveTab}>
  <Tabs.List className="flex flex-col space-y-1" aria-label="Settings categories">
    <Tabs.Trigger value="appearance" className="...">
      <Palette size={18} />
      Appearance
    </Tabs.Trigger>
    {/* Other tabs */}
  </Tabs.List>
  
  <Tabs.Content value="appearance">
    {/* Appearance settings */}
  </Tabs.Content>
  {/* Other panels */}
</Tabs.Root>
```

**Benefits**:
- Auto-manages `aria-selected`, `role`, `tabindex`
- Arrow key navigation built-in
- Screen reader announcements

---

### 10. Reading Time Interval State After Unmount
**File**: `src/hooks/useBookReadingTime.ts`  
**Lines**: 19-27  
**Severity**: 🟡 **MEDIUM** - React warnings

**Problem**:
```typescript
// Interval callback can setState after unmount
setInterval(async () => {
  const stats = await api.getBookReadingStats(bookId)
  setTotalSeconds(stats.total_seconds)  // ⚠️ No mounted guard
  setSessionsCount(stats.sessions_count)
}, 30000)
```

**Fix**:
```typescript
useEffect(() => {
  let mounted = true
  
  const interval = setInterval(async () => {
    try {
      const stats = await api.getBookReadingStats(bookId)
      if (mounted) {
        setTotalSeconds(stats.total_seconds)
        setSessionsCount(stats.sessions_count)
      }
    } catch (error) {
      if (mounted) {
        console.error('Failed to fetch reading stats:', error)
      }
    }
  }, 30000)
  
  return () => {
    mounted = false
    clearInterval(interval)
  }
}, [bookId])
```

---

### 11. Console.* Pollution (194 occurrences)
**Files**: Multiple (48 files)  
**Severity**: 🟡 **MEDIUM** - Noise, potential data leaks

**Strategy**:
```typescript
// Create debug logger utility
// src/lib/logger.ts
const isDev = import.meta.env.DEV

export const logger = {
  debug: (...args: any[]) => isDev && console.debug('[Shiori]', ...args),
  info: (...args: any[]) => isDev && console.info('[Shiori]', ...args),
  warn: (...args: any[]) => console.warn('[Shiori]', ...args),
  error: (...args: any[]) => console.error('[Shiori]', ...args)
}

// Replace console.log/error throughout codebase
// Before:
console.log('[ReaderLayout] Step 1: Detecting format')

// After:
logger.debug('[ReaderLayout] Step 1: Detecting format')
```

**User-facing errors → toasts**:
```typescript
// Before:
catch (error) {
  console.error('Failed to load series:', error)
}

// After:
catch (error) {
  logger.error('Failed to load series:', error)
  toast.error('Failed to load series. Please try again.')
}
```

---

### 12. Library Store Race Condition (loadMoreBooks)
**File**: `src/store/libraryStore.ts`  
**Lines**: 131-151  
**Severity**: 🟡 **MEDIUM** - Concurrent call corruption

**Problem**:
- Multiple concurrent `loadMoreBooks()` calls can interleave
- `get().books` inside async flow may be stale
- Deduplication may lose books

**Fix**:
```typescript
// Add in-flight guard
let loadInFlight = false

loadMoreBooks: async () => {
  const state = get()
  
  // Guard against concurrent calls
  if (state.isLoading || loadInFlight) {
    return
  }
  
  loadInFlight = true
  set({ isLoading: true })
  
  try {
    const newBooks = await api.getMoreBooks(state.offset, state.limit)
    
    // Re-merge against latest state (avoid stale overwrites)
    set(state => {
      const latestBooks = state.books
      const appended = [...latestBooks, ...newBooks]
      
      // Dedupe by id
      const bookMap = new Map(appended.map(b => [b.id, b]))
      const dedupedBooks = Array.from(bookMap.values())
      
      return {
        books: dedupedBooks,
        offset: state.offset + newBooks.length,
        hasMore: newBooks.length === state.limit,
        isLoading: false
      }
    })
  } catch (error) {
    set({ isLoading: false })
    throw error
  } finally {
    loadInFlight = false
  }
}
```

---

## LOW PRIORITY (Housekeeping)

### 13. Settings Paragraph Spacing Units Mismatch
**Files**: `src/types/preferences.ts`, `src/components/settings/SettingsDialog.tsx`  
**Severity**: 🟢 **LOW** - Confusing but not breaking

**Problem**:
```typescript
// types/preferences.ts
DEFAULT_BOOK_PREFERENCES.paragraphSpacing = 16  // pixels?

// SettingsDialog.tsx
<Slider min={0} max={2} step={0.1} />  // Shows as "1.5em"
```

**Fix** (align to em):
```typescript
// types/preferences.ts
paragraphSpacing: 1.0  // Change default to em

// SettingsDialog.tsx (already correct)
<Slider min={0} max={2} step={0.1} value={[preferences.book.paragraphSpacing]} />
<span>{preferences.book.paragraphSpacing.toFixed(1)}em</span>
```

---

### 14. useGroupedLibrary Sort Comparator Missing
**File**: `src/hooks/useGroupedLibrary.ts`  
**Lines**: 65-72  
**Severity**: 🟢 **LOW** - Non-deterministic sort order

**Fix**:
```typescript
// Before:
for (const [seriesTitle, seriesBooks] of Array.from(seriesMap.entries()).sort()) {

// After:
for (const [seriesTitle, seriesBooks] of Array.from(seriesMap.entries())
  .sort((a, b) => a[0].localeCompare(b[0]))) {
```

---

### 15. TTS Rate Divide-by-Zero Risk
**File**: `src/hooks/useTTS.ts`  
**Lines**: 154-156  
**Severity**: 🟢 **LOW** - Edge case

**Fix**:
```typescript
const safeRate = Math.max(0.1, rate)
const estimatedDuration = (sentence.length / 15) * (1.0 / safeRate) * 1000
```

---

### 16. Toast Timers Not Cleared on Manual Removal
**File**: `src/store/toastStore.ts`  
**Lines**: 27-33  
**Severity**: 🟢 **LOW** - Minor leak

**Fix**:
```typescript
// Track timers
const timers = new Map<string, NodeJS.Timeout>()

addToast: (toast) => {
  const id = toast.id || generateId()
  
  const timer = setTimeout(() => {
    set(state => ({
      toasts: state.toasts.filter(t => t.id !== id)
    }))
    timers.delete(id)
  }, duration)
  
  timers.set(id, timer)
  
  set(state => ({
    toasts: [...state.toasts, { ...toast, id }]
  }))
}

removeToast: (id) => {
  const timer = timers.get(id)
  if (timer) {
    clearTimeout(timer)
    timers.delete(id)
  }
  
  set(state => ({
    toasts: state.toasts.filter(t => t.id !== id)
  }))
}
```

---

## IMPLEMENTATION CHECKLIST

### Phase 1 (Day 1-2) - Critical Fixes
- [ ] Fix useTheme.ts type mismatch
- [ ] Fix useReadingProgress flush unmount guard
- [ ] Fix CreateCollectionDialog circular parent check
- [ ] Fix useKeyboardShortcuts modifier logic
- [ ] Add reader touch/keyboard controls

### Phase 2 (Day 3-4) - High Priority
- [ ] Add series merge/remove confirmations
- [ ] Add collection keyboard alternative (context menu)
- [ ] Replace alert() with inline validation (3 files)
- [ ] Fix Settings tabs ARIA (use Radix Tabs)

### Phase 3 (Week 2) - Medium Priority
- [ ] Fix useBookReadingTime mounted guard
- [ ] Create logger utility + replace console.*
- [ ] Fix libraryStore loadMoreBooks race condition
- [ ] Harden remaining useEffect cleanup

### Phase 4 (Week 3) - Polish
- [ ] Fix paragraph spacing units
- [ ] Add sort comparator to useGroupedLibrary
- [ ] Fix TTS rate clamping
- [ ] Fix toast timer cleanup

---

## TESTING REQUIREMENTS

### Unit Tests Needed
```typescript
// src/hooks/__tests__/useTheme.test.ts
describe('useTheme', () => {
  it('should use correct theme enum values', () => {
    const { result } = renderHook(() => useTheme())
    expect(['light', 'dark']).toContain(result.current.theme)
  })
  
  it('should toggle between light and dark', () => {
    const { result } = renderHook(() => useTheme())
    const initial = result.current.theme
    act(() => result.current.toggleTheme())
    expect(result.current.theme).not.toBe(initial)
  })
})

// src/hooks/__tests__/useReadingProgress.test.ts
describe('useReadingProgress cleanup', () => {
  it('should not call setState after unmount', async () => {
    const { unmount } = renderHook(() => useReadingProgress(1))
    unmount()
    
    // Wait for potential async calls
    await waitFor(() => {}, { timeout: 1000 })
    
    // No "setState on unmounted component" warnings
    expect(console.error).not.toHaveBeenCalled()
  })
})
```

### Integration Tests
- Theme toggle → verify DOM attribute updates
- Series management → verify merge/delete with confirmation
- Collection drag-drop → verify keyboard alternative works
- Reader controls → verify touch/keyboard reveal

---

## VERIFICATION COMMANDS

```bash
# TypeScript compilation
npx tsc -b

# ESLint warnings
npx eslint src/ --fix

# Component-specific diagnostics
# (Run after each fix)

# Grep for remaining issues
rg "console\.(log|error|warn)" src/  # Should be minimal
rg "window\.alert|window\.confirm" src/  # Should be zero
rg "setState.*unmount" src/  # Check cleanup patterns
```

---

**Total Bugs Identified**: 16  
**Critical**: 4 | **High**: 4 | **Medium**: 5 | **Low**: 3  
**Estimated Fix Time**: 2-3 weeks (phased approach)
