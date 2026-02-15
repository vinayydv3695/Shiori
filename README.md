<div align="center">

<img src="public/banner.svg" alt="Shiori Banner" width="100%" />

<br />
<br />

**Your Personal eBook Library Manager**

*Elegant • Private • Powerful*

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Made with Tauri](https://img.shields.io/badge/Made%20with-Tauri-24C8DB?logo=tauri)](https://tauri.app/)
[![Built with Rust](https://img.shields.io/badge/Built%20with-Rust-000000?logo=rust)](https://www.rust-lang.org/)

[Features](#-features) • [Download](#-download) • [Getting Started](#-getting-started) • [Screenshots](#-screenshots) • [Why Shiori?](#-why-shiori)

</div>

---

## 📖 What is Shiori?

**Shiori** (栞, meaning "bookmark" in Japanese) is a modern, offline-first desktop application for managing your personal eBook collection. Think of it as a beautiful, fast, and privacy-focused alternative to Calibre.

### ✨ Key Highlights

- 🚀 **Lightning Fast** — Built with Rust for maximum performance
- 🎨 **Beautiful Interface** — Clean, modern design inspired by Notion
- 🔒 **100% Private** — All your data stays on your device, forever
- 📚 **Handle Thousands** — Optimized for libraries with 50,000+ books
- 🌙 **Dark Mode** — Easy on your eyes, day or night
- 💾 **Zero Cloud** — No accounts, no subscriptions, no tracking

---

## ✨ Features

### 📥 Import & Organize

- **Drag & drop** your eBooks (EPUB, PDF, MOBI, AZW3, TXT, CBZ, CBR)
- **Automatic metadata extraction** from file headers
- **Duplicate detection** ensures no book is added twice
- **Tag and categorize** your collection your way

### 🔍 Search & Discover

- **Instant full-text search** across titles, authors, and content
- **Filter by tags, authors, formats, and ratings**
- **Smart collections** based on your reading patterns
- **Find anything in milliseconds**, even in huge libraries

### 🎨 Beautiful Reading Experience

- **Grid, List, and Table views** to browse your way
- **Cover art** automatically displayed (or elegantly generated)
- **Dark and light themes** for comfortable viewing
- **Responsive design** that adapts to your screen

### 🔐 Privacy First

- **All data stored locally** in SQLite database
- **No internet required** after installation
- **No telemetry or tracking** of any kind
- **You own your library**, completely

---

## 💻 Download

### Pre-built Binaries (Coming Soon!)

Once Phase 1 is complete, we'll provide installers for:

- 🐧 **Linux** (.deb, .AppImage)
- 🍎 **macOS** (.dmg, .app)
- 🪟 **Windows** (.exe, .msi)

### Build from Source

Currently, Shiori is in early development. To try it:

1. **Install prerequisites**:
   - [Node.js](https://nodejs.org/) v18+
   - [Rust](https://rustup.rs/) 1.70+
   - Platform-specific dependencies (see below)

2. **Clone and run**:
   ```bash
   git clone https://github.com/yourusername/Shiori.git
   cd Shiori
   npm install
   npm run dev
   ```

<details>
<summary><b>Linux Dependencies</b></summary>

```bash
sudo apt update
sudo apt install -y \
  libwebkit2gtk-4.1-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```
</details>

<details>
<summary><b>macOS Dependencies</b></summary>

```bash
xcode-select --install
```
</details>

<details>
<summary><b>Windows Dependencies</b></summary>

Install [Microsoft Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
</details>

---

## 🚀 Getting Started

### Import Your First Books

1. Launch Shiori
2. Click **"Import Books"** in the top-right corner
3. Select your eBook files (or drag & drop them into the window)
4. Watch as Shiori automatically organizes them!

### Organize Your Library

- **Tag books** by genre, status, or custom categories
- **Rate your favorites** with the 5-star system
- **Add notes** for book recommendations or thoughts
- **Create virtual libraries** for different moods or projects

### Search Like a Pro

- Use the **search bar** for instant results
- **Filter by author** to see all books by your favorite writers
- **Group by series** to keep track of what's next
- **Sort by date added** to find your latest additions

---

## 📸 Screenshots

<div align="center">

### Grid View
*Browse your collection with beautiful book covers*

(Screenshot placeholder - add screenshot here)

### Dark Mode
*Easy on the eyes for late-night reading*

(Screenshot placeholder - add screenshot here)

### Import Books
*Drag, drop, done. Shiori handles the rest*

(Screenshot placeholder - add screenshot here)

</div>

---

## 🤔 Why Shiori?

### vs. Calibre

| Feature | Shiori | Calibre |
|---------|--------|---------|
| **Interface** | Modern, minimal | Dense, dated |
| **Performance** | Rust-powered, instant | Slower with large libraries |
| **Setup** | No configuration needed | Complex setup |
| **Design** | Beautiful by default | Functional |
| **Learning curve** | Intuitive | Steep |

**Note**: Calibre is an amazing tool with decades of features. Shiori is younger, focused on core library management with a modern UX. Both are great—choose what fits your style!

### Why Offline-First?

- 📱 **Use anywhere** — No internet? No problem
- 🔒 **Total privacy** — Your reading habits stay yours
- ⚡ **Instant** — No API calls, no waiting
- 💾 **Reliable** — Your library can't disappear

---

## 🗺️ Roadmap

### ✅ Phase 1A (Current)
- [x] Core library management
- [x] Import books with metadata extraction
- [x] Beautiful grid view
- [x] Dark mode
- [x] Full-text search backend

### 🚧 Phase 1B (Next — Jan 2026)
- [ ] Advanced search UI
- [ ] Metadata editor
- [ ] List and table views
- [ ] Tag management UI
- [ ] Cover art extraction

### 📅 Phase 2 (Q1 2026)
- [ ] Built-in EPUB reader
- [ ] PDF viewer
- [ ] Reading progress tracking
- [ ] Highlights and annotations

### 📅 Phase 3+ (Future)
- [ ] Format conversion (EPUB ↔ PDF ↔ MOBI)
- [ ] USB eReader device support
- [ ] Plugin system
- [ ] Cloud sync (optional, encrypted)

---

## 🛠️ Technology

Shiori is built with modern, reliable technologies:

- **[Tauri](https://tauri.app/)** — Lightweight desktop framework
- **[Rust](https://www.rust-lang.org/)** — Fast, safe backend
- **[React](https://react.dev/)** — Smooth, reactive UI
- **[TypeScript](https://www.typescriptlang.org/)** — Type-safe frontend
- **[SQLite](https://www.sqlite.org/)** — Reliable, embedded database
- **[Tailwind CSS](https://tailwindcss.com/)** — Beautiful, responsive design

---

## 🤝 Contributing

Shiori is in active development! Here's how you can help:

1. **Star this repo** ⭐ to show your support
2. **Try it out** and [report bugs](../../issues)
3. **Share your ideas** for features
4. **Contribute code** (see [CONTRIBUTING.md](CONTRIBUTING.md))

---

## 📄 License

Shiori is free and open-source software licensed under the [MIT License](LICENSE).

---

## 💬 Community

- 🐛 **Report bugs**: [GitHub Issues](../../issues)
- 💡 **Request features**: [GitHub Discussions](../../discussions)
- 📧 **Contact**: [Your Email]
- 🐦 **Updates**: [Your Twitter]

---

## 🙏 Acknowledgments

- Inspired by [Calibre](https://calibre-ebook.com/), the legendary eBook manager
- Icon design influenced by Japanese minimalism
- Built with tools from the amazing open-source community

---

<div align="center">

**栞 (Shiori)** — *Your bookmark to a better reading life*

Made with ❤️ for book lovers everywhere

[⬆ Back to Top](#-shiori)

</div>
