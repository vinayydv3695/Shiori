import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
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

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react(),
    visualizer({
      filename: 'dist/stats.html',
      open: false,
      gzipSize: true,
      brotliSize: true,
    }),
    removeCrossoriginPlugin(),
  ],
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
      ignored: ["**/src-tauri/**"],
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
          // Core React runtime — aggressive caching target
          'vendor-react': ['react', 'react-dom'],
          // Radix UI headless primitives
          'vendor-radix': [
            '@radix-ui/react-checkbox',
            '@radix-ui/react-context-menu',
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-label',
            '@radix-ui/react-scroll-area',
            '@radix-ui/react-select',
            '@radix-ui/react-separator',
            '@radix-ui/react-slot',
            '@radix-ui/react-tabs',
            '@radix-ui/react-toast',
            '@radix-ui/react-tooltip',
          ],
          // State management
          'vendor-state': [
            'zustand',
            '@tanstack/react-query',
            '@tanstack/react-virtual',
          ],
          // PDF rendering (heaviest dep — isolated so it's only loaded in reader)
          'vendor-pdf': ['pdfjs-dist', 'react-pdf'],
          // Charts & animation
          'vendor-ui': ['framer-motion', 'recharts', 'lucide-react'],
          // EPUB renderer
          'vendor-epub': ['epubjs'],
        },
      },
    },
  },
})
