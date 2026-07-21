<div align="center">
  <img src="public/logo.png" alt="Shiori Logo" width="180" />

  <h1>Shiori</h1>
  
  <p>A modern offline-first library and reading platform for serious personal collections. Zero tracking, total control.</p>

  [![Discord](https://img.shields.io/badge/DISCORD-JOIN%20SERVER-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/nS7g56mab)
  [![Downloads](https://img.shields.io/github/downloads/vinayydv3695/Shiori/total?style=for-the-badge&color=yellogreen&label=DOWNLOADS)](https://github.com/vinayydv3695/Shiori/releases)
  
  <br />

  [![License](https://img.shields.io/badge/LICENSE-GPL--3.0-red?style=for-the-badge)](LICENSE)
  [![Platform](https://img.shields.io/badge/PLATFORM-WINDOWS%20%7C%20MACOS%20%7C%20LINUX%20%7C%20ANDROID-0078D4?style=for-the-badge)](#installation)
  [![Framework](https://img.shields.io/badge/FRAMEWORK-TAURI%20%7C%20REACT-8A2BE2?style=for-the-badge)](#tech-stack)
  [![Build](https://img.shields.io/github/actions/workflow/status/vinayydv3695/Shiori/release.yml?branch=main&label=BUILD&style=for-the-badge&color=brightgreen)](https://github.com/vinayydv3695/Shiori/actions/workflows/release.yml)

  <br />
  <br />

  <p>
    Your entire reading library — books, manga, comics, RSS — organized, searchable, and readable offline. No cloud account needed.
  </p>

  <p>
    <a href="#quick-start">Quick Start</a> •
    <a href="#features">Features</a> •
    <a href="#installation">Installation</a> •
    <a href="#similar-projects">Similar Projects</a> •
    <a href="#contributing">Contributing</a>
  </p>
</div>

---

## Showcase

<details>
<summary><b>Desktop Screenshots</b> (Click to expand)</summary>

<br>

| Home | Library |
|---|---|
| ![Home](https://raw.githubusercontent.com/vinayydv3695/Shiori-site/main/public/home.png) | ![Library](https://raw.githubusercontent.com/vinayydv3695/Shiori-site/main/public/library.png) |

| Book Reader | Manga Reader |
|---|---|
| ![Book Reader](https://raw.githubusercontent.com/vinayydv3695/Shiori-site/main/public/bookreader.png) | ![Manga Reader](https://raw.githubusercontent.com/vinayydv3695/Shiori-site/main/public/mangareader.png) |

| Online Books | Online Manga |
|---|---|
| ![Online Books](https://raw.githubusercontent.com/vinayydv3695/Shiori-site/main/public/onlinebooks.png) | ![Online Manga](https://raw.githubusercontent.com/vinayydv3695/Shiori-site/main/public/onlinemangacard.png) |

| RSS Feed | Torbox |
|---|---|
| ![RSS Feed](https://raw.githubusercontent.com/vinayydv3695/Shiori-site/main/public/rssfeed.png) | ![Torbox](https://raw.githubusercontent.com/vinayydv3695/Shiori-site/main/public/torbox.png) |

| AniList | Series View |
|---|---|
| ![AniList](https://raw.githubusercontent.com/vinayydv3695/Shiori-site/main/public/anilist.png) | ![Series View](https://raw.githubusercontent.com/vinayydv3695/Shiori-site/main/public/seriesview.png) |

| OLED Midnight Theme | Sepia Theme |
|---|---|
| ![OLED Midnight](https://raw.githubusercontent.com/vinayydv3695/Shiori-site/main/public/oledmidniht.png) | ![Sepia](https://raw.githubusercontent.com/vinayydv3695/Shiori-site/main/public/sepia.png) |

</details>

<details>
<summary><b>Android Screenshots</b> (Click to expand)</summary>

<br>

<div align="center">
  <img src="https://raw.githubusercontent.com/vinayydv3695/Shiori-site/main/public/android-screenshots/home.jpg" width="24%" />
  <img src="https://raw.githubusercontent.com/vinayydv3695/Shiori-site/main/public/android-screenshots/library.jpg" width="24%" />
  <img src="https://raw.githubusercontent.com/vinayydv3695/Shiori-site/main/public/android-screenshots/seriesview.jpg" width="24%" />
  <img src="https://raw.githubusercontent.com/vinayydv3695/Shiori-site/main/public/android-screenshots/mangareading.jpg" width="24%" />
</div>

<br>

<div align="center">
  <img src="https://raw.githubusercontent.com/vinayydv3695/Shiori-site/main/public/android-screenshots/bookreading.jpg" width="24%" />
  <img src="https://raw.githubusercontent.com/vinayydv3695/Shiori-site/main/public/android-screenshots/onlinebook.jpg" width="24%" />
  <img src="https://raw.githubusercontent.com/vinayydv3695/Shiori-site/main/public/android-screenshots/onlinemanga.jpg" width="24%" />
  <img src="https://raw.githubusercontent.com/vinayydv3695/Shiori-site/main/public/android-screenshots/rssfeed.jpg" width="24%" />
</div>

<br>

<div align="center">
  <img src="https://raw.githubusercontent.com/vinayydv3695/Shiori-site/main/public/android-screenshots/anilist.jpg" width="24%" />
  <img src="https://raw.githubusercontent.com/vinayydv3695/Shiori-site/main/public/android-screenshots/anilsithomepage.jpg" width="24%" />
  <img src="https://raw.githubusercontent.com/vinayydv3695/Shiori-site/main/public/android-screenshots/annonations.jpg" width="24%" />
</div>

</details>

---

## Features

- **<img src="https://api.iconify.design/lucide:book.svg?color=%233b82f6" width="20" height="20" align="text-bottom" /> 10+ Formats** — EPUB, PDF, MOBI, AZW3, DOCX, FB2, CBZ, CBR, and more.
- **<img src="https://api.iconify.design/lucide:search.svg?color=%233b82f6" width="20" height="20" align="text-bottom" /> Instant Search** — SQLite FTS5 full-text indexing across your entire library and annotations.
- **<img src="https://api.iconify.design/lucide:book-open.svg?color=%233b82f6" width="20" height="20" align="text-bottom" /> Dedicated Readers** — Custom reading surfaces for books, manga, and comics with typography and layout controls.
- **<img src="https://api.iconify.design/lucide:pen-tool.svg?color=%233b82f6" width="20" height="20" align="text-bottom" /> Annotations & Tools** — Highlight, categorize, search, export, built-in translation, and dictionary lookup.
- **<img src="https://api.iconify.design/lucide:globe.svg?color=%233b82f6" width="20" height="20" align="text-bottom" /> Online Discovery** — MangaDex, MangaFire, Open Library, Nyaa, LibGen integrations.
- **<img src="https://api.iconify.design/lucide:cloud-download.svg?color=%233b82f6" width="20" height="20" align="text-bottom" /> Cloud Downloads** — TorBox integration for one-click debrid-assisted imports.
- **<img src="https://api.iconify.design/lucide:rss.svg?color=%233b82f6" width="20" height="20" align="text-bottom" /> RSS Reader** — Feed management with daily auto-generated EPUBs.
- **<img src="https://api.iconify.design/lucide:refresh-cw.svg?color=%233b82f6" width="20" height="20" align="text-bottom" /> Format Conversion** — Background conversion engine with queue management and persistence.
- **<img src="https://api.iconify.design/lucide:layers.svg?color=%233b82f6" width="20" height="20" align="text-bottom" /> Smart Organization** — Tags, favorites, nested collections, and auto-grouping for series.
- **<img src="https://api.iconify.design/lucide:lock.svg?color=%233b82f6" width="20" height="20" align="text-bottom" /> Offline-First & Privacy** — No account required, all data stays local. Explicit network allowlists via Tauri.
- **<img src="https://api.iconify.design/lucide:share-2.svg?color=%233b82f6" width="20" height="20" align="text-bottom" /> Local Sharing** — Password-protected local share links with QR codes and expiration limits.
- **<img src="https://api.iconify.design/lucide:gamepad-2.svg?color=%233b82f6" width="20" height="20" align="text-bottom" /> Discord RPC** — Show your reading activity and progress on Discord.
- **<img src="https://api.iconify.design/lucide:headphones.svg?color=%233b82f6" width="20" height="20" align="text-bottom" /> Text-to-Speech** — Built-in TTS controls with voice and rate options.
- **<img src="https://api.iconify.design/lucide:bar-chart-2.svg?color=%233b82f6" width="20" height="20" align="text-bottom" /> Reading Analytics** — Session telemetry for personal insights: daily time, streaks, per-book stats, and goals.

---

## Quick Start

1. Download the [latest release](https://github.com/vinayydv3695/Shiori/releases) for your platform.
2. Install and launch Shiori.
3. Import your first book, set up your library folder, or connect an online source!

---

## Installation

### Install Prebuilt Binaries

Download the latest release from:  
**https://github.com/vinayydv3695/Shiori/releases**

| Platform | Distribution | Notes |
|---|---|---|
| Linux (Arch) | `shiorii-bin` / `shiorii-git` (AUR) | Community-maintained AUR packages |
| Linux (Debian/Ubuntu) | `.deb` | Requires WebKitGTK runtime |
| Linux (Fedora/RHEL) | `.rpm` | RPM package available in releases |
| Linux (Universal) | `.AppImage` | Portable binary |
| Windows | `.exe` installer (NSIS) | Standard installer flow |
| macOS | `.dmg` | Intel and Apple Silicon builds |

#### Arch Linux (AUR)

```bash
yay -S shiorii-bin
# or
yay -S shiorii-git
```

#### Debian / Ubuntu

```bash
sudo apt install ./Shiori_<version>_amd64.deb
```

#### Fedora / RHEL

```bash
sudo dnf install ./Shiori-<version>-1.x86_64.rpm
```

#### AppImage

```bash
chmod +x Shiori_<version>_amd64.AppImage
./Shiori_<version>_amd64.AppImage
```

### Build from Source

**Prerequisites:** Node.js 18+, Rust stable toolchain, and Platform build dependencies for Tauri.

```bash
# Clone and setup
git clone https://github.com/vinayydv3695/Shiori.git
cd Shiori
npm install

# Run in development mode
npm run dev

# Production build
npm run build
```

---

## Tech Stack

Built with **Tauri 2** · **React 19** · **TypeScript** · **SQLite (FTS5)** · **Rust (Tokio / Axum)**

---

## Roadmap

The roadmap is actively refined through issues and discussions. Current focus areas include:

- [ ] Complete import-from-export dataset workflow support
- [ ] Continue chunk-size and route-splitting optimizations for heavy views
- [ ] Improve format adapter fidelity (including richer DOCX/FB2/PDF extraction paths)
- [ ] Expand and harden source connector reliability
- [ ] Strengthen RSS-to-library handoff workflows

---

## Contributing

Shiori follows a contributor-friendly workflow with clear quality gates.

1. Fork the repository
2. Create a focused branch (`feat/...`, `fix/...`, `docs/...`)
3. Implement changes with tests or validation steps where applicable
4. Run local checks (`npm run lint` and `npm run build`)
5. Open a pull request with a clear problem statement and impact summary

For full contributor guidance, review [`CONTRIBUTING.md`](docs/CONTRIBUTING.md).

---

## Similar Projects

If Shiori doesn't quite fit your needs, or if you're looking for a hosted web server rather than a desktop app, check out these excellent alternatives:
- **[Kavita](https://github.com/Kareadita/Kavita)** - A self-hosted digital library for reading manga, comics, and books.
- **[Stump](https://github.com/stumpapp/stump)** - A free and open source comics, manga, and digital book server.
- **[Komga](https://github.com/gotson/komga)** - Free and open source media server for comics/mangas/BDs.
- **[Calibre-Web](https://github.com/janeczku/calibre-web)** - A web app providing a clean interface for browsing, reading and downloading eBooks.

---

## License

Shiori is released under the [GPL-3.0 License](LICENSE).

---

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=vinayydv3695/Shiori&type=Date)](https://star-history.com/#vinayydv3695/Shiori&Date)

---

<div align="center">
  <sub>Built with ❤️ using Tauri + React + Rust</sub>
  <br/>
  <br/>
  <a href="https://github.com/vinayydv3695/Shiori/issues">Report Bug</a> ·
  <a href="https://github.com/vinayydv3695/Shiori/discussions">Discussions</a> ·
  <a href="https://github.com/vinayydv3695/Shiori/releases">Releases</a>
</div>
