import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from './providers/ThemeProvider'
import { ErrorBoundary } from './components/ErrorBoundary'
import { TooltipProvider } from './components/ui/tooltip'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <TooltipProvider delayDuration={0}>
          <App />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
)
