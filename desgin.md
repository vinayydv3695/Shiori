# Shiori Design System and UX Specification

> Filename intentionally kept as `desgin.md` to match requested naming.

---

## 1) Design Goals

Shiori design optimized for long reading sessions and large personal libraries.

Primary UX goals:
1. **Low friction ingestion** — import fast, organize later
2. **Reader-first experience** — minimal noise during reading
3. **High-density information** — efficient for power users
4. **Local ownership feeling** — app behaves like private workspace
5. **Keyboard-first productivity** — shortcuts + command workflows

---

## 2) Information Architecture

## 2.1 Primary Views
- Home dashboard
- Library
- Reader
- Annotations
- Statistics
- RSS feeds/articles
- Online discovery (books/manga)
- Torbox hubs
- Settings

## 2.2 Shell Layout
Standard app shell:
- Topbar (global actions/search/import/settings)
- Navigation rail (major sections)
- Filter panel (contextual, mostly library)
- Main content canvas
- Status bar (counts + library metrics)

Reader mode intentionally isolates content and reduces chrome.

---

## 3) Visual Language

## 3.1 Design Tokens
Tokenized system in CSS variables (`src/styles/tokens.css`, theme files):
- background, foreground, muted, border, ring
- spacing/typography scales
- elevation/shadow tokens
- animation timing tokens

## 3.2 Theme Model
Supported themes include:
- White
- Black
- Rose Pine Moon
- Catppuccin Mocha
- Nord
- Dracula
- Tokyo Night

Theme is applied before render via `ThemeProvider` to avoid flash.

## 3.3 Density and Scale
- UI density: compact/comfortable
- global `--ui-scale` variable adjusts root sizing
- target: readability and compactness for large collections

---

## 4) Component Principles

## 4.1 Reusable Base Components
Radix + Tailwind primitives used for:
- dialogs
- dropdowns/context menus
- inputs
- badges
- toasts
- tooltips
- scroll containers

## 4.2 Feature Components
Feature-specific composites:
- `ModernBookCard`, table/list views, series cards
- onboarding step cards
- reader overlays/toolbars
- manga page/viewport renderers

## 4.3 Dialog-driven Workflows
High-impact actions use focused dialogs:
- import
- metadata edit/search
- conversion
- delete/duplicate resolution
- advanced filters
- settings

---

## 5) Interaction Patterns

## 5.1 Navigation and Search
- topbar search context switches by active view
- search routes to local library or online providers
- command/shortcut actions open frequent workflows quickly

## 5.2 Selection and Bulk Actions
Library supports:
- single-select actions
- multi-select bulk actions
- explicit destructive confirmation dialogs

## 5.3 Drag and Drop
Drag layer supports file drop imports with clear visual state:
- active dropzone overlay
- format guidance text
- path extraction and handoff to import dialog

## 5.4 Reader Interactions
- persistent progress
- annotation tools
- translation and dictionary popups
- optional TTS controls
- manga modes (single/double/strip/webtoon variants)

---

## 6) Accessibility and Usability

Current design intent:
- high-contrast compatible themes
- visible focus states
- keyboard shortcuts for core actions
- sufficient text scaling via UI scale + font controls

Recommended hardening roadmap:
- audit WCAG contrast across all custom themes
- semantic heading hierarchy validation in dialogs
- full keyboard trap/focus cycle tests for all modals

---

## 7) Motion and Feedback

- subtle motion for entrances/transitions (`fade`, `slide`, `scale`)
- toast notifications for async outcomes
- progress indicators for import/conversion operations
- skeleton/shimmer for loading states

Motion should support orientation, not decoration.

---

## 8) Content Design

Tone:
- practical
- concise
- action-oriented

UI copy should:
- state what happened
- state what user can do next
- avoid vague errors

Examples:
- Good: “No valid files found in drop payload.”
- Bad: “Something went wrong.”

---

## 9) Design Constraints

- Desktop-first UX assumptions (not mobile-first)
- Navigation is app-state based, not URL route based
- Large feature surface means consistency requires strict component reuse
- Multiple reading modes increase testing matrix significantly

---

## 10) Future Design Priorities

1. Unify visual behavior across list/grid/table and online views
2. Strengthen accessibility pass per theme
3. Improve onboarding guidance for source integrations
4. Standardize empty/loading/error states across all modules
5. Build a formal component catalog doc with usage rules
