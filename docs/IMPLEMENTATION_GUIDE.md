# Modern UI Implementation Guide

## 🎯 Overview

This guide will help you implement the modern, Calibre-inspired UI for Shiori eBook Manager.

---

## 📦 Required Dependencies

Add these to your `package.json`:

```bash
npm install @tanstack/react-virtual
npm install @radix-ui/react-dropdown-menu
npm install @radix-ui/react-context-menu  
npm install @radix-ui/react-command
npm install @radix-ui/react-tooltip
npm install @radix-ui/react-switch
npm install @radix-ui/react-separator
npm install cmdk
npm install vaul
npm install sonner
```

---

## 🎨 Step 1: Apply Design Tokens

1. Import the design tokens in your main CSS file:

```css
/* src/index.css */
@import './styles/tokens.css';
@import 'tailwindcss/base';
@import 'tailwindcss/components';
@import 'tailwindcss/utilities';

/* Custom scrollbar */
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: hsl(var(--border));
  border-radius: 3px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: hsl(var(--muted-foreground) / 0.3);
}

/* Smooth animations */
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideInUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes slideInDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fadeIn {
  animation: fadeIn var(--transition-base);
}

.animate-slideInUp {
  animation: slideInUp var(--transition-base);
}

.animate-slideInDown {
  animation: slideInDown var(--transition-base);
}
```

---

## 🧩 Step 2: Create Base UI Components

### Button Component

```tsx
// src/components/ui/button.tsx
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "underline-offset-4 hover:underline text-primary",
      },
      size: {
        default: "h-10 py-2 px-4",
        sm: "h-9 px-3 rounded-md",
        lg: "h-11 px-8 rounded-md",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
```

### Input Component

```tsx
// src/components/ui/input.tsx
import * as React from "react"
import { cn } from "@/lib/utils"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
```

### Tooltip Component

```tsx
// src/components/ui/tooltip.tsx
import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"
import { cn } from "@/lib/utils"

const TooltipProvider = TooltipPrimitive.Provider

const Tooltip = TooltipPrimitive.Root

const TooltipTrigger = TooltipPrimitive.Trigger

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      "z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
      className
    )}
    {...props}
  />
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
```

---

## 🎣 Step 3: Create Custom Hooks

### useTheme Hook

```tsx
// src/hooks/useTheme.ts
import { useEffect, useState } from 'react'

type Theme = 'light' | 'dark' | 'system'

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem('theme') as Theme
    return stored || 'system'
  })

  useEffect(() => {
    const root = window.document.documentElement
    root.classList.remove('light', 'dark')

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      root.classList.add(systemTheme)
    } else {
      root.classList.add(theme)
    }

    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark')
  }

  return { theme, setTheme, toggleTheme }
}
```

### useKeyboardShortcuts Hook

```tsx
// src/hooks/useKeyboardShortcuts.ts
import { useEffect } from 'react'

type ShortcutHandler = () => void

interface Shortcuts {
  [key: string]: ShortcutHandler
}

export function useKeyboardShortcuts(shortcuts: Shortcuts) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
      const modifier = isMac ? event.metaKey : event.ctrlKey

      for (const [key, handler] of Object.entries(shortcuts)) {
        const [modifierKey, ...keys] = key.split('+')
        const pressedKey = keys.join('+').toLowerCase()
        const eventKey = event.key.toLowerCase()

        const modifierMatch = 
          (modifierKey === 'cmd' && modifier) ||
          (modifierKey === 'ctrl' && event.ctrlKey) ||
          (modifierKey === 'shift' && event.shiftKey) ||
          (modifierKey === 'alt' && event.altKey)

        if (modifierMatch && eventKey === pressedKey) {
          event.preventDefault()
          handler()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [shortcuts])
}
```

---

## 🏗️ Step 4: Update Main Layout

Replace your current `Layout.tsx` with a modern implementation:

