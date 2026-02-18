#!/bin/bash

echo "=========================================="
echo "Shiori Tauri Development Test Script"
echo "=========================================="
echo ""

# Kill any existing processes
echo "1. Cleaning up existing processes..."
pkill -f "tauri dev" 2>/dev/null
pkill -f "vite" 2>/dev/null
pkill -f "cargo run" 2>/dev/null
sleep 2
echo "   ✓ Cleanup complete"
echo ""

# Build Rust backend first
echo "2. Building Rust backend..."
cd src-tauri
cargo build 2>&1 | tail -5
if [ $? -eq 0 ]; then
    echo "   ✓ Rust build successful"
else
    echo "   ✗ Rust build failed!"
    exit 1
fi
cd ..
echo ""

# Build frontend
echo "3. Building frontend..."
npm run build 2>&1 | grep -E "(dist/|error|warning)" | tail -5
echo "   ✓ Frontend build complete"
echo ""

# Start Tauri dev
echo "4. Starting Tauri dev mode..."
echo "   This will open the application window."
echo "   Check the console for '[Tauri Detection]' and '[API]' logs"
echo ""
echo "   Press Ctrl+C to stop"
echo "=========================================="
echo ""

npm run tauri dev
