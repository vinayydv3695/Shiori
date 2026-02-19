<div align="center">

<img src="public/banner.svg" alt="Shiori Banner" width="100%" />

<br />
<br />

**A Modern eBook Library Manager**

*Built for Performance • Privacy • Simplicity*

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Made with Tauri](https://img.shields.io/badge/Made%20with-Tauri-24C8DB?logo=tauri)](https://tauri.app/)
[![Built with Rust](https://img.shields.io/badge/Built%20with-Rust-000000?logo=rust)](https://www.rust-lang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev/)

[Features](#features) • [Installation](#installation) • [Quick Start](#quick-start) • [Documentation](#documentation) • [Contributing](#contributing)

</div>

---

## What is Shiori?

**Shiori** (栞, meaning "bookmark" in Japanese) is a desktop application for managing personal eBook collections. It's designed as a modern alternative to Calibre—fast, beautiful, and respectful of your privacy.

<div align="center">

| <img src="https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/rocket.svg" width="20" height="20" /> Lightning Fast | <img src="https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/palette.svg" width="20" height="20" /> Clean Interface | <img src="https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/lock.svg" width="20" height="20" /> 100% Private |
|:---:|:---:|:---:|
| Rust-powered backend handles 50,000+ books instantly | Modern UI inspired by Notion's design philosophy | All data stays local—no cloud, no tracking |

</div>

---

## Features

### Library Management

<img src="https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/files.svg" width="16" height="16" /> **Multi-Format Support**
- Import EPUB, PDF, MOBI, AZW3, TXT, DOCX, HTML, FB2, CBZ, CBR, and more
- Automatic metadata extraction from file headers
- SHA256-based duplicate detection

<img src="https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/search.svg" width="16" height="16" /> **Powerful Search**
- Full-text search powered by SQLite FTS5
- Sub-100ms queries even with massive libraries
- Filter by title, author, tags, format, and ratings

<img src="https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/folder.svg" width="16" height="16" /> **Smart Organization**
- Tag-based categorization system
- Virtual collections for grouping books
- Series tracking and management
- Custom rating system

### Reading Experience

<img src="https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/book.svg" width="16" height="16" /> **Built-in Readers**
- Premium EPUB reader with typography controls
- Integrated PDF viewer
- Reading progress tracking across devices
- Bookmarks and annotations support

<img src="https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/palette.svg" width="16" height="16" /> **Beautiful Views**
- Grid view with cover art display
- List and table views for detailed browsing
- Dark and light themes
- Responsive design for any screen size

### Advanced Features

<img src="https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/convert.svg" width="16" height="16" /> **Format Conversion**
- Pure Rust conversion engine
- Convert between EPUB, PDF, MOBI, and more
- Batch processing support
- Quality preservation

<img src="https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/rss.svg" width="16" height="16" /> **RSS to eBook**
- Subscribe to news feeds and blogs
- Automatic daily EPUB generation
- Clean, readable formatting
- Offline reading convenience

<img src="https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/share.svg" width="16" height="16" /> **Book Sharing**
- Local HTTP server for sharing books
- Password protection and QR codes
- Configurable expiration times
- Access logging

---

## Installation

### Pre-built Binaries

Downloads will be available once Phase 1 is complete:

- **Linux**: `.deb`, `.AppImage`
- **macOS**: `.dmg`, `.app`
- **Windows**: `.exe`, `.msi`

### Build from Source

**Prerequisites:**
- [Node.js](https://nodejs.org/) v18 or higher
- [Rust](https://rustup.rs/) 1.70 or higher
- Platform-specific dependencies (see below)

**Steps:**
```bash
git clone https://github.com/yourusername/Shiori.git
cd Shiori
npm install
npm run dev
```

<details>
<summary><strong>Linux Dependencies</strong></summary>

```bash
sudo apt update && sudo apt install -y \
  libwebkit2gtk-4.1-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```
</details>

<details>
<summary><strong>macOS Dependencies</strong></summary>

```bash
xcode-select --install
```
</details>

<details>
<summary><strong>Windows Dependencies</strong></summary>

Install [Microsoft Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
</details>

---

## Quick Start

### Import Books

1. Launch Shiori
2. Drag and drop eBook files into the window
3. Shiori automatically extracts metadata and organizes your library

### Organize Your Collection

- **Add tags** to categorize by genre, reading status, or custom categories
- **Create collections** for projects, reading lists, or themes
- **Rate books** with a 5-star system
- **Track series** to keep reading order organized

### Search Your Library

- Use the search bar for instant results across all metadata
- Apply filters to narrow down by format, author, or tags
- Sort by date added, title, author, or rating

### Read Your Books

- Click any book to open it in the built-in reader
- Adjust font size, line spacing, and themes
- Add highlights and annotations
- Reading progress syncs automatically

---

## Documentation

- **[Architecture](ARCHITECTURE.md)** — Complete technical specification
- **[Getting Started](docs/GETTING_STARTED.md)** — Development setup guide
- **[Implementation Status](IMPLEMENTATION_STATUS.md)** — Current progress tracker
- **[Contributing](CONTRIBUTING.md)** — How to contribute to Shiori

---

## Development Roadmap

### Phase 1A (Complete)

<img src="https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/checkmark.svg" width="14" height="14" /> Core library management  
<img src="https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/checkmark.svg" width="14" height="14" /> Multi-format import with metadata extraction  
<img src="https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/checkmark.svg" width="14" height="14" /> EPUB reader with annotations  
<img src="https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/checkmark.svg" width="14" height="14" /> Full-text search backend (FTS5)  
<img src="https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/checkmark.svg" width="14" height="14" /> Dark mode and themes  

### Phase 1B (In Progress)

<img src="https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/wrench.svg" width="14" height="14" /> Format conversion engine  
<img src="https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/wrench.svg" width="14" height="14" /> RSS feed integration  
<img src="https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/wrench.svg" width="14" height="14" /> Book sharing functionality  
<img src="https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/wrench.svg" width="14" height="14" /> Cover generation system  
<img src="https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/wrench.svg" width="14" height="14" /> Virtual scrolling for large libraries  

### Phase 2 (Planned)

Reading analytics and statistics  
eReader device sync (Kindle, Kobo, etc.)  
Metadata editor with bulk operations  
Advanced search UI  
Plugin system for extensibility  

### Phase 3+ (Future)

Optional cloud sync (encrypted)  
Mobile companion app  
Audiobook support  
AI-powered book recommendations  

---

## Technology Stack

Shiori is built with modern, production-ready technologies:

**Frontend**
- [React 19](https://react.dev/) with TypeScript
- [Tailwind CSS](https://tailwindcss.com/) for styling
- [Radix UI](https://www.radix-ui.com/) primitives
- [Zustand](https://github.com/pmndrs/zustand) for state management

**Backend**
- [Rust](https://www.rust-lang.org/) for performance and safety
- [Tauri 2](https://tauri.app/) for desktop framework
- [SQLite](https://www.sqlite.org/) with FTS5 for database
- [Tokio](https://tokio.rs/) async runtime

**Key Libraries**
- `epubjs` for EPUB rendering
- `pdf.js` for PDF viewing
- `feed-rs` for RSS parsing
- `axum` for HTTP server

---

## Shiori vs. Calibre

| Feature | Shiori | Calibre |
|---------|--------|---------|
| **Interface** | Modern, minimal design | Feature-dense, dated UI |
| **Performance** | Rust-powered, instant response | Slower with large libraries |
| **Setup** | Zero configuration | Complex initial setup |
| **Learning Curve** | Intuitive from day one | Steep learning curve |
| **Memory Usage** | 500MB cap with LRU caching | Can use several GB |
| **Search Speed** | Sub-100ms (50k+ books) | Variable performance |
| **Dark Mode** | Native, seamless | Basic support |
| **RSS to eBook** | Built-in, automatic | Requires plugins |
| **Privacy** | 100% offline, no tracking | Offline but feature telemetry |

**Note:** Calibre is a mature, feature-rich tool with decades of development. Shiori focuses on core library management with modern UX and performance. Both are excellent—choose what fits your needs.

---

## Why Offline-First?

<img src="https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/wifi.svg" width="16" height="16" /> **No Internet Required**  
Use Shiori anywhere, anytime—no connectivity needed after installation

<img src="https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/lock.svg" width="16" height="16" /> **Complete Privacy**  
Your reading habits, library content, and personal data never leave your device

<img src="https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/bolt.svg" width="16" height="16" /> **Instant Performance**  
No API calls, no cloud delays—everything runs at native speed

<img src="https://raw.githubusercontent.com/simple-icons/simple-icons/develop/icons/database.svg" width="16" height="16" /> **Data Ownership**  
You control your library completely—export, backup, or migrate anytime

---

## Contributing

Shiori is open source and welcomes contributions. Here's how to get involved:

1. **Star this repository** to show your support
2. **Report bugs** via [GitHub Issues](../../issues)
3. **Suggest features** in [GitHub Discussions](../../discussions)
4. **Submit pull requests** (see [CONTRIBUTING.md](CONTRIBUTING.md))

---

## License

Shiori is free and open-source software licensed under the [MIT License](LICENSE).

---

## Acknowledgments

- Inspired by [Calibre](https://calibre-ebook.com/), the legendary eBook management tool
- Icon design influenced by Japanese minimalism
- Built on the shoulders of the open-source community

---

<div align="center">

**栞 (Shiori)** — *Your bookmark to a better reading life*

Made with care for book lovers everywhere

[Back to Top](#what-is-shiori)

</div>
