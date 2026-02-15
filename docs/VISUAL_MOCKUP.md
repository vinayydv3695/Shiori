# 🎨 Shiori UI Visual Mockup Description

## Overall Layout

```
┌────────────────────────────────────────────────────────────────────────────┐
│  🔹 Toolbar (56px, bg-background/95, border-b)                             │
│  [+Add] [✏Edit] [⟳Convert] [👁View] [⬇Download] | [💾Save] [🔗Share] [⚙]  │
│                    [🔍 Search books... ⌘K]                   [📚] [☾]      │
├──────────┬───────────────────────────────────────────────────────┬─────────┤
│          │  View Controls (48px)                                 │         │
│          │  All Books                            [🔘Filters] [⊞][☰][⊡]    │
│          ├───────────────────────────────────────────────────────┤         │
│ Filters  │                                                        │ Preview │
│ (240px)  │                                                        │ (320px) │
│          │                                                        │         │
│ Authors  │         📚  Book Card Grid                             │  Cover  │
│ ├─📖 JK  │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐            │  Image  │
│ ├─📖 GRR │  │Cover│ │Cover│ │Cover│ │Cover│ │Cover│            │         │
│ └─📖 NK  │  │ Img │ │ Img │ │ Img │ │ Img │ │ Img │            │  Title  │
│          │  │     │ │     │ │     │ │     │ │     │            │  Author │
│ Language │  │Title│ │Title│ │Title│ │Title│ │Title│            │         │
│ ├─🌐 EN  │  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘            │  Rating │
│ └─🌐 FR  │                                                        │  ⭐⭐⭐⭐⭐ │
│          │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐            │         │
│ Series   │  │Cover│ │Cover│ │Cover│ │Cover│ │Cover│            │  Desc   │
│ ├─📚 HP  │  │ Img │ │ Img │ │ Img │ │ Img │ │ Img │            │  ─────  │
│ └─📚 GOT │  │     │ │     │ │     │ │     │ │     │            │  Lorem  │
│          │  │Title│ │Title│ │Title│ │Title│ │Title│            │  ipsum  │
│ Format   │  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘            │  dolor  │
│ ├─📄 EPUB│                                                        │  sit    │
│ ├─📄 PDF │         (Virtualized Grid - Smooth Scrolling)         │         │
│ └─📄 MOBI│                                                        │  Tags   │
│          │                                                        │  [Sci-Fi]│
│ Tags     │                                                        │  [2024] │
│ ├─🏷 Sci │                                                        │         │
│ └─🏷 Fant│                                                        │  Quick  │
│          │                                                        │  Actions│
│          │                                                        │  [Read] │
│          │                                                        │  [Edit] │
├──────────┴───────────────────────────────────────────────────────┴─────────┤
│  Status Bar (24px, bg-muted/30, border-t)                                 │
│  1,234 of 5,678 books  |  2 selected  |  124 GB          🟢 Synced        │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Component Details

### 1. Toolbar

```
┌──────────────────────────────────────────────────────────────┐
│ [Icon]  [Icon]  [Icon] │ [Icon] │ [Search...] │ [Lib] [Set] │
│  Add    Edit    Conv   │  View  │             │             │
└──────────────────────────────────────────────────────────────┘

Style:
- Height: 56px
- Background: bg-background/95 with backdrop-blur
- Border: border-b border-border
- Padding: px-4
- Icon size: 20px (w-5 h-5)
- Gap: gap-1 between buttons
- Divider: 1px vertical line

Hover States:
- Button: bg-accent/50 → bg-accent
- Icon: scale(1.1) smooth transition
- Tooltip: Fade in after 300ms delay
```

### 2. Search Bar

```
┌─────────────────────────────────────────┐
│ 🔍  Search books...            ⌘K      │
└─────────────────────────────────────────┘

Style:
- Height: 36px (h-9)
- Background: bg-muted/50
- Border: none (focus: ring-1 ring-primary)
- Radius: rounded-lg
- Icon: absolute left-3, text-muted-foreground
- Shortcut badge: absolute right-2, bg-muted rounded

Focus:
- Icon color: text-muted-foreground → text-primary
- Ring: ring-1 ring-primary
```

### 3. Filter Sidebar

```
┌──────────────────────────┐
│ Filters     Clear all (5)│
├──────────────────────────┤
│ 👥 Authors (127)      ˅  │
├──────────────────────────┤
│ 🔍 Search authors...     │
│ ┌────────────────────┐   │
│ │ J.K. Rowling    12 │   │
│ │ G.R.R. Martin    8 │   │
│ │ Neil Gaiman      6 │   │
│ └────────────────────┘   │
├──────────────────────────┤
│ 🌐 Languages (5)      ˅  │
├──────────────────────────┤
│ │ English        234 │   │
│ │ French          45 │   │
│ └────────────────────┘   │
└──────────────────────────┘

Style:
- Width: 240px
- Background: bg-background
- Border: border-r border-border
- Section header: px-3 py-2.5, hover:bg-accent/50
- Filter item: px-2 py-1.5, rounded-md
- Count badge: px-1.5 py-0.5, bg-muted, text-xs
- Scrollbar: custom 6px width

Animations:
- Expand/collapse: max-height transition 200ms
- Chevron rotation: rotate(-90deg) → rotate(0deg)
- Item hover: bg-accent/50 150ms
```

### 4. Book Card

```
┌─────────────────┐
│ ☑️              │  ← Selection checkbox (hover)
│  ┌───────────┐  │
│  │           │  │
│  │   COVER   │  │  ← 2:3 aspect ratio
│  │   IMAGE   │  │
│  │           │  │
│  └───────────┘  │
│  [EPUB]   ⭐4.5 │  ← Format + Rating badges
│                 │
│  Book Title     │  ← 2 line clamp, font-semibold
│                 │
│  Author Name    │  ← text-muted-foreground
│                 │
│  [Sci-Fi] [2024]│  ← Tag badges
│                 │
│  Jan 15  •  2.3M│  ← Date • Size
└─────────────────┘

