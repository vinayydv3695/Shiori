<div align="center">
  <img src="public/banner.svg" alt="Shiori Banner" width="100%">
  
  <h1>Shiori</h1>
  <p><strong>Professional offline-first eBook library manager</strong></p>
  
  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
  [![Version](https://img.shields.io/badge/version-0.1.9-green.svg)](https://github.com/vinayydv3695/Shiori/releases)
  
  <p>
    <a href="#key-features">Key Features</a> •
    <a href="#installation">Installation</a> •
    <a href="#quick-start">Quick Start</a> •
    <a href="#technology-stack">Technology Stack</a> •
    <a href="#contributing">Contributing</a> •
    <a href="#license">License</a>
  </p>
</div>

---

## Project Description

Shiori (栞, Japanese for "bookmark") is a high-performance, offline-first eBook library manager designed for users who prioritize privacy and complete control over their digital collections. Built using Tauri 2.0, React 19, and Rust, Shiori provides a native-level desktop experience that remains lightning-fast even with libraries exceeding 10,000 titles.

Unlike cloud-dependent services, Shiori operates entirely on local infrastructure. It utilizes an embedded SQLite database with FTS5 for instant full-text search and maintains all metadata and files on your local storage. The v0.1.9 release introduces online content discovery (Open Library books, MangaDex manga), improved UI density, and a faster onboarding experience.

---

## Key Features

### Library Management
*   **Multi-Format Support**: Comprehensive support for EPUB, PDF, MOBI, AZW3, DOCX, FB2, CBZ, and CBR.
*   **Automatic Metadata Extraction**: Imports local files and automatically extracts titles, authors, and covers.
*   **Manga Auto-Grouping**: Intelligently groups related manga volumes and chapters.
*   **Duplicate Detection**: Uses content hashing and fuzzy matching to identify and manage duplicate entries.
*   **Advanced Organization**: Support for hierarchical tags, ratings, and custom collections.
*   **Metadata Editor**: Granular control over every aspect of book information and covers.
*   **Online Discovery**: Browse and discover content from Open Library (books) and MangaDex (manga) without leaving the app.

### Reading Experience
*   **Customizable Interface**: 7 professional themes (White, Black, Rose Pine Moon, Catppuccin Mocha, Nord, Dracula, Tokyo Night).
*   **Optimized Reader**: High-performance rendering with smooth page transitions enabled by default.
*   **Multiple View Modes**: Single-page, two-page spread, and continuous vertical scroll modes.
*   **Progress Tracking**: Automatic synchronization of reading progress and detailed reading statistics.
*   **Navigation**: Deeply integrated table of contents and instant chapter jumping.
*   **Improved Layout**: Optimized grid spacing and cover display for better visual density.

### Smart Search and Conversion
*   **Full-Text Indexing**: Search through your entire library in milliseconds using SQLite FTS5.
*   **Keyword Highlighting**: Visual indicators for search matches within book content and metadata.
*   **Format Conversion**: Built-in tools for converting between major formats (EPUB to PDF and vice versa).
*   **RSS Integration**: Subscribe to feeds and save articles directly into your library for offline reading.

### Technical Excellence
*   **Virtual Scrolling**: Efficient UI rendering capable of handling massive libraries without performance degradation.
*   **Parallel Processing**: Utilizes Rust's concurrency model for CPU-intensive tasks like indexing and conversion.
*   **Smart Caching**: Implements LRU caching with zstd compression to optimize disk and memory usage.
*   **Offline-First**: Zero external dependencies or mandatory cloud synchronization.

---

## Installation

### Linux

#### Arch Linux (AUR)
Install the package using an AUR helper such as `yay`:
```bash
yay -S shiori
```
*Required dependency: `webkit2gtk-4.1`*

#### Debian / Ubuntu
Download the latest `.deb` package from the [Releases](https://github.com/vinayydv3695/Shiori/releases) page. Install via terminal:
```bash
sudo apt install ./shiori_0.1.9_amd64.deb
```
*Required dependency: `libwebkit2gtk-4.1-0`*

#### Fedora
Download the latest `.rpm` package from the [Releases](https://github.com/vinayydv3695/Shiori/releases) page. Install via terminal:
```bash
sudo dnf install ./shiori-0.1.9.x86_64.rpm
```

### Windows
Download the `Shiori_0.1.9_x64_en-US.msi` installer from the [Releases](https://github.com/vinayydv3695/Shiori/releases) page and run the executable.

### macOS
Download the `Shiori_0.1.9_x64.dmg` (Intel) or `Shiori_0.1.9_aarch64.dmg` (Apple Silicon) from the [Releases](https://github.com/vinayydv3695/Shiori/releases) page. Drag the application to your Applications folder.

---

## Build from Source

### Prerequisites
*   **Node.js**: v18 or higher.
*   **Rust**: v1.70 or higher (installed via rustup).
*   **System Dependencies**:
    *   **Linux**: `libwebkit2gtk-4.1-dev`, `build-essential`, `curl`, `wget`, `file`, `libssl-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`.
    *   **macOS**: Xcode Command Line Tools (`xcode-select --install`).
    *   **Windows**: Microsoft C++ Build Tools.

### Build Steps
1.  **Clone the repository**:
    ```bash
    git clone https://github.com/vinayydv3695/Shiori.git
    cd Shiori
    ```
2.  **Install frontend dependencies**:
    ```bash
    npm install
    ```
3.  **Run in development mode**:
    ```bash
    npm run dev
    ```
4.  **Build production binary**:
    ```bash
    npm run build
    ```
    The generated installer will be located in `src-tauri/target/release/bundle/`.

---

## Quick Start

### Onboarding
Upon first launch, you will be guided through a streamlined onboarding process to configure your library path and initial preferences. The v0.1.9 release significantly improves onboarding speed.

### Core Workflow
1.  **Importing**: Use the "Add Books" button or drag and drop files directly into the library view.
2.  **Organizing**: Apply tags and edit metadata via the right-click context menu.
3.  **Reading**: Double-click any title to open the integrated reader.
4.  **Theming**: Access the settings menu or use shortcuts to switch between the 7 available professional themes.

### Essential Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + O` | Import books |
| `Ctrl/Cmd + F` | Global search |
| `Ctrl/Cmd + T` | Cycle themes |
| `Ctrl/Cmd + ,` | Open settings |
| `Arrow Keys` | Navigate pages |
| `Escape` | Close reader/dialogs |
| `F11` | Toggle fullscreen |

---

## Technology Stack

### Frontend
*   **React 19**: Modern UI framework utilizing concurrent rendering.
*   **TypeScript**: Ensures type safety across the application.
*   **Tailwind CSS**: Utility-first styling for a responsive interface.
*   **Radix UI**: Accessible, unstyled component primitives.
*   **Zustand**: Lightweight and efficient state management.
*   **TanStack Query**: Robust asynchronous data synchronization.

### Backend (Rust)
*   **Tauri 2.0**: Secure and lightweight desktop application framework.
*   **SQLite FTS5**: High-performance full-text search engine.
*   **Tokio**: Asynchronous runtime for non-blocking operations.
*   **Axum**: Integrated HTTP server for local book sharing features.

### Format Support Libraries
*   **epub-rs**: EPUB parsing and metadata management.
*   **lopdf**: PDF processing and manipulation.
*   **mobi**: Support for MOBI and AZW3 formats.
*   **docx-rs**: DOCX format parsing.
*   **feed-rs**: RSS and Atom feed integration.

---

## Contributing

We welcome technical contributions, bug reports, and feature proposals. To contribute:
1.  Fork the repository.
2.  Create a feature branch: `git checkout -b feature/name`.
3.  Implement changes following the established code style.
4.  Ensure all tests pass.
5.  Submit a pull request with a detailed description of the changes.

Refer to `CONTRIBUTING.md` for comprehensive development guidelines.

---

## License

Shiori is released under the **MIT License**.

```text
Copyright (c) 2026 Shiori Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
```

---

<div align="center">
  <p>Shiori — Managed locally, read universally.</p>
</div>
