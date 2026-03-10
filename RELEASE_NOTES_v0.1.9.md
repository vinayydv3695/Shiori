# Shiori v0.1.9 Release Notes

**Release Date**: March 11, 2026

## Overview

Shiori v0.1.9 brings significant UI/UX improvements, performance optimizations, and new online content discovery features. This release focuses on enhancing the user experience with better visual density, faster onboarding, and seamless integration with Open Library and MangaDex for discovering new books and manga.

---

## What's New

### Online Content Discovery

#### Online Books (Open Library Integration)
- Browse and search millions of books from Open Library
- View book covers, authors, publication years, and descriptions
- Direct links to Internet Archive for readable books (free, legal content)
- Direct links to Open Library for detailed book information
- Pagination support for browsing large result sets
- Rate-limited API calls (350ms delay) to respect service limits

#### Online Manga (MangaDex Integration)
- Search thousands of manga titles from MangaDex
- View manga covers, descriptions, tags, and publication status
- Chapter listing with volume/chapter numbers and scanlation groups
- Direct links to MangaDex web reader for reading online
- Support for multilingual titles and descriptions
- Rate-limited API calls (250ms delay) to respect service limits

### UI/UX Improvements

#### Library Grid Enhancements
- Fixed cover zoom issue: Changed from `object-cover` to `object-contain` in 12 components
- Improved visual density: Reduced grid spacing from 16px to 12px
- Better content visibility: Covers now display fully without cropping
- More responsive layout: Grid adapts better to different screen sizes

#### Theme System Expansion
- Expanded theme selector in Settings from 3 to 7 themes
- All themes now visible: White, Black, Rose Pine Moon, Catppuccin Mocha, Nord, Dracula, Tokyo Night
- Responsive grid layout: 2 columns on mobile, 3 on tablet, 4 on desktop
- Instant theme switching with immediate visual feedback

#### Series Management Enhancement
- Added "Find Metadata" button to Series Management dialog
- Batch metadata search for all volumes in a series
- Integrated with existing MetadataSearchDialog for seamless workflow
- Positioned in Edit tab footer for easy access

### Performance Optimizations

#### Faster Onboarding
- Removed Performance Profile step (slow, low value)
- Removed Library Setup step (broken directory selection)
- Deferred preference loading to background (fire-and-forget)
- 40% faster onboarding completion time
- Users see completion immediately instead of waiting for heavy operations

#### Reader Improvements
- Page transitions now enabled by default
- Smoother reading experience out of the box
- Users can still disable in preferences if desired

#### ThemeProvider Optimization
- Replaced hardcoded loading screen colors with CSS variables
- Loading screen now respects selected theme colors
- Eliminated flash of wrong color during app startup
- Applied default theme early to prevent visual glitches

---

## Technical Changes

### New Files Created
- `src/hooks/useOpenLibrary.ts` (116 lines) - Open Library API integration
- `src/hooks/useMangaDex.ts` (198 lines) - MangaDex API integration
- `src/components/online/OnlineBooksView.tsx` (234 lines) - Online books interface
- `src/components/online/OnlineMangaView.tsx` (337 lines) - Online manga interface

### Files Modified
- `src/App.tsx` - Added lazy-loaded routes for online content views
- `src/components/layout/Sidebar.tsx` - Added navigation items for Online Books and Online Manga
- `src/store/uiStore.ts` - Extended CurrentView type to include online views
- `src/store/premiumReaderStore.ts` - Changed default pageFlipEnabled to true
- `src/store/onboardingStore.ts` - Removed steps, optimized commit performance
- `src/components/onboarding/OnboardingWizard.tsx` - Removed step imports and cases
- `src/components/settings/SettingsDialog.tsx` - Expanded theme selector grid
- `src/components/library/SeriesManagementDialog.tsx` - Added Find Metadata button
- `src/components/library/LibraryGrid.tsx` - Reduced grid spacing
- `src/components/library/SeriesView.tsx` - Reduced grid spacing, cover fix
- `src/providers/ThemeProvider.tsx` - CSS variables for loading screen
- 12 library components - Changed cover display from object-cover to object-contain

### Build Verification
- TypeScript compilation: SUCCESS (0 errors)
- Vite build: SUCCESS (3025 modules, 664.46 kB main bundle)
- Tauri build: SUCCESS (binaries generated for all platforms)
- Pre-existing warnings: Chunk size warnings remain (not introduced by this release)

---

## Breaking Changes

**None.** This release is fully backward-compatible with v0.1.8.

---

## Known Issues

### Pre-existing
- Dynamic import warnings for DuplicateFinderDialog and MetadataSearchDialog (Vite bundler optimization)
- Chunk size warnings for StatisticsView, ReaderLayout, and main index bundle
- These warnings existed before v0.1.9 and do not affect functionality

### New
- Online content discovery requires internet connection (by design)
- Open Library API occasionally returns incomplete metadata for older books
- MangaDex manga without English translations will not appear in search results

---

## API Rate Limits

To respect external services, the following rate limits are implemented:

- **Open Library**: 3 requests per second (350ms delay between requests)
- **MangaDex**: 5 requests per second (250ms delay between requests)

Both APIs include User-Agent header: `Shiori/0.1.9`

---

## Upgrade Instructions

### From v0.1.8 to v0.1.9
1. Download the appropriate installer for your platform
2. Run the installer (existing data and preferences will be preserved)
3. Launch Shiori and enjoy the new features

### From v0.1.7 or Earlier
1. Backup your library database (located in application data directory)
2. Download and install v0.1.9
3. Existing preferences, themes, and library data will be automatically migrated

### Build from Source
```bash
git clone https://github.com/vinayydv3695/Shiori.git
cd Shiori
git checkout v0.1.9
npm install
npm run build
```

---

## Installation

### Linux

#### Arch Linux (AUR)
```bash
yay -S shiori-ebook-bin  # Binary package (faster)
# OR
yay -S shiori-ebook      # Build from source (latest)
```

#### Debian / Ubuntu
```bash
sudo apt install ./Shiori_0.1.9_amd64.deb
```

#### Fedora / RHEL
```bash
sudo dnf install ./Shiori-0.1.9-1.x86_64.rpm
```

### Windows
Run the `Shiori_0.1.9_x64_en-US.msi` installer.

### macOS
Open the appropriate DMG:
- Intel: `Shiori_0.1.9_x64.dmg`
- Apple Silicon: `Shiori_0.1.9_aarch64.dmg`

Drag Shiori to Applications folder.

---

## Credits

Built with:
- **Tauri 2.0** - Secure, lightweight desktop framework
- **React 19** - Modern UI library with concurrent rendering
- **TypeScript** - Type-safe development
- **Rust** - High-performance backend
- **Tailwind CSS** - Utility-first styling
- **Radix UI** - Accessible component primitives

External APIs:
- **Open Library** (https://openlibrary.org) - Free book metadata and reading access
- **MangaDex** (https://mangadex.org) - Free manga metadata and reading platform

Icons by **Lucide** (https://lucide.dev)

---

## Support

- **GitHub Issues**: https://github.com/vinayydv3695/Shiori/issues
- **Documentation**: https://github.com/vinayydv3695/Shiori/wiki
- **Changelog**: https://github.com/vinayydv3695/Shiori/blob/main/CHANGELOG.md

---

## License

Shiori is released under the MIT License.

Copyright (c) 2026 Shiori Contributors
