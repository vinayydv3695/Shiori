# 🔧 Shiori Troubleshooting Guide

## Problem: "Cannot read properties of undefined (reading 'invoke')" Error

### Quick Fix

**Run the app in Tauri mode, NOT browser mode:**

```bash
# ✅ CORRECT - Full Tauri app with backend
npm run tauri dev

# ❌ WRONG - Browser only, no backend  
npm run dev
vite dev
```

---

## How It Works

### Two Modes

1. **Tauri Mode** (Desktop App)
   - Runs Rust backend + React frontend
   - All features work
   - File dialogs, database, imports work
   - Command: `npm run tauri dev`

2. **Browser Mode** (Web Preview)
   - React frontend only
   - Shows 2 mock books
   - File features disabled
   - Yellow warning banner shows
   - Command: `npm run dev`

---

## Step-by-Step Startup

### Option 1: Using the test script (RECOMMENDED)

```bash
./test-tauri.sh
```

This script will:
1. Clean up old processes
2. Build Rust backend
3. Build frontend
4. Start Tauri dev mode

### Option 2: Manual startup

```bash
# 1. Kill old processes
pkill -f "tauri dev"
pkill -f "vite"
pkill -f "cargo run"

# 2. Start Tauri dev
npm run tauri dev
```

---

## What to Look For

### ✅ Success Signs

When you run `npm run tauri dev`, you should see:

```
Running BeforeDevCommand (`vite`)
VITE v7.3.1  ready in XXXms
➜  Local:   http://localhost:5173/

Compiling shiori v0.1.0
Finished `dev` profile
Running `target/debug/shiori`
```

Then a **desktop window** opens with your app.

### Browser Console Logs

Open DevTools (F12) and check console:

```
[Tauri Detection] Running in Tauri mode  ✅
[API] Calling get_books command
[API] Got books: 0
```

### ❌ Problem Signs

**If you see:**
```
[Tauri Detection] Running in browser mode  ⚠️
```

**This means:**
- You opened `http://localhost:5173` in a web browser
- OR you ran `npm run dev` instead of `npm run tauri dev`
- Mock data will be shown
- Backend features won't work

---

## Common Issues

### Issue 1: Port already in use

```
Port 5173 is in use, trying another one...
Port 5174 is in use, trying another one...
```

**Solution:** Kill old vite processes

```bash
pkill -f vite
pkill -f tauri
```

### Issue 2: Rust compilation errors

**Solution:** Check Rust installation

```bash
rustc --version  # Should be 1.70 or higher
cargo --version
```

If not installed:
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### Issue 3: Database errors

The database is created at:
- Linux: `~/.local/share/com.tauri.shiori/library.db`
- macOS: `~/Library/Application Support/com.tauri.shiori/library.db`
- Windows: `C:\Users\<user>\AppData\Roaming\com.tauri.shiori\library.db`

**To reset database:**
```bash
# Linux/macOS
rm -rf ~/.local/share/com.tauri.shiori/
rm -rf ~/Library/Application\ Support/com.tauri.shiori/

# Windows
rmdir /s "%APPDATA%\com.tauri.shiori"
```

### Issue 4: No books showing

1. Check console for `[API] Got books: X`
2. Try importing a book:
   - Click "Add Book" button
   - Select an EPUB/PDF file
   - Check console for import result

---

## Development Workflow

### Normal Development (UI changes only)

```bash
npm run tauri dev

# Make changes to React components
# Vite will hot reload automatically
```

### Backend Changes (Rust)

```bash
npm run tauri dev

# Make changes to src-tauri/src/*.rs
# Cargo will recompile and restart
```

### Full Clean Build

```bash
# Clean everything
cargo clean --manifest-path src-tauri/Cargo.toml
rm -rf dist/
rm -rf node_modules/.vite

# Rebuild
npm run tauri dev
```

---

## Testing Import Feature

1. Start app: `npm run tauri dev`
2. Click "Add Book" in toolbar
3. File dialog should open (if not, check console for errors)
4. Select an EPUB or PDF file
5. Check console:
   ```
   [API] Opening file dialog
   [API] File dialog result: ["/path/to/book.epub"]
   [API] Importing books: 1 files
   ```

---

## Debug Checklist

- [ ] Running `npm run tauri dev` (not `npm run dev`)
- [ ] Desktop window opened (not web browser)
- [ ] Console shows `[Tauri Detection] Running in Tauri mode`
- [ ] No yellow banner at top
- [ ] Rust backend compiled successfully
- [ ] Database initialized (check logs for "Shiori initialized")

---

## Getting Help

If none of these solutions work:

1. Check the console logs (F12 → Console tab)
2. Check terminal output where you ran `npm run tauri dev`
3. Look for specific error messages
4. Share the exact error message

---

## Quick Commands Reference

```bash
# Start development
npm run tauri dev

# Build for production
npm run tauri build

# Frontend only (no backend)
npm run dev

# Build frontend only
npm run build

# Clean Rust build
cd src-tauri && cargo clean

# Check Rust code
cd src-tauri && cargo check
```
