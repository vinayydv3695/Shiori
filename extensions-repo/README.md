# Shiori Extensions Repository

Community extension index for [Shiori](https://github.com/vinayydv3695/Shiori)'s WASM extension
system. Consumed by the app at **Settings → Community Plugins → Extensions**.

Index URL: `https://raw.githubusercontent.com/vinayydv3695/shiori-extensions/main/index.json`

## Install

1. Open Shiori → Settings → Community Plugins → Extensions.
2. Press **Refresh** to fetch this index.
3. **Install** an entry, then toggle it on. (Installed extensions shadow same-id
   built-in sources while enabled.)

## Available extensions

| Extension | Type | What it does |
|---|---|---|
| **MangaDex (WASM)** | manga | Search/browse, chapter feed, and page images from the MangaDex API |
| **Open Library (WASM)** | book | Book search with covers and first-publish metadata |
| **Internet Archive (WASM)** | book | Full-text search across archive.org texts with cover thumbnails |
| **Torrents CSV (WASM reference)** | book | Torrent metadata search (reference implementation of the ABI) |

## Index format

`index.json`:

```json
{
  "version": 1,
  "extensions": [
    {
      "id": "open_library_wasm",
      "name": "Open Library (WASM)",
      "lang": "en",
      "version": "1.0.0",
      "downloadUrl": "https://.../dist/open_library_extension.wasm",
      "nsfw": false,
      "sha256": "<sha256 of the .wasm>",
      "contentType": "book",
      "hosts": ["openlibrary.org"]
    }
  ]
}
```

- `sha256` is verified on install (case-insensitive); a mismatch aborts the install.
- `hosts` is the HTTP allowlist granted to the extension (bare hostnames; `https`
  implied). The app also reads `permissions.hosts` from the extension's own `meta`
  response; the index value wins when present. An extension with an empty allowlist
  cannot make network requests.
- `contentType` is `book` or `manga`.
- `minAppVersion` / `iconUrl` are optional.

## How these artifacts are built

Each extension is a standalone Rust crate in the Shiori monorepo under
`extensions/<name>-extension/`. Build:

```bash
rustup target add wasm32-unknown-unknown
cargo build --release --target wasm32-unknown-unknown \
  --manifest-path extensions/<name>-extension/Cargo.toml
# artifact: extensions/<name>-extension/target/wasm32-unknown-unknown/release/<name>.wasm
```

Then copy into `dist/`, update the `sha256` in `index.json`, and push — GitHub Pages
serves the repo root (this folder *is* the Pages site; `.nojekyll` disables Jekyll).

Writing your own extension: see the author guide in the Shiori repo at
`docs/extensions/README.md` (ABI, host functions, manifest, security model).

## Security

Extensions run in a `wasmi` interpreter with a fuel budget, wall-clock timeout, memory
cap, and an HTTP allowlist scoped to `hosts`. They have no filesystem or process access.
