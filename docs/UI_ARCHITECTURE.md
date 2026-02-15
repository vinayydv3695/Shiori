# Shiori UI Architecture

## Component Hierarchy

```
App
├── CommandPalette (Ctrl+K)
├── ThemeProvider
└── MainLayout
    ├── Toolbar (Top Command Bar)
    │   ├── ToolbarGroup
    │   │   ├── ToolbarButton
    │   │   └── ToolbarDivider
    │   ├── LibrarySwitcher
    │   └── GlobalSearch
    ├── ContentArea
    │   ├── LeftSidebar (Filters)
    │   │   ├── SidebarSection
    │   │   │   ├── SectionHeader
    │   │   │   ├── FilterSearch
    │   │   │   └── FilterList
    │   │   │       └── FilterItem
    │   │   └── ResizeHandle
    │   ├── MainPanel
    │   │   ├── ViewControls
    │   │   │   ├── ViewToggle (Grid/List/Table)
    │   │   │   ├── SortControls
    │   │   │   └── BulkActions
    │   │   ├── BookGrid (Virtualized)
    │   │   │   └── BookCard
    │   │   ├── BookTable (Virtualized)
    │   │   │   ├── TableHeader (Sticky)
    │   │   │   └── TableRow
    │   │   │       └── TableCell
    │   │   └── EmptyState
    │   └── RightPanel (Preview)
    │       ├── BookCover
    │       ├── MetadataSection
    │       ├── DescriptionSection
    │       ├── FormatsSection
    │       └── QuickActions
    └── StatusBar
        ├── LibraryStats
        ├── SyncStatus
        └── ThemeToggle
```

## Component Library Structure

```
src/
├── components/
│   ├── ui/                      # Base components (shadcn-style)
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── dropdown.tsx
│   │   ├── tooltip.tsx
│   │   ├── badge.tsx
│   │   ├── skeleton.tsx
│   │   ├── command.tsx
│   │   ├── context-menu.tsx
│   │   ├── resizable.tsx
│   │   └── toast.tsx
│   │
│   ├── layout/                  # Layout components
│   │   ├── MainLayout.tsx
│   │   ├── Toolbar.tsx
│   │   ├── StatusBar.tsx
│   │   └── ResizablePanel.tsx
│   │
│   ├── library/                 # Library-specific components
│   │   ├── BookGrid.tsx
│   │   ├── BookTable.tsx
│   │   ├── BookCard.tsx
│   │   ├── BookRow.tsx
│   │   ├── ViewControls.tsx
│   │   ├── BulkActions.tsx
│   │   └── EmptyState.tsx
│   │
│   ├── sidebar/                 # Sidebar components
│   │   ├── LeftSidebar.tsx
│   │   ├── FilterSection.tsx
│   │   ├── FilterList.tsx
│   │   ├── FilterItem.tsx
│   │   └── FilterSearch.tsx
│   │
│   ├── preview/                 # Preview panel components
│   │   ├── PreviewPanel.tsx
│   │   ├── BookCover.tsx
│   │   ├── MetadataDisplay.tsx
│   │   ├── DescriptionCard.tsx
│   │   └── FormatsList.tsx
│   │
│   ├── toolbar/                 # Toolbar components
│   │   ├── ToolbarButton.tsx
│   │   ├── ToolbarGroup.tsx
│   │   ├── LibrarySwitcher.tsx
│   │   └── GlobalSearch.tsx
│   │
│   ├── command/                 # Command palette
│   │   ├── CommandPalette.tsx
│   │   ├── CommandGroup.tsx
│   │   └── CommandItem.tsx
│   │
│   └── modals/                  # Modal dialogs
│       ├── SettingsModal.tsx
│       ├── MetadataEditor.tsx
│       ├── ConvertDialog.tsx
│       └── ImportDialog.tsx
│
├── hooks/                       # Custom hooks
│   ├── useKeyboardShortcuts.ts
│   ├── useVirtualization.ts
│   ├── useResizable.ts
│   ├── useCommandPalette.ts
│   ├── useTheme.ts
│   └── useSelection.ts
│
├── lib/
│   ├── utils.ts                 # Utility functions
│   ├── cn.ts                    # Class name merger
│   └── animations.ts            # Animation utilities
│
├── styles/
│   ├── tokens.css               # Design tokens
│   ├── globals.css              # Global styles
│   ├── animations.css           # Animation keyframes
│   └── utilities.css            # Utility classes
│
└── types/
    ├── book.ts
    ├── filter.ts
    ├── view.ts
    └── command.ts
```

## Key Design Patterns

### 1. Composition over Configuration
- Build complex UIs from simple, reusable components
- Use compound components pattern for complex widgets

### 2. Headless UI Components
- Separate logic from presentation
- Use Radix UI primitives for accessibility

### 3. Virtualization
- Use @tanstack/react-virtual for large lists
- Implement windowing for performance

### 4. State Management
- Zustand for global state
- React Query for server state
- Context for theme/preferences

### 5. Accessibility First
- ARIA labels on all interactive elements
- Keyboard navigation everywhere
- Focus management
- Screen reader support

## Performance Strategies

### Code Splitting
```tsx
// Lazy load heavy components
const MetadataEditor = lazy(() => import('./modals/MetadataEditor'))
const BookReader = lazy(() => import('./reader/BookReader'))
```

### Virtualization
```tsx
// Virtual scrolling for large lists
import { useVirtualizer } from '@tanstack/react-virtual'
```

### Memoization
```tsx
// Memo expensive computations
const filteredBooks = useMemo(
  () => applyFilters(books, filters),
  [books, filters]
)
```

### Debouncing
```tsx
// Debounce search input
const debouncedSearch = useDebouncedCallback(
  (value) => setSearchQuery(value),
  300
)
```

## Animation Guidelines

### Micro-interactions
- Button hover: 150ms ease-out
- Dropdown open: 200ms ease-spring
- Modal appear: 300ms ease-out

### Page Transitions
- Fade in: 200ms
- Slide in: 300ms with ease-out
- Scale in: 250ms with spring

### Loading States
- Skeleton screens instead of spinners
- Progressive loading
- Optimistic updates

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + K` | Open command palette |
| `Ctrl/Cmd + N` | Add new book |
| `Ctrl/Cmd + F` | Focus search |
| `Ctrl/Cmd + B` | Toggle sidebar |
| `Ctrl/Cmd + ,` | Open settings |
| `Ctrl/Cmd + Shift + T` | Toggle theme |
| `Delete` | Delete selected books |
| `Ctrl/Cmd + A` | Select all |
| `Escape` | Clear selection / Close modals |
| `Arrow keys` | Navigate books |
| `Enter` | Open book |
| `Space` | Quick preview |

## Accessibility Standards

### WCAG 2.1 AA Compliance
- Color contrast ratio ≥ 4.5:1 for normal text
- Color contrast ratio ≥ 3:1 for large text
- Focus indicators on all interactive elements
- Alt text for all images
- Semantic HTML
- ARIA labels where needed

### Keyboard Navigation
- Tab order follows visual order
- Skip links for main content
- Focus trap in modals
- Arrow key navigation in lists

### Screen Reader Support
- Proper heading hierarchy
- Live regions for dynamic content
- Status announcements
- Descriptive labels
