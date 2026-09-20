import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from './providers/ThemeProvider'
import { ErrorBoundary } from './components/ErrorBoundary'
import { TooltipProvider } from './components/ui/tooltip'
import { MotionConfig } from 'framer-motion'
import { isAndroid } from './lib/tauri'

// Disable native browser context menu (Back, Forward, Reload, Inspect Element) on desktop
// in production builds when clicking on free space. Keeps it enabled in dev mode
// (or via localStorage 'shiori_dev_mode') for inspection and testing.
const isDevMode = import.meta.env.DEV || (typeof window !== 'undefined' && window.localStorage?.getItem('shiori_dev_mode') === 'true');

if (!isDevMode) {
  document.addEventListener('contextmenu', (e) => {
    const target = e.target as HTMLElement | null;
    const isEditable = target && (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable ||
      target.closest('input, textarea, [contenteditable="true"]') !== null
    );
    if (!isEditable) {
      e.preventDefault();
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <TooltipProvider delayDuration={0}>
          <MotionConfig reducedMotion={isAndroid ? 'always' : 'never'}>
            <App />
          </MotionConfig>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
)
