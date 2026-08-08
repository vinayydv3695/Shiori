# Changelog

All notable changes to Shiori will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.3.7] - 2026-08-08

### 🎨 UI & Reader Aesthetic Overhaul
- **Manga Reader Dual Themes**: Added complete support for **Warm Sepia** (`#FAF6EC` / `#2C1E0F`) and **OLED Midnight** (`#000000` / `#09090b`) themes.
- **Centered Chapter & Volume Dropdown**: Redesigned the manga reader chapter selector with centered/end-aligned placement, instant search filter, ascending/descending sort, and 100% opaque surface preventing canvas bleed-through.
- **Minimal Manga Sidebar**: Cleaned up the reader sidebar into a minimalist control panel with horizontal segmented mode controls (`Single`, `Strip`, `Webtoon`, `Manhwa`, `Comic`), smooth page navigation, theme toggles, and auto-scroll speed gauge.
- **Advanced Reader Settings Modal**: Replaced outdated inputs with high-contrast tabbed dialog for layout options, scan fit modes, zoom controls, and keyboard shortcuts.
- **Radix UI Select Architecture**: Replaced all raw native `<select>` dropdowns across the application (`SettingsDialog`, `VoiceManager`, `SmartShelfEditor`, `SeriesManagementDialog`, `BookDetailsDialog`, `AnnotationsViewDesktop`, `TTSControlBar`, `MangaSidebar`) with accessible, custom-styled Radix Select components.

### 🔞 Privacy & Content Filters
- **Global NSFW Filter**: Introduced an app-wide NSFW filter toggle in Settings (enabled by default) to filter adult manga and content metadata across online sources and browse catalogs.

### ⚡ Performance & Engine Upgrades
- **Zero-Ghosting Reader Canvas**: Guaranteed solid, GPU-accelerated panels eliminating subpixel ghosting and manga page bleed-through.
- **Memory & Cache Management**: Configurable preload cache intensity (Light, Normal, Aggressive) with balanced memory usage.

---

## [2.3.6] - 2026-08-07

### 📚 Reader & Online Sources
- **Torbox & AniList Integration**: Streamlined online manga browsing with rich metadata cards and synchronized library imports.
- **Continuous Scroll Flow**: Smooth automatic chapter transitions in long strip, webtoon, and manhwa modes.
- **TTS Engine Enhancements**: Improved speech rate controls, voice selection, and language filter management.

---

## [2.3.5] - 2026-08-06

### 📱 Android & Cross-Platform
- **SAF File Access**: Hardened Storage Access Framework file imports on Android with reliable permission grants.
- **Download Queue Panel**: Real-time chapter downloading with progress tracking, pause/resume, and retry handling.
- **Smart Shelves**: Rule-based smart shelves with multi-criteria filtering (format, read status, rating, tags, language).

---

## [2.3.0] - 2026-08-01

### 🚀 Major Feature Release
- **Multi-Format Conversion Conduit**: Added support for EPUB, PDF, MOBI, DOCX, FB2, TXT, CBZ, and CBR reading and conversions.
- **Audiobook & TTS Synchronization**: Real-time sentence highlighting and playback synchronization.
- **Modern Design System**: Glassmorphism UI tokens, unified color palettes, and responsive layouts across desktop and mobile.
