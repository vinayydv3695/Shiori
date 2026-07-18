# Release Notes (v1.61.6)

## ✨ New Features & Improvements
- **Auto-Updates**: Added background automatic update checking on startup!
  - **Desktop**: Automatically checks for updates and prompts you to install via the Tauri updater.
  - **Android**: Automatically checks the latest GitHub release and prompts you to download the newest `.apk`.
- **Text-to-Speech (TTS)**: Added a chapter-wise "Start Reading" button to Epub settings, allowing you to seamlessly start reading from the beginning of the current chapter without needing to highlight text.
- **Manga Reader - Floating Page Number**: Added a non-intrusive, theme-adaptive floating page number at the bottom of the manga reader to help you track your progress.
- **Manga Reader - Mobile UX**: Streamlined the Manga sidebar on Android, moving complex settings to the Advanced Settings panel to keep the interface smooth and lightweight.
- **Epub Reader - Mobile**: Disabled double page view for Android devices.

## 🐛 Bug Fixes
- Re-added the missing TTS controls/doodle icon on both Desktop and Android interfaces.
- Fixed the visual glitch and lingering loading spinner when switching from online books to online manga by implementing smooth skeleton loading screens.
