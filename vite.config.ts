/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import type { Plugin, PluginOption } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { visualizer } from 'rollup-plugin-visualizer'

// Strip `crossorigin` from every <script> and <link> in the HTML output.
// Tauri's custom protocol (tauri://localhost) does NOT send CORS headers, so
// webkit2gtk on Linux silently rejects resources tagged crossorigin="anonymous".
// This was the root cause of the blank white screen in the AUR package.
function removeCrossoriginPlugin(): Plugin {
  return {
    name: 'remove-crossorigin',
    transformIndexHtml(html: string) {
      return html
        .replace(/<script([^>]*?) crossorigin([^>]*)>/gi, '<script$1$2>')
        .replace(/<link([^>]*?) crossorigin([^>]*)>/gi, '<link$1$2>');
    },
  };
}

const host = process.env.TAURI_DEV_HOST;

const plugins: PluginOption[] = [
  react(),
  removeCrossoriginPlugin(),
];

// Bundle-size report is dev-only: writing it into dist/ shipped it in every
// release (a 1.5MB stats.html inside the APK). Enable explicitly with
// VITE_BUNDLE_VISUALIZER=true when you want the report.
if (process.env.VITE_BUNDLE_VISUALIZER === 'true') {
  plugins.push(
    visualizer({
      filename: 'dist/stats.html',
      open: false,
      gzipSize: true,
      brotliSize: true,
    })
  );
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins,
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: host || true,
    hmr: host
      ? {
        protocol: "ws",
        host,
        port: 5174,
      }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**", "**/build-dir/**", "**/.flatpak-builder/**"],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // Raise per-chunk warning threshold; our intentional split chunks may exceed 500kB
    chunkSizeWarningLimit: 600,
    // CRITICAL: Disable crossorigin on all emitted <script> and <link> tags.
    // Tauri's custom protocol (tauri://localhost) does NOT send CORS headers,
    // so webkit2gtk on Linux silently drops any asset tagged crossorigin="anonymous".
    // This was the root cause of the blank white screen on the packaged AUR build.
    modulePreload: {
      polyfill: false, // removes the Vite modulepreload polyfill injection
    },
    rollupOptions: {
      output: {
        // Remove crossorigin from generated <link rel="modulepreload"> tags
        generatedCode: { constBindings: true },
        manualChunks: {
          pdfjs: ['react-pdf', 'pdfjs-dist'],
          epubjs: ['epubjs'],
          vendor: ['react', 'react-dom', 'framer-motion']
        }
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    // Playwright specs under tests/e2e are driven by the Playwright runner, not Vitest. Excluding them avoids "test.beforeEach() ... called here" errors.
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**', 'e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
})
