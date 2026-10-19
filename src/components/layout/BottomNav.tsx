import React, { useEffect, useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Home, BookOpen, Compass, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CurrentView } from '@/store/uiStore'
import { usePreferencesStore } from '@/store/preferencesStore'
import { IS_STORE_BUILD } from '@/lib/storeConfig'

interface BottomNavProps {
  currentView: CurrentView
  onNavigateToView: (view: CurrentView) => void
  onOpenSettings?: () => void
  onToggleDrawer?: () => void
  onVisibilityChange?: (visible: boolean) => void
}

const IDLE_TIMEOUT_MS = 3500

export function BottomNav({
  currentView,
  onNavigateToView,
  onVisibilityChange,
}: BottomNavProps) {
  const preferredContentType = usePreferencesStore(s => s.preferences?.preferredContentType)
  const [isVisible, setIsVisible] = useState(true)

  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isInteractingRef = useRef(false)
  const lastScrollYRef = useRef(0)

  // Notify parent of visibility changes
  useEffect(() => {
    onVisibilityChange?.(isVisible)
  }, [isVisible, onVisibilityChange])

  // Reset idle timer (auto-hides after 3.5s of no interaction)
  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current)
    }
    if (!isInteractingRef.current) {
      idleTimerRef.current = setTimeout(() => {
        setIsVisible(false)
      }, IDLE_TIMEOUT_MS)
    }
  }, [])

  // Show nav bar and restart timer
  const showNav = useCallback(() => {
    setIsVisible(true)
    resetIdleTimer()
  }, [resetIdleTimer])

  // Reset timer whenever view changes
  useEffect(() => {
    showNav()
  }, [currentView, showNav])

  // Listen for user click/tap/touch & scroll activity anywhere on the screen
  useEffect(() => {
    // Initial timer on mount
    resetIdleTimer()

    const handleUserInteraction = () => {
      showNav()
    }

    const handleScroll = () => {
      const currentScrollY = window.scrollY
      const delta = currentScrollY - lastScrollYRef.current

      // Scroll down: hide immediately
      if (delta > 10 && currentScrollY > 40) {
        setIsVisible(false)
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
      }
      // Scroll up: show immediately
      else if (delta < -10) {
        showNav()
      } else {
        resetIdleTimer()
      }

      lastScrollYRef.current = currentScrollY
    }

    window.addEventListener('pointerdown', handleUserInteraction, { passive: true })
    window.addEventListener('touchstart', handleUserInteraction, { passive: true })
    window.addEventListener('click', handleUserInteraction, { passive: true })
    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
      window.removeEventListener('pointerdown', handleUserInteraction)
      window.removeEventListener('touchstart', handleUserInteraction)
      window.removeEventListener('click', handleUserInteraction)
      window.removeEventListener('scroll', handleScroll)
    }
  }, [resetIdleTimer, showNav])

  // Freeze auto-hide while touching/interacting with the bar itself
  const handleNavPointerEnter = () => {
    isInteractingRef.current = true
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
  }

  const handleNavPointerLeave = () => {
    isInteractingRef.current = false
    resetIdleTimer()
  }

  return (
    <>
      {/* ── Native Android Styled Docked Bottom Bar (Matches Reference) ── */}
      <motion.nav
        aria-label="Bottom Navigation"
        initial={false}
        animate={{
          y: isVisible ? 0 : '100%',
          opacity: isVisible ? 1 : 0,
        }}
        transition={{
          type: 'spring',
          stiffness: 420,
          damping: 34,
          mass: 0.8,
        }}
        onPointerDown={handleNavPointerEnter}
        onPointerUp={handleNavPointerLeave}
        onPointerEnter={handleNavPointerEnter}
        onPointerLeave={handleNavPointerLeave}
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 select-none",
          "bg-card/90 dark:bg-card/85 backdrop-blur-2xl",
          "rounded-t-[28px] sm:rounded-t-[32px] border-t border-x border-b-0 border-border/40",
          "shadow-[0_-8px_32px_rgba(0,0,0,0.08)] dark:shadow-[0_-12px_40px_rgba(0,0,0,0.5)]",
          "overflow-hidden",
          !isVisible && "pointer-events-none"
        )}
        style={{
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <div className="grid grid-cols-4 items-center h-[60px] max-w-lg mx-auto w-full px-2">
          {/* Tab 1: Home */}
          <NavButton
            icon={
              <Home
                className={cn(
                  "w-6 h-6 transition-all duration-200",
                  currentView === 'home'
                    ? "stroke-[2.2] fill-primary text-primary drop-shadow-xs"
                    : "stroke-[1.8] text-muted-foreground/75"
                )}
              />
            }
            label="Home"
            isActive={currentView === 'home'}
            onClick={() => onNavigateToView('home')}
          />

          {/* Tab 2: Library */}
          <NavButton
            icon={
              <BookOpen
                className={cn(
                  "w-6 h-6 transition-all duration-200",
                  currentView === 'library'
                    ? "stroke-[2.2] fill-primary text-primary drop-shadow-xs"
                    : "stroke-[1.8] text-muted-foreground/75"
                )}
              />
            }
            label="Library"
            isActive={currentView === 'library'}
            onClick={() => onNavigateToView('library')}
          />

          {/* Tab 3: Browse / Discover */}
          <NavButton
            icon={
              <Compass
                className={cn(
                  "w-6 h-6 transition-all duration-200",
                  currentView === 'online-books' || currentView === 'online-manga'
                    ? "stroke-[2.2] fill-primary/30 text-primary drop-shadow-xs"
                    : "stroke-[1.8] text-muted-foreground/75"
                )}
              />
            }
            label="Browse"
            isActive={currentView === 'online-books' || currentView === 'online-manga'}
            onClick={() => {
              if (IS_STORE_BUILD) {
                onNavigateToView('online-books')
                return
              }
              onNavigateToView(preferredContentType === 'manga' ? 'online-manga' : 'online-books')
            }}
          />

          {/* Tab 4: Profile / More */}
          <NavButton
            icon={
              <User
                className={cn(
                  "w-6 h-6 transition-all duration-200",
                  currentView === 'more'
                    ? "stroke-[2.2] fill-primary text-primary drop-shadow-xs"
                    : "stroke-[1.8] text-muted-foreground/75"
                )}
              />
            }
            label="More"
            isActive={currentView === 'more'}
            onClick={() => onNavigateToView('more')}
          />
        </div>
      </motion.nav>

      {/* ── Minimalist Bottom Edge Handle to Summon Nav Bar when Hidden ── */}
      <AnimatePresence>
        {!isVisible && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.2 }}
            onClick={showNav}
            className="fixed bottom-1.5 inset-x-0 z-40 flex justify-center pointer-events-auto cursor-pointer"
            aria-label="Tap to show navigation bar"
          >
            <div className="w-12 h-1 rounded-full bg-foreground/25 hover:bg-foreground/50 transition-colors shadow-xs" />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

function NavButton({
  icon,
  label,
  isActive,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  isActive: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "relative flex flex-col items-center justify-center h-full w-full gap-1 transition-all duration-200 active:scale-90 cursor-pointer select-none py-1.5",
        isActive ? "text-primary" : "text-muted-foreground/75 hover:text-foreground"
      )}
    >
      {/* Icon */}
      <div className="relative flex items-center justify-center">
        {icon}
      </div>

      {/* Subtle Dot Indicator Matching Reference */}
      <div className="h-1 flex items-center justify-center">
        {isActive ? (
          <motion.span
            layoutId="bottomNavDot"
            transition={{ type: "spring", stiffness: 480, damping: 32 }}
            className="w-1.5 h-1.5 rounded-full bg-primary"
          />
        ) : (
          <span className="w-1.5 h-1.5 rounded-full opacity-0 pointer-events-none" />
        )}
      </div>
    </button>
  )
}