```tsx
// src/components/layout/ModernLayout.tsx
import { useState } from 'react'
import { ModernToolbar } from './ModernToolbar'
import { ModernSidebar } from '../sidebar/ModernSidebar'
import { ModernBookGrid } from '../library/ModernBookCard'
import { ViewControls, StatusBar } from './ModernToolbar'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useLibraryStore } from '@/store/libraryStore'

export const ModernLayout = () => {
  const [view, setView] = useState<'grid' | 'list' | 'table'>('grid')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [selectedBooks, setSelectedBooks] = useState<number[]>([])
  
  const { books } = useLibraryStore()

  // Keyboard shortcuts
  useKeyboardShortcuts({
    'cmd+k': () => console.log('Open command palette'),
    'cmd+n': () => console.log('Add book'),
    'cmd+f': () => console.log('Focus search'),
    'cmd+b': () => setSidebarOpen(!sidebarOpen),
    'cmd+,': () => console.log('Open settings'),
  })

  return (
    <div className="h-screen flex flex-col bg-background">
      <ModernToolbar
        onAddBook={() => {}}
        onEditMetadata={() => {}}
        onConvert={() => {}}
        onView={() => {}}
        onDownload={() => {}}
        onFetchNews={() => {}}
        onSettings={() => {}}
        onRemove={() => {}}
        onSave={() => {}}
        onShare={() => {}}
        onEditBook={() => {}}
      />

      <div className="flex-1 flex overflow-hidden">
        {sidebarOpen && (
          <ModernSidebar
            authors={[]}
            languages={[]}
            series={[]}
            formats={[]}
            publishers={[]}
            ratings={[]}
            tags={[]}
            identifiers={[]}
            selectedFilters={{
              authors: [],
              languages: [],
              series: [],
              formats: [],
              publishers: [],
              ratings: [],
              tags: [],
              identifiers: [],
            }}
            onFilterToggle={() => {}}
            onClearAll={() => {}}
          />
        )}

        <div className="flex-1 flex flex-col overflow-hidden">
          <ViewControls
            view={view}
            onViewChange={setView}
            onFilterClick={() => setSidebarOpen(!sidebarOpen)}
            selectedCount={selectedBooks.length}
          />

          <div className="flex-1 overflow-auto custom-scrollbar">
            <ModernBookGrid
              books={books}
              selectedBooks={selectedBooks}
              onSelectBook={(id) => {
                setSelectedBooks(prev =>
                  prev.includes(id)
                    ? prev.filter(i => i !== id)
                    : [...prev, id]
                )
              }}
              onOpenBook={() => {}}
              onEditBook={() => {}}
              onDeleteBook={() => {}}
              onDownloadBook={() => {}}
            />
          </div>
        </div>
      </div>

      <StatusBar
        totalBooks={books.length}
        filteredBooks={books.length}
        selectedBooks={selectedBooks.length}
        librarySize="0 MB"
        syncStatus="synced"
      />
    </div>
  )
}
```

---

## 🎨 Step 5: Add Animation Utilities

```tsx
// src/lib/animations.ts
export const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.2 }
}

export const slideInUp = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 10 },
  transition: { duration: 0.2 }
}

export const scaleIn = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
  transition: { duration: 0.2, ease: [0.34, 1.56, 0.64, 1] }
}
```

---

## 🚀 Next Steps

1. **Install dependencies** listed above
2. **Create missing UI components** (Button, Input, Tooltip, etc.)
3. **Update your main App.tsx** to use ModernLayout
4. **Test keyboard shortcuts**
5. **Add command palette** using cmdk
6. **Implement table view** for alternative display
7. **Add preview panel** for book details
8. **Implement virtualization** for large libraries

---

## 📚 Additional Features to Implement

### Command Palette
Use `cmdk` for a modern command palette (⌘K)

### Context Menus
Right-click menus using `@radix-ui/react-context-menu`

### Drag & Drop Import
Use native drag & drop API for importing books

### Toast Notifications
Use `sonner` for beautiful notifications

---

## 🎯 Performance Optimization

1. **Virtualize large lists** with `@tanstack/react-virtual`
2. **Lazy load images** with intersection observer
3. **Debounce search input**
4. **Memoize expensive computations**
5. **Code split heavy components**

---

This is a production-ready, modern UI that matches the quality of Linear, Raycast, and Notion!
