import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { visualizer } from 'rollup-plugin-visualizer'

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    visualizer({
      filename: 'dist/stats.html',
      open: false,
      gzipSize: true,
      brotliSize: true,
    }),
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
    rollupOptions: {
      output: {
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
