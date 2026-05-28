#!/usr/bin/env bash
# =============================================================================
# Shiori — Cloudflare Solver Setup Script
# =============================================================================
# Installs the Node.js Playwright dependency needed for automatic Cloudflare
# challenge solving.  Run this once after cloning or updating Shiori.
#
# Usage:
#   bash scripts/setup_cf_solver.sh
#
# Requirements:
#   - Node.js 18+ (check: node --version)
#   - npm (check: npm --version)
#
# The script installs playwright into the Shiori project-level node_modules
# (not globally) and downloads Chromium browser binaries.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo ""
echo "╔═══════════════════════════════════════════════════════╗"
echo "║      Shiori  —  Cloudflare Solver Setup               ║"
echo "╚═══════════════════════════════════════════════════════╝"
echo ""

# ── Check Node.js ──────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
    echo "❌  Node.js is not installed. Please install Node.js 18+ first."
    echo "    On Arch Linux: sudo pacman -S nodejs npm"
    echo "    On Ubuntu/Debian: sudo apt install nodejs npm"
    exit 1
fi

NODE_VERSION=$(node --version | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌  Node.js 18+ is required (found: $(node --version))"
    echo "    Please upgrade Node.js."
    exit 1
fi
echo "✅  Node.js $(node --version) found"

# ── Install playwright package ─────────────────────────────────────────────────
cd "$PROJECT_ROOT"

echo ""
echo "📦  Installing playwright package…"
if [ -f package.json ]; then
    # Add playwright to the existing package.json if not already present
    if ! grep -q '"playwright"' package.json 2>/dev/null; then
        npm install --save-dev playwright
        echo "✅  playwright added to package.json"
    else
        npm install
        echo "✅  playwright already in package.json — running npm install"
    fi
else
    # No package.json — install as a dev dependency
    npm init -y >/dev/null 2>&1 || true
    npm install --save-dev playwright
    echo "✅  playwright installed"
fi

# ── Install Chromium browser binary ────────────────────────────────────────────
echo ""
echo "🌐  Installing Chromium browser binary for Playwright…"
echo "    (this may take a few minutes on first run)"
npx playwright install chromium

echo ""
echo "✅  Chromium browser installed"

# ── Check for system deps (Linux) ─────────────────────────────────────────────
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo ""
    echo "🔍  Checking Linux system dependencies for Chromium…"
    if ! npx playwright install-deps chromium 2>/dev/null; then
        echo "⚠️   Could not automatically install system deps."
        echo "    If Chromium fails to launch, run:"
        echo "    sudo npx playwright install-deps chromium"
        echo ""
        echo "    On Arch Linux, you can also install from AUR:"
        echo "    yay -S chromium"
    else
        echo "✅  System dependencies installed"
    fi
fi

# ── Quick smoke test ───────────────────────────────────────────────────────────
echo ""
echo "🧪  Quick smoke test — checking solver script exists…"
SOLVER_SCRIPT="$PROJECT_ROOT/src-tauri/scripts/cf_solver.mjs"
if [ -f "$SOLVER_SCRIPT" ]; then
    echo "✅  Solver script found at: $SOLVER_SCRIPT"
else
    echo "❌  Solver script not found at: $SOLVER_SCRIPT"
    echo "    Make sure you have the full Shiori source."
    exit 1
fi

echo ""
echo "╔═══════════════════════════════════════════════════════╗"
echo "║  ✅  Cloudflare solver setup complete!                ║"
echo "╚═══════════════════════════════════════════════════════╝"
echo ""
echo "  To test the solver manually, run:"
echo "    node test_cf.mjs https://www.toongod.org visible 60"
echo ""
echo "  In the app, the solver runs automatically when ToonGod"
echo "  is first accessed. No configuration required."
echo ""