Dimensions:
- Width: Auto (grid: 1/5 to 1/6)
- Border: border border-border
- Radius: rounded-lg
- Shadow: none → shadow-lg on hover
- Padding: p-3

Hover:
- Border: border-primary/50
- Shadow: shadow-lg
- Checkbox: opacity-0 → opacity-100
- Quick actions: opacity-0 → opacity-100
- Scale: subtle scale(1.02)

Quick Actions (top-right):
┌───┐
│ 👁 │  View
│ ✏️ │  Edit
│ ⬇️ │  Download
└───┘
```

### 5. Preview Panel

```
┌──────────────────────┐
│                      │
│    ┌──────────┐      │
│    │          │      │
│    │  COVER   │      │  ← Large cover (240px)
│    │  IMAGE   │      │
│    │          │      │
│    └──────────┘      │
│                      │
│  📖 Book Title       │  ← text-xl font-bold
│  by Author Name      │  ← text-muted-foreground
│                      │
│  ⭐⭐⭐⭐⭐ 4.5/5      │  ← Rating
│                      │
│  ────────────────    │
│                      │
│  Description         │  ← text-sm
│  Lorem ipsum dolor   │
│  sit amet...         │
│  (scrollable)        │
│                      │
│  ────────────────    │
│                      │
│  📦 Formats          │
│  • EPUB (2.3 MB)     │
│  • PDF (4.1 MB)      │
│                      │
│  🏷️ Tags             │
│  [Science Fiction]   │
│  [2024] [Hugo]       │
│                      │
│  ────────────────    │
│                      │
│  [📖 Read Now]       │  ← Primary button
│  [✏️ Edit Metadata]  │  ← Secondary
│  [⬇️ Download]       │  ← Secondary
│                      │
└──────────────────────┘

Style:
- Width: 320px
- Background: bg-card
- Border: border-l border-border
- Padding: p-6
- Gap: gap-4

Sections:
- Card-style with subtle shadows
- Proper typography hierarchy
- Scrollable description
- Clean spacing (space-y-4)
```

### 6. View Controls

```
┌─────────────────────────────────────────────────┐
│ All Books              [🎚 Filters] [⊞] [☰] [⊡] │
└─────────────────────────────────────────────────┘

Style:
- Height: 48px (h-12)
- Background: bg-background
- Border: border-b border-border
- Padding: px-4

View Toggle:
┌───────────┐
│ [⊞][☰][⊡] │  ← bg-muted rounded-lg p-1
└───────────┘
- Active: bg-secondary
- Inactive: bg-transparent hover:bg-accent
- Icon size: w-4 h-4
- Button size: h-7 w-7
```

### 7. Status Bar

```
┌───────────────────────────────────────────────────────┐
│ 1,234 of 5,678 books | 2 selected | 124 GB  🟢 Synced │
└───────────────────────────────────────────────────────┘

Style:
- Height: 24px (h-6)
- Background: bg-muted/30
- Border: border-t border-border
- Text: text-xs text-muted-foreground
- Padding: px-4

Status Indicator:
- 🟢 Green dot: bg-green-600 w-1.5 h-1.5 rounded-full
- Syncing: Pulsing animation
- Error: Red dot
```

---

## Color Palette Examples

### Light Theme
```
Background:   #ffffff (white)
Foreground:   #09090b (near black)
Muted:        #f5f5f5 (light gray)
Border:       #e5e5e5 (gray)
Primary:      #0ea5e9 (sky blue)
Accent:       #f5f5f5 (light hover)
```

### Dark Theme
```
Background:   #09090b (near black)
Foreground:   #fafafa (near white)
Muted:        #27272a (dark gray)
Border:       #27272a (gray)
Primary:      #0ea5e9 (sky blue)
Accent:       #27272a (dark hover)
```

---

## Animation Specifications

### Micro-interactions
- **Button hover**: 150ms ease-out
- **Tooltip appear**: 200ms fade-in
- **Dropdown open**: 200ms slide-down
- **Card hover**: 150ms ease-out (scale, shadow, border)

### Page transitions
- **Modal**: 300ms ease-out (fade + scale)
- **Sidebar**: 200ms ease-out (slide)
- **View switch**: 200ms cross-fade

### Loading states
- **Skeleton**: Subtle pulse animation
- **Spinner**: Rotate 360deg 1s linear infinite
- **Progress**: Indeterminate slide 1.5s ease-in-out infinite

---

## Responsive Breakpoints

```
sm:  640px   →  Grid: 2 columns
md:  768px   →  Grid: 3 columns
lg:  1024px  →  Grid: 4 columns, Show sidebar
xl:  1280px  →  Grid: 5 columns, Show preview
2xl: 1536px  →  Grid: 6 columns, All panels
```

---

## Icon System

**Library**: Lucide React (outline style)

**Categories**:
- Actions: Plus, Edit, Trash, Download, Save, Share
- Navigation: ChevronDown, ChevronRight, ArrowLeft
- Content: BookOpen, FileType, Tag, Star
- UI: Search, Settings, Menu, X, MoreVertical
- Status: CheckCircle, AlertCircle, Info

**Sizes**:
- Toolbar icons: w-5 h-5 (20px)
- Card actions: w-4 h-4 (16px)
- Badges: w-3 h-3 (12px)
- Large icons: w-12 h-12 (48px)

---

This visual specification provides pixel-perfect guidance for implementing the modern Shiori UI! 🎨
